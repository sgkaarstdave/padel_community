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
          createdByMe: Boolean(event.createdByMe),
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

export { STORAGE_KEY, skillColors, places, defaultEvents, loadEvents, saveEvents };
