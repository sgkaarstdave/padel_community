import { state, updateEventById, prependEvent } from '../state/store.js';
import {
  eventsOverlap,
  getEventTimeRange,
  hasEventStarted,
  hasEventEnded,
} from '../utils/time.js';

const CONFLICT_MESSAGE =
  'Die Session überschneidet sich mit einer anderen, der du bereits zugesagt hast.';

const createEventControllers = ({ refreshUI, navigate }) => {
  const findConflictingSession = (targetEvent) => {
    if (!targetEvent) {
      return null;
    }
    return state.events.find((event) => {
      if (event.id === targetEvent.id || hasEventEnded(event)) {
        return false;
      }
      return event.joined && eventsOverlap(event, targetEvent);
    });
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
    if (hasEventStarted(targetEvent, now)) {
      window.alert('Diese Session hat bereits begonnen.');
      return false;
    }
    const changed = updateEventById(id, (event) => {
      const deadlinePassed =
        !!event.deadline && new Date(event.deadline).getTime() < now.getTime();
      if (hasEventEnded(event, now)) {
        return null;
      }
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
    if (hasEventEnded(event)) {
      window.alert('Diese Session liegt in der Vergangenheit.');
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
    const form = domEvent.target;
    const formData = new FormData(form);
    const newEvent = Object.fromEntries(formData.entries());
    const id = `evt-${crypto.randomUUID?.() || Date.now()}`;
    const attendees = 1;
    const createdAt = new Date().toISOString();

    const title = newEvent.title?.trim();
    if (!title) {
      window.alert('Bitte gib einen Titel für den Termin an.');
      return;
    }

    const locationValue =
      newEvent.location === '__custom__'
        ? newEvent.customLocation?.trim()
        : newEvent.location?.trim();
    if (!locationValue) {
      window.alert('Bitte wähle einen Ort aus oder gib einen eigenen ein.');
      return;
    }

    const totalCostInput = Math.max(0, Number(newEvent.totalCost));
    const normalizedTotalCost = Number.isFinite(totalCostInput)
      ? Math.round(totalCostInput * 100) / 100
      : 0;

    const rawDuration = Number(newEvent.duration);
    const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 2;
    const capacityValue = Math.max(2, Number(newEvent.capacity) || 0);

    const date = newEvent.date;
    const time = newEvent.time;
    const range = getEventTimeRange({ date, time, duration });
    if (!range) {
      window.alert('Bitte gib ein gültiges Datum und eine gültige Startzeit an.');
      return;
    }

    const now = new Date();
    if (range.start.getTime() <= now.getTime()) {
      window.alert('Der Termin muss in der Zukunft liegen.');
      return;
    }

    let deadline = '';
    if (newEvent.deadline) {
      const deadlineDate = new Date(newEvent.deadline);
      if (Number.isNaN(deadlineDate.getTime())) {
        window.alert('Bitte gib eine gültige Zusagefrist an.');
        return;
      }
      if (deadlineDate.getTime() <= now.getTime()) {
        window.alert('Die Zusagefrist muss in der Zukunft liegen.');
        return;
      }
      const minimumLeadTimeMs = 60 * 60 * 1000;
      if (deadlineDate.getTime() > range.start.getTime() - minimumLeadTimeMs) {
        window.alert(
          'Die Zusagefrist muss mindestens eine Stunde vor dem Start der Session liegen.',
        );
        return;
      }
      deadline = deadlineDate.toISOString().slice(0, 16);
    }

    const normalized = {
      id,
      title,
      location: locationValue,
      date,
      time,
      duration,
      totalCost: normalizedTotalCost || 0,
      capacity: capacityValue,
      skill: newEvent.skill,
      notes: newEvent.notes?.trim() ?? '',
      owner: 'Du',
      attendees,
      deadline,
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
    form.reset();
    refreshUI();
    navigate('dashboard');
    domEvent.target.querySelector('input[name="title"]').focus();
  };

  return { toggleParticipation, handleFormSubmit };
};

export { createEventControllers };
