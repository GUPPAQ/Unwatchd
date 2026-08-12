module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing url param');
  }

  try {
    const r = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,sv;q=0.8',
        'Referer': 'https://letterboxd.com/'
      }
    });
    const text = await r.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(r.status).send(text);
  } catch (e) {
    console.error('[Vercel Serverless Proxy Error]', e);
    return res.status(500).send(e.message);
  }
};
