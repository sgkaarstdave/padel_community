import {
  decodeJwt,
  generateSalt,
  generateToken,
  hashPassword,
  timingSafeEqual,
} from '../utils/crypto.js';

const USERS_KEY = 'padel-community-users-v1';
const SESSION_KEY = 'padel-community-session-v1';
const PASSWORD_ITERATIONS = 210000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

const listeners = new Set();
let users = [];
let currentSession = null;
let lastToken = null;

const safeParse = (value, fallback) => {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch (error) {
    return fallback;
  }
};

const loadUsers = () => {
  try {
    const stored = localStorage.getItem(USERS_KEY);
    if (!stored) {
      return [];
    }
    const parsed = safeParse(stored, []);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((user) => typeof user?.email === 'string');
  } catch (error) {
    console.warn('Konnte Benutzer nicht laden', error);
    return [];
  }
};

const loadSession = () => {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) {
      return null;
    }
    const session = safeParse(stored, null);
    if (!session || typeof session?.token !== 'string') {
      return null;
    }
    return session;
  } catch (error) {
    console.warn('Konnte Session nicht laden', error);
    return null;
  }
};

const persistUsers = () => {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (error) {
    console.warn('Konnte Benutzer nicht speichern', error);
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

const createSession = (user, overrides = {}) => ({
  userId: user.id,
  email: user.email,
  displayName: user.displayName,
  provider: user.provider,
  avatarUrl: user.avatarUrl || null,
  token: generateToken(32),
  issuedAt: new Date().toISOString(),
  ...overrides,
});

const normalizeEmail = (email) => email.trim().toLowerCase();

const requireEmail = (email) => {
  const value = normalizeEmail(email || '');
  if (!EMAIL_PATTERN.test(value)) {
    throw new Error('Bitte gib eine gültige E-Mail-Adresse an.');
  }
  return value;
};

const validatePassword = (password) => {
  if (!PASSWORD_PATTERN.test(password || '')) {
    throw new Error(
      'Das Passwort muss mindestens 8 Zeichen lang sein und Buchstaben sowie Zahlen enthalten.'
    );
  }
};

const updateSession = (session) => {
  currentSession = session;
  persistSession();
  emit();
};

const getCurrentUser = () => currentSession;

const subscribeAuthChanges = (callback) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

const registerEmailUser = async ({ email, password, displayName }) => {
  const normalizedEmail = requireEmail(email);
  validatePassword(password);

  const existing = users.find((user) => user.email === normalizedEmail);
  if (existing) {
    if (existing.provider === 'google') {
      throw new Error('Diese E-Mail ist bereits mit einem Google-Konto verknüpft.');
    }
    throw new Error('Für diese E-Mail existiert bereits ein Konto.');
  }

  const salt = generateSalt(16);
  const passwordHash = await hashPassword(password, salt, PASSWORD_ITERATIONS);
  const id = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : generateToken(16);
  const name = (displayName || '').trim();

  const user = {
    id,
    email: normalizedEmail,
    displayName: name || normalizedEmail,
    provider: 'password',
    passwordHash,
    passwordSalt: salt,
    passwordIterations: PASSWORD_ITERATIONS,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  users = [...users, user];
  persistUsers();

  const session = createSession(user);
  updateSession(session);
  lastToken = session.token;
  return session;
};

const authenticateEmailUser = async ({ email, password }) => {
  const normalizedEmail = requireEmail(email);
  const user = users.find(
    (candidate) => candidate.email === normalizedEmail && candidate.provider === 'password'
  );
  if (!user) {
    throw new Error('Für diese E-Mail wurde kein Konto gefunden.');
  }
  const { passwordSalt, passwordHash, passwordIterations = PASSWORD_ITERATIONS } = user;
  const computedHash = await hashPassword(password, passwordSalt, passwordIterations);
  if (!timingSafeEqual(passwordHash, computedHash)) {
    throw new Error('Das eingegebene Passwort ist nicht korrekt.');
  }
  user.lastLoginAt = new Date().toISOString();
  persistUsers();
  const session = createSession(user);
  updateSession(session);
  lastToken = session.token;
  return session;
};

const authenticateWithGoogle = async (credential) => {
  if (typeof credential !== 'string' || credential.length === 0) {
    throw new Error('Ungültige Google-Anmeldeantwort.');
  }

  const payload = decodeJwt(credential);
  const email = requireEmail(payload.email);
  const name = payload.name?.trim() || email;
  const picture = payload.picture || null;
  const providerId = payload.sub;

  if (!providerId) {
    throw new Error('Die Google-Antwort enthält keine eindeutige Kennung.');
  }

  const existingWithPassword = users.find(
    (candidate) => candidate.email === email && candidate.provider === 'password'
  );
  if (existingWithPassword) {
    throw new Error('Für diese E-Mail existiert bereits ein klassisches Konto.');
  }

  let user = users.find((candidate) => candidate.email === email && candidate.provider === 'google');
  if (!user) {
    const id = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : generateToken(16);
    user = {
      id,
      email,
      displayName: name,
      provider: 'google',
      providerId,
      avatarUrl: picture,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    users = [...users, user];
  } else {
    user.displayName = name;
    user.avatarUrl = picture || user.avatarUrl || null;
    user.providerId = providerId;
    user.lastLoginAt = new Date().toISOString();
    user.updatedAt = new Date().toISOString();
    users = users.map((candidate) => (candidate.id === user.id ? { ...user } : candidate));
  }

  persistUsers();
  const session = createSession(user, { avatarUrl: user.avatarUrl, providerId });
  updateSession(session);
  lastToken = session.token;
  return session;
};

const logout = () => {
  lastToken = null;
  updateSession(null);
};

users = loadUsers();
currentSession = loadSession();
if (currentSession) {
  lastToken = currentSession.token;
}

export {
  authenticateEmailUser,
  authenticateWithGoogle,
  getCurrentUser,
  logout,
  registerEmailUser,
  subscribeAuthChanges,
};
