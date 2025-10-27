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

export { switchView, setupNavigation };
