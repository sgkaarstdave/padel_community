import { createSupabaseClient } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const TABLE_NAME = 'events';
const METADATA_VERSION = 1;
const MAX_HISTORY_ENTRIES = 40;
const OFFLINE_MESSAGE =
  'Server gerade nicht erreichbar. Bitte prüfe deine Verbindung oder versuche es später erneut.';

const isNavigatorOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

const isLikelyNetworkError = (error) => {
  if (!error) {
    return false;
  }
  if (typeof error.status === 'number' && error.status === 0) {
    return true;
  }
  const message = String(error.message || error.error_description || '')
    .toLowerCase()
    .trim();
  if (!message) {
    return false;
  }
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('offline') ||
    message.includes('timeout')
  );
};

const mapSupabaseError = (error, fallbackMessage) => {
  if (isNavigatorOffline() || isLikelyNetworkError(error)) {
    const offlineError = new Error(OFFLINE_MESSAGE);
    offlineError.isOffline = true;
    offlineError.cause = error;
    return offlineError;
  }
  const normalized = new Error(error?.message || fallbackMessage || 'Unbekannter Fehler.');
  normalized.cause = error;
  return normalized;
};

const parseTimeParts = (timeValue) => {
  if (!timeValue) {
    return null;
  }
  const [hours, minutes, seconds = '0'] = timeValue.split(':');
  const h = Number(hours);
  const m = Number(minutes);
  const s = Number(seconds);
  if ([h, m, s].some((value) => Number.isNaN(value))) {
    return null;
  }
  return { hours: h, minutes: m, seconds: s };
};

const normalizeTimeValue = (timeValue) => {
  if (!timeValue) {
    return null;
  }
  const parts = parseTimeParts(timeValue);
  if (!parts) {
    return null;
  }
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
};

const addDurationToTime = (timeValue, durationHours) => {
  const parts = parseTimeParts(timeValue);
  if (!parts) {
    return null;
  }
  const base = new Date('1970-01-01T00:00:00Z');
  base.setUTCHours(parts.hours, parts.minutes, parts.seconds || 0, 0);
  const ms = Number(durationHours) * 60 * 60 * 1000;
  if (!Number.isFinite(ms)) {
    return normalizeTimeValue(timeValue);
  }
  base.setTime(base.getTime() + ms);
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(base.getUTCHours())}:${pad(base.getUTCMinutes())}:${pad(
    base.getUTCSeconds()
  )}`;
};

const computeDurationFromRange = (startTime, endTime) => {
  const start = parseTimeParts(startTime);
  const end = parseTimeParts(endTime);
  if (!start || !end) {
    return 2;
  }
  const startMs = start.hours * 3600000 + start.minutes * 60000 + start.seconds * 1000;
  const endMs = end.hours * 3600000 + end.minutes * 60000 + end.seconds * 1000;
  const diff = Math.max(0, endMs - startMs);
  if (diff === 0) {
    return 2;
  }
  return Math.max(0.5, Math.round((diff / 3600000) * 10) / 10);
};

const hasTimezoneInfo = (value) => /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);

const normalizeTimestampInput = (value) => {
  if (!value) {
    return '';
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return '';
  }
  const withSeparator = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  if (hasTimezoneInfo(withSeparator)) {
    return withSeparator;
  }
  return `${withSeparator}Z`;
};

const normalizeTimestamp = (value) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const normalizedInput = normalizeTimestampInput(value);
  if (!normalizedInput) {
    return null;
  }
  const date = new Date(normalizedInput);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

const normalizeDurationHours = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 2;
  }
  return Math.max(1, Math.round(numeric));
};

const normalizeCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Math.round(numeric * 100) / 100;
};

const safeParseMetadata = (value) => {
  if (!value || typeof value !== 'string') {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    return { notes: value };
  }
  return {};
};

const sanitizeHistory = (history) => {
  if (!Array.isArray(history)) {
    return [];
  }
  return history
    .filter((entry) => entry && typeof entry.timestamp === 'string' && entry.type)
    .slice(0, MAX_HISTORY_ENTRIES);
};

const sanitizeParticipants = (participants) => {
  if (!Array.isArray(participants)) {
    return [];
  }
  const seen = new Set();
  const normalized = [];
  participants.forEach((participant) => {
    if (!participant?.email) {
      return;
    }
    const email = participant.email.toLowerCase();
    if (seen.has(email)) {
      return;
    }
    seen.add(email);
    normalized.push({
      email,
      displayName: participant.displayName || participant.email,
      joinedAt: participant.joinedAt || new Date().toISOString(),
    });
  });
  return normalized;
};

const deriveOwnerName = (row, metadata, session) => {
  const createdByEmail = row.created_by_email?.toLowerCase() || null;
  if (createdByEmail && session?.email && session.email.toLowerCase() === createdByEmail) {
    return 'Du';
  }
  if (metadata?.ownerName) {
    return metadata.ownerName;
  }
  if (createdByEmail) {
    return createdByEmail.split('@')[0];
  }
  return 'Community';
};

const decodeMetadata = (row) => {
  const metadata = safeParseMetadata(row.description);
  const participants = sanitizeParticipants(metadata.participants);
  const durationFromMetadata = Number(metadata.durationHours ?? metadata.duration) || 2;
  const paypalLink = metadata.paypalLink || metadata.paymentLink || '';
  const rsvpDeadline =
    normalizeTimestamp(metadata.rsvpDeadline || metadata.deadline || '') || '';
  return {
    totalCost: Number(metadata.totalCost) || 0,
    notes: metadata.notes || '',
    paypalLink,
    paymentLink: paypalLink,
    rsvpDeadline,
    deadline: rsvpDeadline,
    durationHours: durationFromMetadata,
    duration: durationFromMetadata,
    history: sanitizeHistory(metadata.history),
    participants,
    ownerName: metadata.ownerName || '',
    createdAt: metadata.createdAt || row.created_at || new Date().toISOString(),
    city: metadata.city || '',
  };
};

const mapRowToEvent = (row, session) => {
  const metadata = decodeMetadata(row);
  const participants = metadata.participants || [];
  const currentEmail = session?.email?.toLowerCase() || null;
  const createdByEmail = row.created_by_email?.toLowerCase() || null;
  const joined = !!currentEmail && participants.some((entry) => entry.email === currentEmail);
  const capacity = Math.max(
    Number(row.slots_total ?? participants.length) || 0,
    participants.length
  );
  const attendees = Math.min(capacity, Number(row.slots_taken ?? participants.length) || 0);
  const startTime = normalizeTimeValue(row.start_time) || null;
  const endTime = normalizeTimeValue(row.end_time) || null;
  const durationFromColumn = Number(row.duration_hours);
  const durationHours =
    Number.isFinite(durationFromColumn) && durationFromColumn > 0
      ? durationFromColumn
      : metadata.durationHours || metadata.duration || computeDurationFromRange(startTime, endTime);
  const totalCostFromColumn = Number(row.total_cost);
  const totalCost =
    Number.isFinite(totalCostFromColumn) && totalCostFromColumn >= 0
      ? totalCostFromColumn
      : metadata.totalCost;
  const notes =
    typeof row.notes === 'string' ? row.notes : metadata.notes || '';
  const paypalLink =
    typeof row.paypal_link === 'string'
      ? row.paypal_link
      : metadata.paypalLink || metadata.paymentLink || '';
  const rsvpDeadline =
    normalizeTimestamp(row.rsvp_deadline || metadata.rsvpDeadline || metadata.deadline || '') ||
    '';
  return {
    id: row.id,
    title: row.title || 'Padel Session',
    location: row.club_name || 'Unbekannter Club',
    city: row.city || metadata.city || '',
    date: row.date || '',
    time: startTime ? startTime.slice(0, 5) : '',
    durationHours,
    totalCost,
    capacity,
    attendees,
    skill: row.skill_level || 'Intermediate',
    notes,
    paypalLink,
    rsvpDeadline,
    owner: deriveOwnerName(row, metadata, session),
    createdAt: metadata.createdAt,
    joined,
    createdByMe: !!createdByEmail && createdByEmail === currentEmail,
    createdByEmail,
    history: metadata.history,
    participants,
    duration: durationHours,
    paymentLink: paypalLink,
    deadline: rsvpDeadline,
  };
};

const buildMetadataPayload = (event) => {
  const durationHours = Number(event.durationHours ?? event.duration) || 2;
  const paypalLink = event.paypalLink || event.paymentLink || '';
  const rsvpDeadline = normalizeTimestamp(event.rsvpDeadline || event.deadline || '') || '';
  return {
    version: METADATA_VERSION,
    totalCost: Number(event.totalCost) || 0,
    notes: event.notes || '',
    paypalLink,
    paymentLink: paypalLink,
    rsvpDeadline,
    deadline: rsvpDeadline,
    durationHours,
    duration: durationHours,
    history: sanitizeHistory(event.history),
    participants: sanitizeParticipants(event.participants || []),
    ownerName: event.owner || '',
    createdAt: event.createdAt || new Date().toISOString(),
    city: event.city || '',
  };
};

const buildRowPayload = (event) => {
  const startTime = normalizeTimeValue(event.time) || '00:00:00';
  const normalizedDurationHours = normalizeDurationHours(event.durationHours ?? event.duration);
  const capacity = Math.max(
    Number(event.capacity) || 0,
    Number(event.attendees) || 0,
    (event.participants || []).length
  );
  const attendees = Math.min(
    capacity,
    Number(event.attendees) || (event.participants || []).length || 0
  );
  const payload = {
    title: event.title,
    date: event.date,
    start_time: startTime,
    end_time: addDurationToTime(startTime, normalizedDurationHours) || startTime,
    city: event.city || '',
    club_name: event.location || '',
    skill_level: event.skill || 'Intermediate',
    slots_total: capacity,
    slots_taken: attendees,
    total_cost: normalizeCurrency(event.totalCost),
    notes: typeof event.notes === 'string' ? event.notes : '',
    paypal_link:
      typeof (event.paypalLink ?? event.paymentLink) === 'string'
        ? event.paypalLink ?? event.paymentLink
        : '',
    duration_hours: normalizedDurationHours,
    rsvp_deadline: normalizeTimestamp(event.rsvpDeadline ?? event.deadline),
    description: JSON.stringify(buildMetadataPayload({ ...event, capacity, attendees })),
  };
  if (event.id) {
    payload.id = event.id;
  }
  if (event.createdByEmail) {
    payload.created_by_email = event.createdByEmail.toLowerCase();
  }
  return payload;
};

const persistEvent = async (event, action) => {
  const supabase = createSupabaseClient();
  const session = getCurrentUser();
  const payload = buildRowPayload(event);
  let query = supabase.from(TABLE_NAME);
  if (action === 'insert') {
    query = query.insert([payload]);
  } else {
    query = query.update(payload).eq('id', event.id);
  }
  const { data, error } = await query.select('*').single();
  if (error) {
    throw mapSupabaseError(error, 'Die Events konnten nicht gespeichert werden.');
  }
  return mapRowToEvent(data, session);
};

const fetchEventRow = async (eventId) => {
  const supabase = createSupabaseClient();
  const session = getCurrentUser();
  const { data, error } = await supabase.from(TABLE_NAME).select('*').eq('id', eventId).single();
  if (error) {
    throw mapSupabaseError(error, 'Event konnte nicht gefunden werden.');
  }
  return mapRowToEvent(data, session);
};

const fetchAllEvents = async () => {
  const supabase = createSupabaseClient();
  const session = getCurrentUser();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });
  if (error) {
    throw mapSupabaseError(error, 'Events konnten nicht geladen werden.');
  }
  const events = (data || []).map((row) => mapRowToEvent(row, session));
  const toTimestamp = (event) => {
    const value = new Date(`${event.date}T${event.time || '00:00'}`).getTime();
    return Number.isNaN(value) ? 0 : value;
  };
  return events.sort((a, b) => toTimestamp(a) - toTimestamp(b));
};

const createEvent = async (event) => {
  const session = getCurrentUser();
  if (!session?.email) {
    throw new Error('Du musst angemeldet sein, um einen Termin zu erstellen.');
  }
  const payload = {
    ...event,
    createdByEmail: session.email,
  };
  return persistEvent(payload, 'insert');
};

const updateEvent = async (event) => {
  if (!event?.id) {
    throw new Error('Es wurde kein gültiges Event angegeben.');
  }
  return persistEvent(event, 'update');
};

const deleteEvent = async (eventId) => {
  const supabase = createSupabaseClient();
  const { error } = await supabase.from(TABLE_NAME).delete().eq('id', eventId);
  if (error) {
    throw mapSupabaseError(error, 'Event konnte nicht gelöscht werden.');
  }
  return true;
};

const incrementSlotsTaken = async (eventId) => {
  const session = getCurrentUser();
  if (!session?.email) {
    throw new Error('Du musst angemeldet sein, um beitreten zu können.');
  }
  const event = await fetchEventRow(eventId);
  if (event.joined) {
    return event;
  }
  const capacity = Math.max(Number(event.capacity) || 0, 1);
  const attendees = Number(event.attendees) || 0;
  if (capacity > 0 && attendees >= capacity) {
    throw new Error('Dieses Match ist bereits voll.');
  }
  const participants = sanitizeParticipants([
    ...(event.participants || []),
    {
      email: session.email.toLowerCase(),
      displayName: session.displayName || session.email,
      joinedAt: new Date().toISOString(),
    },
  ]);
  const history = [
    { timestamp: new Date().toISOString(), type: 'join' },
    ...(event.history || []),
  ].slice(0, MAX_HISTORY_ENTRIES);
  const updatedEvent = {
    ...event,
    attendees: Math.min(capacity, participants.length),
    participants,
    history,
    joined: true,
  };
  return updateEvent(updatedEvent);
};

const decrementSlotsTaken = async (eventId) => {
  const session = getCurrentUser();
  if (!session?.email) {
    throw new Error('Du musst angemeldet sein, um eine Zusage zurückzuziehen.');
  }
  const event = await fetchEventRow(eventId);
  const participants = (event.participants || []).filter(
    (participant) => participant.email !== session.email.toLowerCase()
  );
  if (participants.length === (event.participants || []).length) {
    throw new Error('Du hast für dieses Event keine Zusage.');
  }
  const history = [
    { timestamp: new Date().toISOString(), type: 'leave' },
    ...(event.history || []),
  ].slice(0, MAX_HISTORY_ENTRIES);
  const updatedEvent = {
    ...event,
    attendees: Math.max(0, participants.length),
    participants,
    history,
    joined: false,
  };
  return updateEvent(updatedEvent);
};

export {
  fetchAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  incrementSlotsTaken,
  decrementSlotsTaken,
};
