import { elements } from './elements.js';
import { state, setRecentJoins } from '../state/store.js';
import { formatTimeRange } from '../utils/time.js';
import { formatCurrency } from '../utils/format.js';

let toggleParticipationHandler = () => {};

const registerToggleHandler = (handler) => {
  toggleParticipationHandler = handler;
};

const getFilteredEvents = () => {
  const skill = elements.skillFilter.value;
  const location = elements.locationFilter.value;
  return state.events.filter((event) => {
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
  const skillFiltered = state.events.filter(
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
  const joinedEvents = state.events
    .filter((event) => event.joined)
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
  const openEvents = filtered.filter((event) => event.attendees < event.capacity);
  const openSpots = openEvents.reduce(
    (acc, event) => acc + (event.capacity - event.attendees),
    0
  );
  const trend = computeRecentTrend();
  setRecentJoins(trend);
  elements.activeMatches.textContent = openEvents.length;
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

export {
  registerToggleHandler,
  renderEventsList,
  renderMySessions,
  updateStats,
  bindFilters,
};
