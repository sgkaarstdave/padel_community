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
  toggle: null,
  toggleWrapper: null,
  toggleLabel: null,
  statusBadge: null,
  hint: null,
  busy: false,
  messageOverride: null,
  state: getPushState(),
  unsubscribe: null,
};

const getPushElements = () => {
  if (!pushUi.card && typeof document !== 'undefined') {
    pushUi.card = document.getElementById('pushPermissionCard');
    pushUi.description = document.getElementById('pushPermissionDescription');
    pushUi.toggle = document.getElementById('pushSettingsToggle');
    pushUi.toggleWrapper = document.getElementById('pushSettingsToggleWrapper');
    pushUi.toggleLabel = document.getElementById('pushSettingsToggleLabel');
    pushUi.statusBadge = document.getElementById('pushSettingsStatus');
    pushUi.hint = document.getElementById('pushSettingsHint');
  }
  return pushUi;
};

const setPushCardBusy = (busy) => {
  pushUi.busy = busy;
  updateSettingsPushView();
};

const setPushCardMessage = (message, state = 'info') => {
  const elements = getPushElements();
  if (!elements.card) {
    return;
  }
  pushUi.messageOverride = { message, state };
  if (elements.description) {
    elements.description.textContent = message;
  }
  elements.card.dataset.state = state;
  updateSettingsPushView({ message, state });
};

const clearPushCardMessageOverride = () => {
  pushUi.messageOverride = null;
};

const getPushStatusMessage = (state, options = {}) => {
  const permission = state.permission;
  const isDenied = permission === 'denied';
  const isEnabled = Boolean(state.isEnabled) && !isDenied;

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

  if (options.resetMessage) {
    return defaultState;
  }
  if (pushUi.messageOverride && !options.resetMessage) {
    return pushUi.messageOverride;
  }
  if (state.lastError) {
    return { state: 'error', message: state.lastError };
  }
  return defaultState;
};

const updateSettingsPushView = (statusMessage) => {
  const elements = getPushElements();
  if (!elements.toggle && !elements.hint && !elements.statusBadge) {
    return;
  }
  const state = pushUi.state || getPushState();
  const permission = state.permission;
  const isDenied = permission === 'denied';
  const isEnabled = Boolean(state.isEnabled) && !isDenied;
  const resolvedMessage = statusMessage || getPushStatusMessage(state);
  const isDisabled = pushUi.busy || isDenied || !state.isSupported;

  if (elements.toggle) {
    elements.toggle.checked = isEnabled;
    elements.toggle.disabled = isDisabled;
    elements.toggle.setAttribute('aria-checked', isEnabled ? 'true' : 'false');
    elements.toggle.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
    elements.toggle.setAttribute('aria-busy', pushUi.busy ? 'true' : 'false');
  }
  if (elements.toggleWrapper) {
    elements.toggleWrapper.classList.toggle('is-loading', pushUi.busy);
    elements.toggleWrapper.classList.toggle('is-disabled', isDisabled);
  }
  if (elements.toggleLabel) {
    elements.toggleLabel.textContent = pushUi.busy ? '…' : isEnabled ? 'Ein' : 'Aus';
  }
  if (elements.statusBadge) {
    elements.statusBadge.textContent = isEnabled ? 'Aktiv' : 'Deaktiviert';
    elements.statusBadge.dataset.state = isEnabled ? 'active' : 'inactive';
  }
  if (elements.hint && resolvedMessage?.message) {
    elements.hint.textContent = resolvedMessage.message;
  }
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
    updateSettingsPushView(getPushStatusMessage(state, options));
    return;
  }
  elements.card.hidden = false;
  const statusMessage = getPushStatusMessage(state, options);
  if (elements.description) {
    elements.description.textContent = statusMessage.message;
  }
  elements.card.dataset.state = statusMessage.state;
  updateSettingsPushView(statusMessage);
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

// Toggle im Einstellungsbereich reagiert auf Nutzeraktionen.
const handlePushToggleChange = (event) => {
  const target = event.target;
  const state = pushUi.state || getPushState();
  const permission = state.permission;
  const isDenied = permission === 'denied';
  const isEnabled = Boolean(state.isEnabled) && !isDenied;
  const desiredState = target.checked;

  if (pushUi.busy) {
    target.checked = isEnabled;
    return;
  }

  if (!state.isSupported || isDenied) {
    target.checked = isEnabled;
    setPushCardMessage(
      'Benachrichtigungen sind im Browser blockiert. Bitte erlaube sie zuerst.',
      'error'
    );
    return;
  }

  if (desiredState === isEnabled) {
    return;
  }

  const currentUser = getCurrentUser();
  if (!currentUser) {
    target.checked = false;
    setPushCardMessage('Bitte melde dich an, um Push-Benachrichtigungen zu steuern.', 'error');
    return;
  }

  if (desiredState) {
    handleEnablePush();
    return;
  }
  handleDisablePush();
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
  elements.toggle?.addEventListener('change', handlePushToggleChange);
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
let lastUpdated = null;
let isRefreshingDashboard = false;

const formatLastUpdated = (value) => {
  if (!value) {
    return '–';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '–';
  }
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
};

const updateLastUpdatedDisplay = () => {
  const label = document.getElementById('lastUpdatedLabel');
  if (!label) {
    return;
  }
  label.textContent = `Zuletzt aktualisiert: ${formatLastUpdated(lastUpdated)}`;
};

const setLastUpdated = (value) => {
  lastUpdated = value instanceof Date ? value : value ? new Date(value) : null;
  updateLastUpdatedDisplay();
};

const setRefreshingState = (refreshing) => {
  isRefreshingDashboard = refreshing;
  document.querySelectorAll('[data-refresh-button]').forEach((button) => {
    button.classList.toggle('is-loading', refreshing);
    button.setAttribute('aria-busy', refreshing ? 'true' : 'false');
    if (button.dataset.lockDuringRefresh === 'true') {
      button.disabled = refreshing;
    }
  });
  document.querySelectorAll('[data-refresh-icon]').forEach((icon) => {
    icon.classList.toggle('is-spinning', refreshing);
  });
};

const refreshDashboardData = async () => {
  if (isRefreshingDashboard) {
    return;
  }
  setRefreshingState(true);
  try {
    await loadEventsFromBackend();
  } finally {
    setRefreshingState(false);
  }
};

const bindRefreshControls = () => {
  document.querySelectorAll('[data-action="refresh-dashboard"]').forEach((button) => {
    if (button.dataset.refreshBound === 'true') {
      return;
    }
    button.addEventListener('click', (event) => {
      event.preventDefault();
      refreshDashboardData();
    });
    button.dataset.refreshBound = 'true';
  });
  updateLastUpdatedDisplay();
};

const loadEventsFromBackend = async () => {
  try {
    setDataError('');
    const events = await fetchAllEvents();
    setEvents(events);
    refreshUI();
    setLastUpdated(new Date());
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
      refreshDashboardData();
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
    bindRefreshControls();

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
  await refreshDashboardData();
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
