import { state, updateEventById, prependEvent, removeEventById } from '../state/store.js';
import {
  createEvent as persistEvent,
  updateEvent as persistEventUpdate,
  deleteEvent as removeEventRemote,
  incrementSlotsTaken,
  decrementSlotsTaken,
} from '../state/eventRepository.js';
import { places } from '../state/storage.js';
import { getCurrentUser } from '../state/auth.js';
import {
  eventsOverlap,
  getEventTimeRange,
  hasEventStarted,
  hasEventEnded,
} from '../utils/time.js';

const DEADLINE_MINIMUM_OFFSET_MS = 60 * 1000;
const DEADLINE_MIN_GAP_BEFORE_START_MS = 30 * 60 * 1000;
const DEADLINE_SLOT_INTERVAL_MS = 30 * 60 * 1000;

const formatDeadlineForInput = (value) => {
  if (!value) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (num) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const TIME_SLOT_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, '0');
  const minutes = index % 2 === 0 ? '00' : '30';
  return `${hours}:${minutes}`;
});

const CONFLICT_MESSAGE =
  'Die Session überschneidet sich mit einer anderen, der du bereits zugesagt hast.';

const createEventControllers = ({ refreshUI, navigate, reportError }) => {
  const form = document.getElementById('eventForm');
  const submitButton = form?.querySelector('button[type="submit"]');
  const cancelEditButton = document.getElementById('cancelEditButton');
  const locationSelect = form?.querySelector('select[name="location"]');
  const customLocationInput = document.getElementById('customLocationInput');
  const dateInput = form?.querySelector('input[name="date"]');
  const timeInput =
    form?.querySelector('select[name="time"]') || form?.querySelector('input[name="time"]');
  const deadlineInput = form?.querySelector('input[name="rsvpDeadline"]');
  const deadlineSelect = form?.querySelector('select[name="rsvpDeadlineOption"]');
  const deadlinePlaceholderText =
    deadlineSelect?.querySelector('option[value=""]')?.textContent?.trim() ||
    'Zusage-Deadline wählen';
  const notifyError = typeof reportError === 'function' ? reportError : () => {};
  const locationCityMap = new Map(places.map((place) => [place.name, place.city || '']));

  let editingEventId = null;

  const ensureSelectOption = (selectElement, value, labelText) => {
    if (!selectElement || !value || selectElement.tagName !== 'SELECT') {
      return;
    }
    const hasOption = Array.from(selectElement.options).some(
      (option) => option.value === value,
    );
    if (!hasOption) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = labelText ?? value;
      option.dataset.slotOption = 'custom';
      selectElement.appendChild(option);
    }
  };

  const populateTimeOptions = (selectElement) => {
    if (!selectElement || selectElement.tagName !== 'SELECT') {
      return;
    }
    const hasSlotOptions = selectElement.querySelector('option[data-slot-option]');
    if (hasSlotOptions) {
      return;
    }
    TIME_SLOT_OPTIONS.forEach((slot) => {
      const option = document.createElement('option');
      option.value = slot;
      option.textContent = slot;
      option.dataset.slotOption = 'true';
      selectElement.appendChild(option);
    });
  };

  populateTimeOptions(timeInput);

  const getStartDateFromInputs = () => {
    if (!dateInput?.value || !timeInput?.value) {
      return null;
    }
    const start = new Date(`${dateInput.value}T${timeInput.value}`);
    if (Number.isNaN(start.getTime())) {
      return null;
    }
    return start;
  };

  const setHiddenDeadlineValue = (value) => {
    if (deadlineInput) {
      deadlineInput.value = value || '';
    }
  };

  const formatDeadlineOptionLabel = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value || '';
    }
    return new Intl.DateTimeFormat('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const roundDateToSlot = (date, direction = 'ceil') => {
    const timestamp = date.getTime();
    const remainder = timestamp % DEADLINE_SLOT_INTERVAL_MS;
    if (remainder === 0) {
      return new Date(timestamp);
    }
    if (direction === 'floor') {
      return new Date(timestamp - remainder);
    }
    return new Date(timestamp + (DEADLINE_SLOT_INTERVAL_MS - remainder));
  };

  const buildDeadlineSlotDates = () => {
    const startDate = getStartDateFromInputs();
    if (!startDate) {
      return [];
    }
    const latestAllowed = new Date(startDate.getTime() - DEADLINE_MIN_GAP_BEFORE_START_MS);
    const nowWithOffset = new Date(Date.now() + DEADLINE_MINIMUM_OFFSET_MS);
    if (latestAllowed.getTime() < nowWithOffset.getTime()) {
      return [];
    }
    const earliestSlot = roundDateToSlot(nowWithOffset, 'ceil');
    const latestSlot = roundDateToSlot(latestAllowed, 'floor');
    if (latestSlot.getTime() < earliestSlot.getTime()) {
      return [];
    }
    const slots = [];
    for (
      let slotTime = earliestSlot.getTime();
      slotTime <= latestSlot.getTime();
      slotTime += DEADLINE_SLOT_INTERVAL_MS
    ) {
      slots.push(new Date(slotTime));
    }
    return slots;
  };

  const updateDeadlineSelectOptions = () => {
    if (!deadlineSelect) {
      return;
    }
    const currentValue = deadlineInput?.value || '';
    const startDate = getStartDateFromInputs();
    const slots = startDate ? buildDeadlineSlotDates() : [];
    const fragment = document.createDocumentFragment();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = deadlinePlaceholderText;
    fragment.appendChild(placeholder);
    slots.forEach((slotDate) => {
      const value = formatDeadlineForInput(slotDate);
      const option = document.createElement('option');
      option.value = value;
      option.textContent = formatDeadlineOptionLabel(slotDate);
      option.dataset.slotOption = 'true';
      fragment.appendChild(option);
    });
    deadlineSelect.innerHTML = '';
    deadlineSelect.appendChild(fragment);
    if (currentValue) {
      const hasCurrent = slots.some(
        (slotDate) => formatDeadlineForInput(slotDate) === currentValue,
      );
      if (!hasCurrent) {
        ensureSelectOption(
          deadlineSelect,
          currentValue,
          formatDeadlineOptionLabel(currentValue),
        );
      }
      deadlineSelect.value = currentValue;
    } else {
      deadlineSelect.value = '';
    }
    deadlineSelect.disabled = !startDate || slots.length === 0;
  };

  const syncDeadlineSelectWithInput = () => {
    if (!deadlineSelect) {
      return;
    }
    const value = deadlineInput?.value || '';
    if (value) {
      ensureSelectOption(
        deadlineSelect,
        value,
        formatDeadlineOptionLabel(value),
      );
      deadlineSelect.value = value;
    } else {
      deadlineSelect.value = '';
    }
  };

  const handleDeadlineSelectChange = () => {
    if (!deadlineSelect) {
      return;
    }
    setHiddenDeadlineValue(deadlineSelect.value || '');
    clampDeadlineFieldValue();
    syncDeadlineSelectWithInput();
  };

  const syncDeadlineFieldValue = () => {
    if (!deadlineSelect) {
      return;
    }
    setHiddenDeadlineValue(deadlineSelect.value || '');
  };

  const clampDeadlineFieldValue = () => {
    if (!deadlineInput || !deadlineInput.value) {
      return;
    }
    const currentValue = new Date(deadlineInput.value);
    if (Number.isNaN(currentValue.getTime())) {
      deadlineInput.value = '';
      return;
    }
    const minValue = deadlineInput.min ? new Date(deadlineInput.min) : null;
    const maxValue = deadlineInput.max ? new Date(deadlineInput.max) : null;
    if (minValue && currentValue.getTime() < minValue.getTime()) {
      deadlineInput.value = deadlineInput.min;
      return;
    }
    if (maxValue && currentValue.getTime() > maxValue.getTime()) {
      deadlineInput.value = deadlineInput.max;
    }
  };

  const applyDeadlineFieldBounds = () => {
    if (!deadlineInput) {
      return;
    }
    const now = new Date();
    let minDate = new Date(now.getTime() + DEADLINE_MINIMUM_OFFSET_MS);
    let maxDate = null;
    const startDate = getStartDateFromInputs();
    if (startDate) {
      const latestAllowed = new Date(startDate.getTime() - DEADLINE_MIN_GAP_BEFORE_START_MS);
      if (latestAllowed.getTime() <= minDate.getTime()) {
        minDate = latestAllowed;
      }
      maxDate = latestAllowed;
    }
    deadlineInput.min = formatDeadlineForInput(minDate);
    if (maxDate) {
      deadlineInput.max = formatDeadlineForInput(maxDate);
    } else {
      deadlineInput.removeAttribute('max');
    }
    clampDeadlineFieldValue();
    updateDeadlineSelectOptions();
    syncDeadlineSelectWithInput();
  };

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
    setHiddenDeadlineValue('');
    setFormMode('create');
    applyDeadlineFieldBounds();
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
    applyDeadlineFieldBounds();
  }

  if (cancelEditButton) {
    cancelEditButton.addEventListener('click', () => {
      resetFormState();
      navigate('my-appointments');
    });
  }

  if (dateInput) {
    dateInput.addEventListener('input', applyDeadlineFieldBounds);
    dateInput.addEventListener('change', applyDeadlineFieldBounds);
  }
  if (timeInput) {
    timeInput.addEventListener('input', applyDeadlineFieldBounds);
    timeInput.addEventListener('change', applyDeadlineFieldBounds);
  }
  if (deadlineSelect) {
    deadlineSelect.addEventListener('input', handleDeadlineSelectChange);
    deadlineSelect.addEventListener('change', handleDeadlineSelectChange);
  }
  if (form) {
    form.addEventListener('reset', () => {
      requestAnimationFrame(applyDeadlineFieldBounds);
    });
  }

  const extractFormData = () => {
    if (!form) {
      return null;
    }
    syncDeadlineFieldValue();
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
    const rawDuration = Number(raw.durationHours ?? raw.duration);
    const durationValue = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 2;
    const durationHours = Math.max(1, Math.round(durationValue));
    const range = getEventTimeRange({ date, time, durationHours });
    if (!range) {
      window.alert('Bitte gib ein gültiges Datum und eine gültige Startzeit an.');
      return null;
    }

    const now = new Date();
    if (range.start.getTime() <= now.getTime()) {
      window.alert('Der Termin muss in der Zukunft liegen.');
      return null;
    }

    const deadlineValue = raw.rsvpDeadline?.trim() ?? raw.deadline?.trim();
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
    const startTimeMs = range.start.getTime();
    if (deadlineDate.getTime() >= startTimeMs) {
      window.alert('Die Zusagefrist muss vor dem Start der Session liegen.');
      return null;
    }
    if (deadlineDate.getTime() > startTimeMs - DEADLINE_MIN_GAP_BEFORE_START_MS) {
      window.alert(
        'Die Zusagefrist muss mindestens 30 Minuten vor dem Start der Session liegen.',
      );
      return null;
    }
    const normalizedDeadline = deadlineDate.toISOString();

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
    const cityValue = locationCityMap.get(locationValue) || '';

    const paypalLink = raw.paypalLink?.trim() ?? raw.paymentLink?.trim() ?? '';
    const notes = raw.notes?.trim() ?? '';

    return {
      title,
      location: locationValue,
      city: cityValue,
      date,
      time,
      durationHours,
      duration: durationHours,
      totalCost: normalizedTotalCost || 0,
      capacity: capacityValue,
      skill: raw.skill || 'Intermediate',
      notes,
      paypalLink,
      paymentLink: paypalLink,
      rsvpDeadline: normalizedDeadline,
      deadline: normalizedDeadline,
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

  const joinSession = async (id) => {
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
    const deadlinePassed =
      !!targetEvent.rsvpDeadline &&
      new Date(targetEvent.rsvpDeadline).getTime() < now.getTime();
    const capacity = Math.max(0, Number(targetEvent.capacity) || 0);
    const attendees = Math.max(0, Number(targetEvent.attendees) || 0);
    if (deadlinePassed || (capacity > 0 && attendees >= capacity)) {
      return false;
    }
    try {
      const updatedEvent = await incrementSlotsTaken(id);
      if (updatedEvent) {
        updateEventById(id, () => updatedEvent);
        refreshUI();
        notifyError('');
        return true;
      }
    } catch (error) {
      console.error('Teilnahme konnte nicht gespeichert werden', error);
      notifyError(error.message || 'Teilnahme konnte nicht gespeichert werden.');
    }
    return false;
  };

  const withdrawFromSession = async (id) => {
    const now = new Date();
    try {
      const updatedEvent = await decrementSlotsTaken(id);
      if (updatedEvent) {
        updateEventById(id, () => updatedEvent);
        refreshUI();
        notifyError('');
        return true;
      }
    } catch (error) {
      console.error('Absage konnte nicht gespeichert werden', error);
      notifyError(error.message || 'Absage konnte nicht gespeichert werden.');
    }
    return false;
  };

  const toggleParticipation = async (id) => {
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
      await withdrawFromSession(id);
    } else {
      await joinSession(id);
    }
  };

  const handleFormSubmit = async (domEvent) => {
    domEvent.preventDefault();
    notifyError('');
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

      const history = Array.isArray(existingEvent.history) ? existingEvent.history : [];
      const attendees = Math.max(0, Number(existingEvent.attendees) || 0);
      const capacity = Math.max(attendees, normalized.capacity);
      const payload = {
        ...existingEvent,
        ...normalized,
        capacity,
        history: [{ timestamp: now.toISOString(), type: 'update' }, ...history],
      };
      try {
        const updatedEvent = await persistEventUpdate(payload);
        if (updatedEvent) {
          updateEventById(editingEventId, () => updatedEvent);
          resetFormState();
          refreshUI();
          notifyError('');
          navigate('my-appointments');
        }
      } catch (error) {
        console.error('Event konnte nicht aktualisiert werden', error);
        notifyError(error.message || 'Event konnte nicht aktualisiert werden.');
      }
      return;
    }

    const createdAt = now.toISOString();
    const currentUser = getCurrentUser();
    const ownerLabel = currentUser?.displayName || currentUser?.email || 'Du';
    const participants = currentUser?.email
      ? [
          {
            email: currentUser.email.toLowerCase(),
            displayName: currentUser.displayName || currentUser.email,
            joinedAt: createdAt,
          },
        ]
      : [];
    const attendees = Math.max(1, participants.length || 0);

    const draft = {
      ...normalized,
      id: `draft-${Date.now()}`,
      attendees,
    };
    const conflictingSession = findConflictingSession(draft);
    if (conflictingSession) {
      window.alert(CONFLICT_MESSAGE);
      return;
    }

    const eventToStore = {
      ...normalized,
      owner: ownerLabel,
      attendees,
      createdAt,
      joined: true,
      createdByMe: true,
      createdByEmail: currentUser?.email || null,
      participants,
      history: [
        { timestamp: createdAt, type: 'create' },
        { timestamp: createdAt, type: 'join' },
      ],
    };

    try {
      const createdEvent = await persistEvent(eventToStore);
      prependEvent(createdEvent);
      resetFormState();
      refreshUI();
      notifyError('');
      navigate('my-appointments');
      focusTitleField();
    } catch (error) {
      console.error('Event konnte nicht erstellt werden', error);
      notifyError(error.message || 'Event konnte nicht erstellt werden.');
    }
  };

  const setFieldValue = (selector, value = '') => {
    if (!form) {
      return;
    }
    const field = form.querySelector(selector);
    if (field) {
      if (field.tagName === 'SELECT' && value) {
        ensureSelectOption(field, value);
      }
      field.value = value ?? '';
    }
  };

  const populateForm = (event) => {
    if (!form) {
      return;
    }
    setFieldValue('input[name="title"]', event.title || '');
    setFieldValue('input[name="date"]', event.date || '');
    setFieldValue('[name="time"]', event.time || '');
    setFieldValue('input[name="durationHours"]', event.durationHours ?? event.duration ?? 2);
    setFieldValue('input[name="totalCost"]', event.totalCost ?? 0);
    setFieldValue('input[name="capacity"]', event.capacity ?? 4);
    setFieldValue('select[name="skill"]', event.skill || 'Intermediate');
    setFieldValue('textarea[name="notes"]', event.notes || '');
    setFieldValue('input[name="paypalLink"]', event.paypalLink || event.paymentLink || '');
    setFieldValue(
      'input[name="rsvpDeadline"]',
      formatDeadlineForInput(event.rsvpDeadline || event.deadline),
    );
    applyDeadlineFieldBounds();
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

  const deleteEvent = async (id) => {
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
    try {
      await removeEventRemote(id);
      const removed = removeEventById(id);
      if (removed) {
        if (editingEventId === id) {
          resetFormState();
        }
        refreshUI();
        notifyError('');
        navigate('my-appointments');
      }
    } catch (error) {
      console.error('Event konnte nicht gelöscht werden', error);
      notifyError(error.message || 'Event konnte nicht gelöscht werden.');
    }
  };

  return { toggleParticipation, handleFormSubmit, startEditing, deleteEvent };
};

export { createEventControllers };
