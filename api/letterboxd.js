module.exports = async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const parsed = new URL(targetUrl);
    if (!parsed.hostname.endsWith('letterboxd.com')) {
      return res.status(403).send('Only letterboxd.com URLs are allowed');
    }
  } catch (e) {
    return res.status(400).send('Invalid target URL');
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const text = await response.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    return res.status(response.status).send(text);
  } catch (err) {
    console.error('[Vercel Letterboxd Proxy Error]', err);
    return res.status(500).send(err.message);
  }
};
