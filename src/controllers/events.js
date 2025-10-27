import { state, updateEventById, prependEvent } from '../state/store.js';
import { eventsOverlap } from '../utils/time.js';

const CONFLICT_MESSAGE =
  'Die Session überschneidet sich mit einer anderen, der du bereits zugesagt hast.';

const createEventControllers = ({ refreshUI, navigate }) => {
  const findConflictingSession = (targetEvent) => {
    if (!targetEvent) {
      return null;
    }
    return state.events.find(
      (event) => event.id !== targetEvent.id && event.joined && eventsOverlap(event, targetEvent)
    );
  };

  const joinSession = (id) => {
    const targetEvent = state.events.find((event) => event.id === id);
    if (!targetEvent) {
      return false;
    }
    const conflictingSession = findConflictingSession(targetEvent);
    if (conflictingSession) {
      window.alert(CONFLICT_MESSAGE);
      return false;
    }
    const now = new Date();
    const changed = updateEventById(id, (event) => {
      const deadlinePassed =
        !!event.deadline && new Date(event.deadline).getTime() < now.getTime();
      const capacity = Math.max(0, Number(event.capacity) || 0);
      const attendees = Math.max(0, Number(event.attendees) || 0);
      const isFull = capacity === 0 || attendees >= capacity;
      if (event.joined || deadlinePassed || isFull) {
        return null;
      }
      const history = Array.isArray(event.history) ? event.history : [];
      return {
        ...event,
        joined: true,
        attendees: Math.min(capacity, attendees + 1),
        history: [{ timestamp: now.toISOString(), type: 'join' }, ...history],
      };
    });
    if (changed) {
      refreshUI();
    }
    return changed;
  };

  const withdrawFromSession = (id) => {
    const now = new Date();
    const changed = updateEventById(id, (event) => {
      if (!event.joined) {
        return null;
      }
      const attendees = Math.max(0, Number(event.attendees) || 0);
      const history = Array.isArray(event.history) ? event.history : [];
      return {
        ...event,
        joined: false,
        attendees: Math.max(0, attendees - 1),
        history: [{ timestamp: now.toISOString(), type: 'leave' }, ...history],
      };
    });
    if (changed) {
      refreshUI();
    }
    return changed;
  };

  const toggleParticipation = (id) => {
    const event = state.events.find((session) => session.id === id);
    if (!event) {
      return;
    }
    if (event.joined) {
      const confirmed = window.confirm(
        'Willst du deine Teilnahme wirklich zurückziehen?'
      );
      if (!confirmed) {
        return;
      }
      withdrawFromSession(id);
    } else {
      joinSession(id);
    }
  };

  const handleFormSubmit = (domEvent) => {
    domEvent.preventDefault();
    const formData = new FormData(domEvent.target);
    const newEvent = Object.fromEntries(formData.entries());
    const id = `evt-${crypto.randomUUID?.() || Date.now()}`;
    const attendees = 1;
    const createdAt = new Date().toISOString();

    const totalCostInput = Math.max(0, Number(newEvent.totalCost));
    const normalizedTotalCost = Number.isFinite(totalCostInput)
      ? Math.round(totalCostInput * 100) / 100
      : 0;

    const normalized = {
      id,
      title: newEvent.title.trim(),
      location: newEvent.location.trim(),
      date: newEvent.date,
      time: newEvent.time,
      duration: Number(newEvent.duration) || 2,
      totalCost: normalizedTotalCost || 0,
      capacity: Math.max(1, Number(newEvent.capacity)) || 4,
      skill: newEvent.skill,
      notes: newEvent.notes?.trim() ?? '',
      owner: 'Du',
      attendees,
      deadline: newEvent.deadline || '',
      paymentLink: newEvent.paymentLink?.trim() || '',
      createdAt,
      joined: true,
      createdByMe: true,
      history: [
        { timestamp: createdAt, type: 'create' },
        { timestamp: createdAt, type: 'join' },
      ],
    };

    const conflictingSession = findConflictingSession(normalized);
    if (conflictingSession) {
      window.alert(CONFLICT_MESSAGE);
      return;
    }

    prependEvent(normalized);
    domEvent.target.reset();
    refreshUI();
    navigate('dashboard');
    domEvent.target.querySelector('input[name="title"]').focus();
  };

  return { toggleParticipation, handleFormSubmit };
};

export { createEventControllers };
