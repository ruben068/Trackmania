// ── Config ────────────────────────────────────────────────────
const API = location.hostname === 'localhost'
  ? '/api/leaderboard'
  : 'https://redbull-faster-leaderboard.redbull-faster.workers.dev/leaderboard';
const REFRESH = 50;
const DEADLINE = new Date('2026-04-19T19:00:00+02:00');
const STAGE2_START = new Date('2026-05-02T15:00:00+02:00');

const $ = id => document.getElementById(id);
const dom = {
  loading:         $('loading'),
  error:           $('error'),
  panel:           $('panelSimulator'),
  stage2Countdown: $('stage2Countdown'),
};

let raw = null;

function expand(e) {
  return {
    name: e.n, flag: e.f,
    t1: e.t1, r1: e.r1,
    t2: e.t2, r2: e.r2,
    t3: e.t3, r3: e.r3,
    sum: e.s, mc: e.mc, li: e.li,
  };
}

// ── Countdown ─────────────────────────────────────────────────
function updateCountdown() {
  const diff = STAGE2_START.getTime() - Date.now();
  if (diff <= 0) { dom.stage2Countdown.textContent = 'LIVE NOW'; return; }
  const days = Math.floor(diff / 86400000);
  const hrs  = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  if (days > 0) {
    dom.stage2Countdown.textContent = `${days}d ${String(hrs).padStart(2, '0')}h`;
  } else {
    dom.stage2Countdown.textContent =
      `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}
updateCountdown();
setInterval(updateCountdown, 1000);

// ── Fetch ─────────────────────────────────────────────────────
async function fetchData() {
  try {
    const frozen = Date.now() >= DEADLINE.getTime();
    const res = await fetch(frozen ? './snapshot.json' : API);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    raw = {
      entries: data.l.map(expand),
      names: data.mn,
      updated: data.lu,
      total: data.tp,
    };

    window.getSimData = () => raw;

    dom.loading.style.display = 'none';
    dom.error.style.display = 'none';
    dom.panel.style.display = '';

    if (window.renderSimulator) window.renderSimulator();
  } catch (err) {
    console.error('Fetch failed:', err);
    if (dom.panel.style.display === 'none') {
      dom.loading.style.display = 'none';
      dom.error.style.display = '';
      dom.error.querySelector('.error-text').textContent = 'Connection failed — ' + err.message;
    }
  }
}

fetchData();
if (Date.now() < DEADLINE.getTime()) setInterval(fetchData, REFRESH * 1000);
