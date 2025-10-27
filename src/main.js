import { setupNavigation, switchView } from './controllers/navigation.js';
import { setupCalendarControls } from './controllers/calendar.js';
import { createEventControllers } from './controllers/events.js';
import {
  registerToggleHandler,
  renderEventsList,
  renderMySessions,
  renderMyAppointments,
  updateStats,
  bindFilters,
} from './views/events.js';
import { renderCalendar } from './views/calendar.js';
import { renderPlaces } from './views/places.js';

const refreshUI = () => {
  renderEventsList();
  renderMySessions();
  renderMyAppointments();
  renderCalendar();
  updateStats();
};

const hydrate = () => {
  setupNavigation();
  setupCalendarControls(renderCalendar);
  bindFilters(() => {
    renderEventsList();
    updateStats();
  });
  renderPlaces();

  const { toggleParticipation, handleFormSubmit } = createEventControllers({
    refreshUI,
    navigate: switchView,
  });

  registerToggleHandler(toggleParticipation);
  refreshUI();

  document.getElementById('eventForm').addEventListener('submit', handleFormSubmit);
};

document.addEventListener('DOMContentLoaded', hydrate);
