// Usage numbers from the anonymous counter in api/proxy.js: scans and unique watchlists,
// in total and per day for the last 30 days (UTC). Only aggregate counts, nothing personal.
export default async function handler(req, res) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  res.setHeader('Cache-Control', 'no-store');
  if (!url || !token) {
    return res.status(503).json({ error: 'Counter store not connected' });
  }

  const days = [];
  for (let i = 29; i >= 0; i--) {
    days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  }
  const commands = [
    ['GET', 'scans:total'],
    ['PFCOUNT', 'watchlists:all'],
    ...days.flatMap(d => [['GET', `scans:${d}`], ['PFCOUNT', `watchlists:${d}`]])
  ];

  try {
    const r = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(4000)
    });
    const out = (await r.json()).map(x => Number(x.result) || 0);
    return res.status(200).json({
      totalScans: out[0],
      uniqueWatchlists: out[1],
      last30Days: days.map((day, i) => ({ day, scans: out[2 + i * 2], uniqueWatchlists: out[3 + i * 2] }))
    });
  } catch (e) {
    console.error('[stats]', e);
    return res.status(502).json({ error: 'Could not read the counter store' });
  }
}
