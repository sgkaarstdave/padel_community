import { state, updateEventById, prependEvent, removeEventById } from '../state/store.js';
import {
  eventsOverlap,
  getEventTimeRange,
  hasEventStarted,
  hasEventEnded,
} from '../utils/time.js';

const CONFLICT_MESSAGE =
  'Die Session überschneidet sich mit einer anderen, der du bereits zugesagt hast.';

const createEventControllers = ({ refreshUI, navigate }) => {
  const form = document.getElementById('eventForm');
  const submitButton = form?.querySelector('button[type="submit"]');
  const cancelEditButton = document.getElementById('cancelEditButton');
  const locationSelect = form?.querySelector('select[name="location"]');
  const customLocationInput = document.getElementById('customLocationInput');

  let editingEventId = null;

  const setFormMode = (mode) => {
    if (!form) {
      return;
    }
    form.dataset.mode = mode;
    if (submitButton) {
      submitButton.textContent =
        mode === 'edit' ? 'Termin aktualisieren' : 'Termin speichern';
    }
    if (cancelEditButton) {
      cancelEditButton.hidden = mode !== 'edit';
    }
  };

  const resetFormState = () => {
    editingEventId = null;
    if (form) {
      form.reset();
    }
    setFormMode('create');
  };

  const focusTitleField = () => {
    if (!form) {
      return;
    }
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const titleField = form.querySelector('input[name="title"]');
    if (titleField) {
      requestAnimationFrame(() => titleField.focus());
    }
  };

  const applyLocationSelection = (locationValue) => {
    if (!locationSelect) {
      return;
    }
    const options = Array.from(locationSelect.options || []);
    const hasMatchingOption = options.some((option) => option.value === locationValue);
    if (hasMatchingOption) {
      locationSelect.value = locationValue;
      locationSelect.dispatchEvent(new Event('change', { bubbles: true }));
      if (customLocationInput) {
        customLocationInput.value = '';
      }
    } else {
      locationSelect.value = '__custom__';
      locationSelect.dispatchEvent(new Event('change', { bubbles: true }));
      if (customLocationInput) {
        customLocationInput.value = locationValue;
      }
    }
  };

  if (form) {
    setFormMode('create');
  }

  if (cancelEditButton) {
    cancelEditButton.addEventListener('click', () => {
      resetFormState();
      navigate('my-appointments');
    });
  }

  const extractFormData = () => {
    if (!form) {
      return null;
    }
    const formData = new FormData(form);
    const raw = Object.fromEntries(formData.entries());

    const title = raw.title?.trim();
    if (!title) {
      window.alert('Bitte gib einen Titel für den Termin an.');
      return null;
    }

    const selectedLocation = raw.location;
    let locationValue = '';
    if (selectedLocation === '__custom__') {
      locationValue = raw.customLocation?.trim() ?? '';
    } else {
      locationValue = selectedLocation?.trim() ?? '';
    }
    if (!locationValue) {
      window.alert('Bitte wähle einen Ort aus oder gib einen eigenen ein.');
      return null;
    }

    const date = raw.date;
    const time = raw.time;
    const rawDuration = Number(raw.duration);
    const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 2;
    const range = getEventTimeRange({ date, time, duration });
    if (!range) {
      window.alert('Bitte gib ein gültiges Datum und eine gültige Startzeit an.');
      return null;
    }

    const now = new Date();
    if (range.start.getTime() <= now.getTime()) {
      window.alert('Der Termin muss in der Zukunft liegen.');
      return null;
    }

    const deadlineValue = raw.deadline?.trim();
    if (!deadlineValue) {
      window.alert('Bitte gib eine Zusagefrist an.');
      return null;
    }
    const deadlineDate = new Date(deadlineValue);
    if (Number.isNaN(deadlineDate.getTime())) {
      window.alert('Bitte gib eine gültige Zusagefrist an.');
      return null;
    }
    if (deadlineDate.getTime() <= now.getTime()) {
      window.alert('Die Zusagefrist muss in der Zukunft liegen.');
      return null;
    }
    const minimumLeadTimeMs = 60 * 60 * 1000;
    if (deadlineDate.getTime() > range.start.getTime() - minimumLeadTimeMs) {
      window.alert(
        'Die Zusagefrist muss mindestens eine Stunde vor dem Start der Session liegen.',
      );
      return null;
    }

    const rawTotalCostValue = raw.totalCost ?? '';
    const hasTotalCostInput = String(rawTotalCostValue).trim() !== '';
    if (!hasTotalCostInput) {
      window.alert('Bitte gib die Gesamtkosten der Session an.');
      return null;
    }

    const totalCostInput = Math.max(0, Number(raw.totalCost));
    const normalizedTotalCost = Number.isFinite(totalCostInput)
      ? Math.round(totalCostInput * 100) / 100
      : 0;

    const capacityValue = Math.max(2, Number(raw.capacity) || 0);

    return {
      title,
      location: locationValue,
      date,
      time,
      duration,
      totalCost: normalizedTotalCost || 0,
      capacity: capacityValue,
      skill: raw.skill || 'Intermediate',
      notes: raw.notes?.trim() ?? '',
      paymentLink: raw.paymentLink?.trim() || '',
      deadline: deadlineValue,
    };
  };

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
    const normalized = extractFormData();
    if (!normalized) {
      return;
    }

    const now = new Date();

    if (editingEventId) {
      const existingEvent = state.events.find((event) => event.id === editingEventId);
      if (!existingEvent) {
        resetFormState();
        return;
      }
      if (hasEventStarted(existingEvent, now)) {
        window.alert('Dieser Termin kann nicht mehr bearbeitet werden.');
        resetFormState();
        return;
      }

      const draftEvent = { ...existingEvent, ...normalized };
      const conflictingSession = findConflictingSession(draftEvent);
      if (conflictingSession) {
        window.alert(CONFLICT_MESSAGE);
        return;
      }

      const updated = updateEventById(editingEventId, (event) => {
        if (!event.createdByMe) {
          return null;
        }
        const history = Array.isArray(event.history) ? event.history : [];
        const attendees = Math.max(0, Number(event.attendees) || 0);
        const capacity = Math.max(attendees, normalized.capacity);
        return {
          ...event,
          ...normalized,
          capacity,
          history: [{ timestamp: now.toISOString(), type: 'update' }, ...history],
        };
      });

      if (updated) {
        resetFormState();
        refreshUI();
        navigate('my-appointments');
      }
      return;
    }

    const id = `evt-${crypto.randomUUID?.() || Date.now()}`;
    const attendees = 1;
    const createdAt = now.toISOString();

    const draft = {
      ...normalized,
      id,
      attendees,
    };
    const conflictingSession = findConflictingSession(draft);
    if (conflictingSession) {
      window.alert(CONFLICT_MESSAGE);
      return;
    }

    const eventToStore = {
      ...normalized,
      id,
      owner: 'Du',
      attendees,
      createdAt,
      joined: true,
      createdByMe: true,
      history: [
        { timestamp: createdAt, type: 'create' },
        { timestamp: createdAt, type: 'join' },
      ],
    };

    prependEvent(eventToStore);
    resetFormState();
    refreshUI();
    navigate('my-appointments');
    focusTitleField();
  };

  const setFieldValue = (selector, value = '') => {
    if (!form) {
      return;
    }
    const field = form.querySelector(selector);
    if (field) {
      field.value = value ?? '';
    }
  };

  const populateForm = (event) => {
    if (!form) {
      return;
    }
    setFieldValue('input[name="title"]', event.title || '');
    setFieldValue('input[name="date"]', event.date || '');
    setFieldValue('input[name="time"]', event.time || '');
    setFieldValue('input[name="duration"]', event.duration ?? 2);
    setFieldValue('input[name="totalCost"]', event.totalCost ?? 0);
    setFieldValue('input[name="capacity"]', event.capacity ?? 4);
    setFieldValue('select[name="skill"]', event.skill || 'Intermediate');
    setFieldValue('textarea[name="notes"]', event.notes || '');
    setFieldValue('input[name="paymentLink"]', event.paymentLink || '');
    setFieldValue('input[name="deadline"]', event.deadline || '');
    applyLocationSelection(event.location);
  };

  const startEditing = (id) => {
    if (!form) {
      return;
    }
    const event = state.events.find((session) => session.id === id);
    if (!event || !event.createdByMe) {
      return;
    }
    if (hasEventStarted(event)) {
      window.alert('Dieser Termin kann nicht mehr bearbeitet werden.');
      return;
    }
    editingEventId = id;
    populateForm(event);
    setFormMode('edit');
    navigate('my-appointments');
    focusTitleField();
  };

  const deleteEvent = (id) => {
    const event = state.events.find((session) => session.id === id);
    if (!event || !event.createdByMe) {
      return;
    }
    if (hasEventStarted(event)) {
      window.alert('Dieser Termin kann nicht mehr gelöscht werden.');
      return;
    }
    const confirmed = window.confirm('Möchtest du diesen Termin wirklich löschen?');
    if (!confirmed) {
      return;
    }
    const removed = removeEventById(id);
    if (removed) {
      if (editingEventId === id) {
        resetFormState();
      }
      refreshUI();
      navigate('my-appointments');
    }
  };

  return { toggleParticipation, handleFormSubmit, startEditing, deleteEvent };
};

export { createEventControllers };
