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
  const titleElement = document.getElementById('view-title');
  if (titleElement) {
    titleElement.textContent = titles[target] || 'Meine Termine';
  }
};

const setupNavigation = () => {
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.target));
  });
};

export { switchView, setupNavigation };
