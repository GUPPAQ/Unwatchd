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

## Conventions
- Only IMDb ratings are shown (fetched via Cinemeta, cached 14 days). TMDB vote averages
  are used internally for ranking only.
- All TMDB requests go through `tmdbFetch()` (concurrency cap + retry on 429/5xx).
- Swallowed errors use `logIgnored(context, e)`; open the site with `?debug` to see them.
- Streaming data comes from JustWatch via TMDB and must stay attributed.

Note: the script is deliberately not called `build` – Vercel would then try to run it and
expect a `public/` output folder. Vercel just serves the committed files as-is.
