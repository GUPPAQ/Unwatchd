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
- `service-worker.js` – bump `CACHE_NAME` whenever shipped files change.

## Build
After changing anything in `src/` or Tailwind classes in `index.html`:

    npm install   # first time only
    npm run build

Commit the regenerated `app.js` and `styles.css` together with the source change.

## Conventions
- Only IMDb ratings are shown (fetched via Cinemeta, cached 14 days). TMDB vote averages
  are used internally for ranking only.
- All TMDB requests go through `tmdbFetch()` (concurrency cap + retry on 429/5xx).
- Swallowed errors use `logIgnored(context, e)`; open the site with `?debug` to see them.
- Streaming data comes from JustWatch via TMDB and must stay attributed.
