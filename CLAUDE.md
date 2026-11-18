# Unwatchd

Single-page web app (unwatchd.online) that scans Letterboxd watchlists and shows where
each film streams. Hosted on Vercel; `api/proxy.js` is a serverless function that fetches
Letterboxd pages (letterboxd.com only).

## Layout
- `index.html` – markup + the app's own CSS (`<style>` block). Loads `styles.css` and `app.js`.
- `src/js/*.js` – the app's JavaScript, split by area. Files are concatenated **in filename
  order** into one classic script, so all functions and variables are shared globals
  (inline `onclick=` handlers in the HTML rely on this). Keep that in mind when moving code.
- `src/css/tailwind.css` + `tailwind.config.cjs` – Tailwind v3 input/config.
- `app.js`, `styles.css` – **generated**, never edit by hand.
- `service-worker.js` – retired: it only unregisters itself for browsers that installed it
  from an older version. Keep it deployed, don't add to it, and don't register a new one.
- `api/proxy.js` – only allows `letterboxd.com/<user>/watchlist/page/<n>/` and caches
  pages at the edge for 2 minutes. If the app needs other Letterboxd pages, widen
  `WATCHLIST_PAGE_PATH` deliberately.
- `og-image.png` – link preview image (1200×630) referenced by the `og:`/`twitter:` meta tags.

## Build
After changing anything in `src/` or Tailwind classes in `index.html`:

    npm install   # first time only
    npm run build:assets

Commit the regenerated `app.js` and `styles.css` together with the source change.

## Scan data
- Film matching (`findBestMediaMatch` in `src/js/11-search-matching.js`) follows rules measured
  against real data; the comment above `findBestTmdbMatch` explains them. After changing it,
  run `node scripts/match-accuracy.mjs` and compare with the numbers it printed before.
- The saved scan lives in IndexedDB only (`saveScanToStorage`). Per film it keeps providers for
  the regions in `REGION_META`, as slim entries (`slimProviderForStorage`).
- `getCanonicalProvider(p, isRentBuy, region)`: pass the region the provider data belongs to
  whenever it isn't the region being viewed (the scan stores all regions at once).

## Design rules
The "film-night" design: the films carry the colour, the interface is near-black and type.
Tokens and components live in the "FILM-NIGHT WORLD" block at the end of the `<style>` in
`index.html`; product brief in `PRODUCT.md`, direction in `.impeccable/surfaces/index-html.md`.
- Colours: ground `#0a0a0b`, raised surface `#151517`, hairlines `rgba(255,255,255,.11)`, text
  `#f4f0e8`, muted `#a5a097`. One accent, ember `#ff5a36`. `tailwind.config.cjs` maps Tailwind's
  blue/indigo/purple/sky to ember and gray/slate/zinc/neutral to the warm ink scale, so stock
  utility classes in generated markup stay in palette. No navy, no glass, no gradients as decoration.
- Type: Instrument Serif for display lines and section titles (always weight 400), Outfit for
  everything else; both served from `/fonts/`. Three weights only: 400 text, 500 controls, 600
  emphasis (the wordmark is the one 700). Sizes from 12/13/14/15/16/17/18/20 plus the serif display
  sizes. No text below 12px, no letter-spaced capitals, no other faces (the IMDb mark is Outfit in
  #f5c518). The "Type system" block at the end of the `<style>` folds older utility classes
  (font-black, uppercase, tracking-*, text-[10px]) into these rules.
- Buttons are pills (`.btn`, `.btn-primary`, `.btn-quiet`, `.ghost-btn`, `.link-btn`), sentence
  case, never all caps. No small labels above headings.
- No emoji as icons. Inline SVG or nothing. Region flags are the exception.
- Landing: the whole scan form is one bar (`.ask-bar`: username, optional friend, "Streaming on"
  pill, button) that stacks into a card on phones. "Streaming on" grows the bar itself downwards
  into a card of service chips (a second grid row); picks apply as you tap. While scanning, the bar
  itself shows the progress. "Change" on the results puts `body.landing-mode` on, which hides the
  results until "Back to your results". The poster wall drifts (CSS), still for reduced motion.
- Film, person and cast pages build from the shared pieces in `src/js/17-pages.js`
  (`posterCardHTML`, `personCardHTML`, `pageNavHTML`, `pageFooterHTML`), so a film or a person looks
  the same everywhere. Section headings are `.section-head` > `.section-title` (serif).
- Top bar: the search field itself (Ctrl/⌘K focuses it) and the region. The VPN switch lives in the results
  tools and the film page's watch box, where it has an effect.
- Motion (`src/js/16-motion.js`): feedback on press (`:active`), springs via `springTo()` for
  anything you can touch, interruptible from the current position, the phone filter sheet
  (`createSheet()`) drags and flicks closed. Respect `prefers-reduced-motion` (instant or fade instead of slide).

## Conventions
- Only IMDb ratings are shown (fetched via Cinemeta, cached 14 days). TMDB vote averages
  are used internally for ranking only.
- All TMDB requests go through `tmdbFetch()` (concurrency cap + retry on 429/5xx).
- Swallowed errors use `logIgnored(context, e)`; open the site with `?debug` to see them.
- Streaming data comes from JustWatch via TMDB and must stay attributed.

Note: the script is deliberately not called `build` – Vercel would then try to run it and
expect a `public/` output folder. Vercel just serves the committed files as-is.
