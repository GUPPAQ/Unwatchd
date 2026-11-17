---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

# Surface brief: Unwatchd app (index.html)

Scope: the whole single-page app: landing and scan form, scan progress, results (headline, service filter, Tonight's pick, availability tabs, poster grid, filters), quick search, film page, actor/crew pages, trailer and provider popups. Mode: Operate (the visitor completes a task: find something to watch tonight). The landing's first viewport is the one Persuade-leaning moment.

Audience and job: Letterboxd members at home in the evening, mostly on a phone. Enter a username, see which watchlist films are on their services, pick one. Also judged as a portfolio piece.

Constraints: keep every function and DOM id the JS relies on; insights popup is removed; IMDb ratings stay; TMDB and JustWatch attribution stay; never imitate Letterboxd's look.

Unresolved: none.

## Direction contract

THESIS: A film-night poster wall, not a dashboard. The films are the only colour; the interface is near-black paper and type around them. Refuses the category default of navy glass cards, pill badges and emoji-labelled controls.

OWN-WORLD: Ground #0a0a0b, raised surface #151517, hairlines rgba(255,255,255,.11). Warm off-white text #f4f0e8, muted #a5a097. One accent, ember orange-red #ff5a36, for the count, the active tab underline, focus, and italics in display lines. Instrument Serif for display lines and film titles; Outfit for everything else. Pill buttons (off-white primary, translucent quiet), underlined tabs, hairline-bordered chips. No glass, no gradients as decoration, no emoji.

STORY: The visitor sees a wall of posters and one question, types a username, and gets one number, one film to watch tonight, then the rest of the wall filtered to what they can actually play.

FIRST VIEWPORT: Landing: slim top bar (logo, Search, Region); left-aligned eyebrow, serif display "What can you watch tonight?" at 8rem on desktop, lede, one pill username field with a primary pill button, services row. A tilted poster wall bleeds off the right edge. Results: context line, serif headline with the count in ember italics, service chips, full-width Tonight's pick with the film's title logo, then sticky underlined tabs over the poster grid. Primary action: Find my films / Watch on <service>.

FORM: Pinned prototype next.html, position 1 of 1. seed: none (pinned): "i like the screenshot" / "continue with the complete website redesign i like the screenshot".

Signature move: the poster wall, tilted and masked on the landing, which becomes the user's own filtered grid once they scan; Tonight's pick shows the film's own title artwork.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
