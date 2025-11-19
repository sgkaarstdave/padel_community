import { setupNavigation, switchView } from './controllers/navigation.js';
import { setupCalendarControls } from './controllers/calendar.js';
import { createEventControllers } from './controllers/events.js';
import { initializeAuth } from './controllers/auth.js';
import { getCurrentUser } from './state/auth.js';
import {
  registerToggleHandler,
  registerOwnerHandlers,
  renderEventsList,
  renderEventsHistory,
  renderMySessions,
  renderMyAppointments,
  updateStats,
  bindFilters,
} from './views/events.js';
import { renderCalendar } from './views/calendar.js';
import { renderPlaces } from './views/places.js';
import { places } from './state/storage.js';
import { pruneExpiredEvents, setEvents } from './state/store.js';
import { fetchAllEvents } from './state/eventRepository.js';
import {
  getPushState,
  subscribePushChanges,
  enablePushNotifications,
  disablePushNotifications,
  initPushForCurrentUser,
} from './state/pushSubscriptions.js';

const OFFLINE_NOTICE =
  'Server gerade nicht erreichbar. Bitte prüfe deine Verbindung oder versuche es später erneut.';

const pushUi = {
  card: null,
  description: null,
  enableButton: null,
  disableButton: null,
  busy: false,
  messageOverride: null,
  state: getPushState(),
  unsubscribe: null,
};

const getPushElements = () => {
  if (!pushUi.card && typeof document !== 'undefined') {
    pushUi.card = document.getElementById('pushPermissionCard');
    pushUi.description = document.getElementById('pushPermissionDescription');
    pushUi.enableButton = document.getElementById('enablePushButton');
    pushUi.disableButton = document.getElementById('disablePushButton');
  }
  return pushUi;
};

const setPushCardBusy = (busy) => {
  const elements = getPushElements();
  pushUi.busy = busy;
  const permission = pushUi.state?.permission || getPushState().permission;
  const isDenied = permission === 'denied';
  if (elements.enableButton) {
    elements.enableButton.disabled = busy || isDenied;
    elements.enableButton.classList.toggle('is-loading', busy);
  }
  if (elements.disableButton) {
    elements.disableButton.disabled = busy;
    elements.disableButton.classList.toggle('is-loading', busy);
  }
};

const setPushCardMessage = (message, state = 'info') => {
  const elements = getPushElements();
  if (!elements.card || !elements.description) {
    return;
  }
  pushUi.messageOverride = { message, state };
  elements.description.textContent = message;
  elements.card.dataset.state = state;
};

const clearPushCardMessageOverride = () => {
  pushUi.messageOverride = null;
};

const refreshPushPermissionCard = (options = {}) => {
  const elements = getPushElements();
  if (!elements.card) {
    return;
  }
  if (options.resetMessage) {
    clearPushCardMessageOverride();
  }
  const state = pushUi.state || getPushState();
  const isAuthenticated = !!getCurrentUser();
  if (!isAuthenticated || !state.isSupported) {
    elements.card.hidden = true;
    return;
  }
  elements.card.hidden = false;
  const permission = state.permission;
  const isDenied = permission === 'denied';
  const isEnabled = Boolean(state.isEnabled) && !isDenied;

  if (elements.enableButton) {
    elements.enableButton.hidden = isEnabled;
    elements.enableButton.disabled = pushUi.busy || isDenied;
  }
  if (elements.disableButton) {
    elements.disableButton.hidden = !isEnabled;
    elements.disableButton.disabled = pushUi.busy;
  }

  if (!elements.description) {
    return;
  }

  const defaultState = (() => {
    if (isDenied) {
      return { state: 'error', message: 'Benachrichtigungen im Browser nicht erlaubt.' };
    }
    if (isEnabled) {
      return {
        state: 'success',
        message:
          'Push-Benachrichtigungen sind aktiv. Du erhältst Updates zu neuen Events, Zusagen und Absagen.',
      };
    }
    return {
      state: 'info',
      message: 'Push-Benachrichtigungen sind deaktiviert. Aktiviere sie, um keine Sessions zu verpassen.',
    };
  })();

  const statusMessage = (() => {
    if (pushUi.messageOverride && !options.resetMessage) {
      return pushUi.messageOverride;
    }
    if (state.lastError) {
      return { state: 'error', message: state.lastError };
    }
    return defaultState;
  })();

  elements.description.textContent = statusMessage.message;
  elements.card.dataset.state = statusMessage.state;
};

const handleEnablePush = async () => {
  if (pushUi.busy) {
    return;
  }
  const currentUser = getCurrentUser();
  if (!currentUser) {
    setPushCardMessage('Bitte melde dich an, um Push-Benachrichtigungen zu aktivieren.', 'error');
    return;
  }
  setPushCardBusy(true);
  try {
    await enablePushNotifications(currentUser);
    clearPushCardMessageOverride();
  } catch (error) {
    setPushCardMessage(
      error?.message || 'Push-Benachrichtigungen konnten nicht aktiviert werden.',
      'error'
    );
  } finally {
    setPushCardBusy(false);
    refreshPushPermissionCard();
  }
};

const handleDisablePush = async () => {
  if (pushUi.busy) {
    return;
  }
  const currentUser = getCurrentUser();
  setPushCardBusy(true);
  try {
    await disablePushNotifications(currentUser);
    clearPushCardMessageOverride();
  } catch (error) {
    setPushCardMessage(
      error?.message || 'Push-Benachrichtigungen konnten nicht deaktiviert werden.',
      'error'
    );
  } finally {
    setPushCardBusy(false);
    refreshPushPermissionCard();
  }
};

const setupPushPermissionCard = () => {
  const elements = getPushElements();
  if (!elements.card || elements.card.dataset.initialized === 'true') {
    return;
  }
  elements.card.dataset.initialized = 'true';
  elements.card.hidden = true;
  // Push-Status aus dem State-Modul abonnieren, damit das Dashboard live reagiert.
  pushUi.state = getPushState();
  if (!pushUi.unsubscribe) {
    pushUi.unsubscribe = subscribePushChanges((state) => {
      pushUi.state = state;
      refreshPushPermissionCard();
    });
  }
  elements.enableButton?.addEventListener('click', handleEnablePush);
  elements.disableButton?.addEventListener('click', handleDisablePush);
  refreshPushPermissionCard();
};

const setupLocationSelector = () => {
  const select = document.getElementById('locationSelect');
  if (!select) {
    return;
  }
  const customWrapper = document.getElementById('customLocationWrapper');
  const customInput = document.getElementById('customLocationInput');
  const form = document.getElementById('eventForm');

  if (customWrapper) {
    customWrapper.hidden = true;
  }
  select.innerHTML = '';

  places.forEach((place) => {
    const option = document.createElement('option');
    option.value = place.name;
    option.textContent = `${place.name} (${place.city})`;
    select.appendChild(option);
  });

  const customOption = document.createElement('option');
  customOption.value = '__custom__';
  customOption.textContent = 'Eigener Ort hinzufügen…';
  select.appendChild(customOption);

  const updateVisibility = () => {
    const isCustom = select.value === '__custom__';
    if (customWrapper) {
      customWrapper.hidden = !isCustom;
    }
    if (customInput) {
      if (!isCustom) {
        customInput.value = '';
      }
      customInput.required = isCustom;
    }
    if (isCustom && customInput) {
      customInput.focus();
    }
  };

  select.addEventListener('change', updateVisibility);

  if (form) {
    form.addEventListener('reset', () => {
      if (select.options.length > 0) {
        select.selectedIndex = 0;
      }
      updateVisibility();
    });
  }

  if (select.options.length > 0) {
    select.selectedIndex = 0;
  }
  updateVisibility();
};

const refreshUI = () => {
  pruneExpiredEvents();
  renderEventsList();
  renderEventsHistory();
  renderMySessions();
  renderMyAppointments();
  renderCalendar();
  updateStats();
};

const setDataError = (message) => {
  const banner = document.getElementById('dataError');
  if (!banner) {
    return;
  }
  if (message) {
    banner.textContent = message;
    banner.hidden = false;
  } else {
    banner.textContent = '';
    banner.hidden = true;
  }
};

let hasBootstrapped = false;
let formListenerAttached = false;

const loadEventsFromBackend = async () => {
  try {
    setDataError('');
    const events = await fetchAllEvents();
    setEvents(events);
    refreshUI();
  } catch (error) {
    console.error('Konnte Events nicht laden', error);
    if (error?.isOffline) {
      setDataError(error.message || OFFLINE_NOTICE);
      return;
    }
    setDataError(error?.message || 'Events konnten nicht geladen werden. Bitte versuche es später erneut.');
  }
};

const bootstrapApplication = async () => {
  if (!hasBootstrapped) {
    setupNavigation(() => {
      refreshUI();
      loadEventsFromBackend();
    });
    switchView('dashboard');
    setupCalendarControls(renderCalendar);
    bindFilters(() => {
      renderEventsList();
      renderEventsHistory();
      updateStats();
    });
    renderPlaces();
    setupLocationSelector();

    const { toggleParticipation, handleFormSubmit, startEditing, deleteEvent } =
      createEventControllers({
        refreshUI,
        navigate: switchView,
        reportError: setDataError,
      });

    registerToggleHandler(toggleParticipation);
    registerOwnerHandlers({ onEdit: startEditing, onDelete: deleteEvent });

    const form = document.getElementById('eventForm');
    if (form && !formListenerAttached) {
      form.addEventListener('submit', handleFormSubmit);
      formListenerAttached = true;
    }

    hasBootstrapped = true;
  }

  refreshUI();
  await loadEventsFromBackend();
};

document.addEventListener('DOMContentLoaded', () => {
  setupPushPermissionCard();
  initializeAuth({
    onAuthenticated: (session) => {
      bootstrapApplication().catch((error) => {
        console.error('Fehler beim Starten der Anwendung', error);
        setDataError('Die Anwendung konnte nicht vollständig geladen werden.');
      });
      // Nach erfolgreichem Login direkt versuchen, die bestehende Subscription zu registrieren.
      initPushForCurrentUser(session)
        .catch((error) => {
          console.warn('Push-Subscription konnte nicht synchronisiert werden', error);
        })
        .finally(() => {
          refreshPushPermissionCard({ resetMessage: true });
        });
    },
    onLogout: () => {
      pushUi.state = getPushState();
      refreshPushPermissionCard({ resetMessage: true });
    },
  });
});
