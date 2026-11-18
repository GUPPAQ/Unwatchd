// Finds the direct link to a film (or series) on each streaming service, from JustWatch, so the
// site's Watch buttons open the title itself instead of the service's home or search page.
//   GET /api/justwatch?tmdb=294254&type=movie&country=SE&title=Maze%20Runner%3A%20The%20Scorch%20Trials
// Locked down so it can't be used as a general proxy:
//  - one fixed GraphQL query to JustWatch, with checked parameters (no free-form query passes through)
//  - only the countries the site supports, a numeric TMDB id, a short title
//  - the answer is matched on the TMDB id, and only service names, kinds and links are returned
//  - no CORS headers: the site calls it same-origin, so other websites can't read it
// Answers are cached at Vercel's edge for hours, so popular films don't hit JustWatch repeatedly.
// JustWatch's data must stay attributed on the site (it already is, in every footer).
const COUNTRIES = new Set(['SE', 'US', 'GB', 'CA', 'AU', 'IE', 'NZ', 'DE', 'FR', 'IT', 'ES', 'NL', 'PL', 'BR', 'MX', 'IN', 'JP', 'KR', 'NO', 'DK', 'FI']);
const JUSTWATCH_GRAPHQL = 'https://apis.justwatch.com/graphql';
const QUERY = `query Unwatchd($country: Country!, $language: Language!, $first: Int!, $filter: TitleFilter) {
  popularTitles(country: $country, first: $first, filter: $filter) {
    edges { node {
      objectType
      content(country: $country, language: $language) { externalIds { tmdbId } }
      offers(country: $country, platform: WEB) { monetizationType standardWebURL package { clearName technicalName } }
    } }
  }
}`;

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') {
    return res.status(405).send(JSON.stringify({ error: 'Method not allowed' }));
  }
  const tmdb = String(req.query.tmdb || '');
  const type = req.query.type === 'tv' ? 'SHOW' : 'MOVIE';
  const country = String(req.query.country || '').toUpperCase();
  const title = String(req.query.title || '').trim();
  const alt = String(req.query.alt || '').trim(); // the original title, tried when the first finds nothing
  if (!/^\d{1,9}$/.test(tmdb) || !COUNTRIES.has(country) || !title || title.length > 200 || alt.length > 200) {
    return res.status(400).send(JSON.stringify({ error: 'Bad parameters' }));
  }

  // One search, matched on the TMDB id; null when JustWatch doesn't have it under that title.
  const lookup = async (searchQuery) => {
    const r = await fetch(JUSTWATCH_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { country, language: 'en', first: 8, filter: { searchQuery } } })
    });
    if (!r.ok) throw new Error(`JustWatch answered ${r.status}`);
    const data = await r.json();
    const edges = (data && data.data && data.data.popularTitles && data.data.popularTitles.edges) || [];
    return edges.map(e => e.node).find(n => n && n.objectType === type && n.content && n.content.externalIds && String(n.content.externalIds.tmdbId) === tmdb) || null;
  };

  try {
    let match = await lookup(title);
    if (!match && alt && alt.toLowerCase() !== title.toLowerCase()) match = await lookup(alt);
    const seen = new Set();
    const offers = [];
    for (const o of (match && match.offers) || []) {
      if (!o || !o.standardWebURL || !o.package) continue;
      let url;
      try { url = new URL(o.standardWebURL); } catch { continue; }
      if (url.protocol !== 'https:') continue;
      const key = `${o.package.technicalName}|${o.monetizationType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push({ name: o.package.clearName, key: o.package.technicalName, type: o.monetizationType, url: url.href });
    }
    // Found titles keep for hours; "not found" for a shorter while, in case it's added soon.
    res.setHeader('Cache-Control', match ? 'public, s-maxage=21600, stale-while-revalidate=86400' : 'public, s-maxage=3600');
    return res.status(200).send(JSON.stringify({ found: !!match, offers }));
  } catch (e) {
    console.error('[JustWatch lookup]', e);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).send(JSON.stringify({ error: 'Lookup failed' }));
  }
}
