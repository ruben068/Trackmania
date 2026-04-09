const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

const API_URL = 'https://redbull-faster-leaderboard.redbull-faster.workers.dev/leaderboard';
let cachedData = null;
let lastFetch = 0;
const CACHE_TTL = 45_000; // 45 seconds

async function fetchLeaderboard() {
  const now = Date.now();
  if (cachedData && now - lastFetch < CACHE_TTL) return cachedData;

  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  cachedData = await res.json();
  lastFetch = now;
  return cachedData;
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/leaderboard', async (req, res) => {
  try {
    const data = await fetchLeaderboard();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Red Bull Faster Leaderboard running at http://localhost:${PORT}`);
});
