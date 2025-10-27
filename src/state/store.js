import { loadEvents, saveEvents } from './storage.js';
import { isActiveOrRecent } from '../utils/time.js';
import { sanitizeText } from '../utils/text.js';

const state = {
  events: loadEvents(),
  currentWeekOffset: 0,
  recentJoins: 0,
};

const applyUserContext = (user) => {
  const userId = user?.id ?? null;
  const displayName = sanitizeText(
    user?.name || (user?.email ? user.email.split('@')[0] : ''),
  );
  state.events = state.events.map((event) => {
    const createdBy = event.createdBy ?? null;
    const isMine = Boolean(userId && createdBy && createdBy === userId);
    const preservedOwner = sanitizeText(event.owner || '');
    const recordedOwner = sanitizeText(event.createdByName || '');
    const normalizedFallback = recordedOwner || (preservedOwner && preservedOwner !== 'Du' ? preservedOwner : 'Community');
    return {
      ...event,
      createdBy,
      createdByName: recordedOwner || (preservedOwner && preservedOwner !== 'Du' ? preservedOwner : null),
      owner: isMine && displayName ? displayName : normalizedFallback,
      createdByMe: isMine,
    };
  });
  return state.events;
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

const removeEventById = (id) => {
  const initialLength = state.events.length;
  state.events = state.events.filter((event) => event.id !== id);
  if (state.events.length !== initialLength) {
    saveEvents(state.events);
    return true;
  }
  return false;
};

const setEvents = (events) => {
  state.events = events;
  saveEvents(state.events);
};

const pruneExpiredEvents = () => {
  const now = new Date();
  const initialLength = state.events.length;
  state.events = state.events.filter((event) => isActiveOrRecent(event, now));
  if (state.events.length !== initialLength) {
    saveEvents(state.events);
  }
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
  applyUserContext,
  updateEventById,
  prependEvent,
  removeEventById,
  setEvents,
  pruneExpiredEvents,
  adjustWeekOffset,
  setWeekOffset,
  setRecentJoins,
};
