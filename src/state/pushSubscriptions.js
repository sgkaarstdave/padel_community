import { createSupabaseClient } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const SUPABASE_PROJECT_ID = 'gutesbsaqkkusbuukdyg';
const SUPABASE_FUNCTIONS_URL = `https://${SUPABASE_PROJECT_ID}.functions.supabase.co`;
// Edge Function Endpunkt exakt wie im Supabase Dashboard hinterlegt.
const REGISTER_PUSH_SUBSCRIPTION_URL = `${SUPABASE_FUNCTIONS_URL}/register-push-subscription`;
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1dGVzYnNhcWtrdXNidXVrZHlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0NDY1NDMsImV4cCI6MjA3OTAyMjU0M30.gkjdKY9694s7-otyd4ax_yB23G3usWLEVfMZ-dr50wo';

const VAPID_PUBLIC_KEY =
  'BJNAvvUUBpijYcgnLtGHwk2lGQ9fzbRlGiZgXbg8AgyfOFLpb-PscbudWEd5JeCmskmiKpfxVtf7xqrX6ksscYg';

const pushState = {
  isEnabled: false,
  isBusy: false,
  lastError: null,
};

const listeners = new Set();

const getApplicationBaseUrl = () => {
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
  } catch (error) {
    // no-op
  }
  return 'https://padel.community';
};

const isPushSupported = () => {
  if (typeof window === 'undefined') {
    return false;
  }
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
};

const getNotificationPermissionState = () => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
};

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData =
    typeof globalThis.atob === 'function'
      ? globalThis.atob(base64)
      : globalThis.Buffer
        ? globalThis.Buffer.from(base64, 'base64').toString('binary')
        : '';
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

const bufferToBase64 = (buffer) => {
  if (!buffer) {
    return null;
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }
  if (globalThis.Buffer) {
    return globalThis.Buffer.from(binary, 'binary').toString('base64');
  }
  return null;
};

const requestNotificationPermission = async () => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch (error) {
    console.warn('Konnte Benachrichtigungserlaubnis nicht anfragen', error);
    return 'denied';
  }
};

const getServiceWorkerRegistration = async () => {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    return null;
  }
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) {
    return existing;
  }
  try {
    return await navigator.serviceWorker.ready;
  } catch (error) {
    console.warn('Service Worker Registrierung nicht verfügbar', error);
    return null;
  }
};

const serializeSubscription = (subscription) => {
  if (!subscription) {
    return null;
  }
  const json = subscription.toJSON?.();
  const p256dh = json?.keys?.p256dh || bufferToBase64(subscription.getKey?.('p256dh'));
  const auth = json?.keys?.auth || bufferToBase64(subscription.getKey?.('auth'));
  if (!p256dh || !auth) {
    return null;
  }
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime || null,
    keys: {
      p256dh,
      auth,
    },
  };
};

const getPushState = () => ({
  ...pushState,
  isSupported: isPushSupported(),
  permission: getNotificationPermissionState(),
});

const emitPushState = () => {
  const snapshot = getPushState();
  listeners.forEach((listener) => {
    try {
      listener({ ...snapshot });
    } catch (error) {
      console.error('Push Listener Fehler', error);
    }
  });
};

const setPushState = (partial = {}) => {
  Object.assign(pushState, partial);
  emitPushState();
};

const subscribePushChanges = (listener) => {
  listeners.add(listener);
  listener(getPushState());
  return () => listeners.delete(listener);
};

const getEdgeFunctionHeaders = (token) => {
  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

// Schickt die aktuelle Subscription direkt an die Edge Function.
const sendSubscriptionToServer = async (currentUser, subscription) => {
  const serialized = serializeSubscription(subscription);
  if (!serialized) {
    throw new Error('Ungültige Push-Subscription.');
  }
  if (!currentUser?.userId || !currentUser?.token) {
    throw new Error('Bitte melde dich an, um Push-Benachrichtigungen zu aktivieren.');
  }
  const payload = {
    userId: currentUser.userId,
    subscription: serialized,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  };

  const response = await fetch(REGISTER_PUSH_SUBSCRIPTION_URL, {
    method: 'POST',
    headers: getEdgeFunctionHeaders(currentUser.token),
    body: JSON.stringify(payload),
    credentials: 'omit',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Push-Subscription konnte nicht registriert werden.');
  }

  return serialized;
};

const createOrLoadSubscription = async () => {
  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    throw new Error('Kein aktiver Service Worker gefunden.');
  }
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  return subscription;
};

// Synchronisiert die lokale Subscription mit Supabase, sobald ein User vorhanden ist.
const initPushForCurrentUser = async (currentUser = getCurrentUser()) => {
  if (!currentUser) {
    setPushState({ isEnabled: false });
    return null;
  }
  if (!isPushSupported()) {
    setPushState({ isEnabled: false });
    return null;
  }
  if (getNotificationPermissionState() !== 'granted') {
    setPushState({ isEnabled: false });
    return null;
  }
  try {
    const subscription = await createOrLoadSubscription();
    await sendSubscriptionToServer(currentUser, subscription);
    setPushState({ isEnabled: true, lastError: null });
    return subscription;
  } catch (error) {
    console.error('Push-Initialisierung fehlgeschlagen', error);
    setPushState({ isEnabled: false, lastError: error.message || 'Push konnte nicht aktiviert werden.' });
    throw error;
  }
};

// Fordert Berechtigungen an und registriert die Subscription beim Backend.
const enablePushNotifications = async (currentUser = getCurrentUser()) => {
  if (!isPushSupported()) {
    const message = 'Dein Browser unterstützt keine Web-Push-Benachrichtigungen.';
    setPushState({ isEnabled: false, lastError: message });
    throw new Error(message);
  }
  if (!currentUser) {
    const message = 'Bitte melde dich an, um Push-Benachrichtigungen zu aktivieren.';
    setPushState({ isEnabled: false, lastError: message });
    throw new Error(message);
  }

  setPushState({ isBusy: true, lastError: null });
  try {
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      const message = 'Benachrichtigungen im Browser nicht erlaubt.';
      setPushState({ isEnabled: false, lastError: message });
      throw new Error(message);
    }
    await initPushForCurrentUser(currentUser);
    return true;
  } catch (error) {
    console.error('Push-Benachrichtigungen konnten nicht aktiviert werden', error);
    if (!pushState.lastError) {
      setPushState({ lastError: error.message || 'Push konnte nicht aktiviert werden.' });
    }
    throw error;
  } finally {
    setPushState({ isBusy: false });
  }
};

// Entfernt aktive Subscriptions lokal und bereinigt optional den Supabase-Eintrag.
const disablePushNotifications = async (currentUser = getCurrentUser()) => {
  if (!isPushSupported()) {
    setPushState({ isEnabled: false });
    return false;
  }
  setPushState({ isBusy: true, lastError: null });
  try {
    const registration = await getServiceWorkerRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }
    if (currentUser?.userId) {
      try {
        const supabase = createSupabaseClient();
        const { error } = await supabase
          .from('web_push_subscriptions')
          .delete()
          .eq('user_id', currentUser.userId);
        if (error) {
          throw error;
        }
      } catch (error) {
        console.warn('Konnte gespeicherte Push-Subscription nicht löschen', error);
      }
    }
    setPushState({ isEnabled: false, lastError: null });
    return true;
  } catch (error) {
    console.error('Push-Benachrichtigungen konnten nicht deaktiviert werden', error);
    setPushState({ isEnabled: false, lastError: error.message || 'Push konnte nicht deaktiviert werden.' });
    throw error;
  } finally {
    setPushState({ isBusy: false });
  }
};

const notifyEventAction = async (type, event) => {
  if (!type) {
    return null;
  }
  const session = getCurrentUser();
  if (!session?.userId) {
    return null;
  }
  const supabase = createSupabaseClient();
  const payload = {
    type,
    actor: {
      id: session.userId,
      email: session.email,
      name: session.displayName || session.email,
    },
    event: event
      ? {
          id: event.id,
          title: event.title,
          location: event.location,
          date: event.date,
          time: event.time,
          owner: event.owner,
          city: event.city || '',
          createdByUserId: event.createdByUserId || event.ownerId || null,
        }
      : null,
    appUrl: getApplicationBaseUrl(),
  };

  try {
    await supabase.functions.invoke('send-web-push', { body: payload });
  } catch (error) {
    console.warn('Konnte Web-Push nicht auslösen', error);
  }
  return null;
};

export {
  VAPID_PUBLIC_KEY,
  getPushState,
  isPushSupported,
  getNotificationPermissionState,
  initPushForCurrentUser,
  enablePushNotifications,
  disablePushNotifications,
  subscribePushChanges,
  notifyEventAction,
};
