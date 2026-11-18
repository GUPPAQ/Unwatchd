    // =========================================================================
    // SHARED PAGE PIECES: the poster card, the person card, the page nav and footer.
    // The home grid, film pages, person pages and the cast page all draw from these,
    // so a film or a person looks the same wherever it appears.
    // =========================================================================

    // A poster card as HTML (same look as createMovieCard() in the home grid).
    // `m` is a TMDB-style item ({ id, title|name, poster_path|poster, release_date|first_air_date }).
    function posterCardHTML(m, { onclick = '', sub = '', current = false, index = 0, hideWatchlist = false } = {}) {
      const title = m.title || m.name || '';
      const safeTitle = escapeHTML(title);
      const poster = m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : (m.poster ? m.poster.replace('/w500/', '/w342/') : '');
      const year = (m.release_date || m.first_air_date || m.releaseDate || '').slice(0, 4);
      const mediaType = m.mediaType || m.media_type || 'movie';
      const inWatchlist = scannedMovies.some(s => s.id === m.id && (s.mediaType || 'movie') === mediaType);
      const badges = [
        current ? '' : renderPosterRatingBadgeHtml(m),
        inWatchlist && !current && !hideWatchlist ? '<span class="poster-corner-badge poster-wl-badge" title="On your watchlist">Watchlist</span>' : '',
        current ? '<span class="poster-corner-badge poster-wl-badge">Viewing</span>' : ''
      ].join('');
      const caption = sub
        ? `<div class="poster-card-caption is-stacked"><span class="poster-card-title">${safeTitle}</span><span class="poster-card-sub">${escapeHTML(sub)}</span></div>`
        : `<div class="poster-card-caption"><span class="poster-card-title">${safeTitle}</span>${year ? `<span class="poster-card-year">${year}</span>` : ''}</div>`;
      return `<div class="poster-card${current ? ' is-current' : ''}" style="--i:${Math.min(index, 24)}">
        <a href="#" class="poster-card-art" aria-label="${safeTitle}${year ? ` (${year})` : ''}" data-movie-card-id="${m.id}" onclick="event.preventDefault();${current ? '' : onclick}">
          <div class="poster-card-clip">${poster ? `<img src="${poster}" alt="" loading="lazy" decoding="async">` : `<div class="poster-card-fallback">${safeTitle}</div>`}</div>
          ${badges}
        </a>
        ${caption}
      </div>`;
    }

    // A person as a portrait card: photo, name, and their part (character or job).
    // Keeps the cast-chip-card class so the cast rail's drag guard and the watch box sizing find it.
    function personCardHTML(p, { role = '', onclick = '', index = 0 } = {}) {
      const name = escapeHTML(p.name || 'Unknown');
      const img = p.profile_path ? `https://image.tmdb.org/t/p/w185${p.profile_path}` : null;
      const roleHint = /director|creator/i.test(role) ? 'Director' : 'Actor';
      return `<button type="button" class="person-card cast-chip-card" style="--i:${Math.min(index, 24)}" data-person-id="${p.id}" data-person-name="${name}" data-role-hint="${roleHint}" onclick="if(!window.isCastDragging){${onclick || 'openActorPage(Number(this.dataset.personId), this.dataset.personName, this.dataset.roleHint)'}}">
        <span class="person-card-photo">${img ? `<img src="${img}" alt="" loading="lazy" decoding="async" draggable="false">` : `<span class="person-card-initial">${name.charAt(0)}</span>`}</span>
        <span class="person-card-name">${name}</span>
        ${role ? `<span class="person-card-role">${escapeHTML(role)}</span>` : ''}
      </button>`;
    }

    // Back and close, the same on every full page.
    function pageNavHTML(backOnclick, closeOnclick, id = '') {
      const chevron = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6"></path></svg>';
      const cross = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" d="M6 18L18 6M6 6l12 12"></path></svg>';
      return `<nav ${id ? `id="${id}" ` : ''}class="movie-page-nav page-nav">
        <button type="button" class="page-nav-btn" onclick="${backOnclick}" aria-label="Back">${chevron}</button>
        <button type="button" class="page-nav-btn" onclick="${closeOnclick}" aria-label="Close">${cross}</button>
      </nav>`;
    }

    // Outside links as plain text pills, then the attribution line (TMDB and JustWatch).
    // `links` is [{ label, href }] or [{ label, onclick }].
    function pageFooterHTML(links = [], extraNote = '') {
      const items = links.filter(Boolean).map(l => l.href
        ? `<a class="page-link" href="${l.href}" target="_blank" rel="noopener">${escapeHTML(l.label)}</a>`
        : `<button type="button" class="page-link" onclick="${l.onclick}">${escapeHTML(l.label)}</button>`).join('');
      return `<footer class="page-footer">
        ${items ? `<div class="page-links">${items}</div>` : ''}
        <p class="page-legal">This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data provided by <a href="https://www.justwatch.com" target="_blank" rel="noopener">JustWatch</a>. <a href="/privacy.html">Privacy</a>${extraNote}</p>
      </footer>`;
    }

    // "Copy link" for the footer: copies, then says so for a moment.
    function copyPageLink(btn, url) {
      try { navigator.clipboard.writeText(url); } catch (e) { logIgnored('copyPageLink', e); }
      const old = btn.textContent;
      btn.textContent = 'Link copied';
      setTimeout(() => { btn.textContent = old; }, 1800);
    }

    // Once a full page scrolls, its back/close row gets a solid strip (the sticky tab bars sit
    // right under it), so content never shows through around the buttons.
    (() => {
      ['moviePageView', 'actorPageView', 'allCastModal'].forEach(id => {
        const view = document.getElementById(id);
        if (!view) return;
        view.addEventListener('scroll', () => {
          const nav = view.querySelector('.page-nav');
          if (nav) nav.classList.toggle('is-solid', view.scrollTop > 40);
        }, { passive: true });
      });
    })();