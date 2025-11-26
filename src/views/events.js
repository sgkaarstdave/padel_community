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
let ownerEditHandler = () => {};
let ownerDeleteHandler = () => {};

const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"']/g, (char) =>
    (
      {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[char] || char
    ),
  );

const registerToggleHandler = (handler) => {
  toggleParticipationHandler = handler;
};

const registerOwnerHandlers = ({ onEdit, onDelete } = {}) => {
  if (typeof onEdit === 'function') {
    ownerEditHandler = onEdit;
  }
  if (typeof onDelete === 'function') {
    ownerDeleteHandler = onDelete;
  }
};

const getFilteredEvents = () => {
  const skill = elements.skillFilter.value;
  const location = elements.locationFilter.value;
  const onlyJoinable = elements.joinableOnlyFilter?.checked;
  const now = Date.now();
  return state.events.filter((event) => {
    const range = getEventTimeRange(event);
    if (!range || range.end.getTime() <= now) {
      return false;
    }
    const skillMatch = skill === 'all' || event.skill === skill;
    const locationMatch = location === 'all' || event.location === location;
    const joinableMatch = !onlyJoinable || isEventJoinable(event);
    return skillMatch && locationMatch && joinableMatch;
  });
};

const getGuestCount = (event) => {
  if (Array.isArray(event?.guests)) {
    return event.guests.length;
  }
  const numeric = Number(event?.guestCount);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};

const getEventMeta = (event) => {
  const totalCost = Number(event.totalCost) || 0;
  const attendeeCount = Math.max(0, Number(event.attendees) || 0);
  const guestCount = getGuestCount(event);
  const participantCount = Math.max(0, Array.isArray(event.participants) ? event.participants.length : attendeeCount);
  const occupied = Math.max(attendeeCount, participantCount + guestCount);
  const normalizedAttendees = Math.max(1, occupied);
  const capacity = Math.max(normalizedAttendees, Number(event.capacity) || 0);
  const openSpots = Math.max(0, capacity - occupied);
  const isFull = openSpots <= 0;
  const rsvpDeadline = event.rsvpDeadline || event.deadline || '';
  const isDeadlineReached = !!rsvpDeadline && new Date(rsvpDeadline).getTime() < Date.now();
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
    attendees: occupied,
    capacity,
    guestCount,
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

const OWNER_ALERT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const OWNER_ALERT_WINDOW_DAYS = Math.round(
  OWNER_ALERT_WINDOW_MS / (24 * 60 * 60 * 1000)
);
const OWNER_ALERTS_STORAGE_KEY = 'ownerAlertsDismissed';

const getHistoryActor = (entry) => {
  const actorLabel = entry?.actorName || entry?.actorEmail;
  return escapeHtml(actorLabel || 'Teilnehmende Person');
};

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

const readDismissedOwnerAlerts = () => {
  if (typeof localStorage === 'undefined') {
    return {};
  }
  try {
    const raw = localStorage.getItem(OWNER_ALERTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) || {} : {};
  } catch (error) {
    return {};
  }
};

const persistDismissedOwnerAlerts = (value) => {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(OWNER_ALERTS_STORAGE_KEY, JSON.stringify(value));
  } catch (error) {
    // ignore persistence errors
  }
};

const markOwnerAlertDismissed = (eventId, timestamp) => {
  const dismissed = readDismissedOwnerAlerts();
  persistDismissedOwnerAlerts({
    ...dismissed,
    [eventId]: timestamp,
  });
};

const renderParticipantsList = (event) => {
  const participants = Array.isArray(event.participants) ? event.participants : [];
  const baseLabel = '<span class="participants-list__label">Teilnehmende:</span>';
  if (!participants.length) {
    return `
      <div class="participants-list participants-list--empty">
        ${baseLabel}
        <div class="participants-list__chips">
          <span class="participant-chip participant-chip--empty">Noch keine Zusagen sichtbar</span>
        </div>
      </div>
    `;
  }
  const chips = participants
    .map((participant) => {
      const name = escapeHtml(participant.displayName || participant.email || 'Teilnehmende Person');
      const relative = participant.joinedAt ? formatRelativeTime(participant.joinedAt) : '';
      const tooltip = relative ? `Zusage ${relative}` : 'Teilnehmende Person';
      return `<span class="participant-chip" title="${escapeHtml(tooltip)}">${name}</span>`;
    })
    .join('');
  return `
      <div class="participants-list">
        ${baseLabel}
        <div class="participants-list__chips">${chips}</div>
      </div>
    `;
};

const renderGuestsList = (event) => {
  const guests = Array.isArray(event.guests) ? event.guests : [];
  if (!guests.length) {
    return '';
  }
  const chips = guests
    .map(
      (guest) => `
        <span class="participant-chip participant-chip--guest" title="Gast">G · ${escapeHtml(
          guest.name || 'Gast'
        )}</span>
      `
    )
    .join('');
  return `
    <div class="participants-list participants-list--guests">
      <span class="participants-list__label">Gäste:</span>
      <div class="participants-list__chips">${chips}</div>
    </div>
  `;
};

const renderCourtStatus = (event) => {
  if (event.courtBooked) {
    return '<span class="status-badge status-badge--success">✅ Platz gebucht</span>';
  }
  return '<span class="status-badge status-badge--muted">⚠️ Platz noch nicht gebucht</span>';
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
    guestCount,
  } = getEventMeta(event);
  const rsvpDeadline = event.rsvpDeadline || event.deadline || '';
  const showParticipationButton = !event.createdByMe;

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
          <span>🤝 Anteil aktuell: ${formatCurrency(currentShare)} (${attendees} Zusagen/Gäste)</span>
          <span>📊 Bei ${capacity} Spieler:innen: ${formatCurrency(
            projectedShare
          )} p.P.</span>
          <span>👤 ${attendees}/${capacity}</span>
          ${
            rsvpDeadline
              ? `<span class="deadline ${
                  isDeadlineReached ? 'overdue' : ''
                }">⏳ Zusage bis ${new Date(rsvpDeadline).toLocaleString('de-DE')}</span>`
              : ''
          }
        </div>
        <div class="event-flags">
          ${renderCourtStatus(event)}
          ${
            guestCount
              ? `<span class="status-badge status-badge--neutral">${guestCount} Gast${
                  guestCount === 1 ? '' : 'e'
                }</span>`
              : ''
          }
        </div>
        ${renderParticipantsList(event)}
        ${renderGuestsList(event)}
        ${event.notes ? `<p class="muted">${event.notes}</p>` : ''}
        ${
          event.paypalLink || event.paymentLink
            ? `<div class="payment-hint">
                <a class="payment-link" href="${
                  event.paypalLink || event.paymentLink
                }" target="_blank" rel="noopener">
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
        ${
          showParticipationButton
            ? `<button ${buttonDisabled ? 'disabled' : ''} data-id="${event.id}">${buttonLabel}</button>`
            : ''
        }
      </div>
    `;

  if (showParticipationButton) {
    const button = card.querySelector('button');
    if (button) {
      button.addEventListener('click', () => toggleParticipationHandler(event.id));
    }
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
    const aJoinable = isEventJoinable(a);
    const bJoinable = isEventJoinable(b);
    if (aJoinable !== bJoinable) {
      return aJoinable ? -1 : 1;
    }
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
    guestCount,
  } = getEventMeta(event);
  const history = Array.isArray(event.history) ? event.history : [];
  const leaveHistory = history
    .filter((entry) => entry.type === 'leave')
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  const latestLeave = leaveHistory[0];
  const historyItems = history
    .slice(0, 4)
    .map((entry) => {
      const label =
        entry.type === 'join'
          ? 'Neue Zusage'
          : entry.type === 'leave'
          ? 'Absage'
          : entry.type === 'update'
          ? 'Details aktualisiert'
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
        <div class="event-flags event-flags--owner">
          ${renderCourtStatus(event)}
          ${
            guestCount
              ? `<span class="status-badge status-badge--neutral">${guestCount} Gast${
                  guestCount === 1 ? '' : 'e'
                }</span>`
              : ''
          }
        </div>
        ${
          event.notes ? `<p class="muted">${event.notes}</p>` : ''
        }
        ${renderParticipantsList(event)}
        ${renderGuestsList(event)}
        ${
          latestLeave
            ? `<div class="event-notice event-notice--warning" role="status">
                <span class="event-notice__badge">Absage</span>
                <div class="event-notice__details">
                  <span class="event-notice__title">${leaveHistory.length} Absage${
                leaveHistory.length === 1 ? '' : 'n'
              }</span>
                  <span class="event-notice__subtitle">Letzte Absage von ${getHistoryActor(
                    latestLeave
                  )}</span>
                  <span class="event-notice__time">Letzte ${formatRelativeTime(
                    latestLeave.timestamp
                  )}</span>
                </div>
              </div>`
            : ''
        }
      </div>
      <div class="owner-card__sidebar">
        <small class="muted">${statusLabel}</small>
        <ul class="history">
          ${historyItems || '<li class="history__item"><span>Keine Aktivitäten</span></li>'}
        </ul>
        <div class="owner-card__actions">
          <button type="button" class="owner-card__action" data-action="edit" data-id="${
            event.id
          }">Bearbeiten</button>
          <button
            type="button"
            class="owner-card__action owner-card__action--delete"
            data-action="delete"
            data-id="${event.id}"
          >
            Löschen
          </button>
        </div>
      </div>
    `;

  const editButton = card.querySelector('[data-action="edit"]');
  if (editButton) {
    editButton.addEventListener('click', () => ownerEditHandler(event.id));
  }

  const deleteButton = card.querySelector('[data-action="delete"]');
  if (deleteButton) {
    deleteButton.addEventListener('click', () => ownerDeleteHandler(event.id));
  }

  return card;
};

const renderOwnerAlerts = (events) => {
  if (!elements.ownerAlerts) {
    return;
  }
  const windowMs = OWNER_ALERT_WINDOW_MS;
  const now = Date.now();
  const dismissedAlerts = readDismissedOwnerAlerts();
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
      const timestampIso = new Date(latestLeave.timestamp).toISOString();
      return {
        event,
        entry: { ...latestLeave, timestamp: timestampIso },
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        new Date(b.entry.timestamp).getTime() - new Date(a.entry.timestamp).getTime()
    )
    .filter(
      ({ event, entry }) =>
        !dismissedAlerts?.[event.id] || dismissedAlerts[event.id] !== entry.timestamp
    );

  if (!alerts.length) {
    elements.ownerAlerts.innerHTML =
      `<div class="alert alert--muted">Keine neuen Absagen in den letzten ${OWNER_ALERT_WINDOW_DAYS} Tagen.</div>`;
    return;
  }

  elements.ownerAlerts.innerHTML = alerts
    .map(({ event, entry }) => {
      const actor = getHistoryActor(entry);
      return `
        <div class="owner-alert" data-alert-id="${event.id}" data-alert-ts="${escapeHtml(
        entry.timestamp
      )}">
          <div class="owner-alert__icon">⚠️</div>
          <div class="owner-alert__content">
            <p class="owner-alert__label">Absage</p>
            <p class="owner-alert__title">${escapeHtml(event.title)}</p>
            <p class="owner-alert__meta">von ${actor} · ${formatRelativeTime(entry.timestamp)}</p>
          </div>
          <button type="button" class="owner-alert__dismiss" data-alert-dismiss>
            Verstanden
          </button>
        </div>
      `;
    })
    .join('');

  elements.ownerAlerts
    .querySelectorAll('[data-alert-dismiss]')
    .forEach((button) =>
      button.addEventListener('click', () => {
        const alertCard = button.closest('.owner-alert');
        const eventId = alertCard?.getAttribute('data-alert-id');
        const timestamp = alertCard?.getAttribute('data-alert-ts');
        if (eventId && timestamp) {
          markOwnerAlertDismissed(eventId, timestamp);
        }
        alertCard?.remove();
        if (!elements.ownerAlerts.querySelector('.owner-alert')) {
          elements.ownerAlerts.innerHTML =
            `<div class="alert alert--muted">Keine neuen Absagen in den letzten ${OWNER_ALERT_WINDOW_DAYS} Tagen.</div>`;
        }
      })
    );
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
  let openSpots = 0;
  const joinableEvents = state.events.filter((event) => {
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
  [elements.skillFilter, elements.locationFilter, elements.joinableOnlyFilter]
    .filter(Boolean)
    .forEach((filter) => filter.addEventListener('change', handler));
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
  registerOwnerHandlers,
  renderEventsList,
  renderMySessions,
  renderMyAppointments,
  updateStats,
  bindFilters,
  renderEventsHistory,
};
