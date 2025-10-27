const STORAGE_KEY = 'padel-community-events-v1';

const skillColors = {
  Beginner: 'rgba(59, 130, 246, 0.35)',
  Intermediate: 'rgba(99, 102, 241, 0.35)',
  Advanced: 'rgba(244, 114, 182, 0.35)',
};

const places = [
  {
    name: 'Padel Club Hamburg',
    city: 'Hamburg',
    rating: 4.8,
    courts: 6,
    tags: ['Indoor', 'Pro-Shop', 'Coaching'],
    url: 'https://www.padelclubhamburg.de',
  },
  {
    name: 'Padel Base Berlin',
    city: 'Berlin',
    rating: 4.6,
    courts: 8,
    tags: ['Outdoor', 'Snacks', 'Trainings'],
    url: 'https://www.padelbase.de',
  },
  {
    name: 'Rhein Main Padel Arena',
    city: 'Frankfurt',
    rating: 4.9,
    courts: 5,
    tags: ['Indoor', 'Matchmaking', 'Afterwork'],
    url: 'https://www.rheinmainpadel.de',
  },
  {
    name: 'Munich Smash Hub',
    city: 'München',
    rating: 4.7,
    courts: 4,
    tags: ['Rooftop', 'Lounge', 'Events'],
    url: 'https://www.munichsmashhub.de',
  },
];

const defaultEvents = () => {
  const today = new Date();
  const pad = (value) => value.toString().padStart(2, '0');
  const withDate = (offsetDays, hour, minute = 0) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offsetDays);
    date.setHours(hour, minute, 0, 0);
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )}`;
    const timeStr = `${pad(hour)}:${pad(minute)}`;
    return { date, dateStr, timeStr };
  };

  const entries = [
    {
      title: 'Sunrise Doubles',
      location: 'Padel Club Hamburg',
      skill: 'Intermediate',
      capacity: 4,
      totalCost: 48,
      notes: 'Wir spielen auf Court 2. Bälle bringe ich mit.',
      owner: 'Lea',
      paymentLink: 'https://paypal.me/padelhamburg',
      offset: 1,
      hour: 8,
      duration: 2,
    },
    {
      title: 'Lunch Break Rally',
      location: 'Padel Base Berlin',
      skill: 'Beginner',
      capacity: 4,
      totalCost: 36,
      notes: 'Perfekt für Einsteiger:innen. Coaching inklusive.',
      owner: 'Marco',
      paymentLink: 'https://paypal.me/padelberlin',
      offset: 2,
      hour: 12,
      duration: 1.5,
    },
    {
      title: 'Afterwork League',
      location: 'Rhein Main Padel Arena',
      skill: 'Advanced',
      capacity: 6,
      totalCost: 108,
      notes: 'High intensity Training. Bitte 10 Minuten früher da sein.',
      owner: 'Sara',
      paymentLink: 'https://paypal.me/padelrheinmain',
      offset: 3,
      hour: 19,
      duration: 2,
    },
    {
      title: 'Weekend Mixed Open',
      location: 'Munich Smash Hub',
      skill: 'Intermediate',
      capacity: 8,
      totalCost: 120,
      notes: 'Mix & Match Format, wir rotieren nach jedem Satz.',
      owner: 'Jonas',
      paymentLink: 'https://paypal.me/padelmunich',
      offset: 5,
      hour: 10,
      duration: 3,
    },
  ];

  return entries.map((entry, index) => {
    const { date, dateStr, timeStr } = withDate(entry.offset, entry.hour);
    const deadline = new Date(date);
    deadline.setHours(deadline.getHours() - 6);
    const attendees = Math.max(1, Math.floor(entry.capacity / 2));
    const history = Array.from({ length: attendees }, (_, idx) => {
      const joinTime = new Date();
      joinTime.setHours(joinTime.getHours() - (idx + 1) * 4);
      return { timestamp: joinTime.toISOString(), type: 'join' };
    });
    history.unshift({ timestamp: new Date().toISOString(), type: 'create' });
    return {
      id: `seed-${index}`,
      title: entry.title,
      location: entry.location,
      skill: entry.skill,
      capacity: entry.capacity,
      totalCost: entry.totalCost,
      notes: entry.notes,
      owner: entry.owner,
      paymentLink: entry.paymentLink || '',
      date: dateStr,
      time: timeStr,
      duration: entry.duration,
      deadline: deadline.toISOString().slice(0, 16),
      attendees,
      createdAt: new Date().toISOString(),
      joined: false,
      history,
    };
  });
};

const loadEvents = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.map((event) => {
        const capacity = Number(event.capacity) || 4;
        const legacyPrice = Number(event.price);
        let totalCost = Number(event.totalCost);
        if (!Number.isFinite(totalCost) || totalCost <= 0) {
          if (Number.isFinite(legacyPrice) && legacyPrice > 0) {
            totalCost = legacyPrice * Math.max(1, capacity);
          } else {
            totalCost = 0;
          }
        }
        if (!Number.isFinite(totalCost)) {
          totalCost = 0;
        }
        totalCost = Math.max(0, Math.round(totalCost * 100) / 100);
        return {
          ...event,
          attendees: Number(event.attendees) || 0,
          capacity,
          duration: Number(event.duration) || 2,
          totalCost,
          joined: Boolean(event.joined),
          history: event.history || [],
          paymentLink: event.paymentLink || '',
        };
      });
    }
  } catch (error) {
    console.error('Konnte Events nicht laden', error);
  }
  return defaultEvents();
};

const saveEvents = (events) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch (error) {
    console.warn('Lokale Speicherung deaktiviert', error);
  }
};

const state = {
  events: loadEvents(),
  currentWeekOffset: 0,
  recentJoins: 0,
};

const elements = {
  eventsList: document.getElementById('eventsList'),
  mySessionsList: document.getElementById('mySessionsList'),
  calendarGrid: document.getElementById('calendarGrid'),
  calendarRange: document.getElementById('calendarRange'),
  skillFilter: document.getElementById('skillFilter'),
  locationFilter: document.getElementById('locationFilter'),
  activeMatches: document.getElementById('activeMatches'),
  openSpots: document.getElementById('openSpots'),
  communityTrend: document.getElementById('communityTrend'),
};

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

const padNumber = (value) => value.toString().padStart(2, '0');

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

const formatCurrency = (value) => {
  const numeric = Number(value);
  return currencyFormatter.format(Number.isFinite(numeric) ? numeric : 0);
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

const findConflictingSession = (targetEvent) => {
  if (!targetEvent) {
    return null;
  }
  return state.events.find(
    (event) => event.id !== targetEvent.id && event.joined && eventsOverlap(event, targetEvent)
  );
};

const CONFLICT_MESSAGE =
  'Die Session überschneidet sich mit einer anderen, der du bereits zugesagt hast.';

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
  state.recentJoins = trend;
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

const renderCalendar = () => {
  const start = getStartOfWeek(state.currentWeekOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  elements.calendarRange.textContent = `${start.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
  })} – ${end.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`;

  elements.calendarGrid.innerHTML = '';
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dayEvents = state.events
      .filter((event) => event.date === toISODate(date))
      .sort(
        (a, b) =>
          new Date(`${a.date}T${a.time}`).getTime() -
          new Date(`${b.date}T${b.time}`).getTime()
      );
    const day = document.createElement('div');
    day.classList.add('calendar__day');
    day.innerHTML = `
      <div>
        <h4>${date.toLocaleDateString('de-DE', {
          weekday: 'long',
        })}</h4>
        <div class="date">${date.toLocaleDateString('de-DE')}</div>
      </div>
      <div class="calendar__body">
        ${
          dayEvents.length
            ? dayEvents
                .map(
                  (event) => `
                    <div class="calendar__badge" style="background: ${
                      skillColors[event.skill] || 'rgba(59, 130, 246, 0.2)'
                    }">
                      ${event.time} · ${event.title}
                    </div>
                  `
                )
                .join('')
            : '<span class="muted">Noch keine Matches</span>'
        }
      </div>
    `;
    elements.calendarGrid.appendChild(day);
  }
};

const renderPlaces = () => {
  const list = document.getElementById('placesList');
  list.innerHTML = '';
  places.forEach((place) => {
    const card = document.createElement('article');
    card.classList.add('place-card');
    card.innerHTML = `
      <div class="place-card__header">
        <h4>${place.name}</h4>
        <span class="badge">⭐️ ${place.rating.toFixed(1)}</span>
      </div>
      <p class="muted">${place.city} · ${place.courts} Courts</p>
      <div class="place-card__tags">
        ${place.tags.map((tag) => `<span>${tag}</span>`).join('')}
      </div>
      <a class="primary" href="${place.url}" target="_blank" rel="noopener">Zur Website</a>
    `;
    list.appendChild(card);
  });
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
    openSpots,
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
        <p class="muted">${event.location} · Gastgeber: ${event.owner || 'Community'}</p>
        <div class="event-meta">
          <span>🗓️ ${new Date(`${event.date}T00:00`).toLocaleDateString('de-DE')}</span>
          <span>⏱️ ${formatTimeRange(event)}</span>
          <span>💶 Gesamtkosten: ${formatCurrency(totalCost)}</span>
          <span>🤝 Anteil aktuell: ${formatCurrency(currentShare)} (${attendees} Zusagen)</span>
          <span>📊 Bei ${capacity} Spieler:innen: ${formatCurrency(projectedShare)} p.P.</span>
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
    button.addEventListener('click', () => toggleParticipation(event.id));
  }
  return card;
};

const getStartOfWeek = (offset = 0) => {
  const now = new Date();
  const date = new Date(now);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Montag als Start
  date.setDate(diff + offset * 7);
  date.setHours(0, 0, 0, 0);
  return date;
};

const toISODate = (date) => date.toISOString().slice(0, 10);

const syncState = () => {
  saveEvents(state.events);
  renderEventsList();
  renderMySessions();
  renderCalendar();
  updateStats();
};

const updateEventById = (id, updater) => {
  let hasChanged = false;
  state.events = state.events.map((event) => {
    if (event.id !== id) return event;
    const nextEvent = updater({ ...event });
    if (nextEvent) {
      hasChanged = true;
      return nextEvent;
    }
    return event;
  });
  return hasChanged;
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
    syncState();
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
    syncState();
  }
  return changed;
};

const toggleParticipation = (id) => {
  const event = state.events.find((session) => session.id === id);
  if (!event) {
    return;
  }
  if (event.joined) {
    withdrawFromSession(id);
  } else {
    joinSession(id);
  }
};

const handleFormSubmit = (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
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

  state.events = [normalized, ...state.events];
  event.target.reset();
  syncState();
  switchView('dashboard');
  event.target.querySelector('input[name="title"]').focus();
};

const switchView = (target) => {
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === `${target}-view`);
  });
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.target === target);
  });
  const titles = {
    dashboard: 'Community Dashboard',
    'my-sessions': 'Meine Sessions',
    create: 'Neuen Termin erstellen',
    discover: 'Padel-Spots entdecken',
  };
  document.getElementById('view-title').textContent = titles[target];
};

const setupNavigation = () => {
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.target));
  });
};

const setupCalendarControls = () => {
  document.getElementById('prevWeek').addEventListener('click', () => {
    state.currentWeekOffset -= 1;
    renderCalendar();
  });
  document.getElementById('nextWeek').addEventListener('click', () => {
    state.currentWeekOffset += 1;
    renderCalendar();
  });
};

const setupFilters = () => {
  [elements.skillFilter, elements.locationFilter].forEach((filter) =>
    filter.addEventListener('change', () => {
      renderEventsList();
      updateStats();
    })
  );
};

const hydrate = () => {
  setupNavigation();
  setupCalendarControls();
  setupFilters();
  renderPlaces();
  renderEventsList();
  renderMySessions();
  renderCalendar();
  updateStats();
  document.getElementById('eventForm').addEventListener('submit', handleFormSubmit);
};

document.addEventListener('DOMContentLoaded', hydrate);
