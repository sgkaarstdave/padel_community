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
    'my-appointments': 'Meine Termine',
    discover: 'Padel-Spots entdecken',
  };
  const subtitles = {
    dashboard:
      'Behalte offene Plätze, Zusagen und Trends der Community im Blick.',
    'my-sessions':
      'Hier findest du alle Termine, denen du aktuell zugesagt hast.',
    'my-appointments':
      'Verwalte deine erstellten Matches, passe Details an und behalte alle Zusagen im Blick.',
    discover:
      'Entdecke beliebte Locations und buche direkt über den jeweiligen Anbieter.',
  };
  const titleElement = document.getElementById('view-title');
  if (titleElement) {
    titleElement.textContent = titles[target] || 'Meine Termine';
  }
  const subtitleElement = document.getElementById('view-description');
  if (subtitleElement) {
    subtitleElement.textContent =
      subtitles[target] ||
      'Verwalte deine erstellten Matches, passe Details an und behalte alle Zusagen im Blick.';
  }
};

const setupNavigation = () => {
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.target));
  });
};

export { switchView, setupNavigation };
