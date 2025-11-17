import { isActiveOrRecent } from '../utils/time.js';

const STORAGE_KEY = 'padel-community-events-v1';

const skillColors = {
  Beginner: 'rgba(59, 130, 246, 0.35)',
  Intermediate: 'rgba(99, 102, 241, 0.35)',
  Advanced: 'rgba(244, 114, 182, 0.35)',
};

const places = [
  {
    name: 'High Class Fitness Padel',
    city: 'Dormagen',
    rating: 4.7,
    courts: 3,
    tags: ['Indoor', 'Fitnessstudio', 'Online-Buchung'],
    url: 'https://highclassfitness.de/',
    bookingUrl:
      'https://highclassfitness.ebusy.de/court-module/3093?currentDate=11/07/2025',
  },
  {
    name: '4PADEL Düsseldorf',
    city: 'Düsseldorf',
    rating: 4.8,
    courts: 4,
    tags: ['Indoor', 'Academy', 'Events'],
    url: 'https://www.4padel.de/',
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
      title: 'Dormagen Sunrise Doubles',
      location: 'High Class Fitness Padel',
      skill: 'Intermediate',
      capacity: 4,
      totalCost: 52,
      notes:
        'Indoor-Session auf Court 1. Slot wurde über eBusy reserviert, bringt gute Laune mit.',
      owner: 'Nina',
      paymentLink:
        'https://highclassfitness.ebusy.de/court-module/3093?currentDate=11/07/2025',
      offset: 1,
      hour: 8,
      duration: 2,
    },
    {
      title: 'Lunch Break Intro Dormagen',
      location: 'High Class Fitness Padel',
      skill: 'Beginner',
      capacity: 4,
      totalCost: 40,
      notes:
        'Schnupperrunde im High Class Fitness, perfekt für Einsteiger:innen mit kurzem Technik-Check.',
      owner: 'Marcel',
      paymentLink:
        'https://highclassfitness.ebusy.de/court-module/3093?currentDate=11/07/2025',
      offset: 2,
      hour: 12,
      duration: 1.5,
    },
    {
      title: 'Afterwork League Düsseldorf',
      location: '4PADEL Düsseldorf',
      skill: 'Advanced',
      capacity: 6,
      totalCost: 114,
      notes:
        'Matchplay in der ehemaligen Tennishalle von 4PADEL – bitte 10 Minuten vorher zum Warm-up da sein.',
      owner: 'Sara',
      paymentLink: 'https://www.4padel.de/',
      offset: 3,
      hour: 19,
      duration: 2,
    },
    {
      title: 'Weekend Mixed Düsseldorf',
      location: '4PADEL Düsseldorf',
      skill: 'Intermediate',
      capacity: 8,
      totalCost: 128,
      notes:
        'Community-Mix mit Musik und Getränken in der 4PADEL Lounge – wir rotieren nach jedem Satz.',
      owner: 'Jonas',
      paymentLink: 'https://www.4padel.de/',
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
      createdByMe: false,
      history,
    };
  });
};

const loadEvents = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const now = new Date();
      return parsed
        .map((event) => {
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
            createdByMe: Boolean(event.createdByMe),
          };
        })
        .filter((event) => isActiveOrRecent(event, now));
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

export { STORAGE_KEY, skillColors, places, defaultEvents, loadEvents, saveEvents };
