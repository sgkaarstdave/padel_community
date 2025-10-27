const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let loadingPromise = null;

const loadGoogleScript = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Sign-In ist im aktuellen Kontext nicht verfügbar.'));
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google);
  }
  if (loadingPromise) {
    return loadingPromise;
  }
  loadingPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
    if (existingScript && window.google?.accounts?.id) {
      resolve(window.google);
      return;
    }
    const script = existingScript || document.createElement('script');
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.id) {
        resolve(window.google);
      } else {
        reject(new Error('Google Identity Services konnten nicht geladen werden.'));
      }
    };
    script.onerror = () => {
      reject(new Error('Das Google Identity Services Skript konnte nicht geladen werden.'));
    };
    if (!existingScript) {
      document.head.appendChild(script);
    }
  });
  return loadingPromise;
};

const parseJwt = (token) => {
  try {
    const [, payload] = token.split('.');
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized);
    const json = decodeURIComponent(
      decoded
        .split('')
        .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(''),
    );
    return JSON.parse(json);
  } catch (error) {
    console.warn('Konnte Google JWT nicht analysieren.', error);
    return null;
  }
};

const extractProfileFromCredential = (credential) => {
  const payload = parseJwt(credential);
  if (!payload) {
    throw new Error('Die Google-Antwort konnte nicht ausgewertet werden.');
  }
  const { email, name, picture: avatar, sub } = payload;
  return { email, name, avatar, sub };
};

const initializeGoogleSignIn = async ({
  container,
  clientId,
  onCredential,
  onError,
} = {}) => {
  const result = { available: false };
  if (!container || !clientId || clientId === 'YOUR_GOOGLE_CLIENT_ID') {
    return result;
  }
  try {
    await loadGoogleScript();
    if (!window.google?.accounts?.id) {
      throw new Error('Google Identity Services stehen nicht zur Verfügung.');
    }
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: ({ credential }) => {
        if (!credential) {
          onError?.(new Error('Die Google-Anmeldung hat kein Token zurückgegeben.'));
          return;
        }
        onCredential?.(credential);
      },
    });
    window.google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
    });
    container.dataset.googleReady = 'true';
    return { available: true };
  } catch (error) {
    onError?.(error);
    return { available: false, error };
  }
};

export { initializeGoogleSignIn, extractProfileFromCredential };
