import { createSupabaseClient } from './supabaseClient.js';

const SESSION_KEY = 'padel-community-session-v2';

const listeners = new Set();
let currentSession = null;
let lastPersistedToken = null;

const supabase = createSupabaseClient();

const safeParse = (value, fallback = null) => {
  try {
    return JSON.parse(value) ?? fallback;
  } catch (error) {
    return fallback;
  }
};

const persistSession = () => {
  try {
    if (currentSession) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch (error) {
    console.warn('Konnte Session nicht speichern', error);
  }
};

const loadPersistedSession = () => {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) {
      return null;
    }
    const parsed = safeParse(stored, null);
    if (!parsed || typeof parsed.email !== 'string') {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('Konnte Session nicht laden', error);
    return null;
  }
};

const emit = () => {
  const snapshot = currentSession ? { ...currentSession } : null;
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('Auth Listener Fehler', error);
    }
  });
};

const normalizeDisplayName = (metadata = {}, fallbackEmail = '') => {
  return (
    metadata.displayName ||
    metadata.full_name ||
    metadata.name ||
    metadata.user_name ||
    fallbackEmail ||
    ''
  ).trim();
};

const mapSupabaseSession = (supabaseSession, fallbackUser = null) => {
  const user = supabaseSession?.user || fallbackUser;
  if (!user?.email) {
    return null;
  }
  const metadata = user.user_metadata || {};
  const appMetadata = user.app_metadata || {};
  const displayName = normalizeDisplayName(metadata, user.email) || user.email;
  const avatarUrl = metadata.avatar_url || metadata.picture || null;
  const provider = appMetadata.provider || 'email';
  const token = supabaseSession?.access_token || supabaseSession?.accessToken || null;
  return {
    userId: user.id,
    email: user.email,
    displayName,
    provider,
    avatarUrl,
    token,
  };
};

const applySession = (session) => {
  currentSession = session;
  lastPersistedToken = session?.token || null;
  persistSession();
  emit();
  return session;
};

const applySupabaseSession = (supabaseSession, fallbackUser = null) => {
  if (!supabaseSession && !fallbackUser) {
    return applySession(null);
  }
  const normalized = mapSupabaseSession(supabaseSession, fallbackUser);
  return applySession(normalized);
};

const getCurrentUser = () => currentSession;

const subscribeAuthChanges = (callback) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

const normalizeEmail = (email) => (email || '').trim().toLowerCase();

const registerEmailUser = async ({ email, password, displayName }) => {
  const normalizedEmail = normalizeEmail(email);
  const profileName = (displayName || '').trim();
  const redirectTo = (() => {
    try {
      if (typeof window !== 'undefined' && window.location) {
        return window.location.origin;
      }
      return undefined;
    } catch (error) {
      return undefined;
    }
  })();

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        displayName: profileName,
        full_name: profileName,
      },
    },
  });

  const duplicateAccountMessage =
    'Für diese E-Mail-Adresse existiert bereits ein Konto. Bitte melde dich stattdessen an.';

  if (error) {
    const message = error.code === 'user_already_exists' ? duplicateAccountMessage : error.message;
    throw new Error(message || 'Registrierung fehlgeschlagen.');
  }

  const userIdentities = data?.user?.identities;
  const existingAccountDetected = Array.isArray(userIdentities) && userIdentities.length === 0;
  if (existingAccountDetected) {
    throw new Error(duplicateAccountMessage);
  }

  if (!data?.session) {
    // Supabase verlangt eine E-Mail-Bestätigung und liefert daher keine aktive Session zurück.
    // Wir behalten den abgemeldeten Zustand bei, damit die Nutzer:innen sich erst nach
    // erfolgreicher Bestätigung anmelden können und nicht versehentlich ohne gültigen Token
    // als eingeloggt gelten.
    applySession(null);
    return currentSession;
  }

  return applySupabaseSession(data.session);
};

const authenticateEmailUser = async ({ email, password }) => {
  const normalizedEmail = normalizeEmail(email);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    throw new Error(error.message || 'Anmeldung fehlgeschlagen.');
  }

  return applySupabaseSession(data.session);
};

const logout = async () => {
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.warn('Konnte Benutzer nicht abmelden', error);
  }
  applySession(null);
};

const bootstrapSession = async () => {
  const stored = loadPersistedSession();
  if (stored) {
    currentSession = stored;
    lastPersistedToken = stored.token || null;
    emit();
  }
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw error;
    }
    applySupabaseSession(data.session);
  } catch (error) {
    console.warn('Konnte aktuelle Session nicht laden', error);
    if (!lastPersistedToken) {
      applySession(null);
    }
  }
};

bootstrapSession();

const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    applySession(null);
    return;
  }
  applySupabaseSession(session);
});

if (authListener?.subscription) {
  const originalUnsubscribe = authListener.subscription.unsubscribe.bind(
    authListener.subscription
  );
  authListener.subscription.unsubscribe = () => {
    originalUnsubscribe();
    listeners.clear();
  };
}

export {
  authenticateEmailUser,
  getCurrentUser,
  logout,
  registerEmailUser,
  subscribeAuthChanges,
};
