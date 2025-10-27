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
  eventsOverlap,
  getStartOfWeek,
  toISODate,
};
