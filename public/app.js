// ── Config ────────────────────────────────────────────────────
const API = '/api/leaderboard';
const PAGE = 100;
const REFRESH = 50;
const CUTOFF = 100; // top 100 advance
const DEADLINE = new Date('2026-04-19T19:00:00+02:00'); // 19 April 7PM CEST
const RECENT_THRESHOLD = 5 * 60; // 5 minutes in seconds

// ── DOM ───────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const dom = {
  loading:      $('loading'),
  error:        $('error'),
  tableWrap:    $('tableWrap'),
  tbody:        $('tbody'),
  players:      $('playerCount'),
  updated:      $('lastUpdated'),
  countdown:    $('countdown'),
  dot:          $('liveDot'),
  search:       $('searchInput'),
  loadWrap:     $('loadMore'),
  loadBtn:      $('loadMoreBtn'),
  loadInfo:     $('loadMoreInfo'),
  hMap1:        $('hMap1'),
  hMap2:        $('hMap2'),
  hMap3:        $('hMap3'),
  hTotal:       $('hTotal'),
  countryFilter:$('countryFilter'),
  findInput:    $('findMeInput'),
  findBtn:      $('findMeBtn'),
  recBanner:    $('recordsBanner'),
  recLabel1:    $('recLabel1'),  recTime1: $('recTime1'),  recHolder1: $('recHolder1'),
  recLabel2:    $('recLabel2'),  recTime2: $('recTime2'),  recHolder2: $('recHolder2'),
  recLabel3:    $('recLabel3'),  recTime3: $('recTime3'),  recHolder3: $('recHolder3'),
  countryBody:  $('countryBody'),
  cmp1:         $('cmp1'),
  cmp2:         $('cmp2'),
  compareBtn:   $('compareBtn'),
  compareResult:$('compareResult'),
  statsGrid:    $('statsGrid'),
};

// ── State ─────────────────────────────────────────────────────
let raw = null;
let sorted = null;
let shown = PAGE;
let sortBy = 'total';
let mapNames = ['Map 1', 'Map 2', 'Map 3'];
let fetchedAt = 0;
let activeTab = 'leaderboard';
let highlightName = '';
let prevRanks = new Map(); // name -> previous rank for movement tracking

// ── Helpers ───────────────────────────────────────────────────
function fmtTime(ms) {
  if (ms == null) return null;
  const t = Math.abs(ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const ml = t % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(ml).padStart(3, '0')}`;
}

function fmtDelta(d) {
  if (!d || d <= 0) return '';
  return '+' + fmtTime(d);
}

function ago(ts) {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 0) return 'just now';
  if (sec < 60) return sec + 's ago';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const dy = Math.floor(hr / 24);
  return dy + 'd ago';
}

function isRecent(ts) {
  if (!ts) return false;
  const d = typeof ts === 'number' ? ts : Math.floor(new Date(ts).getTime() / 1000);
  return (Math.floor(Date.now() / 1000) - d) < RECENT_THRESHOLD;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function flag(iso) {
  if (!iso) return '';
  return `<img class="player-flag" src="https://flagcdn.com/20x15/${iso}.png" alt="${iso}" loading="lazy" onerror="this.style.display='none'">`;
}

function flagLarge(iso) {
  if (!iso) return '';
  return `<img class="player-flag" src="https://flagcdn.com/24x18/${iso}.png" alt="${iso}" loading="lazy" onerror="this.style.display='none'">`;
}

function countryName(iso) {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    return names.of(iso.toUpperCase()) || iso.toUpperCase();
  } catch { return iso ? iso.toUpperCase() : 'Unknown'; }
}

// ── Expand API shorthand ──────────────────────────────────────
function expand(e) {
  return {
    rank: e.r, name: e.n, flag: e.f,
    t1: e.t1, r1: e.r1,
    t2: e.t2, r2: e.r2,
    t3: e.t3, r3: e.r3,
    sum: e.s, mc: e.mc, li: e.li,
  };
}

// ── Countdown ─────────────────────────────────────────────────
function updateCountdown() {
  const now = Date.now();
  const diff = DEADLINE.getTime() - now;
  if (diff <= 0) { dom.countdown.textContent = 'CLOSED'; return; }
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) dom.countdown.textContent = `${days}d ${hrs}h`;
  else dom.countdown.textContent = `${hrs}h ${mins}m`;
}
updateCountdown();
setInterval(updateCountdown, 60000);

// ── Sort ──────────────────────────────────────────────────────
function doSort() {
  if (!raw) return [];
  const list = [...raw.entries];

  if (sortBy === 'total') {
    list.sort((a, b) => {
      if (a.mc !== b.mc) return b.mc - a.mc;
      return a.sum - b.sum;
    });
  } else {
    const k = sortBy === 'map1' ? 't1' : sortBy === 'map2' ? 't2' : 't3';
    list.sort((a, b) => {
      const ah = a[k] != null, bh = b[k] != null;
      if (ah && !bh) return -1;
      if (!ah && bh) return 1;
      if (ah && bh) return a[k] - b[k];
      return 0;
    });
  }

  list.forEach((e, i) => e._r = i + 1);
  return list;
}

function setSort(mode) {
  sortBy = mode;
  shown = PAGE;
  updateHeaders();
  sorted = doSort();
  render();
}

function updateHeaders() {
  [dom.hMap1, dom.hMap2, dom.hMap3, dom.hTotal].forEach(h => h.classList.remove('active'));
  if (sortBy === 'map1') dom.hMap1.classList.add('active');
  else if (sortBy === 'map2') dom.hMap2.classList.add('active');
  else if (sortBy === 'map3') dom.hMap3.classList.add('active');
  else dom.hTotal.classList.add('active');
}

// ── Build row ─────────────────────────────────────────────────
function row(e, best) {
  const tr = document.createElement('tr');
  tr.dataset.name = (e.name || '').toLowerCase();

  const r = e.rank;
  if (r === 1) tr.className = 'gold';
  else if (r === 2) tr.className = 'silver';
  else if (r === 3) tr.className = 'bronze';

  // Top 100 cutoff line
  if (r === CUTOFF) tr.classList.add('cutoff-row');
  if (r === CUTOFF + 1) tr.classList.add('below-cutoff');

  // Recent improvement glow
  if (isRecent(e.li)) tr.classList.add('recent-glow');

  // Highlight "find me"
  if (highlightName && (e.name || '').toLowerCase() === highlightName) {
    tr.classList.add('highlight-me');
    tr.id = 'found-player';
  }

  const t1 = fmtTime(e.t1);
  const t2 = fmtTime(e.t2);
  const t3 = fmtTime(e.t3);
  const tot = fmtTime(e.sum);

  const mr = (v) => v != null ? `<span class="map-rank">#${v}</span>` : '';

  let delta = '';
  if (sortBy === 'total' && r > 1 && best > 0 && e.mc === 3) {
    const d = fmtDelta(e.sum - best);
    if (d) delta = `<span class="delta">${d}</span>`;
  }

  // Movement indicator
  let moveHtml = '';
  const nameKey = (e.name || '').toLowerCase();
  if (prevRanks.size > 0 && prevRanks.has(nameKey)) {
    const prev = prevRanks.get(nameKey);
    const diff = prev - r; // positive = moved up
    if (diff > 0) moveHtml = `<span class="move-up" title="Up ${diff}">▲${diff}</span>`;
    else if (diff < 0) moveHtml = `<span class="move-down" title="Down ${Math.abs(diff)}">▼${Math.abs(diff)}</span>`;
  } else if (prevRanks.size > 0) {
    moveHtml = `<span class="move-new" title="New entry">★</span>`;
  }

  tr.innerHTML = `
    <td class="col-rank">${r}${moveHtml}</td>
    <td class="col-player">${flag(e.flag)}${esc(e.name)}</td>
    <td class="col-time ${t1 == null ? 'time-missing' : ''}">${t1 != null ? mr(e.r1) + t1 : '—'}</td>
    <td class="col-time ${t2 == null ? 'time-missing' : ''}">${t2 != null ? mr(e.r2) + t2 : '—'}</td>
    <td class="col-time ${t3 == null ? 'time-missing' : ''}">${t3 != null ? mr(e.r3) + t3 : '—'}</td>
    <td class="col-total">${tot ?? '—'}${delta ? '<br>' + delta : ''}</td>
    <td class="col-improved">${ago(e.li)}</td>
  `;
  return tr;
}

// ── Render ────────────────────────────────────────────────────
function bestTime() {
  if (!raw) return 0;
  const b = raw.entries.find(e => e.mc === 3);
  return b ? b.sum : 0;
}

function getFilteredSorted() {
  if (!sorted) return [];
  const country = dom.countryFilter.value;
  if (!country) return sorted;
  return sorted.filter(e => e.flag === country);
}

function render() {
  if (!sorted) return;
  const query = dom.search.value.trim().toLowerCase();
  const bt = bestTime();
  const filtered = getFilteredSorted();
  const frag = document.createDocumentFragment();

  if (query && query.length >= 2) {
    let count = 0;
    for (const e of filtered) {
      if (count >= 200) break;
      if ((e.name || '').toLowerCase().includes(query)) {
        frag.appendChild(row(e, bt));
        count++;
      }
    }
    dom.tbody.innerHTML = '';
    dom.tbody.appendChild(frag);
    dom.loadWrap.style.display = 'none';
    return;
  }

  const limit = Math.min(shown, filtered.length);
  for (let i = 0; i < limit; i++) {
    frag.appendChild(row(filtered[i], bt));
  }

  dom.tbody.innerHTML = '';
  dom.tbody.appendChild(frag);

  if (shown < filtered.length && !query) {
    dom.loadWrap.style.display = '';
    dom.loadInfo.textContent = `${Math.min(shown, filtered.length)} of ${filtered.length}`;
  } else {
    dom.loadWrap.style.display = 'none';
  }
}

// ── Load more ─────────────────────────────────────────────────
function loadMore() {
  if (!sorted) return;
  const bt = bestTime();
  const filtered = getFilteredSorted();
  const start = shown;
  shown += PAGE;
  const end = Math.min(shown, filtered.length);
  const frag = document.createDocumentFragment();
  for (let i = start; i < end; i++) frag.appendChild(row(filtered[i], bt));
  dom.tbody.appendChild(frag);

  if (shown >= filtered.length) dom.loadWrap.style.display = 'none';
  else dom.loadInfo.textContent = `${Math.min(shown, filtered.length)} of ${filtered.length}`;
}

// ── Records banner ────────────────────────────────────────────
function updateRecords() {
  if (!raw) return;
  const entries = raw.entries;

  // Find best time per map
  let wr1 = null, wr2 = null, wr3 = null;
  for (const e of entries) {
    if (e.t1 != null && (wr1 === null || e.t1 < wr1.t1)) wr1 = e;
    if (e.t2 != null && (wr2 === null || e.t2 < wr2.t2)) wr2 = e;
    if (e.t3 != null && (wr3 === null || e.t3 < wr3.t3)) wr3 = e;
  }

  dom.recLabel1.textContent = mapNames[0];
  dom.recLabel2.textContent = mapNames[1];
  dom.recLabel3.textContent = mapNames[2];

  dom.recTime1.textContent = wr1 ? fmtTime(wr1.t1) : '—';
  dom.recTime2.textContent = wr2 ? fmtTime(wr2.t2) : '—';
  dom.recTime3.textContent = wr3 ? fmtTime(wr3.t3) : '—';

  dom.recHolder1.innerHTML = wr1 ? `${esc(wr1.name)} <span class="record-when">${ago(wr1.li)}</span>` : '';
  dom.recHolder2.innerHTML = wr2 ? `${esc(wr2.name)} <span class="record-when">${ago(wr2.li)}</span>` : '';
  dom.recHolder3.innerHTML = wr3 ? `${esc(wr3.name)} <span class="record-when">${ago(wr3.li)}</span>` : '';

  dom.recBanner.style.display = '';
}

// ── Country filter populate ───────────────────────────────────
function populateCountries() {
  if (!raw) return;
  const countries = new Map();
  for (const e of raw.entries) {
    if (e.flag && !countries.has(e.flag)) {
      countries.set(e.flag, countryName(e.flag));
    }
  }
  const sorted = [...countries.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  dom.countryFilter.innerHTML = '<option value="">All countries</option>';
  for (const [code, name] of sorted) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = name;
    dom.countryFilter.appendChild(opt);
  }
}

// ── Find me ───────────────────────────────────────────────────
function findMe() {
  const name = dom.findInput.value.trim().toLowerCase();
  if (!name || !sorted) return;

  highlightName = name;
  dom.search.value = '';
  dom.countryFilter.value = '';

  // Make sure enough rows are loaded
  const idx = sorted.findIndex(e => (e.name || '').toLowerCase() === name);
  if (idx === -1) {
    // Try partial match
    const partial = sorted.findIndex(e => (e.name || '').toLowerCase().includes(name));
    if (partial === -1) {
      alert('Driver not found!');
      highlightName = '';
      return;
    }
    highlightName = sorted[partial].name.toLowerCase();
    shown = Math.max(shown, partial + 20);
  } else {
    shown = Math.max(shown, idx + 20);
  }

  render();

  requestAnimationFrame(() => {
    const el = document.getElementById('found-player');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

// ── Country ranking ───────────────────────────────────────────
function renderCountries() {
  if (!raw) return;
  const map = new Map();

  // Use the total-sorted list (only players with all 3 maps)
  const totalSorted = [...raw.entries]
    .filter(e => e.mc === 3)
    .sort((a, b) => a.sum - b.sum);

  for (const e of totalSorted) {
    const c = e.flag || '??';
    if (!map.has(c)) map.set(c, { code: c, best: e, drivers: 0, times: [] });
    const entry = map.get(c);
    entry.drivers++;
    if (entry.times.length < 5) entry.times.push(e.sum);
  }

  const list = [...map.values()].sort((a, b) => a.best.sum - b.best.sum);

  const frag = document.createDocumentFragment();
  list.forEach((c, i) => {
    const tr = document.createElement('tr');
    if (i === 0) tr.className = 'gold';
    else if (i === 1) tr.className = 'silver';
    else if (i === 2) tr.className = 'bronze';

    const avg = c.times.length > 0
      ? fmtTime(Math.round(c.times.reduce((a, b) => a + b, 0) / c.times.length))
      : '—';

    tr.innerHTML = `
      <td class="col-rank">${i + 1}</td>
      <td class="col-player">${flagLarge(c.code)}${esc(countryName(c.code))}</td>
      <td class="col-time">${esc(c.best.name)}</td>
      <td class="col-total">${fmtTime(c.best.sum)}</td>
      <td class="col-time">${c.drivers}</td>
      <td class="col-time">${avg}</td>
    `;
    frag.appendChild(tr);
  });

  dom.countryBody.innerHTML = '';
  dom.countryBody.appendChild(frag);
}

// ── Compare ───────────────────────────────────────────────────
function doCompare() {
  if (!raw) return;
  const n1 = dom.cmp1.value.trim().toLowerCase();
  const n2 = dom.cmp2.value.trim().toLowerCase();
  if (!n1 || !n2) return;

  const find = (n) => raw.entries.find(e => (e.name || '').toLowerCase() === n)
    || raw.entries.find(e => (e.name || '').toLowerCase().includes(n));

  const p1 = find(n1);
  const p2 = find(n2);

  if (!p1 || !p2) {
    dom.compareResult.innerHTML = `<p class="error-text">One or both drivers not found.</p>`;
    return;
  }

  const diffCell = (a, b) => {
    if (a == null || b == null) return '—';
    const d = a - b;
    if (d === 0) return '=';
    const sign = d > 0 ? '+' : '';
    return `<span class="${d > 0 ? 'delta' : 'delta-ahead'}">${sign}${fmtTime(d)}</span>`;
  };

  const winner = (a, b) => {
    if (a == null || b == null) return '';
    return a < b ? 'winner' : a > b ? 'loser' : '';
  };

  dom.compareResult.innerHTML = `
    <table class="compare-table">
      <thead>
        <tr>
          <th></th>
          <th class="col-player">${flag(p1.flag)}${esc(p1.name)}</th>
          <th style="width:80px">Diff</th>
          <th class="col-player">${flag(p2.flag)}${esc(p2.name)}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="compare-label">${esc(mapNames[0])}</td>
          <td class="col-time ${winner(p1.t1, p2.t1)}">${fmtTime(p1.t1) ?? '—'}</td>
          <td class="col-time">${diffCell(p1.t1, p2.t1)}</td>
          <td class="col-time ${winner(p2.t1, p1.t1)}">${fmtTime(p2.t1) ?? '—'}</td>
        </tr>
        <tr>
          <td class="compare-label">${esc(mapNames[1])}</td>
          <td class="col-time ${winner(p1.t2, p2.t2)}">${fmtTime(p1.t2) ?? '—'}</td>
          <td class="col-time">${diffCell(p1.t2, p2.t2)}</td>
          <td class="col-time ${winner(p2.t2, p1.t2)}">${fmtTime(p2.t2) ?? '—'}</td>
        </tr>
        <tr>
          <td class="compare-label">${esc(mapNames[2])}</td>
          <td class="col-time ${winner(p1.t3, p2.t3)}">${fmtTime(p1.t3) ?? '—'}</td>
          <td class="col-time">${diffCell(p1.t3, p2.t3)}</td>
          <td class="col-time ${winner(p2.t3, p1.t3)}">${fmtTime(p2.t3) ?? '—'}</td>
        </tr>
        <tr class="compare-total">
          <td class="compare-label">Combined</td>
          <td class="col-total ${winner(p1.sum, p2.sum)}">${fmtTime(p1.sum) ?? '—'}</td>
          <td class="col-time">${diffCell(p1.sum, p2.sum)}</td>
          <td class="col-total ${winner(p2.sum, p1.sum)}">${fmtTime(p2.sum) ?? '—'}</td>
        </tr>
        <tr>
          <td class="compare-label">Rank</td>
          <td class="col-time">#${p1.rank}</td>
          <td class="col-time"></td>
          <td class="col-time">#${p2.rank}</td>
        </tr>
      </tbody>
    </table>
  `;
}

// ── Stats ─────────────────────────────────────────────────────
function renderStats() {
  if (!raw) return;
  const entries = raw.entries;
  const complete = entries.filter(e => e.mc === 3);

  // Time distribution (combined time, 5s buckets)
  const buckets = new Map();
  let minTime = Infinity, maxTime = 0;
  for (const e of complete) {
    const bucket = Math.floor(e.sum / 5000) * 5000;
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    if (e.sum < minTime) minTime = e.sum;
    if (e.sum > maxTime) maxTime = e.sum;
  }

  const bucketList = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  const maxCount = Math.max(...bucketList.map(b => b[1]));

  // Build chart HTML
  let chartHtml = '<div class="dist-chart">';
  for (const [time, count] of bucketList) {
    const pct = (count / maxCount * 100).toFixed(1);
    const label = fmtTime(time);
    chartHtml += `
      <div class="dist-bar-wrap">
        <span class="dist-label">${label}</span>
        <div class="dist-bar-bg">
          <div class="dist-bar" style="width:${pct}%"></div>
        </div>
        <span class="dist-count">${count}</span>
      </div>`;
  }
  chartHtml += '</div>';

  // Map completion breakdown
  const played3 = complete.length;
  const played2 = entries.filter(e => e.mc === 2).length;
  const played1 = entries.filter(e => e.mc === 1).length;

  // Top countries by # of drivers
  const countryCounts = new Map();
  for (const e of entries) {
    if (e.flag) countryCounts.set(e.flag, (countryCounts.get(e.flag) || 0) + 1);
  }
  const topCountries = [...countryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  let countryHtml = '<div class="stat-list">';
  for (const [code, count] of topCountries) {
    const pct = (count / entries.length * 100).toFixed(1);
    countryHtml += `
      <div class="stat-list-row">
        <span>${flagLarge(code)} ${esc(countryName(code))}</span>
        <div class="dist-bar-bg small">
          <div class="dist-bar" style="width:${pct}%"></div>
        </div>
        <span class="dist-count">${count}</span>
      </div>`;
  }
  countryHtml += '</div>';

  // Recent activity (last hour)
  const hourAgo = Math.floor(Date.now() / 1000) - 3600;
  const recentCount = entries.filter(e => e.li && e.li > hourAgo).length;

  // Top 10 per map
  function top10Html(key, mapName) {
    const top = entries
      .filter(e => e[key] != null)
      .sort((a, b) => a[key] - b[key])
      .slice(0, 10);
    let html = '<table class="mini-table"><tbody>';
    top.forEach((e, i) => {
      const cls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      html += `<tr class="${cls}">
        <td class="col-rank mini-rank">${i + 1}</td>
        <td class="col-player mini-player">${flag(e.flag)}${esc(e.name)}</td>
        <td class="col-time">${fmtTime(e[key])}</td>
        <td class="col-improved mini-when">${ago(e.li)}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    return html;
  }

  dom.statsGrid.innerHTML = `
    <div class="stat-card wide">
      <h3>Overview</h3>
      <div class="overview-row">
        <div class="stat-kv"><span>Total drivers</span><strong>${entries.length}</strong></div>
        <div class="stat-kv"><span>Played 3 maps</span><strong>${played3}</strong></div>
        <div class="stat-kv"><span>Played 2 maps</span><strong>${played2}</strong></div>
        <div class="stat-kv"><span>Played 1 map</span><strong>${played1}</strong></div>
        <div class="stat-kv"><span>Active last hour</span><strong>${recentCount}</strong></div>
        <div class="stat-kv"><span>Top 100 cutoff</span><strong>${complete.length >= CUTOFF ? fmtTime(complete[CUTOFF - 1].sum) : '—'}</strong></div>
      </div>
    </div>
    <div class="stat-card">
      <h3>Top 10 — ${esc(mapNames[0])}</h3>
      ${top10Html('t1', mapNames[0])}
    </div>
    <div class="stat-card">
      <h3>Top 10 — ${esc(mapNames[1])}</h3>
      ${top10Html('t2', mapNames[1])}
    </div>
    <div class="stat-card">
      <h3>Top 10 — ${esc(mapNames[2])}</h3>
      ${top10Html('t3', mapNames[2])}
    </div>
    <div class="stat-card wide">
      <h3>Combined Time Distribution</h3>
      ${chartHtml}
    </div>
    <div class="stat-card wide">
      <h3>Top Countries by Drivers</h3>
      ${countryHtml}
    </div>
  `;
}

// ── Tabs ──────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;

    document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
    document.getElementById('toolbarMain').style.display = activeTab === 'leaderboard' ? '' : 'none';

    if (activeTab === 'leaderboard') {
      $('panelLeaderboard').style.display = '';
    } else if (activeTab === 'countries') {
      $('panelCountries').style.display = '';
      renderCountries();
    } else if (activeTab === 'compare') {
      $('panelCompare').style.display = '';
    } else if (activeTab === 'stats') {
      $('panelStats').style.display = '';
      renderStats();
    }
  });
});

// ── Fetch ─────────────────────────────────────────────────────
async function fetchData() {
  dom.dot.classList.add('fetching');
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    raw = {
      entries: data.l.map(expand),
      names: data.mn,
      updated: data.lu,
      total: data.tp,
    };

    if (raw.names) {
      mapNames = raw.names;
      dom.hMap1.firstChild.textContent = mapNames[0] || 'Map 1';
      dom.hMap2.firstChild.textContent = mapNames[1] || 'Map 2';
      dom.hMap3.firstChild.textContent = mapNames[2] || 'Map 3';
    }

    dom.players.textContent = raw.total || raw.entries.length;
    fetchedAt = Date.now();
    dom.updated.textContent = 'just now';

    // Save current ranks before re-sorting for movement tracking
    if (sorted && sorted.length > 0) {
      prevRanks = new Map();
      for (const e of sorted) {
        prevRanks.set((e.name || '').toLowerCase(), e.rank);
      }
    }

    sorted = doSort();
    updateHeaders();
    updateRecords();
    populateCountries();

    dom.loading.style.display = 'none';
    dom.error.style.display = 'none';
    dom.tableWrap.style.display = '';

    render();
  } catch (err) {
    console.error('Fetch failed:', err);
    if (dom.tableWrap.style.display === 'none') {
      dom.loading.style.display = 'none';
      dom.error.style.display = '';
      dom.error.querySelector('.error-text').textContent = 'Connection failed — ' + err.message;
    }
  } finally {
    dom.dot.classList.remove('fetching');
  }
}

// ── Events ────────────────────────────────────────────────────
dom.hMap1.addEventListener('click', () => setSort(sortBy === 'map1' ? 'total' : 'map1'));
dom.hMap2.addEventListener('click', () => setSort(sortBy === 'map2' ? 'total' : 'map2'));
dom.hMap3.addEventListener('click', () => setSort(sortBy === 'map3' ? 'total' : 'map3'));
dom.hTotal.addEventListener('click', () => setSort('total'));
dom.loadBtn.addEventListener('click', loadMore);
dom.findBtn.addEventListener('click', findMe);
dom.findInput.addEventListener('keydown', e => { if (e.key === 'Enter') findMe(); });
dom.compareBtn.addEventListener('click', doCompare);
dom.cmp1.addEventListener('keydown', e => { if (e.key === 'Enter') doCompare(); });
dom.cmp2.addEventListener('keydown', e => { if (e.key === 'Enter') doCompare(); });

dom.countryFilter.addEventListener('change', () => {
  shown = PAGE;
  render();
});

let searchTimer;
dom.search.addEventListener('input', () => {
  highlightName = '';
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 150);
});

// ── Ticker ────────────────────────────────────────────────────
setInterval(() => {
  if (fetchedAt) {
    const s = Math.floor((Date.now() - fetchedAt) / 1000);
    dom.updated.textContent = s + 's ago';
  }
}, 5000);

// ── Init ──────────────────────────────────────────────────────
fetchData();
setInterval(fetchData, REFRESH * 1000);
