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
        headline.innerHTML = `<span class="text-blue-400">${streaming.toLocaleString()}</span> of ${whose} ${streaming === 1 ? 'is' : 'are'} streaming on your services right now.`;
      } else {
        headline.textContent = `None of ${whose} are streaming on your services right now.`;
      }

      const rentbuy = all.rentbuy.length;
      const other = all.other.length;
      const parts = [];
      if (streaming > 0) {
        // With one service the breakdown just repeats the headline ("Disney+ 24"), so skip it.
        if (Object.keys(perService).length > 1) parts.push(`${breakdown}.`);
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

    function fillTonightPick(m, poolSize) {
      currentTonightPick = m;
      const img = document.getElementById('tonightPickBackdrop');
      if (img) {
        const src = m.backdrop || m.poster || '';
        if (src) { img.src = src; img.classList.remove('hidden'); } else { img.removeAttribute('src'); img.classList.add('hidden'); }
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
      if (rating) meta.push(`IMDb ${rating}`);
      const metaEl = document.getElementById('tonightPickMeta');
      if (metaEl) metaEl.textContent = meta.join(' · ');

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
      const where = document.getElementById('tonightPickWhere');
      if (where) {
        if (!serviceName) where.textContent = '';
        else if (viaVpn) where.textContent = `Streaming on ${serviceName} in ${REGION_META[region]?.name || region} (needs a VPN).`;
        else {
          const names = [...new Set(local.map(cleanProviderName))].slice(0, 2);
          where.textContent = `Streaming on ${names.join(' and ')}, which you have.`;
        }
      }

      const watch = document.getElementById('tonightPickWatch');
      if (watch) {
        if (serviceName) {
          let link = getRegionServiceUrl(serviceName, region, m.title);
          const deeplink = getDeeplinkFor(serviceName);
          if (deeplink && deeplink.searchUrl) link = deeplink.searchUrl(m.title);
          const appLink = deeplink && deeplink.appUrl ? deeplink.appUrl(m.title) : null;
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
      fillTonightPick(pick, pool.length);
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
      const compact = resultsVisible && scannedMovies.length > 0 && !scanPanelExpanded && !isScanning;
      full.classList.toggle('hidden', compact);
      bar.classList.toggle('hidden', !compact);
      if (!compact) return;

      const user = ((el.usernameInput && el.usernameInput.value) || localStorage.getItem('ps_username') || '').trim();
      const friend = isFriendMatchActive ? ((el.friendInput && el.friendInput.value) || '').trim() : '';
      const userEl = document.getElementById('scanCompactUser');
      if (userEl) userEl.textContent = friend ? `${user} + ${friend}` : user;

      const names = currentProviders.filter(cp => selectedServiceIds.has(cp.id)).map(cp => cp.name);
      const servicesEl = document.getElementById('scanCompactServices');
      if (servicesEl) servicesEl.textContent = names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');

      const friendBtn = document.getElementById('scanCompactFriendBtn');
      if (friendBtn) friendBtn.classList.toggle('hidden', isFriendMatchActive);
    }

    function expandScanPanel() {
      scanPanelExpanded = true;
      updateScanPanelMode();
      const full = document.getElementById('scanPanel');
      if (full) full.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    (() => {
      const on = (id, fn) => { const node = document.getElementById(id); if (node) node.addEventListener('click', fn); };
      on('tonightPickAnother', showAnotherTonightPick);
      on('tonightPickTrailer', playTonightPickTrailer);
      on('tonightPickArt', () => { if (currentTonightPick) openMoviePage(currentTonightPick, true); });
      on('scanCompactChangeBtn', () => { expandScanPanel(); if (el.usernameInput) el.usernameInput.focus({ preventScroll: true }); });
      on('scanCompactFriendBtn', () => {
        expandScanPanel();
        const friendHidden = el.friendInputWrapper && el.friendInputWrapper.classList.contains('hidden');
        if (friendHidden && el.toggleFriendBtn) el.toggleFriendBtn.click();
        else if (el.friendInput) el.friendInput.focus({ preventScroll: true });
      });
      // Results are shown and hidden from many places (scan, restore, clear, friend removal...),
      // so follow the section itself rather than hooking each of them.
      if (el.resultsSection) {
        new MutationObserver(updateScanPanelMode).observe(el.resultsSection, { attributes: true, attributeFilter: ['class'] });
      }
      updateScanPanelMode();
    })();
