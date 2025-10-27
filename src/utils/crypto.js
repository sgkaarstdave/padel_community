const encoder = new TextEncoder();

const getSubtle = () => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    return window.crypto.subtle;
  }
  throw new Error('Kryptografische Funktionen stehen nicht zur Verfügung.');
};

const getCrypto = () => {
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto;
  }
  throw new Error('Kryptografische Funktionen stehen nicht zur Verfügung.');
};

const bytesToBase64 = (bytes) => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
};

const base64ToBytes = (value) => {
  const normalized = value.replace(/\s/g, '');
  const binary = atob(normalized);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
};

const toBase64Url = (bytes) =>
  bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const fromBase64Url = (value) => {
  let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  if (padding) {
    normalized += '='.repeat(4 - padding);
  }
  return base64ToBytes(normalized);
};

const generateSalt = (size = 16) => {
  const buffer = new Uint8Array(size);
  getCrypto().getRandomValues(buffer);
  return bytesToBase64(buffer);
};

const hashPassword = async (password, saltBase64, iterations = 210000) => {
  if (!saltBase64) {
    throw new Error('Salt wird benötigt, um ein Passwort zu hashen.');
  }
  const subtle = getSubtle();
  const salt = base64ToBytes(saltBase64);
  const keyMaterial = await subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return bytesToBase64(new Uint8Array(derivedBits));
};

const generateToken = (size = 32) => {
  const buffer = new Uint8Array(size);
  getCrypto().getRandomValues(buffer);
  return toBase64Url(buffer);
};

const timingSafeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
};

const decodeJwt = (token) => {
  if (typeof token !== 'string' || token.split('.').length < 2) {
    throw new Error('Ungültiges Token.');
  }
  const [, payloadSegment] = token.split('.');
  const payloadBytes = fromBase64Url(payloadSegment);
  const decoder = new TextDecoder();
  const json = decoder.decode(payloadBytes);
  return JSON.parse(json);
};

export {
  base64ToBytes,
  bytesToBase64,
  decodeJwt,
  generateSalt,
  generateToken,
  hashPassword,
  timingSafeEqual,
  toBase64Url,
};
