import { createSupabaseClient } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const VAPID_PUBLIC_KEY =
  'BJNAvvUUBpijYcgnLtGHwk2lGQ9fzbRlGiZgXbg8AgyfOFLpb-PscbudWEd5JeCmskmiKpfxVtf7xqrX6ksscYg';

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

const requestNotificationPermission = async () => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    const result = await Notification.requestPermission();
    return result;
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

const persistSubscription = async (subscription) => {
  const serialized = serializeSubscription(subscription);
  const session = getCurrentUser();
  if (!session?.userId) {
    throw new Error('Melde dich an, um Push-Benachrichtigungen zu aktivieren.');
  }
  if (!serialized) {
    throw new Error('Ungültige Push-Subscription.');
  }
  const supabase = createSupabaseClient();
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
  await supabase.functions.invoke('register-push-subscription', {
    body: {
      action: 'subscribe',
      userId: session.userId,
      subscription: serialized,
      userAgent,
    },
  });
  return serialized;
};

const subscribeToPushNotifications = async () => {
  if (!isPushSupported()) {
    throw new Error('Dein Browser unterstützt keine Web-Push-Benachrichtigungen.');
  }
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    throw new Error('Push-Benachrichtigungen wurden nicht erlaubt.');
  }
  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    throw new Error('Service Worker konnte nicht gefunden werden.');
  }
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  await persistSubscription(subscription);
  return subscription;
};

const unsubscribeFromPushNotifications = async () => {
  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    return false;
  }
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return false;
  }
  try {
    const session = getCurrentUser();
    if (session?.userId) {
      const supabase = createSupabaseClient();
      await supabase.functions.invoke('register-push-subscription', {
        body: {
          action: 'unsubscribe',
          userId: session.userId,
          subscription: { endpoint: subscription.endpoint },
        },
      });
    }
  } catch (error) {
    console.warn('Konnte Push-Subscription auf dem Server nicht löschen', error);
  }
  const result = await subscription.unsubscribe();
  return result;
};

const syncPushSubscription = async () => {
  if (!isPushSupported()) {
    return null;
  }
  if (getNotificationPermissionState() !== 'granted') {
    return null;
  }
  const registration = await getServiceWorkerRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) {
    return null;
  }
  try {
    await persistSubscription(subscription);
  } catch (error) {
    console.warn('Konnte Push-Subscription nicht synchronisieren', error);
  }
  return subscription;
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
  isPushSupported,
  getNotificationPermissionState,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  syncPushSubscription,
  notifyEventAction,
};
