    // =========================================================================
    // RESULTS HEADLINE, TONIGHT'S PICK AND THE SLIM SCAN BAR
    // renderResultsHero() runs at the end of every applyFiltersAndRender().
    // =========================================================================
    // `var` and function declarations (not let/const) on purpose: applyFiltersAndRender() in
    // 10-home-results.js can run before this file's lines have executed during page load.
    var tonightPickKey = null;        // `${mediaType}_${id}` of the film the pick card shows
    var currentTonightPick = null;
    var scanPanelExpanded = false;    // true after "Change" is pressed, until the next scan starts

    function movieKeyOf(m) { return `${m.mediaType || 'movie'}_${m.id}`; }
    function filmsCount(n) { return n === 1 ? '1 film' : `${n.toLocaleString()} films`; }
    function cleanProviderName(p) { return (p.provider_name || p.name || '').replace('with Ads', '').trim(); }

    function renderResultsHero() {
      const headline = document.getElementById('resultsHeadline');
      const subline = document.getElementById('resultsSubline');
      if (!headline || !subline) return;
      if (!scannedMovies.length) {
        headline.textContent = '';
        subline.textContent = '';
        renderTonightPick();
        updateScanPanelMode();
        return;
      }

      // Counts come from the whole watchlist, not the filtered grid, so typing in the
      // title search doesn't turn the headline into "1 of your 617 films".
      const isSubscribed = buildSubscribedMatcher();
      const all = groupMoviesByAvailability(scannedMovies, isSubscribed);
      const total = scannedMovies.length;
      const streaming = all.stream.length;

      const perService = {};
      all.stream.forEach(m => {
        const names = (m.regionData?.flatrate || []).filter(isSubscribed).map(cleanProviderName);
        if (names.length === 0 && m.vpnInfo) names.push(`${m.vpnInfo.services[0]?.label || 'Other region'} via VPN`);
        new Set(names).forEach(n => { perService[n] = (perService[n] || 0) + 1; });
      });
      const breakdown = Object.keys(perService)
        .sort((a, b) => perService[b] - perService[a])
        .slice(0, 4)
        .map(n => `${n} ${perService[n]}`)
        .join(' · ');

      const whose = isFriendMatchActive ? `the ${filmsCount(total)} you both want to see` : `your ${filmsCount(total)}`;
      if (streaming > 0) {
        headline.innerHTML = `<em>${streaming.toLocaleString()}</em> of ${whose} ${streaming === 1 ? 'is' : 'are'} yours to watch tonight.`;
      } else {
        headline.textContent = `None of ${whose} are on your services tonight.`;
      }
      renderServiceChips(perService, streaming);

      const rentbuy = all.rentbuy.length;
      const other = all.other.length;
      const parts = [];
      if (streaming > 0) {
        // The per-service counts live on the service chips; here only when there are no chips.
        const chipsShown = currentProviders.filter(cp => selectedServiceIds.has(cp.id) && perService[cp.name] > 0).length >= 2;
        if (!chipsShown && Object.keys(perService).length > 1) parts.push(`${breakdown}.`);
        if (rentbuy > 0) parts.push(`${rentbuy.toLocaleString()} more can be rented or bought.`);
      } else {
        if (rentbuy > 0) parts.push(`${filmsCount(rentbuy)} can be rented or bought.`);
        if (other > 0) parts.push(`${filmsCount(other)} ${other === 1 ? 'is' : 'are'} on services you don't have.`);
      }
      subline.textContent = parts.join(' ');

      renderTonightPick();
      updateScanPanelMode();
    }

    // The pick comes from the visible "Streaming" tab, so filters (genre, length...) shape it.
    // It stays put while it's still in that list, and only changes on "Another pick".
    function renderTonightPick() {
      const card = document.getElementById('tonightPick');
      if (!card) return;
      const pool = (currentGroupedResults && currentGroupedResults.stream) || [];
      if (!scannedMovies.length || pool.length === 0) {
        card.classList.add('hidden');
        currentTonightPick = null;
        return;
      }
      let pick = pool.find(m => movieKeyOf(m) === tonightPickKey);
      if (!pick) {
        pick = pool[Math.floor(Math.random() * pool.length)];
        tonightPickKey = movieKeyOf(pick);
      }
      fillTonightPick(pick, pool.length);
      card.classList.remove('hidden');
    }

    // One TMDB request per pick: the film's own title logo (the artwork streaming apps show), its
    // tagline and its synopsis. The scan doesn't keep those, so the pick fetches them itself.
    var tonightPickInfoCache = new Map();
    async function loadTonightPickInfo(m) {
      const key = movieKeyOf(m);
      if (tonightPickInfoCache.has(key)) return tonightPickInfoCache.get(key);
      const info = { logo: null, tagline: '', overview: '' };
      try {
        const type = m.mediaType === 'tv' ? 'tv' : 'movie';
        const res = await tmdbFetch(`https://api.themoviedb.org/3/${type}/${m.id}?api_key=${TMDB_API_KEY}&append_to_response=images&include_image_language=en`);
        const data = await res.json();
        const logos = ((data.images && data.images.logos) || []).filter(l => l.file_path && !l.file_path.endsWith('.svg'));
        logos.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0) || (b.width || 0) - (a.width || 0));
        if (logos[0]) info.logo = `https://image.tmdb.org/t/p/w500${logos[0].file_path}`;
        info.tagline = (data.tagline || '').trim();
        info.overview = (data.overview || '').trim();
      } catch (e) { logIgnored('loadTonightPickInfo', e); }
      tonightPickInfoCache.set(key, info);
      return info;
    }

    // Tagline and synopsis for the pick shown now (filled in when the lookup lands).
    function fillTonightPickText(m, info) {
      if (currentTonightPick !== m) return;
      const tagline = document.getElementById('tonightPickTagline');
      const overview = document.getElementById('tonightPickOverview');
      if (tagline) tagline.textContent = info ? info.tagline : '';
      if (overview) overview.textContent = info ? info.overview : '';
    }

    function fillTonightPick(m, poolSize) {
      currentTonightPick = m;
      const card = document.getElementById('tonightPick');
      const img = document.getElementById('tonightPickBackdrop');
      if (img) {
        const src = m.backdrop || m.poster || '';
        if (src) { img.src = src; img.classList.remove('hidden'); } else { img.removeAttribute('src'); img.classList.add('hidden'); }
      }

      // Title artwork: the plain title stays invisible until we know whether there's a logo,
      // so it never flashes up in text first. Re-renders of the same film leave it alone.
      const logo = document.getElementById('tonightPickLogo');
      const key = movieKeyOf(m);
      if (logo && card && logo.dataset.key !== key) {
        logo.dataset.key = key;
        logo.classList.add('hidden'); logo.removeAttribute('src'); card.classList.remove('has-logo');
        const known = tonightPickInfoCache.has(key) && !tonightPickInfoCache.get(key).logo;
        card.classList.toggle('logo-pending', !known);
        fillTonightPickText(m, tonightPickInfoCache.get(key));
        const settle = () => { if (currentTonightPick === m) card.classList.remove('logo-pending'); };
        setTimeout(settle, 1500); // a slow lookup never hides the title for long
        loadTonightPickInfo(m).then((info) => {
          if (currentTonightPick !== m) return; // a newer pick replaced this one meanwhile
          fillTonightPickText(m, info);
          const url = info.logo;
          if (!url) { settle(); return; }
          logo.onload = () => { if (currentTonightPick === m) { logo.classList.remove('hidden'); card.classList.add('has-logo'); settle(); } };
          logo.onerror = settle;
          logo.alt = m.title || '';
          logo.src = url;
        });
      }
      const title = document.getElementById('tonightPickTitle');
      if (title) title.textContent = m.title || '';

      const meta = [];
      const year = (m.releaseDate || '').slice(0, 4);
      if (year) meta.push(year);
      if (m.runtime > 0) meta.push(m.runtime >= 60 ? `${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m` : `${m.runtime}m`);
      const genres = (m.genreIds || []).map(id => GENRE_MAP[id]).filter(Boolean).slice(0, 2).join(', ');
      if (genres) meta.push(genres);
      const rating = getCachedRating(m);
      const metaEl = document.getElementById('tonightPickMeta');
      if (metaEl) {
        const parts = meta.map(t => `<span>${escapeHTML(t)}</span>`);
        if (rating) parts.unshift(`<span class="pick-rating">${IMDB_TAG_HTML}<span>${escapeHTML(String(rating))}</span></span>`);
        metaEl.innerHTML = parts.join('<span class="pick-dot" aria-hidden="true">·</span>');
      }

      // Which of the viewer's services has it: a local one first, otherwise the VPN region.
      const local = (m.regionData?.flatrate || []).filter(buildSubscribedMatcher());
      let serviceName = local.length ? cleanProviderName(local[0]) : null;
      let region = currentRegion;
      let viaVpn = false;
      if (!serviceName && m.vpnInfo) {
        serviceName = m.vpnInfo.services[0]?.label || null;
        region = m.vpnInfo.region;
        viaVpn = true;
      }
      // Where it streams: the service's logo and name, and whether it's included or needs a VPN.
      const where = document.getElementById('tonightPickWhere');
      if (where) {
        if (!serviceName) where.innerHTML = '';
        else {
          const logoUrl = getProviderLogoUrl(serviceName);
          const others = viaVpn ? [] : [...new Set(local.map(cleanProviderName))].filter(n => n !== serviceName);
          const name = others.length ? `${serviceName} and ${others.length === 1 ? others[0] : `${others.length} more`}` : serviceName;
          const status = viaVpn
            ? `<span class="pick-where-status is-vpn">Needs a VPN set to ${escapeHTML(REGION_META[region]?.name || region)}</span>`
            : `<span class="pick-where-status">Included with your subscription</span>`;
          where.innerHTML = `<span class="pick-where-logo">${logoUrl ? `<img src="${escapeHTML(logoUrl)}" alt="">` : ''}</span><span class="pick-where-text"><span class="pick-where-name">On ${escapeHTML(name)}</span>${status}</span>`;
        }
      }

      const watch = document.getElementById('tonightPickWatch');
      if (watch) {
        if (serviceName) {
          let link = getRegionServiceUrl(serviceName, region, m.title);
          const deeplink = getDeeplinkFor(serviceName);
          if (deeplink && deeplink.searchUrl) link = deeplink.searchUrl(m.title);
          let appLink = deeplink && deeplink.appUrl ? deeplink.appUrl(m.title) : null;
          const directLink = getJustWatchLink(m, region, serviceName, false); // the film's own page, once known
          if (directLink) { link = directLink; appLink = null; }
          watch.href = link;
          watch.textContent = `Watch on ${serviceName}`;
          watch.onclick = (e) => { if (appLink) { e.preventDefault(); openStreamingService(link, appLink); } };
          watch.classList.remove('hidden');
        } else {
          watch.classList.add('hidden');
        }
      }

      const another = document.getElementById('tonightPickAnother');
      if (another) another.disabled = poolSize <= 1;
    }

    function showAnotherTonightPick() {
      const pool = (currentGroupedResults && currentGroupedResults.stream) || [];
      const others = pool.filter(m => movieKeyOf(m) !== tonightPickKey);
      if (others.length === 0) return;
      const pick = others[Math.floor(Math.random() * others.length)];
      tonightPickKey = movieKeyOf(pick);
      // Start loading the next film's still at once; when it's ready (or after a short wait),
      // swap title, details and image in the same frame and fade the old still out on top.
      // Tapping again before it lands just retargets to the newer pick.
      const img = document.getElementById('tonightPickBackdrop');
      const art = document.getElementById('tonightPickArt');
      if (!img || !art) { fillTonightPick(pick, pool.length); return; }
      const swapId = (showAnotherTonightPick.swapId || 0) + 1;
      showAnotherTonightPick.swapId = swapId;
      let swapped = false;
      const swap = () => {
        if (swapped || showAnotherTonightPick.swapId !== swapId) return;
        swapped = true;
        art.querySelectorAll('.pick-ghost').forEach(g => g.remove());
        if (img.getAttribute('src') && !prefersReducedMotion.matches) {
          const ghost = img.cloneNode(false);
          ghost.removeAttribute('id'); ghost.className = 'pick-ghost'; ghost.alt = '';
          art.appendChild(ghost);
          requestAnimationFrame(() => requestAnimationFrame(() => { ghost.style.opacity = '0'; }));
          setTimeout(() => ghost.remove(), 500);
        }
        fillTonightPick(pick, pool.length);
      };
      // Wait for the still and the title logo together, so both land in the same frame.
      const loadImage = (url) => new Promise((resolve) => {
        if (!url) { resolve(); return; }
        const i = new Image(); i.onload = i.onerror = () => resolve(); i.src = url;
      });
      Promise.all([
        loadImage(pick.backdrop || pick.poster),
        loadTonightPickInfo(pick).then(info => loadImage(info.logo))
      ]).then(swap);
      setTimeout(swap, 900); // a slow image never holds the new pick back for long
    }

    async function playTonightPickTrailer() {
      const m = currentTonightPick;
      if (!m) return;
      const btn = document.getElementById('tonightPickTrailer');
      if (btn) btn.disabled = true;
      try {
        const type = m.mediaType === 'tv' ? 'tv' : 'movie';
        const res = await tmdbFetch(`https://api.themoviedb.org/3/${type}/${m.id}/videos?api_key=${TMDB_API_KEY}`);
        const data = await res.json();
        const trailer = getBestTrailer({ videos: data });
        if (trailer && trailer.key) { openTrailerModal(trailer.key, m.title); return; }
      } catch (e) {
        logIgnored('playTonightPickTrailer', e);
      } finally {
        if (btn) btn.disabled = false;
      }
      openMoviePage(m, true); // no trailer found: the film page still has everything else
    }

    // Once results are showing, the big scan form collapses into a one-line bar.
    function updateScanPanelMode() {
      const full = document.getElementById('scanPanel');
      const bar = document.getElementById('scanCompactBar');
      if (!full || !bar) return;
      const resultsVisible = !!(el.resultsSection && !el.resultsSection.classList.contains('hidden'));
      const hasResults = resultsVisible && scannedMovies.length > 0 && !isScanning;
      const compact = hasResults && !scanPanelExpanded;
      full.classList.toggle('hidden', compact);
      bar.classList.toggle('hidden', !compact);
      // "Change" opens a clean start page: the results wait behind "Back to your results".
      const landingMode = hasResults && scanPanelExpanded;
      document.body.classList.toggle('landing-mode', landingMode);
      const back = document.getElementById('landingBackBtn');
      if (back) {
        back.classList.toggle('hidden', !landingMode);
        if (landingMode) fillLandingReturn();
      }
      if (!compact) return;

      const user = (localStorage.getItem('ps_username') || (el.usernameInput && el.usernameInput.value) || '').trim();
      const friend = isFriendMatchActive ? (localStorage.getItem('ps_friend_username') || '').trim() : '';
      const userEl = document.getElementById('scanCompactUser');
      if (userEl) userEl.textContent = friend ? `${user} and ${friend}` : user;

      const servicesEl = document.getElementById('scanCompactServices');
      if (servicesEl) {
        const selected = getSelectedProviderList();
        servicesEl.innerHTML = serviceStackHTML(selected, 5);
        servicesEl.title = describeServices(selected);
      }

      const friendBtn = document.getElementById('scanCompactFriendBtn');
      if (friendBtn) friendBtn.classList.toggle('hidden', isFriendMatchActive);
    }

    // One chip per selected service with films on it, plus "All". A chip narrows the grid
    // (and Tonight's pick) to that service, through the same provider filter the Filters panel sets.
    function renderServiceChips(perService, streamingTotal) {
      const box = document.getElementById('serviceChips');
      if (!box) return;
      const services = currentProviders.filter(cp => selectedServiceIds.has(cp.id) && perService[cp.name] > 0);
      if (services.length < 2) { box.innerHTML = ''; box.classList.add('hidden'); return; }
      const only = (!homeFilterProviders.has('all') && homeFilterProviders.size === 1) ? [...homeFilterProviders][0] : null;
      const chip = (name, count, logo) => `<button type="button" class="svc-chip" data-service="${escapeHTML(name)}" aria-pressed="${(only === name) || (!only && !name)}">${logo ? `<img src="${escapeHTML(logo)}" alt="" onerror="this.remove()">` : ''}<span class="svc-chip-name">${name ? escapeHTML(name) : 'All'}</span><span class="svc-chip-count">${count.toLocaleString()}</span></button>`;
      box.innerHTML = chip('', streamingTotal, null) + services.sort((a, b) => perService[b.name] - perService[a.name]).map(cp => chip(cp.name, perService[cp.name], getProviderLogoUrl(cp.name))).join('');
      box.classList.remove('hidden');
    }

    function selectServiceChip(name) {
      homeFilterProviders = name ? new Set([name]) : new Set(['all']);
      tonightPickKey = null; // a new service gets its own pick
      currentPage = 1;
      if (activeTab !== 'stream') setHomeTab('stream');
      renderAllCustomFilters('home');
      applyFiltersAndRender();
    }

    // Quick search lives behind the Search button in the top bar (and ⌘K / Ctrl+K).
    // Search is the field in the top bar; Ctrl/⌘K just puts you in it.
    function openQuickSearch() {
      if (!el.quickSearchInput) return;
      el.quickSearchInput.focus();
      el.quickSearchInput.select();
    }
    function closeQuickSearch() {
      if (el.searchDropdown) el.searchDropdown.classList.add('hidden');
      if (el.quickSearchInput) el.quickSearchInput.blur();
    }

    // The landing's poster wall: the visitor's own watchlist when we have it, otherwise
    // this week's most talked-about films.
    // Four columns that drift slowly (CSS), each holding its posters twice for a seamless loop;
    // the speeds differ a little so the columns never line up.
    async function fillPosterWall() {
      const wall = document.getElementById('posterWall');
      if (!wall || wall.childElementCount) return;
      const COLS = 4, PER_COL = 7;
      let posters = scannedMovies.filter(m => m.poster).sort(() => Math.random() - 0.5).slice(0, COLS * PER_COL).map(m => m.poster.replace('/w500/', '/w342/'));
      if (posters.length < 16) {
        try {
          const pages = await Promise.all([1, 2].map(page => tmdbFetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}&page=${page}`).then(r => r.json())));
          posters = pages.flatMap(d => d.results || []).filter(f => f.poster_path).slice(0, COLS * PER_COL).map(f => `https://image.tmdb.org/t/p/w342${f.poster_path}`);
        } catch (e) { logIgnored('fillPosterWall', e); return; }
      }
      if (posters.length < COLS) return;
      const perCol = Math.floor(posters.length / COLS);
      const speeds = [170, 140, 190, 155];
      wall.innerHTML = Array.from({ length: COLS }, (_, c) => {
        const col = posters.slice(c * perCol, (c + 1) * perCol);
        const imgs = col.map(src => `<img src="${src}" alt="" decoding="async">`).join('');
        return `<div class="wall-col"><div class="wall-track" style="--drift:${speeds[c % speeds.length]}s;animation-delay:-${c * 23}s">${imgs}${imgs}</div></div>`;
      }).join('');
    }

    function expandScanPanel() {
      scanPanelExpanded = true;
      updateScanPanelMode();
      window.scrollTo({ top: 0, behavior: prefersReducedMotion.matches ? 'auto' : 'smooth' });
    }

    // The way back after "Change": a few of the posters waiting, how many, and whose watchlist.
    function fillLandingReturn() {
      const stream = (currentGroupedResults && currentGroupedResults.stream) || [];
      const posters = document.getElementById('landingReturnPosters');
      if (posters) {
        posters.innerHTML = stream.filter(m => m.poster).slice(0, 3)
          .map(m => `<img src="${m.poster.replace('/w500/', '/w154/')}" alt="" decoding="async">`).join('');
      }
      const title = document.getElementById('landingReturnTitle');
      if (title) title.textContent = stream.length ? `${filmsCount(stream.length)} to watch tonight` : 'Your results are still here';
      const user = (localStorage.getItem('ps_username') || '').trim();
      const friend = isFriendMatchActive ? (localStorage.getItem('ps_friend_username') || '').trim() : '';
      const sub = document.getElementById('landingReturnSub');
      if (sub) sub.textContent = user ? (friend ? `In both ${user}'s and ${friend}'s watchlists` : `From ${user}'s watchlist`) : '';
    }

    function collapseScanPanel() {
      scanPanelExpanded = false;
      if (typeof closeBrowser === 'function') closeBrowser();
      updateScanPanelMode();
      window.scrollTo({ top: 0 });
    }

    (() => {
      const on = (id, fn) => { const node = document.getElementById(id); if (node) node.addEventListener('click', fn); };
      const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
      document.querySelectorAll('.kbd-shortcut').forEach(k => { k.textContent = isMac ? '⌘K' : 'Ctrl K'; });
      if (el.quickSearchInput) {
        el.quickSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeQuickSearch(); });
        // Tapping the pill's icon or padding still puts you in the field.
        document.getElementById('quickSearchBar')?.addEventListener('mousedown', (e) => {
          if (e.target === el.quickSearchInput || e.target.closest('button, #searchDropdown')) return;
          e.preventDefault(); el.quickSearchInput.focus();
        });
      }
      const chips = document.getElementById('serviceChips');
      if (chips) chips.addEventListener('click', (e) => { const b = e.target.closest('.svc-chip'); if (b) selectServiceChip(b.dataset.service || null); });
      setTimeout(fillPosterWall, 400); // after the saved scan (if any) has had a chance to load
      on('tonightPickAnother', showAnotherTonightPick);
      on('tonightPickTrailer', playTonightPickTrailer);
      on('tonightPickArt', () => { if (currentTonightPick) openMoviePage(currentTonightPick, true); });
      on('scanCompactChangeBtn', () => { expandScanPanel(); if (el.usernameInput) el.usernameInput.focus({ preventScroll: true }); });
      on('scanCompactFriendBtn', () => { expandScanPanel(); if (el.friendInput) el.friendInput.focus({ preventScroll: true }); });
      on('landingBackBtn', collapseScanPanel);
      // Results are shown and hidden from many places (scan, restore, clear, friend removal...),
      // so follow the section itself rather than hooking each of them.
      if (el.resultsSection) {
        new MutationObserver(updateScanPanelMode).observe(el.resultsSection, { attributes: true, attributeFilter: ['class'] });
      }
      updateScanPanelMode();
    })();
