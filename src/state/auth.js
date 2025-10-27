import { sanitizeText } from '../utils/text.js';

const USERS_KEY = 'padel-community-users-v1';
const SESSION_KEY = 'padel-community-session-v1';

let memoryUsers = [];
let memorySession = null;
const listeners = new Set();

const hasStorage = () => typeof window !== 'undefined' && !!window.localStorage;

const createId = (prefix) => {
  const fallback = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }
  } catch (error) {
    console.warn('Konnte keine UUID erzeugen, verwende Fallback.', error);
  }
  return `${prefix}-${fallback}`;
};

const readUsers = () => {
  if (!hasStorage()) {
    return memoryUsers;
  }
  try {
    const stored = window.localStorage.getItem(USERS_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((entry) => ({ ...entry }));
  } catch (error) {
    console.warn('Konnte Nutzer nicht aus localStorage laden.', error);
    return memoryUsers;
  }
};

const writeUsers = (users) => {
  if (!Array.isArray(users)) {
    return;
  }
  if (!hasStorage()) {
    memoryUsers = users.map((entry) => ({ ...entry }));
    return;
  }
  try {
    window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (error) {
    console.warn('Konnte Nutzer nicht speichern, verwende Speicher im Arbeitsspeicher.', error);
    memoryUsers = users.map((entry) => ({ ...entry }));
  }
};

const readSession = () => {
  if (!hasStorage()) {
    return memorySession;
  }
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch (error) {
    console.warn('Konnte Session nicht laden, verwende Speicher im Arbeitsspeicher.', error);
    return memorySession;
  }
};

const writeSession = (value) => {
  if (!hasStorage()) {
    memorySession = value;
    return;
  }
  try {
    if (!value) {
      window.localStorage.removeItem(SESSION_KEY);
      return;
    }
    window.localStorage.setItem(SESSION_KEY, value);
  } catch (error) {
    console.warn('Konnte Session nicht speichern, verwende Speicher im Arbeitsspeicher.', error);
    memorySession = value;
  }
};

const sanitizeEmail = (email) => (email || '').trim().toLowerCase();

const encodePassword = (password) => {
  const safe = password ?? '';
  try {
    return btoa(unescape(encodeURIComponent(safe)));
  } catch (error) {
    console.warn('Konnte Passwort nicht kodieren, speichere im Klartext.', error);
    return safe;
  }
};

const toPublicUser = (user) => {
  if (!user) {
    return null;
  }
  const { passwordHash, ...publicShape } = user;
  return publicShape;
};

const notifyListeners = (user) => {
  const snapshot = user ? toPublicUser(user) : null;
  listeners.forEach((callback) => {
    try {
      callback(snapshot);
    } catch (error) {
      console.error('Fehler im Auth-Listener', error);
    }
  });
};

const getCurrentUser = () => {
  const sessionId = readSession();
  if (!sessionId) {
    return null;
  }
  const users = readUsers();
  const match = users.find((entry) => entry.id === sessionId);
  return toPublicUser(match);
};

const MIN_PASSWORD_LENGTH = 8;

const requireEmail = (email) => {
  const normalized = sanitizeEmail(email);
  if (!normalized) {
    throw new Error('Bitte gib eine gültige E-Mail-Adresse ein.');
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(normalized)) {
    throw new Error('Bitte gib eine gültige E-Mail-Adresse ein.');
  }
  return normalized;
};

const requirePassword = (password) => {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
  }
  return password;
};

const resolveDisplayName = ({ name, email }) => {
  const trimmed = sanitizeText(name || '');
  if (trimmed) {
    return trimmed;
  }
  const normalizedEmail = sanitizeEmail(email);
  if (normalizedEmail) {
    return normalizedEmail.split('@')[0];
  }
  return 'Padel Fan';
};

const register = ({ name, email, password }) => {
  const normalizedEmail = requireEmail(email);
  const safePassword = requirePassword(password);
  const users = readUsers();
  const emailExists = users.some((entry) => entry.email === normalizedEmail);
  if (emailExists) {
    throw new Error('Für diese E-Mail existiert bereits ein Konto. Bitte melde dich an.');
  }

  const id = createId('usr');
  const user = {
    id,
    email: normalizedEmail,
    name: resolveDisplayName({ name, email: normalizedEmail }),
    passwordHash: encodePassword(safePassword),
    createdAt: new Date().toISOString(),
  };

  const nextUsers = [...users, user];
  writeUsers(nextUsers);
  writeSession(user.id);
  notifyListeners(user);
  return toPublicUser(user);
};

const login = ({ email, password }) => {
  const normalizedEmail = requireEmail(email);
  const safePassword = requirePassword(password);
  const users = readUsers();
  const user = users.find((entry) => entry.email === normalizedEmail);
  if (!user || !user.passwordHash) {
    throw new Error('Wir konnten kein Konto mit dieser E-Mail-Adresse finden.');
  }
  const encoded = encodePassword(safePassword);
  if (user.passwordHash !== encoded) {
    throw new Error('Das Passwort ist nicht korrekt.');
  }
  writeSession(user.id);
  notifyListeners(user);
  return toPublicUser(user);
};

const logout = () => {
  writeSession(null);
  notifyListeners(null);
};

const upsertUser = (users, userId, updater) => {
  const index = users.findIndex((entry) => entry.id === userId);
  if (index === -1) {
    return users;
  }
  const updated = updater({ ...users[index] });
  if (!updated) {
    return users;
  }
  const clone = [...users];
  clone[index] = updated;
  return clone;
};

const loginWithGoogleProfile = ({ email, name, avatar, sub }) => {
  const normalizedEmail = requireEmail(email);
  if (!sub) {
    throw new Error('Die Google-Antwort enthielt keine Nutzer-ID.');
  }
  const users = readUsers();
  let user = users.find((entry) => entry.googleId === sub);
  let nextUsers = users;
  if (!user) {
    user = users.find((entry) => entry.email === normalizedEmail);
  }
  const displayName = resolveDisplayName({ name, email: normalizedEmail });
  if (user) {
    nextUsers = upsertUser(users, user.id, (existing) => ({
      ...existing,
      googleId: sub,
      avatar: avatar || existing.avatar || '',
      name: displayName || existing.name,
    }));
    user = nextUsers.find((entry) => entry.id === user.id);
  } else {
    const id = createId('usr');
    user = {
      id,
      email: normalizedEmail,
      name: displayName,
      googleId: sub,
      avatar: avatar || '',
      createdAt: new Date().toISOString(),
    };
    nextUsers = [...users, user];
  }

  writeUsers(nextUsers);
  writeSession(user.id);
  notifyListeners(user);
  return toPublicUser(user);
};

const subscribe = (callback) => {
  if (typeof callback !== 'function') {
    return () => {};
  }
  listeners.add(callback);
  return () => listeners.delete(callback);
};

export {
  getCurrentUser,
  register,
  login,
  logout,
  loginWithGoogleProfile,
  subscribe,
};
