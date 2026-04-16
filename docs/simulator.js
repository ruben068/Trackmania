// ══════════════════════════════════════════════════════════════
//  TOURNAMENT PATH SIMULATOR — drag-and-drop edition
//  Placement = position in list. Drag to reorder. Downstream
//  rounds auto-populate from finishing positions.
// ══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const SIM_KEY = 'rbf-sim-v3';

  // Round 1 seed-to-match map (from Appendix D)
  const R1_SEEDS = {
    0: [1, 8, 9, 16, 17, 24, 25, 32, 33, 40, 41, 48, 49, 56, 57, 64, 65, 72, 73, 80, 81, 88, 89, 96, 97],
    1: [4, 5, 12, 13, 20, 21, 28, 29, 36, 37, 44, 45, 52, 53, 60, 61, 68, 69, 76, 77, 84, 85, 92, 93, 100],
    2: [3, 6, 11, 14, 19, 22, 27, 30, 35, 38, 43, 46, 51, 54, 59, 62, 67, 70, 75, 78, 83, 86, 91, 94, 99],
    3: [2, 7, 10, 15, 18, 23, 26, 31, 34, 39, 42, 47, 50, 55, 58, 63, 66, 71, 74, 79, 82, 87, 90, 95, 98],
  };

  // Zone thresholds per round — index-based, 0-indexed position
  // R1: P1=0, P2-8=1..7, P9-12=8..11, P13-25=12..24
  // R2: P1=0, P2-4=1..3, P5-14=4..13
  // R3: P1-4=0..3, P5-18=4..17
  // R4: P1=0, P2-14=1..13
  const ROUNDS = {
    r1: {
      matches: 4, size: 25, name: 'Round 1',
      zoneFor: i => i === 0 ? 'q' : i < 8 ? 'r2' : i < 12 ? 'r3' : 'out',
    },
    r2: {
      matches: 2, size: 14, name: 'Round 2',
      zoneFor: i => i === 0 ? 'q' : i < 4 ? 'r4' : 'r3',
    },
    r3: {
      matches: 2, size: 18, name: 'Round 3',
      zoneFor: i => i < 4 ? 'r4' : 'out',
    },
    r4: {
      matches: 1, size: 14, name: 'Round 4',
      zoneFor: i => i === 0 ? 'q' : 'out',
    },
  };

  const ZONE_META = {
    q:   { cls: 'zone-q',   label: 'QUALIFIED' },
    r2:  { cls: 'zone-r2',  label: '→ Round 2' },
    r3:  { cls: 'zone-r3',  label: '→ Round 3' },
    r4:  { cls: 'zone-r4',  label: '→ Round 4' },
    out: { cls: 'zone-out', label: 'Eliminated' },
  };

  // State: { r1: { m0: [name,...], m1: [...], ... }, r2: {...}, ... }
  let state = { r1: {}, r2: {}, r3: {}, r4: {} };
  let ranked = [];
  let driverByName = new Map();
  let sortables = [];

  const $ = id => document.getElementById(id);
  const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
  const flag = iso => iso ? `<img class="player-flag" src="https://flagcdn.com/16x12/${iso}.png" alt="${iso}">` : '';

  // ── Persistence ────────────────────────────────────────────
  function saveState() {
    try { localStorage.setItem(SIM_KEY, JSON.stringify(state)); } catch {}
  }
  function loadState() {
    try {
      const s = localStorage.getItem(SIM_KEY);
      if (s) {
        const loaded = JSON.parse(s);
        state = {
          r1: loaded.r1 || {},
          r2: loaded.r2 || {},
          r3: loaded.r3 || {},
          r4: loaded.r4 || {},
        };
      }
    } catch {}
  }

  function seedOf(name) {
    const i = ranked.findIndex(d => d.name === name);
    return i === -1 ? 9999 : i + 1;
  }

  // ── Seed-based initial / auto-fill ─────────────────────────
  function autoFillR1() {
    state.r1 = {};
    for (let m = 0; m < 4; m++) {
      const names = R1_SEEDS[m]
        .map(seed => ranked[seed - 1])
        .filter(Boolean)
        .map(d => d.name);
      state.r1['m' + m] = names;
    }
  }

  // Merge downstream: preserve existing order for drivers still in pool,
  // append newcomers in seed order at the end, drop missing drivers.
  function mergePreserve(existing, newPool) {
    const poolSet = new Set(newPool);
    const kept = (existing || []).filter(n => poolSet.has(n));
    const keptSet = new Set(kept);
    const newcomers = newPool.filter(n => !keptSet.has(n));
    newcomers.sort((a, b) => seedOf(a) - seedOf(b));
    return kept.concat(newcomers);
  }

  function rebuildR2() {
    // R2 M0 pool = R1 M0 P2-8 + R1 M1 P2-8
    // R2 M1 pool = R1 M2 P2-8 + R1 M3 P2-8
    const pools = [[], []];
    for (let m = 0; m < 4; m++) {
      const arr = state.r1['m' + m] || [];
      const p28 = arr.slice(1, 8);
      const target = m < 2 ? 0 : 1;
      pools[target].push(...p28);
    }
    state.r2.m0 = mergePreserve(state.r2.m0, pools[0]);
    state.r2.m1 = mergePreserve(state.r2.m1, pools[1]);
  }

  function rebuildR3() {
    // R3 M0 pool = R1 M0 P9-12 + R1 M1 P9-12 + R2 M0 P5-14
    // R3 M1 pool = R1 M2 P9-12 + R1 M3 P9-12 + R2 M1 P5-14
    const pools = [[], []];
    for (let m = 0; m < 4; m++) {
      const arr = state.r1['m' + m] || [];
      const p912 = arr.slice(8, 12);
      const target = m < 2 ? 0 : 1;
      pools[target].push(...p912);
    }
    for (let m = 0; m < 2; m++) {
      const arr = state.r2['m' + m] || [];
      const p514 = arr.slice(4, 14);
      pools[m].push(...p514);
    }
    state.r3.m0 = mergePreserve(state.r3.m0, pools[0]);
    state.r3.m1 = mergePreserve(state.r3.m1, pools[1]);
  }

  function rebuildR4() {
    // R4 pool = R2 P2-4 + R3 P1-4
    const pool = [];
    for (let m = 0; m < 2; m++) {
      const arr = state.r2['m' + m] || [];
      pool.push(...arr.slice(1, 4));
    }
    for (let m = 0; m < 2; m++) {
      const arr = state.r3['m' + m] || [];
      pool.push(...arr.slice(0, 4));
    }
    state.r4.m0 = mergePreserve(state.r4.m0, pool);
  }

  function rebuildDownstream(from) {
    if (from === 'r1') { rebuildR2(); rebuildR3(); rebuildR4(); }
    else if (from === 'r2') { rebuildR3(); rebuildR4(); }
    else if (from === 'r3') { rebuildR4(); }
  }

  function autoFill() {
    autoFillR1();
    state.r2 = {}; state.r3 = {}; state.r4 = {};
    rebuildR2(); rebuildR3(); rebuildR4();
    saveState();
    renderAll();
  }

  function reset() {
    state = { r1: {}, r2: {}, r3: {}, r4: {} };
    autoFill();
  }

  // ── Rendering ──────────────────────────────────────────────
  function renderAll() {
    // Kill existing sortable instances
    sortables.forEach(s => { try { s.destroy(); } catch {} });
    sortables = [];

    for (const round of ['r1', 'r2', 'r3', 'r4']) renderRound(round);
    renderFinalists();
    updateProgress();
    attachSortables();
  }

  function renderRound(round) {
    const grid = $(`sim${round.toUpperCase()}Grid`);
    if (!grid) return;

    const meta = ROUNDS[round];
    grid.innerHTML = '';

    for (let m = 0; m < meta.matches; m++) {
      const names = state[round]['m' + m] || [];
      const card = document.createElement('div');
      card.className = 'sim-match-card';
      card.innerHTML = `
        <div class="sim-match-header">
          <h4>Match ${m + 1}</h4>
          <div class="sim-match-legend">${renderLegend(round)}</div>
        </div>
        <ol class="sim-drivers" data-round="${round}" data-match="m${m}">
          ${names.map((n, i) => renderDriverLi(round, n, i)).join('') || '<li class="sim-empty">No drivers yet</li>'}
        </ol>
      `;
      grid.appendChild(card);
    }
  }

  function renderLegend(round) {
    const zones = new Set();
    const boundaries = [];
    const zoneForFn = ROUNDS[round].zoneFor;
    for (let i = 0; i < ROUNDS[round].size; i++) {
      const z = zoneForFn(i);
      if (!zones.has(z)) {
        zones.add(z);
        boundaries.push({ zone: z, start: i });
      }
    }
    return boundaries.map(b => {
      const meta = ZONE_META[b.zone];
      return `<span class="legend-chip ${meta.cls}">${meta.label}</span>`;
    }).join('');
  }

  function renderDriverLi(round, name, i) {
    const driver = driverByName.get(name);
    if (!driver) return '';
    const zone = ROUNDS[round].zoneFor(i);
    const cls = ZONE_META[zone].cls;
    const position = i + 1;
    return `<li class="sim-driver ${cls}" data-name="${esc(name)}">
      <span class="sim-pos">P${position}</span>
      <span class="sim-seed">#${seedOf(name)}</span>
      <span class="sim-driver-name">${flag(driver.flag)}${esc(name)}</span>
      <span class="sim-handle">≡</span>
    </li>`;
  }

  function attachSortables() {
    if (typeof Sortable === 'undefined') {
      console.warn('Sortable.js not loaded');
      return;
    }
    document.querySelectorAll('#panelSimulator .sim-drivers').forEach(ol => {
      const round = ol.dataset.round;
      const match = ol.dataset.match;
      if (!round || !match) return;
      const s = Sortable.create(ol, {
        animation: 150,
        handle: '.sim-handle',
        ghostClass: 'sim-ghost',
        chosenClass: 'sim-chosen',
        dragClass: 'sim-drag',
        forceFallback: true,
        fallbackOnBody: true,
        onEnd: () => {
          const names = [...ol.querySelectorAll('.sim-driver')].map(li => li.dataset.name);
          state[round][match] = names;
          rebuildDownstream(round);
          saveState();
          renderAll();
        },
      });
      sortables.push(s);
    });
  }

  // ── Finalists ──────────────────────────────────────────────
  function getQualified() {
    const list = [];
    // R1 P1s (4)
    for (let m = 0; m < 4; m++) {
      const arr = state.r1['m' + m] || [];
      if (arr[0]) list.push({ name: arr[0], via: `R1 M${m + 1}` });
    }
    // R2 P1s (2)
    for (let m = 0; m < 2; m++) {
      const arr = state.r2['m' + m] || [];
      if (arr[0]) list.push({ name: arr[0], via: `R2 M${m + 1}` });
    }
    // R4 P1 (1)
    const r4 = state.r4.m0 || [];
    if (r4[0]) list.push({ name: r4[0], via: 'R4' });
    return list;
  }

  // Dutch sort: per rule 97 — R4 > R3 > R1 (R2 is not a stopping point),
  // then by match placement (lower index = higher place), tiebreak by Stage 1 seed.
  function dutchSortScore(name) {
    const r4 = state.r4.m0 || [];
    const r4i = r4.indexOf(name);
    if (r4i > 0) return { round: 4, placement: r4i, seed: seedOf(name) };

    for (let m = 0; m < 2; m++) {
      const r3 = state.r3['m' + m] || [];
      const r3i = r3.indexOf(name);
      if (r3i >= 4) return { round: 3, placement: r3i, seed: seedOf(name) };
    }

    for (let m = 0; m < 4; m++) {
      const r1 = state.r1['m' + m] || [];
      const r1i = r1.indexOf(name);
      if (r1i >= 12) return { round: 1, placement: r1i, seed: seedOf(name) };
    }

    return { round: 0, placement: 999, seed: seedOf(name) };
  }

  function sortDutch(names) {
    return names.slice().sort((a, b) => {
      const sa = dutchSortScore(a);
      const sb = dutchSortScore(b);
      if (sa.round !== sb.round) return sb.round - sa.round;
      if (sa.placement !== sb.placement) return sa.placement - sb.placement;
      return sa.seed - sb.seed;
    });
  }

  function furthestRoundLabel(name) {
    const r4 = state.r4.m0 || [];
    if (r4.includes(name)) {
      const i = r4.indexOf(name);
      return `R4 P${i + 1}`;
    }
    for (let m = 0; m < 2; m++) {
      const r3 = state.r3['m' + m] || [];
      if (r3.includes(name)) return `R3 P${r3.indexOf(name) + 1}`;
    }
    for (let m = 0; m < 4; m++) {
      const r1 = state.r1['m' + m] || [];
      if (r1.includes(name)) return `R1 P${r1.indexOf(name) + 1}`;
    }
    return '—';
  }

  function renderFinalists() {
    const list = $('simFinalistList');
    const notice = $('simDutchNotice');
    const qualified = getQualified();

    let html = '';
    qualified.forEach((q, i) => {
      const d = driverByName.get(q.name);
      html += `<div class="finalist-card">
        <span class="finalist-num">${i + 1}</span>
        <span class="finalist-name">${d ? flag(d.flag) : ''}${esc(q.name)}</span>
        <span class="finalist-via">${q.via}</span>
      </div>`;
    });

    // 8th slot
    let eighthHtml = '';
    let msg = '';
    const r4 = state.r4.m0 || [];

    if (qualified.length === 7 && r4.length === 14) {
      const hasDutch = qualified.some(q => {
        const d = driverByName.get(q.name); return d && d.flag === 'nl';
      });
      const anyDutchInR1 = Object.values(state.r1).flat().some(n => {
        const d = driverByName.get(n); return d && d.flag === 'nl';
      });

      if (hasDutch || !anyDutchInR1) {
        // 8th = P2 of R4 (index 1)
        const p2Name = r4[1];
        const p2 = driverByName.get(p2Name);
        if (p2) {
          eighthHtml = `<div class="finalist-card">
            <span class="finalist-num">8</span>
            <span class="finalist-name">${flag(p2.flag)}${esc(p2.name)}</span>
            <span class="finalist-via">R4 P2</span>
          </div>`;
          msg = hasDutch
            ? 'A Dutch driver qualified via Round 1-4 — 8th slot goes to P2 of Round 4.'
            : 'No Dutch drivers in Stage 2 — 8th slot goes to P2 of Round 4.';
        }
      } else {
        // Round 5 Dutch qualification — pick up to 4 by furthest round (R4>R3>R1),
        // then match placement, tiebreak Stage 1 seed (rule 97).
        const dutchInSim = [...Object.values(state.r1).flat()]
          .filter(n => { const d = driverByName.get(n); return d && d.flag === 'nl'; });
        const top4 = sortDutch(dutchInSim).slice(0, 4);

        eighthHtml = `<div class="finalist-card round5">
          <span class="finalist-num">8</span>
          <span class="finalist-name">ROUND 5 — Dutch Qualification</span>
          <span class="finalist-via">Top 4 Dutch</span>
        </div>`;
        if (top4.length > 0) {
          eighthHtml += `<div class="round5-list">
            ${top4.map((name, i) => {
              const d = driverByName.get(name);
              return `<div class="round5-driver">
                <span class="r5-num">${i + 1}</span>
                ${flag(d && d.flag)}${esc(name)}
                <span class="r5-via">furthest: ${furthestRoundLabel(name)}</span>
              </div>`;
            }).join('')}
          </div>`;
        }
        msg = 'No Dutch qualified in Round 1-4 — Round 5 Dutch Qualification needed.';
      }
    }

    html += eighthHtml;

    const totalShown = qualified.length + (eighthHtml ? 1 : 0);
    for (let i = totalShown; i < 8; i++) {
      html += `<div class="finalist-card empty">
        <span class="finalist-num">${i + 1}</span>
        <span class="finalist-name">—</span>
        <span class="finalist-via">TBD</span>
      </div>`;
    }

    list.innerHTML = html;
    if (msg) { notice.textContent = msg; notice.style.display = ''; }
    else { notice.style.display = 'none'; }
  }

  function updateProgress() {
    const counts = {
      r1: (Object.values(state.r1).flat() || []).length,
      r2: (Object.values(state.r2).flat() || []).length,
      r3: (Object.values(state.r3).flat() || []).length,
      r4: (Object.values(state.r4).flat() || []).length,
    };
    $('simR1Count').textContent = `${counts.r1} drivers`;
    $('simR2Count').textContent = `${counts.r2} drivers`;
    $('simR3Count').textContent = `${counts.r3} drivers`;
    $('simR4Count').textContent = `${counts.r4} drivers`;

    const qualified = getQualified();
    const final = qualified.length + ((state.r4.m0 || []).length === 14 ? 1 : 0);
    $('simFinalCount').textContent = `${final}/8`;
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    if (!window.getSimData || !window.getSimData()) return;
    const data = window.getSimData();
    ranked = [...data.entries]
      .sort((a, b) => a.mc !== b.mc ? b.mc - a.mc : a.sum - b.sum)
      .slice(0, 100);
    driverByName = new Map(ranked.map(d => [d.name, d]));

    loadState();
    // If state empty, auto-fill from seed
    if (!state.r1 || Object.keys(state.r1).length === 0) {
      autoFill();
    } else {
      // Make sure downstream rounds exist & are in sync
      rebuildR2(); rebuildR3(); rebuildR4();
      renderAll();
    }
  }

  function wire() {
    const a = $('simAutoFill');
    if (a) a.addEventListener('click', () => {
      if (confirm('Reset simulator to seed-based predicted order?')) autoFill();
    });
    const r = $('simReset');
    if (r) r.addEventListener('click', () => {
      if (confirm('Reset all simulator choices?')) reset();
    });
  }

  window.renderSimulator = () => {
    if (!ranked.length) init();
    else renderAll();
  };

  function tryInit() {
    if (window.getSimData && window.getSimData()) init();
    else setTimeout(tryInit, 400);
  }

  wire();
  tryInit();
})();
