// /sitemap-films.xml (see the rewrites in vercel.json): film pages for the most popular and
// best-rated films on TMDB, so search engines find them. Slugs are title + year, which
// api/film-page.js and the app both resolve.
const TMDB_KEY = '774f07552749a1ca68245403367e3218';
const SITE = 'https://www.unwatchd.online';

function slugify(text) {
  return String(text || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+|-+$/g, '');
}

async function page(list, n) {
  try {
    const r = await fetch(`https://api.themoviedb.org/3/movie/${list}?page=${n}&api_key=${TMDB_KEY}`, { signal: AbortSignal.timeout(5000) });
    return r.ok ? ((await r.json()).results || []) : [];
  } catch { return []; }
}

export default async function handler(req, res) {
  const jobs = [];
  for (let n = 1; n <= 25; n++) { jobs.push(page('popular', n), page('top_rated', n)); }
  const films = (await Promise.all(jobs)).flat();
  const seen = new Set();
  const urls = [];
  for (const f of films) {
    const year = (f.release_date || '').slice(0, 4);
    const base = slugify(f.title);
    if (!base || !year || seen.has(f.id)) continue;
    seen.add(f.id);
    urls.push(`${SITE}/film/${base}-${year}`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(urls)].map(u => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).send(xml);
}
