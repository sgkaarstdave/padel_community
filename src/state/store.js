import { loadEvents, saveEvents } from './storage.js';

const state = {
  events: loadEvents(),
  currentWeekOffset: 0,
  recentJoins: 0,
};

const updateEventById = (id, updater) => {
  let hasChanged = false;
  state.events = state.events.map((event) => {
    if (event.id !== id) {
      return event;
    }
    const nextEvent = updater({ ...event });
    if (!nextEvent) {
      return event;
    }
    hasChanged = true;
    return nextEvent;
  });

  if (hasChanged) {
    saveEvents(state.events);
  }

  return hasChanged;
};

const prependEvent = (event) => {
  state.events = [event, ...state.events];
  saveEvents(state.events);
};

const setEvents = (events) => {
  state.events = events;
  saveEvents(state.events);
};

const adjustWeekOffset = (delta) => {
  state.currentWeekOffset += delta;
  return state.currentWeekOffset;
};

const setWeekOffset = (offset) => {
  state.currentWeekOffset = offset;
  return state.currentWeekOffset;
};

const setRecentJoins = (value) => {
  state.recentJoins = value;
  return state.recentJoins;
};

export {
  state,
  updateEventById,
  prependEvent,
  setEvents,
  adjustWeekOffset,
  setWeekOffset,
  setRecentJoins,
};
