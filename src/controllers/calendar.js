import { adjustWeekOffset } from '../state/store.js';

const setupCalendarControls = (onWeekChange) => {
  document.getElementById('prevWeek').addEventListener('click', () => {
    adjustWeekOffset(-1);
    onWeekChange();
  });
  document.getElementById('nextWeek').addEventListener('click', () => {
    adjustWeekOffset(1);
    onWeekChange();
  });
};

export { setupCalendarControls };
