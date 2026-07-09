/* Aruba Homes frontend: filters -> /api/listings, grid + Leaflet map views. */
const state = {
  status: 'sale', q: '', area: '', type: '', beds: '', minPrice: '', maxPrice: '',
  source: '', sort: 'newest', page: 1, view: 'grid',
};
let meta = null;
let map = null;
let markers = [];

const $ = (id) => document.getElementById(id);
const fmtUsd = (n) => 'US$ ' + Math.round(n).toLocaleString('en-US');
const fmtAwg = (n) => 'ƒ ' + Math.round(n).toLocaleString('en-US');

async function loadMeta() {
  meta = await (await fetch('/api/meta')).json();
  for (const a of meta.areas) $('area').append(new Option(a, a));
  for (const t of meta.types) $('type').append(new Option(t[0].toUpperCase() + t.slice(1), t));
  for (const s of meta.sources.filter((s) => s.synced)) $('source').append(new Option(s.name, s.id));
  $('lastUpdated').textContent = meta.lastUpdated
    ? 'Updated ' + new Date(meta.lastUpdated).toLocaleString()
    : 'First sync pending…';
  const dir = $('directory');
  dir.innerHTML = '';
  for (const s of meta.sources.filter((s) => !s.demo)) {
    const li = document.createElement('li');
    li.innerHTML = `<a href="${s.url}" target="_blank" rel="noopener">${esc(s.name)}</a>
      <span class="tag ${s.synced ? 'ok' : 'pending'}">${s.synced ? 'auto-sync' : 'coming soon'}</span>`;
    dir.appendChild(li);
  }
}

function params() {
  const p = new URLSearchParams();
  for (const k of ['status', 'q', 'area', 'type', 'beds', 'minPrice', 'maxPrice', 'source', 'sort']) {
    if (state[k]) p.set(k, state[k]);
  }
  p.set('page', state.page);
  return p;
}

async function loadListings() {
  const res = await (await fetch('/api/listings?' + params())).json();
  $('totalCount').textContent = `${res.total} listing${res.total === 1 ? '' : 's'}`;
  renderGrid(res);
  renderMapMarkers(res.listings);
  renderPager(res);
  $('empty').classList.toggle('hidden', res.total > 0);
}

function isNew(l) {
  return meta && (Date.now() - new Date(l.first_seen_at)) / 86400000 <= meta.newBadgeDays;
}

function renderGrid(res) {
  const grid = $('grid');
  grid.innerHTML = '';
  for (const l of res.listings) {
    const el = document.createElement('article');
    el.className = 'card';
    // Whole card opens the original listing (inner links still work normally).
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('a')) return;
      const url = l.agencies[0]?.url;
      if (url) window.open(url, '_blank', 'noopener');
    });
    const img = l.images && l.images[0];
    el.innerHTML = `
      <div class="card-photo">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy" onerror="this.remove()">` : '🏠'}
        ${isNew(l) ? '<span class="badge-new">New</span>' : ''}
      </div>
      <div class="card-body">
        <div class="card-price">${l.price_usd ? fmtUsd(l.price_usd) : (esc(l.price_raw) || 'Price on request')}
          ${l.price_awg ? `<small>· ${fmtAwg(l.price_awg)}</small>` : ''}
        </div>
        <div class="card-title">${esc(l.title)}</div>
        <div class="card-meta">
          ${l.area ? `<span>${esc(l.area)}</span>` : ''}
          ${l.bedrooms != null ? `<span>${l.bedrooms} bd</span>` : ''}
          ${l.bathrooms != null ? `<span>${l.bathrooms} ba</span>` : ''}
          ${l.building_m2 ? `<span>${l.building_m2} m²</span>` : ''}
          <span>${esc(cap(l.type || ''))}</span>
        </div>
        <div class="card-agency">
          ${l.agencies.length > 1
            ? `<span class="multi-agency">${l.agencies.length} agencies</span>`
            : `<span class="agency-name">${esc(l.agencies[0]?.name || '')}</span>`}
          <a href="${esc(l.agencies[0]?.url || '#')}" target="_blank" rel="noopener">View listing →</a>
        </div>
      </div>`;
    grid.appendChild(el);
  }
}

function renderPager(res) {
  const pages = Math.max(1, Math.ceil(res.total / res.perPage));
  $('pageInfo').textContent = `Page ${res.page} of ${pages}`;
  $('prevPage').disabled = res.page <= 1;
  $('nextPage').disabled = res.page >= pages;
}

function ensureMap() {
  if (map) return;
  map = L.map('map').setView([12.52, -69.99], 11); // center of Aruba
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
}

function renderMapMarkers(listings) {
  if (!map) return;
  markers.forEach((m) => m.remove());
  markers = listings
    .filter((l) => l.lat != null && l.lng != null)
    .map((l) =>
      L.marker([l.lat, l.lng]).addTo(map).bindPopup(`
        <div class="map-popup">
          <strong>${esc(l.title)}</strong>
          ${l.price_usd ? fmtUsd(l.price_usd) : ''}<br>
          ${l.agencies.map((a) => `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name)} ↗</a>`).join('<br>')}
        </div>`)
    );
}

function setView(view) {
  state.view = view;
  $('viewGrid').classList.toggle('active', view === 'grid');
  $('viewMap').classList.toggle('active', view === 'map');
  $('grid').classList.toggle('hidden', view !== 'grid');
  document.querySelector('.pager').classList.toggle('hidden', view !== 'grid');
  $('map').classList.toggle('hidden', view !== 'map');
  if (view === 'map') {
    ensureMap();
    setTimeout(() => map.invalidateSize(), 50);
    loadListings();
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ---- wire up controls ------------------------------------------------------
// Sale-only site: state.status stays 'sale'; there are no rent/all tabs.
for (const id of ['area', 'type', 'beds', 'source', 'sort']) {
  $(id).addEventListener('change', () => { state[id] = $(id).value; state.page = 1; loadListings(); });
}
let debounce;
for (const id of ['q', 'minPrice', 'maxPrice']) {
  $(id).addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state[id] = $(id).value; state.page = 1; loadListings(); }, 350);
  });
}
$('prevPage').addEventListener('click', () => { state.page--; loadListings(); });
$('nextPage').addEventListener('click', () => { state.page++; loadListings(); });
$('viewGrid').addEventListener('click', () => setView('grid'));
$('viewMap').addEventListener('click', () => setView('map'));

loadMeta().then(loadListings);
