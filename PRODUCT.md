# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Letterboxd members with long watchlists, at home in the evening, deciding what to watch tonight from the streaming services they already pay for. Most visits are on a phone. Unwatchd is also the owner's portfolio piece, so it must hold up to someone judging its craft.

## Product Purpose

Turn a Letterboxd watchlist into an answer: which of these films can I stream right now, and where. Success is a visitor finding something to watch within a minute of entering their username.

## Positioning

It starts from the user's own Letterboxd watchlist and their own subscriptions, not from a catalogue. It answers "which of the films I already want to see can I watch tonight", which a generic streaming search can't.

## Operating Context

- The visitor enters a public Letterboxd username and picks their services and region. The scan reads the watchlist, matches each film to TMDB and checks availability.
- A first scan of ~500 films takes roughly 30 seconds; repeat scans are a few seconds.
- Results split into: streaming on your services, rent or buy, on other services, not streaming.

## Capabilities and Constraints

- Keep: watchlist scan, friend match (films both watchlists share), service and region selection, VPN mode (films unlockable in other regions), filters and sorting, title filter, quick search for any film or person, film pages, actor/crew pages, trailers, the "Tonight's pick" recommendation.
- Removed in the redesign: the watchlist insights popup.
- Ratings shown are IMDb ratings (fetched via Cinemeta). Owner's decision.
- Static site on Vercel with one serverless proxy; vanilla JS built from `src/js`, Tailwind v3. No accounts, no database.
- Data: TMDB (credit required, non-commercial), streaming availability from JustWatch via TMDB (attribution required). Not affiliated with Letterboxd; must not imitate Letterboxd's look.

## Brand Commitments

- Name: Unwatchd. Existing logo in `icons/` (white disc with a notch).
- The owner approved the direction of the `next.html` prototype for the redesign.

## Evidence on Hand

- Measured: film matching picks the right film 98.9% of the time on 792 real watchlist films (`scripts/match-accuracy.mjs`).
- No users, testimonials or usage numbers to show. Don't invent any.

## Product Principles

1. Answer first: the visitor's question is "what can I watch tonight", so lead with that.
2. The films carry the visual weight; the interface stays out of their way.
3. Fast on a phone, honest about what it couldn't check.
4. Every screen looks like the same product.
