// Checks how well the watchlist scan matches Letterboxd films to TMDB entries.
// Loads the site's real matching code (src/js/01-core.js + 11-search-matching.js), runs it on
// the films in match-truth.json, and compares against the TMDB entry Letterboxd itself links
// each film to. Run it after changing anything in findBestMediaMatch / findBestTmdbMatch:
//
//     node scripts/match-accuracy.mjs
//
// It makes about 1,000 TMDB requests. A few films can never match: TMDB has deleted their
// entries since Letterboxd linked them (the script lists every miss so you can tell).
// match-truth.json: films from public Letterboxd watchlists, with the TMDB type and id read
// from each film's Letterboxd page (the themoviedb.org link).
import vm from 'node:vm';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [srcDir = join(here, '..', 'src', 'js'), truthFile = join(here, 'match-truth.json'), outFile = null] = process.argv.slice(2);
const truth = JSON.parse(readFileSync(truthFile, 'utf8'));

let requests = 0;
const countingFetch = (url, init) => { if (String(url).includes('api.themoviedb.org')) requests++; return fetch(url, init); };
const sandbox = {
  console: { log() {}, warn() {}, error() {}, debug() {} }, fetch: countingFetch, setTimeout, clearTimeout, URLSearchParams, URL, Intl, AbortController, Promise,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { userAgent: 'node', platform: '', maxTouchPoints: 0, language: 'en-US', languages: ['en-US'] },
  location: { search: '', hash: '', pathname: '/' }, document: {}
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(srcDir, '01-core.js'), 'utf8') + '\n' + readFileSync(join(srcDir, '11-search-matching.js'), 'utf8'), sandbox, { filename: 'site.js' });
const findBestMediaMatch = vm.runInContext('findBestMediaMatch', sandbox);

const started = Date.now();
const rows = new Array(truth.length);
let next = 0;
const worker = async () => {
  while (next < truth.length) {
    const i = next++; const t = truth[i];
    let best = null, err = null;
    try { best = await findBestMediaMatch({ filmId: t.filmId, title: t.title, year: t.year, slug: t.slug }); } catch (e) { err = e.message; }
    const got = best ? `${best.__mediaType}:${best.id}` : null;
    rows[i] = { slug: t.slug, title: t.title, year: t.year, want: `${t.tmdbType}:${t.tmdbId}`, got, gotTitle: best ? (best.title || best.name) : null, gotDate: best ? (best.release_date || best.first_air_date) : null, err };
  }
};
await Promise.all(Array.from({ length: 10 }, worker));
const secs = ((Date.now() - started) / 1000).toFixed(1);

const right = rows.filter(r => r.got === r.want);
const none = rows.filter(r => !r.got);
const wrong = rows.filter(r => r.got && r.got !== r.want);
if (outFile) writeFileSync(outFile, JSON.stringify(rows, null, 1));
console.log(`films: ${rows.length} | correct: ${right.length} (${(100 * right.length / rows.length).toFixed(1)}%) | wrong film: ${wrong.length} | not found: ${none.length}`);
console.log(`TMDB requests: ${requests} (${(requests / rows.length).toFixed(2)} per film) | ${secs}s at 10 films in parallel`);
for (const r of wrong) console.log(`  WRONG  "${r.title}" (${r.year}) want ${r.want} got ${r.got} "${r.gotTitle}" ${r.gotDate || ''}`);
for (const r of none) console.log(`  NONE   "${r.title}" (${r.year}) want ${r.want}${r.err ? ' err ' + r.err : ''}`);
