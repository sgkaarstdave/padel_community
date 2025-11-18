import { isActiveOrRecent } from '../utils/time.js';

const state = {
  events: [],
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

  return hasChanged;
};

const prependEvent = (event) => {
  state.events = [event, ...state.events];
};

const removeEventById = (id) => {
  const initialLength = state.events.length;
  state.events = state.events.filter((event) => event.id !== id);
  return state.events.length !== initialLength;
};

const setEvents = (events) => {
  state.events = Array.isArray(events) ? [...events] : [];
  return state.events;
};

const pruneExpiredEvents = () => {
  const now = new Date();
  const initialLength = state.events.length;
  state.events = state.events.filter((event) => isActiveOrRecent(event, now));
  return state.events.length;
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
  removeEventById,
  setEvents,
  pruneExpiredEvents,
  adjustWeekOffset,
  setWeekOffset,
  setRecentJoins,
};
