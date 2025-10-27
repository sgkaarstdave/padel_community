const HISTORY_WINDOW_DAYS = 14;

const padNumber = (value) => value.toString().padStart(2, '0');

const formatTimeRange = (event) => {
  const [hour, minute] = event.time.split(':').map(Number);
  const start = new Date(`${event.date}T${event.time}`);
  const end = new Date(start);
  const durationMinutes = Math.round((event.duration || 2) * 60);
  end.setMinutes(start.getMinutes() + durationMinutes);
  return `${padNumber(hour)}:${padNumber(minute)} – ${padNumber(
    end.getHours()
  )}:${padNumber(end.getMinutes())}`;
};

const getEventTimeRange = (event) => {
  if (!event?.date || !event?.time) {
    return null;
  }
  const start = new Date(`${event.date}T${event.time}`);
  if (Number.isNaN(start.getTime())) {
    return null;
  }
  const duration = Number(event.duration);
  const durationHours = Number.isFinite(duration) && duration > 0 ? duration : 2;
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + Math.round(durationHours * 60));
  return { start, end };
};

const hasEventStarted = (event, referenceDate = new Date()) => {
  const range = getEventTimeRange(event);
  if (!range) {
    return false;
  }
  return range.start.getTime() <= referenceDate.getTime();
};

const hasEventEnded = (event, referenceDate = new Date()) => {
  const range = getEventTimeRange(event);
  if (!range) {
    return false;
  }
  return range.end.getTime() <= referenceDate.getTime();
};

const getHistoryWindowStart = (referenceDate = new Date()) => {
  const windowStart = new Date(referenceDate);
  windowStart.setDate(windowStart.getDate() - HISTORY_WINDOW_DAYS);
  return windowStart;
};

const isActiveOrRecent = (event, referenceDate = new Date()) => {
  const range = getEventTimeRange(event);
  if (!range) {
    return false;
  }
  const { end } = range;
  if (end.getTime() > referenceDate.getTime()) {
    return true;
  }
  const windowStart = getHistoryWindowStart(referenceDate);
  return end.getTime() >= windowStart.getTime();
};

const isEventInHistoryWindow = (event, referenceDate = new Date()) => {
  const range = getEventTimeRange(event);
  if (!range) {
    return false;
  }
  const { end } = range;
  const windowStart = getHistoryWindowStart(referenceDate);
  return (
    end.getTime() < referenceDate.getTime() && end.getTime() >= windowStart.getTime()
  );
};

const eventsOverlap = (a, b) => {
  const rangeA = getEventTimeRange(a);
  const rangeB = getEventTimeRange(b);
  if (!rangeA || !rangeB) {
    return false;
  }
  return rangeA.start < rangeB.end && rangeB.start < rangeA.end;
};

const getStartOfWeek = (offset = 0) => {
  const now = new Date();
  const date = new Date(now);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff + offset * 7);
  date.setHours(0, 0, 0, 0);
  return date;
};

const toISODate = (date) => date.toISOString().slice(0, 10);

export {
  padNumber,
  formatTimeRange,
  getEventTimeRange,
  hasEventStarted,
  hasEventEnded,
  isActiveOrRecent,
  isEventInHistoryWindow,
  HISTORY_WINDOW_DAYS,
  eventsOverlap,
  getStartOfWeek,
  toISODate,
};
