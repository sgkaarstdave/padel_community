import { elements } from './elements.js';
import { state, setRecentJoins } from '../state/store.js';
import {
  formatTimeRange,
  getEventTimeRange,
  hasEventEnded,
  isEventInHistoryWindow,
  HISTORY_WINDOW_DAYS,
} from '../utils/time.js';
import { formatCurrency } from '../utils/format.js';

let toggleParticipationHandler = () => {};

const registerToggleHandler = (handler) => {
  toggleParticipationHandler = handler;
};

const getFilteredEvents = () => {
  const skill = elements.skillFilter.value;
  const location = elements.locationFilter.value;
  const now = Date.now();
  return state.events.filter((event) => {
    const range = getEventTimeRange(event);
    if (!range || range.end.getTime() <= now) {
      return false;
    }
    const skillMatch = skill === 'all' || event.skill === skill;
    const locationMatch = location === 'all' || event.location === location;
    return skillMatch && locationMatch;
  });
};

const getEventMeta = (event) => {
  const totalCost = Number(event.totalCost) || 0;
  const attendeeCount = Math.max(0, Number(event.attendees) || 0);
  const normalizedAttendees = Math.max(1, attendeeCount);
  const capacity = Math.max(normalizedAttendees, Number(event.capacity) || 0);
  const openSpots = Math.max(0, capacity - attendeeCount);
  const isFull = openSpots <= 0;
  const isDeadlineReached =
    !!event.deadline && new Date(event.deadline).getTime() < Date.now();
  const buttonDisabled = !event.joined && (isFull || isDeadlineReached);
  const currentShare = totalCost / normalizedAttendees;
  const projectedShare = capacity > 0 ? totalCost / capacity : currentShare;
  const buttonLabel = event.joined
    ? 'Teilnahme zurückziehen'
    : isDeadlineReached
    ? 'Anmeldung geschlossen'
    : isFull
    ? 'Match voll'
    : 'Beitreten';
  const statusLabel = event.joined
    ? `Du nimmst teil – dein Anteil aktuell: ${formatCurrency(currentShare)}`
    : isDeadlineReached
    ? 'Anmeldung geschlossen'
    : isFull
    ? 'Match ist voll'
    : `${openSpots} Plätze frei – aktuell ca. ${formatCurrency(
        currentShare
      )} p.P.`;
  return {
    openSpots,
    isFull,
    isDeadlineReached,
    buttonDisabled,
    buttonLabel,
    statusLabel,
    currentShare,
    projectedShare,
    totalCost,
    attendees: attendeeCount,
    capacity,
  };
};

const isEventJoinable = (event) => {
  const { isFull, isDeadlineReached } = getEventMeta(event);
  return !event.joined && !isFull && !isDeadlineReached;
};

const RELATIVE_TIME_LIMITS = [
  { unit: 'minute', value: 60 },
  { unit: 'hour', value: 24 },
  { unit: 'day', value: 7 },
];

const formatRelativeTime = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'vor einiger Zeit';
  }
  const diffMs = Date.now() - date.getTime();
  if (diffMs <= 0) {
    return 'gerade eben';
  }
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) {
    return 'gerade eben';
  }
  if (minutes < RELATIVE_TIME_LIMITS[0].value) {
    return `vor ${minutes} Min.`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < RELATIVE_TIME_LIMITS[1].value) {
    return `vor ${hours} Std.`;
  }
  const days = Math.round(hours / 24);
  if (days < RELATIVE_TIME_LIMITS[2].value) {
    return `vor ${days} Tg.`;
  }
  return date.toLocaleDateString('de-DE');
};

const createEventCard = (event) => {
  const {
    isFull,
    isDeadlineReached,
    buttonDisabled,
    buttonLabel,
    statusLabel,
    currentShare,
    projectedShare,
    totalCost,
    attendees,
    capacity,
  } = getEventMeta(event);

  const card = document.createElement('article');
  card.classList.add('event-card');
  if (event.joined) {
    card.classList.add('joined');
  }
  if (isFull) {
    card.classList.add('is-full');
  }
  if (isDeadlineReached) {
    card.classList.add('is-closed');
  }

  card.innerHTML = `
      <div>
        <div class="badge">${event.skill}</div>
        <h4>${event.title}</h4>
        <p class="muted">${event.location} · Gastgeber: ${
          event.owner || 'Community'
        }</p>
        <div class="event-meta">
          <span>🗓️ ${new Date(`${event.date}T00:00`).toLocaleDateString('de-DE')}</span>
          <span>⏱️ ${formatTimeRange(event)}</span>
          <span>💶 Gesamtkosten: ${formatCurrency(totalCost)}</span>
          <span>🤝 Anteil aktuell: ${formatCurrency(currentShare)} (${attendees} Zusagen)</span>
          <span>📊 Bei ${capacity} Spieler:innen: ${formatCurrency(
            projectedShare
          )} p.P.</span>
          <span>👤 ${attendees}/${capacity}</span>
          ${
            event.deadline
              ? `<span class="deadline ${
                  isDeadlineReached ? 'overdue' : ''
                }">⏳ Zusage bis ${new Date(event.deadline).toLocaleString('de-DE')}</span>`
              : ''
          }
        </div>
        ${event.notes ? `<p class="muted">${event.notes}</p>` : ''}
        ${
          event.paymentLink
            ? `<div class="payment-hint">
                <a class="payment-link" href="${event.paymentLink}" target="_blank" rel="noopener">
                  💸 PayPal-Link öffnen
                </a>
                <small class="muted">${
                  event.joined
                    ? 'Nutze den Link nach dem Match für den Kostenanteil.'
                    : 'So können Teilnehmende unkompliziert ihren Anteil senden.'
                }</small>
              </div>`
            : ''
        }
      </div>
      <div class="event-actions">
        <div class="capacity-bar"><span style="width: ${Math.min(
          100,
          (attendees / Math.max(1, capacity)) * 100
        )}%"></span></div>
        <small class="muted">${statusLabel}</small>
        <button ${buttonDisabled ? 'disabled' : ''} data-id="${event.id}">${buttonLabel}</button>
      </div>
    `;

  const button = card.querySelector('button');
  if (button) {
    button.addEventListener('click', () => toggleParticipationHandler(event.id));
  }

  return card;
};

const renderEventsList = () => {
  const previousLocation = elements.locationFilter.value;
  const skill = elements.skillFilter.value;
  const now = Date.now();
  const upcomingEvents = state.events.filter((event) => {
    const range = getEventTimeRange(event);
    return range && range.end.getTime() > now;
  });

  const skillFiltered = upcomingEvents.filter(
    (event) => skill === 'all' || event.skill === skill
  );

  const locationOptions = new Set(['all']);
  skillFiltered.forEach((event) => locationOptions.add(event.location));

  elements.locationFilter.innerHTML = '';
  [...locationOptions].forEach((location) => {
    const option = document.createElement('option');
    option.value = location;
    option.textContent = location === 'all' ? 'Alle Orte' : location;
    elements.locationFilter.appendChild(option);
  });

  if (locationOptions.has(previousLocation)) {
    elements.locationFilter.value = previousLocation;
  } else {
    elements.locationFilter.value = 'all';
  }

  const events = getFilteredEvents().sort((a, b) => {
    const aDate = new Date(`${a.date}T${a.time}`);
    const bDate = new Date(`${b.date}T${b.time}`);
    return aDate - bDate;
  });

  elements.eventsList.innerHTML = '';

  if (!events.length) {
    elements.eventsList.innerHTML =
      '<div class="empty">Keine Sessions in diesem Filterbereich. Starte eine neue!</div>';
    return;
  }

  events.forEach((event) => {
    const card = createEventCard(event);
    elements.eventsList.appendChild(card);
  });
};

const renderMySessions = () => {
  const referenceDate = new Date();
  const joinedEvents = state.events
    .filter((event) => event.joined && !hasEventEnded(event, referenceDate))
    .sort(
      (a, b) =>
        new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime()
    );

  elements.mySessionsList.innerHTML = '';

  if (!joinedEvents.length) {
    elements.mySessionsList.innerHTML =
      '<div class="empty">Du hast aktuell keine zugesagten Sessions.</div>';
    return;
  }

  joinedEvents.forEach((event) => {
    const card = createEventCard(event);
    elements.mySessionsList.appendChild(card);
  });
};

const createOwnerCard = (event) => {
  const {
    openSpots,
    statusLabel,
    currentShare,
    projectedShare,
    totalCost,
    attendees,
    capacity,
  } = getEventMeta(event);
  const history = Array.isArray(event.history) ? event.history : [];
  const historyItems = history
    .slice(0, 4)
    .map((entry) => {
      const label =
        entry.type === 'join'
          ? 'Neue Zusage'
          : entry.type === 'leave'
          ? 'Absage'
          : 'Termin erstellt';
      return `<li class="history__item history__item--${entry.type}">
          <span>${label}</span>
          <span class="muted">${formatRelativeTime(entry.timestamp)}</span>
        </li>`;
    })
    .join('');

  const card = document.createElement('article');
  card.classList.add('event-card', 'owner-card');
  card.innerHTML = `
      <div>
        <div class="badge">${event.skill}</div>
        <h4>${event.title}</h4>
        <p class="muted">${event.location} · ${
          new Date(`${event.date}T00:00`).toLocaleDateString('de-DE')
        } · ${formatTimeRange(event)}</p>
        <div class="event-meta owner-meta">
          <span>👥 Zusagen: ${attendees}/${capacity}</span>
          <span>🪑 Offene Plätze: ${openSpots}</span>
          <span>💶 Gesamtkosten: ${formatCurrency(totalCost)}</span>
          <span>🤝 Aktueller Anteil: ${formatCurrency(currentShare)}</span>
          <span>📊 Bei voller Auslastung: ${formatCurrency(projectedShare)} p.P.</span>
        </div>
        ${
          event.notes ? `<p class="muted">${event.notes}</p>` : ''
        }
      </div>
      <div class="owner-card__sidebar">
        <small class="muted">${statusLabel}</small>
        <ul class="history">
          ${historyItems || '<li class="history__item"><span>Keine Aktivitäten</span></li>'}
        </ul>
      </div>
    `;

  return card;
};

const renderOwnerAlerts = (events) => {
  if (!elements.ownerAlerts) {
    return;
  }
  const windowMs = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const alerts = events
    .map((event) => {
      const history = Array.isArray(event.history) ? event.history : [];
      const latestLeave = history.find((entry) => entry.type === 'leave');
      if (!latestLeave) {
        return null;
      }
      const timestamp = new Date(latestLeave.timestamp).getTime();
      if (Number.isNaN(timestamp) || now - timestamp > windowMs) {
        return null;
      }
      return {
        event,
        entry: latestLeave,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        new Date(b.entry.timestamp).getTime() - new Date(a.entry.timestamp).getTime()
    );

  if (!alerts.length) {
    elements.ownerAlerts.innerHTML =
      '<div class="alert alert--muted">Keine neuen Absagen in den letzten 7 Tagen.</div>';
    return;
  }

  elements.ownerAlerts.innerHTML = alerts
    .map(
      ({ event, entry }) => `
        <div class="alert alert--warning">
          <strong>${event.title}</strong>: Absage ${formatRelativeTime(entry.timestamp)}
        </div>
      `
    )
    .join('');
};

const renderMyAppointments = () => {
  const referenceDate = new Date();
  const createdEvents = state.events
    .filter((event) => event.createdByMe && !hasEventEnded(event, referenceDate))
    .sort(
      (a, b) =>
        new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime()
    );

  if (!elements.myAppointmentsList) {
    return;
  }

  elements.myAppointmentsList.innerHTML = '';

  if (!createdEvents.length) {
    if (elements.ownerAlerts) {
      elements.ownerAlerts.innerHTML =
        '<div class="alert alert--muted">Du hast noch keine eigenen Termine erstellt.</div>';
    }
    elements.myAppointmentsList.innerHTML =
      '<div class="empty">Du hast bisher keine eigenen Termine erstellt.</div>';
    return;
  }

  renderOwnerAlerts(createdEvents);

  createdEvents.forEach((event) => {
    const card = createOwnerCard(event);
    elements.myAppointmentsList.appendChild(card);
  });
};

const computeRecentTrend = () => {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  return state.events.reduce((total, event) => {
    (event.history || []).forEach((entry) => {
      const timestamp = new Date(entry.timestamp).getTime();
      if (Number.isNaN(timestamp) || timestamp < since) {
        return;
      }
      if (entry.type === 'join') {
        total += 1;
      }
      if (entry.type === 'leave') {
        total -= 1;
      }
    });
    return total;
  }, 0);
};

const updateStats = () => {
  const filtered = getFilteredEvents();
  let openSpots = 0;
  const joinableEvents = filtered.filter((event) => {
    if (!isEventJoinable(event)) {
      return false;
    }
    const { openSpots: availableSpots } = getEventMeta(event);
    openSpots += availableSpots;
    return true;
  });
  const trend = computeRecentTrend();
  setRecentJoins(trend);
  elements.activeMatches.textContent = joinableEvents.length;
  elements.openSpots.textContent = openSpots;
  elements.communityTrend.textContent = `${trend >= 0 ? '+' : ''}${trend}`;
  elements.communityTrend.style.color =
    trend >= 0 ? 'var(--success)' : 'var(--danger)';
  elements.communityTrend.style.background =
    trend >= 0
      ? 'rgba(52, 211, 153, 0.18)'
      : 'rgba(248, 113, 113, 0.18)';
};

const bindFilters = (handler) => {
  [elements.skillFilter, elements.locationFilter].forEach((filter) =>
    filter.addEventListener('change', handler)
  );
};

const renderEventsHistory = () => {
  if (!elements.eventsHistory) {
    return;
  }
  const referenceDate = new Date();
  const historyEvents = state.events
    .filter((event) => isEventInHistoryWindow(event, referenceDate))
    .sort(
      (a, b) =>
        new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime()
    )
    .slice(0, 6);

  elements.eventsHistory.innerHTML = '';

  if (!historyEvents.length) {
    elements.eventsHistory.innerHTML =
      `<div class="empty">Keine vergangenen Sessions in den letzten ${HISTORY_WINDOW_DAYS} Tagen.</div>`;
    return;
  }

  historyEvents.forEach((event) => {
    const range = getEventTimeRange(event);
    const attendees = Math.max(0, Number(event.attendees) || 0);
    const capacity = Math.max(attendees, Number(event.capacity) || 0);
    const card = document.createElement('article');
    card.classList.add('event-history-card');
    card.innerHTML = `
      <div class="event-history-card__header">
        <h4>${event.title}</h4>
        <span>${new Date(`${event.date}T00:00`).toLocaleDateString('de-DE')}</span>
      </div>
      <div class="event-history-card__meta">
        <span>📍 ${event.location}</span>
        <span>⏱️ ${formatTimeRange(event)}</span>
        <span>🎯 ${event.skill}</span>
      </div>
      <div class="event-history-card__footer">
        <small class="muted">${attendees}/${capacity} Zusagen · Beendet ${formatRelativeTime(
          range?.end?.toISOString() || event.date
        )}</small>
      </div>
    `;
    elements.eventsHistory.appendChild(card);
  });
};

export {
  registerToggleHandler,
  renderEventsList,
  renderMySessions,
  renderMyAppointments,
  updateStats,
  bindFilters,
  renderEventsHistory,
};
