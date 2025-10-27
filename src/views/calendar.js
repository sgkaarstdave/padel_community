import { elements } from './elements.js';
import { state } from '../state/store.js';
import { skillColors } from '../state/storage.js';
import { getStartOfWeek, toISODate } from '../utils/time.js';

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

export { renderCalendar };
