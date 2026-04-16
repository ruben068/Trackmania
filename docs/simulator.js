// ══════════════════════════════════════════════════════════════
//  TOURNAMENT PATH SIMULATOR
//  Interactive Stage 2 knockout simulator.
//  Click drivers to cycle through outcomes; subsequent rounds
//  auto-populate based on earlier picks.
// ══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const SIM_KEY = 'rbf-sim-v2';

  // Round 1 seed-to-match map (from Appendix D)
  const R1_SEEDS = {
    0: [1, 8, 9, 16, 17, 24, 25, 32, 33, 40, 41, 48, 49, 56, 57, 64, 65, 72, 73, 80, 81, 88, 89, 96, 97],
    1: [4, 5, 12, 13, 20, 21, 28, 29, 36, 37, 44, 45, 52, 53, 60, 61, 68, 69, 76, 77, 84, 85, 92, 93, 100],
    2: [3, 6, 11, 14, 19, 22, 27, 30, 35, 38, 43, 46, 51, 54, 59, 62, 67, 70, 75, 78, 83, 86, 91, 94, 99],
    3: [2, 7, 10, 15, 18, 23, 26, 31, 34, 39, 42, 47, 50, 55, 58, 63, 66, 71, 74, 79, 82, 87, 90, 95, 98],
  };

  const ROUNDS = {
    r1: {
      matches: 4,
      zones: [
        { key: 'q',   cap: 1,  cls: 'zone-q',   short: 'P1',     desc: 'Qualified' },
        { key: 'r2',  cap: 7,  cls: 'zone-r2',  short: 'P2-8',   desc: '→ Round 2' },
        { key: 'r3',  cap: 4,  cls: 'zone-r3',  short: 'P9-12',  desc: '→ Round 3' },
        { key: 'out', cap: 13, cls: 'zone-out', short: 'P13-25', desc: 'Eliminated' },
      ],
    },
    r2: {
      matches: 2,
      zones: [
        { key: 'q',  cap: 1,  cls: 'zone-q',  short: 'P1',    desc: 'Qualified' },
        { key: 'r4', cap: 3,  cls: 'zone-r4', short: 'P2-4',  desc: '→ Round 4' },
        { key: 'r3', cap: 10, cls: 'zone-r3', short: 'P5-14', desc: '→ Round 3' },
      ],
    },
    r3: {
      matches: 2,
      zones: [
        { key: 'r4',  cap: 4,  cls: 'zone-r4',  short: 'P1-4',   desc: '→ Round 4' },
        { key: 'out', cap: 14, cls: 'zone-out', short: 'P5-18',  desc: 'Eliminated' },
      ],
    },
    r4: {
      matches: 1,
      zones: [
        { key: 'q',   cap: 1,  cls: 'zone-q',   short: 'P1',    desc: 'Qualified' },
        { key: 'out', cap: 13, cls: 'zone-out', short: 'P2-14', desc: 'Eliminated' },
      ],
    },
  };

  let state = { r1: {}, r2: {}, r3: {}, r4: {} };
  let ranked = [];

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
        state = { r1: loaded.r1 || {}, r2: loaded.r2 || {}, r3: loaded.r3 || {}, r4: loaded.r4 || {} };
      }
    } catch {}
  }
  function resetState() {
    state = { r1: {}, r2: {}, r3: {}, r4: {} };
    saveState();
  }

  // ── Match compositions ─────────────────────────────────────
  function getR1Matches() {
    const m = [[], [], [], []];
    for (let i = 0; i < 4; i++) {
      for (const seed of R1_SEEDS[i]) {
        const driver = ranked[seed - 1];
        if (driver) m[i].push(driver);
      }
    }
    return m;
  }

  function getR2Matches() {
    const m = [[], []];
    const r1 = getR1Matches();
    for (let i = 0; i < 4; i++) {
      for (const d of r1[i]) {
        if (state.r1[d.name] === 'r2') {
          m[i < 2 ? 0 : 1].push(d);
        }
      }
    }
    return m;
  }

  function getR3Matches() {
    const m = [[], []];
    const r1 = getR1Matches();
    const r2 = getR2Matches();
    // R1 P9-12: M1+M2 → R3 M1, M3+M4 → R3 M2
    for (let i = 0; i < 4; i++) {
      for (const d of r1[i]) {
        if (state.r1[d.name] === 'r3') m[i < 2 ? 0 : 1].push(d);
      }
    }
    // R2 P5-14: M1 → R3 M1, M2 → R3 M2
    for (let i = 0; i < 2; i++) {
      for (const d of r2[i]) {
        if (state.r2[d.name] === 'r3') m[i].push(d);
      }
    }
    return m;
  }

  function getR4Matches() {
    const match = [];
    const r2 = getR2Matches();
    const r3 = getR3Matches();
    for (const ms of r2) for (const d of ms) if (state.r2[d.name] === 'r4') match.push(d);
    for (const ms of r3) for (const d of ms) if (state.r3[d.name] === 'r4') match.push(d);
    return [match];
  }

  function getRoundMatches(round) {
    if (round === 'r1') return getR1Matches();
    if (round === 'r2') return getR2Matches();
    if (round === 'r3') return getR3Matches();
    if (round === 'r4') return getR4Matches();
    return [];
  }

  // ── Validation ─────────────────────────────────────────────
  function isRoundComplete(round) {
    const matches = getRoundMatches(round);
    const zones = ROUNDS[round].zones;
    for (const ms of matches) {
      if (ms.length === 0) return false;
      const counts = {};
      zones.forEach(z => counts[z.key] = 0);
      for (const d of ms) {
        const z = state[round][d.name];
        if (z && counts[z] !== undefined) counts[z]++;
      }
      for (const z of zones) {
        if (counts[z.key] !== z.cap) return false;
      }
    }
    return true;
  }

  function isRoundUnlocked(round) {
    if (round === 'r1') return true;
    const prev = round === 'r2' ? 'r1' : round === 'r3' ? 'r2' : 'r3';
    return isRoundComplete(prev);
  }

  function cleanDownstream(fromRound) {
    const order = ['r1', 'r2', 'r3', 'r4'];
    const fromIdx = order.indexOf(fromRound);
    for (let i = fromIdx + 1; i < order.length; i++) {
      const r = order[i];
      const matches = getRoundMatches(r);
      const inPool = new Set();
      for (const ms of matches) for (const d of ms) inPool.add(d.name);
      for (const name of Object.keys(state[r])) {
        if (!inPool.has(name)) delete state[r][name];
      }
    }
  }

  // ── Interaction ────────────────────────────────────────────
  function cycleDriver(round, driverName) {
    const zones = ROUNDS[round].zones;
    const current = state[round][driverName];
    const idx = zones.findIndex(z => z.key === current);
    const nextIdx = idx === -1 ? 0 : (idx + 1) % zones.length;
    state[round][driverName] = zones[nextIdx].key;
    cleanDownstream(round);
    saveState();
    renderAll();
  }

  function autoFill() {
    state = { r1: {}, r2: {}, r3: {}, r4: {} };

    // R1: per match, rank by current Stage 1 seed
    const r1 = getR1Matches();
    for (let m = 0; m < 4; m++) {
      r1[m].forEach((d, i) => {
        if (i === 0) state.r1[d.name] = 'q';
        else if (i <= 7) state.r1[d.name] = 'r2';
        else if (i <= 11) state.r1[d.name] = 'r3';
        else state.r1[d.name] = 'out';
      });
    }
    // R2: P1 = highest seed, P2-4 = next 3, P5-14 = rest
    const r2 = getR2Matches();
    for (let m = 0; m < 2; m++) {
      const sorted = r2[m].slice().sort((a, b) => seedOf(a) - seedOf(b));
      sorted.forEach((d, i) => {
        if (i === 0) state.r2[d.name] = 'q';
        else if (i <= 3) state.r2[d.name] = 'r4';
        else state.r2[d.name] = 'r3';
      });
    }
    // R3: top 4 by seed go to R4
    const r3 = getR3Matches();
    for (let m = 0; m < 2; m++) {
      const sorted = r3[m].slice().sort((a, b) => seedOf(a) - seedOf(b));
      sorted.forEach((d, i) => {
        if (i <= 3) state.r3[d.name] = 'r4';
        else state.r3[d.name] = 'out';
      });
    }
    // R4: P1 = best seed
    const r4 = getR4Matches();
    const sorted4 = r4[0].slice().sort((a, b) => seedOf(a) - seedOf(b));
    sorted4.forEach((d, i) => {
      state.r4[d.name] = i === 0 ? 'q' : 'out';
    });

    saveState();
    renderAll();
  }

  function seedOf(d) {
    return ranked.findIndex(r => r.name === d.name) + 1;
  }

  // ── Rendering ──────────────────────────────────────────────
  function renderAll() {
    for (const r of ['r1', 'r2', 'r3', 'r4']) renderRound(r);
    renderFinalists();
    updateProgress();
  }

  function renderRound(round) {
    const grid = $(`sim${round.toUpperCase()}Grid`);
    if (!grid) return;
    const wrap = grid.closest('.sim-round');
    const unlocked = isRoundUnlocked(round);
    wrap.classList.toggle('locked', !unlocked);

    if (!unlocked) {
      grid.innerHTML = '<div class="sim-locked">Complete the previous round first</div>';
      return;
    }

    const matches = getRoundMatches(round);
    const meta = ROUNDS[round];
    grid.innerHTML = '';

    for (let m = 0; m < meta.matches; m++) {
      const card = document.createElement('div');
      card.className = 'sim-match-card';
      card.innerHTML = `
        <div class="sim-match-header">
          <h4>Match ${m + 1}</h4>
          ${renderZoneCounts(round, m)}
        </div>
        <div class="sim-drivers">
          ${matches[m].map(d => renderDriverCard(round, d)).join('') || '<div class="sim-empty">No drivers yet</div>'}
        </div>
      `;
      grid.appendChild(card);
    }
  }

  function renderZoneCounts(round, matchIdx) {
    const matches = getRoundMatches(round);
    const driverNames = matches[matchIdx].map(d => d.name);
    const zones = ROUNDS[round].zones;
    return `<div class="zone-counts">${zones.map(z => {
      const count = driverNames.filter(n => state[round][n] === z.key).length;
      const cls = count === z.cap ? 'exact' : count > z.cap ? 'over' : '';
      return `<span class="zone-count ${z.cls} ${cls}">${z.short} ${count}/${z.cap}</span>`;
    }).join('')}</div>`;
  }

  function renderDriverCard(round, driver) {
    const zone = state[round][driver.name];
    const zoneMeta = ROUNDS[round].zones.find(z => z.key === zone);
    const cls = zoneMeta ? zoneMeta.cls : '';
    const badge = zoneMeta ? `<span class="zone-badge ${zoneMeta.cls}">${zoneMeta.short}</span>` : '<span class="zone-badge unset">—</span>';
    const s = seedOf(driver);
    return `<div class="sim-driver ${cls}" data-round="${round}" data-name="${esc(driver.name)}">
      <span class="sim-seed">#${s}</span>
      <span class="sim-driver-name">${flag(driver.flag)}${esc(driver.name)}</span>
      ${badge}
    </div>`;
  }

  // ── Finalists ──────────────────────────────────────────────
  function getQualified() {
    const list = [];
    const r1 = getR1Matches();
    for (let m = 0; m < 4; m++) {
      for (const d of r1[m]) if (state.r1[d.name] === 'q') list.push({ ...d, via: `R1 M${m + 1}` });
    }
    const r2 = getR2Matches();
    for (let m = 0; m < 2; m++) {
      for (const d of r2[m]) if (state.r2[d.name] === 'q') list.push({ ...d, via: `R2 M${m + 1}` });
    }
    const r4 = getR4Matches();
    for (const d of r4[0]) if (state.r4[d.name] === 'q') list.push({ ...d, via: 'R4' });
    return list;
  }

  function renderFinalists() {
    const list = $('simFinalistList');
    const notice = $('simDutchNotice');
    const qualified = getQualified();
    const r4m = getR4Matches()[0];

    let html = '';
    qualified.forEach((q, i) => {
      html += `<div class="finalist-card">
        <span class="finalist-num">${i + 1}</span>
        <span class="finalist-name">${flag(q.flag)}${esc(q.name)}</span>
        <span class="finalist-via">${q.via}</span>
      </div>`;
    });

    // 8th slot logic
    const r4Complete = isRoundComplete('r4');
    let eighthHtml = '';
    let dutchMsg = '';

    if (qualified.length === 7 && r4Complete) {
      const hasDutch = qualified.some(q => q.flag === 'nl');
      const anyDutchPlayed = [...Object.keys(state.r1)].some(name => {
        const d = ranked.find(r => r.name === name);
        return d && d.flag === 'nl';
      });

      if (hasDutch || !anyDutchPlayed) {
        // 8th = P2 of R4
        const r4Out = r4m.filter(d => state.r4[d.name] === 'out');
        const p2 = r4Out[0]; // Can't know exact P2 without result ordering
        if (p2) {
          eighthHtml = `<div class="finalist-card">
            <span class="finalist-num">8</span>
            <span class="finalist-name">${flag(p2.flag)}${esc(p2.name)}</span>
            <span class="finalist-via">R4 P2</span>
          </div>`;
          dutchMsg = hasDutch
            ? 'A Dutch driver qualified via Round 1-4 — 8th slot goes to P2 of Round 4.'
            : 'No Dutch drivers in Stage 2 — 8th slot goes to P2 of Round 4.';
        }
      } else {
        // Round 5 needed. Pick up to 4 Dutch by furthest advancement
        const dutchParticipants = ranked.filter(d => d.flag === 'nl' && state.r1[d.name] !== undefined);
        // Rank by: R4 first, then R3, then R1
        dutchParticipants.sort((a, b) => advancementScore(b) - advancementScore(a));
        const top4 = dutchParticipants.slice(0, 4);

        eighthHtml = `<div class="finalist-card round5">
          <span class="finalist-num">8</span>
          <span class="finalist-name">ROUND 5 — Dutch Qualification</span>
          <span class="finalist-via">Top 4 Dutch</span>
        </div>`;
        if (top4.length > 0) {
          eighthHtml += `<div class="round5-list">
            ${top4.map((d, i) => `<div class="round5-driver">
              <span class="r5-num">${i + 1}</span>
              ${flag(d.flag)}${esc(d.name)}
              <span class="r5-via">furthest: ${advancementLabel(d)}</span>
            </div>`).join('')}
          </div>`;
        }
        dutchMsg = 'No Dutch qualified in Round 1-4 — Round 5 Dutch Qualification needed.';
      }
    }

    html += eighthHtml;

    // Fill empty slots
    const totalShown = qualified.length + (eighthHtml ? 1 : 0);
    for (let i = totalShown; i < 8; i++) {
      html += `<div class="finalist-card empty">
        <span class="finalist-num">${i + 1}</span>
        <span class="finalist-name">—</span>
        <span class="finalist-via">TBD</span>
      </div>`;
    }

    list.innerHTML = html;

    if (dutchMsg) {
      notice.textContent = dutchMsg;
      notice.style.display = '';
    } else {
      notice.style.display = 'none';
    }
  }

  function advancementScore(d) {
    if (state.r4[d.name] === 'q') return 100;
    if (state.r4[d.name] === 'out') return 80;
    if (state.r3[d.name] === 'r4') return 70;
    if (state.r3[d.name] === 'out') return 50;
    if (state.r2[d.name] === 'q') return 90;
    if (state.r2[d.name] === 'r4') return 60;
    if (state.r2[d.name] === 'r3') return 40;
    if (state.r1[d.name] === 'q') return 95;
    if (state.r1[d.name] === 'r2') return 30;
    if (state.r1[d.name] === 'r3') return 20;
    if (state.r1[d.name] === 'out') return 10;
    return 0;
  }

  function advancementLabel(d) {
    if (state.r4[d.name]) return 'Round 4';
    if (state.r3[d.name]) return 'Round 3';
    if (state.r2[d.name]) return 'Round 2';
    if (state.r1[d.name]) return 'Round 1';
    return '—';
  }

  function updateProgress() {
    const counts = [];

    const r1 = getR1Matches();
    const r1Total = r1.reduce((s, m) => s + m.length, 0);
    const r1Set = Object.keys(state.r1).filter(n => r1.flat().some(d => d.name === n)).length;
    $('simR1Count').textContent = `${r1Set}/${r1Total}`;
    counts.push(r1Set === r1Total);

    for (const round of ['r2', 'r3', 'r4']) {
      const el = $(`sim${round.toUpperCase()}Count`);
      if (!isRoundUnlocked(round)) { el.textContent = 'locked'; continue; }
      const ms = getRoundMatches(round);
      const total = ms.reduce((s, m) => s + m.length, 0);
      const set = Object.keys(state[round]).length;
      el.textContent = `${set}/${total}`;
    }

    const qualified = getQualified();
    const final = qualified.length + (isRoundComplete('r4') ? 1 : 0);
    $('simFinalCount').textContent = `${final}/8`;
  }

  // ── Init & events ──────────────────────────────────────────
  function init() {
    if (!window.getSimData || !window.getSimData()) return;
    const data = window.getSimData();
    ranked = [...data.entries]
      .sort((a, b) => a.mc !== b.mc ? b.mc - a.mc : a.sum - b.sum)
      .slice(0, 100);
    loadState();
    renderAll();
  }

  function wire() {
    document.addEventListener('click', e => {
      const driver = e.target.closest('.sim-driver');
      if (driver && driver.closest('#panelSimulator')) {
        cycleDriver(driver.dataset.round, driver.dataset.name);
      }
    });
    const a = $('simAutoFill');
    if (a) a.addEventListener('click', autoFill);
    const r = $('simReset');
    if (r) r.addEventListener('click', () => {
      if (confirm('Reset all simulator choices?')) { resetState(); renderAll(); }
    });
  }

  window.renderSimulator = () => {
    if (!ranked.length) init();
    else renderAll();
  };

  // Bootstrap: wait for data
  function tryInit() {
    if (window.getSimData && window.getSimData()) {
      init();
    } else {
      setTimeout(tryInit, 400);
    }
  }

  wire();
  tryInit();
})();
