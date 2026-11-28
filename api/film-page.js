// Serves /film/<slug> and /series/<slug> (see the rewrites in vercel.json): the normal app, but
// with that title's own <title>, description, link preview, canonical URL and structured data,
// so search engines can index every film page. The app itself then opens the film page from the
// path, exactly as it does for #film/<slug> links.
// The slug is the app's own: slugify(title), usually followed by the year (dune-part-two-2024).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TMDB_KEY = '774f07552749a1ca68245403367e3218'; // the site's public TMDB key (also in src/js/01-core.js)
const SITE = 'https://www.unwatchd.online';
let template = null;

function slugify(text) {
  return String(text || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+|-+$/g, '');
}

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function tmdb(path) {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(`https://api.themoviedb.org/3/${path}${sep}api_key=${TMDB_KEY}`, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`TMDB ${r.status}`);
  return r.json();
}

// Same reading of a slug as resolveRouteToId() in src/js/01-core.js.
function parseSlug(slug) {
  let m = slug.match(/^(.+?)-((?:19|20)\d\d)-(\d+)$/);
  if (m) return { base: m[1], year: m[2], dup: +m[3] };
  m = slug.match(/^(.+?)-((?:19|20)\d\d)$/);
  if (m) return { base: m[1], year: m[2], dup: 0 };
  m = slug.match(/^(.+?)-(\d{1,2})$/);
  if (m) return { base: m[1], year: null, dup: +m[2] };
  return { base: slug, year: null, dup: 0 };
}

async function findTitle(slug, tv) {
  const { base, year, dup } = parseSlug(slug);
  const kind = tv ? 'tv' : 'movie';
  const q = encodeURIComponent(base.replace(/-/g, ' '));
  const data = await tmdb(`search/${kind}?query=${q}`);
  const results = data.results || [];
  const dateOf = (x) => x.release_date || x.first_air_date || '';
  const nameOf = (x) => x.title || x.name || '';
  const exact = results.filter(x => slugify(nameOf(x)) === base || slugify(x.original_title || x.original_name) === base);
  exact.sort((a, b) => dateOf(a).slice(0, 4).localeCompare(dateOf(b).slice(0, 4)) || (b.vote_count || 0) - (a.vote_count || 0) || (b.popularity || 0) - (a.popularity || 0));
  let pool = year ? exact.filter(x => dateOf(x).startsWith(year)) : exact;
  if (year && !pool.length) pool = exact.filter(x => Math.abs(parseInt(dateOf(x)) - +year) <= 1);
  const hit = pool[dup] || pool[0] || (year ? null : exact[0]);
  if (!hit) return null;
  return tmdb(`${kind}/${hit.id}?append_to_response=watch/providers`);
}

function streamingSummary(d) {
  const results = (d['watch/providers'] && d['watch/providers'].results) || {};
  const services = new Set();
  let countries = 0;
  for (const region of Object.values(results)) {
    if (region.flatrate && region.flatrate.length) {
      countries++;
      region.flatrate.slice(0, 3).forEach(p => services.add(p.provider_name));
    }
  }
  return { countries, services: [...services].slice(0, 4) };
}

function render(html, d, tv, canonicalPath) {
  const name = d.title || d.name || '';
  const year = (d.release_date || d.first_air_date || '').slice(0, 4);
  const label = year ? `${name} (${year})` : name;
  const { countries, services } = streamingSummary(d);
  const title = `Where to watch ${label}: streaming in your country | Unwatchd`;
  const where = services.length
    ? `Streaming on ${services.join(', ')}${countries > 1 ? ` and more, in ${countries} countries` : ''}.`
    : 'See where it streams, rents or sells in your country.';
  const overview = (d.overview || '').replace(/\s+/g, ' ').trim();
  const short = overview.length > 150 ? `${overview.slice(0, 147).replace(/\s+\S*$/, '')}…` : overview;
  const desc = `Where to stream ${label}. ${where} ${short}`.trim();
  const url = `${SITE}${canonicalPath}`;
  const image = d.backdrop_path ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}` : `${SITE}/og-image.png`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': tv ? 'TVSeries' : 'Movie',
    name,
    url,
    description: overview || undefined,
    image: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : undefined,
    datePublished: d.release_date || d.first_air_date || undefined,
    genre: (d.genres || []).map(g => g.name),
    sameAs: d.imdb_id ? `https://www.imdb.com/title/${d.imdb_id}/` : undefined
  };
  const set = (re, value) => { html = html.replace(re, value); };
  set(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  set(/<meta name="title" content="[^"]*">/, `<meta name="title" content="${esc(title)}">`);
  set(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${esc(url)}">`);
  set(/<meta name="description"\s+content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
  set(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${esc(url)}">`);
  set(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(`Where to watch ${label}`)}">`);
  set(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
  set(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(image)}">`);
  set(/<meta property="og:image:width" content="[^"]*">\s*<meta property="og:image:height" content="[^"]*">\s*<meta property="og:image:alt" content="[^"]*">/, `<meta property="og:image:alt" content="${esc(name)}">`);
  set(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(`Where to watch ${label}`)}">`);
  set(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(desc)}">`);
  set(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${esc(image)}">`);
  set(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  // Relative asset paths would resolve under /film/ — anchor them to the site root.
  html = html.replace(/(href|src)="\.\//g, '$1="/');
  return html;
}

export default async function handler(req, res) {
  if (!template) template = readFileSync(join(process.cwd(), 'index.html'), 'utf8').replace(/(href|src)="\.\//g, '$1="/');
  const tv = req.query.type === 'series';
  const slug = String(req.query.slug || '').toLowerCase();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    return res.status(404).send(template.replace('<head>', '<head>\n  <meta name="robots" content="noindex">'));
  }
  try {
    const d = await findTitle(slug, tv);
    if (!d) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600');
      return res.status(404).send(template.replace('<head>', '<head>\n  <meta name="robots" content="noindex">'));
    }
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).send(render(template, d, tv, `/${tv ? 'series' : 'film'}/${slug}`));
  } catch (e) {
    console.error('[film-page]', e);
    // TMDB slow or down: still serve the app (it resolves the film itself), just without the extras.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(template.replace(/\s*<link rel="canonical" href="[^"]*">/, ''));
  }
}
