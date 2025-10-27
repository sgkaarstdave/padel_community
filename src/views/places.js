import { places } from '../state/storage.js';

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

export { renderPlaces };
