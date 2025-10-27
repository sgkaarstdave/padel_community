import { setupNavigation, switchView } from './controllers/navigation.js';
import { setupCalendarControls } from './controllers/calendar.js';
import { createEventControllers } from './controllers/events.js';
import { setupAuth } from './controllers/auth.js';
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
import { pruneExpiredEvents, applyUserContext } from './state/store.js';
import { getCurrentUser } from './state/auth.js';

const setupLocationSelector = () => {
  const select = document.getElementById('locationSelect');
  if (!select) {
    return;
  }
  const customWrapper = document.getElementById('customLocationWrapper');
  const customInput = document.getElementById('customLocationInput');
  const form = document.getElementById('eventForm');

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

const hydrate = () => {
  setupNavigation();
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
    });

  registerToggleHandler(toggleParticipation);
  registerOwnerHandlers({ onEdit: startEditing, onDelete: deleteEvent });

  const initialUser = getCurrentUser();
  applyUserContext(initialUser);
  refreshUI();

  const form = document.getElementById('eventForm');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }

  setupAuth({
    onAuthenticated: (user) => {
      applyUserContext(user);
      refreshUI();
      switchView('dashboard');
    },
    onLogout: () => {
      applyUserContext(null);
      refreshUI();
      switchView('dashboard');
    },
  });
};

document.addEventListener('DOMContentLoaded', hydrate);
