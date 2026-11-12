    // ── Rating System (IMDb via Cinemeta) ──────────────────────────────────────────
    function getRatingInfo(movieObj) {
      if (!movieObj) return { rating: null, label: 'IMDb', source: 'imdb' };
      const mediaType = movieObj.mediaType || movieObj.media_type || (movieObj.name && !movieObj.title ? 'tv' : 'movie');
      movieObj.mediaType = mediaType;
      const key = `${mediaType}_${movieObj.id}`;
      const imdbId = movieObj.imdbId || movieObj.imdb_id || movieToImdbIdMap.get(key);
      if (imdbId && imdbRatingCache.has(imdbId)) {
        return { rating: imdbRatingCache.get(imdbId), label: 'IMDb', source: 'imdb' };
      }
      if (movieObj.imdbRating) {
        return { rating: String(movieObj.imdbRating), label: 'IMDb', source: 'imdb' };
      }
      const cachedDetails = movieDetailsCache.get(key);
      const detailsImdbId = cachedDetails?.external_ids?.imdb_id;
      if (detailsImdbId && imdbRatingCache.has(detailsImdbId)) {
        return { rating: imdbRatingCache.get(detailsImdbId), label: 'IMDb', source: 'imdb' };
      }
      return { rating: null, label: 'IMDb', source: 'imdb' };
    }

    function resolveAndFetchMovieImdbRating(movieObj) {
      enqueueImdbResolution(movieObj, false);
    }

    function getCachedRating(movieObj) {
      if (!movieObj) return null;
      const mediaType = movieObj.mediaType || movieObj.media_type || (movieObj.name && !movieObj.title ? 'tv' : 'movie');
      movieObj.mediaType = mediaType;
      const imdbId = movieObj.imdbId || movieObj.imdb_id || getStoredImdbId(mediaType, movieObj.id);
      if (imdbId) {
        const r = getStoredImdbRating(imdbId);
        if (r) {
          movieObj.imdbRating = r;
          movieObj.rating = r;
          return r;
        }
      }
      if (movieObj.imdbRating) {
        return String(movieObj.imdbRating);
      }
      const key = `${mediaType}_${movieObj.id}`;
      const cachedDetails = movieDetailsCache.get(key);
      const detailsImdbId = cachedDetails?.external_ids?.imdb_id;
      if (detailsImdbId) {
        const r = getStoredImdbRating(detailsImdbId);
        if (r) {
          movieObj.imdbRating = r;
          movieObj.rating = r;
          return r;
        }
      }
      enqueueImdbResolution(movieObj, false);
      return null;
    }

    function getMoviePopularity(m) {
      if (!m) return 0;
      // Pure TMDB Official Popularity Score
      if (typeof m.popularity === 'number' && m.popularity > 0) return m.popularity;
      return m.vote_count || 0;
    }

    function createMovieCard(movieObj, delayIndex = 0) {
      const safeTitle = escapeHTML(movieObj.title);
      const safeSubtext = escapeHTML(movieObj.subtext);
      const wrapper = document.createElement('div');
      wrapper.className = `tilt-card animate-fade h-full cursor-pointer z-10 hover:z-30 relative`;
      wrapper.style.animationDelay = `${delayIndex * 0.02}s`;
      const a = document.createElement('a');
      a.href = movieObj.url;
      a.dataset.movieCardId = movieObj.id;
      a.addEventListener('click', (e) => { e.preventDefault(); openMoviePage(movieObj, true); });
      a.className = 'tilt-card-inner glow-card block relative rounded-2xl aspect-[2/3] bg-gray-900 border border-white/5 h-full';
      const innerClip = document.createElement('div');
      innerClip.className = 'absolute inset-0 rounded-2xl overflow-hidden pointer-events-none';
      if (movieObj.poster) {
        innerClip.innerHTML = `<img src="${movieObj.poster}" alt="${safeTitle} poster" loading="lazy" decoding="async" class="w-full h-full object-cover">`;
      } else {
        innerClip.innerHTML = `<div class="absolute inset-0 flex items-center justify-center p-4 text-center font-bold text-gray-500 text-xs">${safeTitle}</div>`;
      }
      const glare = document.createElement('div');
      glare.className = 'glare';
      innerClip.appendChild(glare);
      a.appendChild(innerClip);

      const badgeHtml = renderPosterRatingBadgeHtml(movieObj);
      if (badgeHtml) {
        const tmp = document.createElement('div');
        tmp.innerHTML = badgeHtml;
        const badgeEl = tmp.firstElementChild;
        if (badgeEl) {
          badgeEl.id = `poster-rating-${movieObj.id}`;
          a.appendChild(badgeEl);
        }
      }

      if (movieObj.vpnInfo) {
        const vpnBadge = document.createElement('div');
        vpnBadge.className = 'poster-corner-badge poster-vpn-badge';
        vpnBadge.title = `Requires switching your VPN to ${REGION_META[movieObj.vpnInfo.region].name}`;
        vpnBadge.innerHTML = `${REGION_META[movieObj.vpnInfo.region].flag} VPN`;
        a.appendChild(vpnBadge);
      }

      a.title = safeTitle;
      wrapper.appendChild(a);
      apply3DTilt(wrapper);
      return wrapper;
    }
    function renderPagination(maxPage) { const pagDiv = el.paginationControls; if (!pagDiv) return; pagDiv.innerHTML = ''; if (maxPage <= 1) { pagDiv.classList.add('hidden'); return; } pagDiv.classList.remove('hidden'); const createBtn = (text, disabled, onClick, isActive = false) => { const btn = document.createElement('button'); btn.innerHTML = text; btn.disabled = disabled; if (isActive) { btn.className = 'w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 text-white font-bold text-sm shadow-[0_0_12px_rgba(59,130,246,0.6)]'; } else if (disabled && text !== '...') { btn.className = 'w-9 h-9 flex items-center justify-center rounded-full bg-transparent text-gray-600 font-bold text-sm cursor-not-allowed'; } else if (text === '...') { btn.className = 'w-9 h-9 flex items-center justify-center bg-transparent text-gray-500 font-bold text-sm pointer-events-none'; } else { btn.className = 'w-9 h-9 flex items-center justify-center rounded-full liquid-glass text-white font-bold text-sm transition-all cursor-pointer'; btn.onclick = onClick; } return btn; }; const goToPage = (p) => { currentPage = p; renderActiveGrid(); window.scrollTo({ top: el.resultsSection.offsetTop - 100, behavior: 'smooth' }); }; pagDiv.appendChild(createBtn('<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>', currentPage === 1, () => goToPage(currentPage - 1))); const addPage = (p) => { pagDiv.appendChild(createBtn(p, false, () => goToPage(p), p === currentPage)); }; if (maxPage <= 5) { for (let i = 1; i <= maxPage; i++) addPage(i); } else { if (currentPage <= 3) { for (let i = 1; i <= 4; i++) addPage(i); pagDiv.appendChild(createBtn('...', true)); addPage(maxPage); } else if (currentPage >= maxPage - 2) { addPage(1); pagDiv.appendChild(createBtn('...', true)); for (let i = maxPage - 3; i <= maxPage; i++) addPage(i); } else { addPage(1); pagDiv.appendChild(createBtn('...', true)); addPage(currentPage - 1); addPage(currentPage); addPage(currentPage + 1); pagDiv.appendChild(createBtn('...', true)); addPage(maxPage); } } pagDiv.appendChild(createBtn('<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>', currentPage === maxPage, () => goToPage(currentPage + 1))); }
    function updateStats() { if (scannedMovies.length === 0) { if (el.statsBar) el.statsBar.classList.add('hidden'); return; } document.getElementById('stat-total').textContent = scannedMovies.length; let genreCounts = {}; let decadeCounts = {}; let totalRating = 0; let ratedCount = 0; scannedMovies.forEach(m => { if (m.genreIds) m.genreIds.forEach(id => { if (GENRE_MAP[id]) genreCounts[GENRE_MAP[id]] = (genreCounts[GENRE_MAP[id]] || 0) + 1; }); if (m.releaseDate) { const dec = Math.floor(parseInt(m.releaseDate.split('-')[0]) / 10) * 10; if (!isNaN(dec)) decadeCounts[dec] = (decadeCounts[dec] || 0) + 1; } const rVal = getCachedRating(m); if (rVal) { const r = parseFloat(rVal); if (!isNaN(r) && r > 0) { totalRating += r; ratedCount++; } } }); const topG = Object.keys(genreCounts).sort((a, b) => genreCounts[b] - genreCounts[a])[0] || '-'; const topD = Object.keys(decadeCounts).sort((a, b) => decadeCounts[b] - decadeCounts[a])[0]; const avg = ratedCount ? (totalRating / ratedCount).toFixed(1) : '-'; document.getElementById('stat-genre').textContent = topG; document.getElementById('stat-decade').innerHTML = topD ? `${topD}S` : '-'; const avgEl = document.getElementById('stat-avg'); if (avgEl) avgEl.textContent = avg; }
    function populateFilterDropdowns() {
      renderAllCustomFilters('home');
    }

    // Shared by the home filters and the actor page filters.
    function buildSubscribedMatcher() {
      const selectedNames = new Set(
        currentProviders
          .filter(cp => selectedServiceIds.has(cp.id))
          .map(cp => cleanNormalize(cp.name))
      );
      return (p) => {
        if (!p) return false;
        if (p.provider_id && selectedServiceIds.has(p.provider_id)) return true;
        if (p.id && selectedServiceIds.has(p.id)) return true;
        const norm = cleanNormalize(p.provider_name || p.name || '');
        return norm ? selectedNames.has(norm) : false;
      };
    }

  function findVpnMatch(m, isSubscribedScan = buildSubscribedMatcher()) {
      if (!vpnModeEnabled || !m.allProviders) return null;
      const localData = m.allProviders[currentRegion] || m.regionData;
      const localFlatrate = localData?.flatrate || [];
      const hasLocal = localFlatrate.some(isSubscribedScan);
      if (hasLocal) return null;
      for (const code of Object.keys(REGION_META)) {
        if (code === currentRegion || !m.allProviders[code]) continue;
        const altData = m.allProviders[code];
        const altFlat = altData?.flatrate || [];
        const matchedIds = altFlat.filter(isSubscribedScan);
        if (matchedIds.length > 0) {
          const sorted = [...matchedIds].sort((a, b) => {
            const nameA = cleanNormalize(a.provider_name || a.name || '');
            const nameB = cleanNormalize(b.provider_name || b.name || '');
            const getScore = (n) => {
              if (n.includes('netflix')) return 100;
              if (n.includes('hbo') || n.includes('max')) return 90;
              if (n.includes('amazon') || n.includes('prime')) return 80;
              if (n.includes('disney')) return 70;
              if (n.includes('apple')) return 60;
              return 10;
            };
            return getScore(nameB) - getScore(nameA);
          });
          return { region: code, services: sorted.map(p => ({ label: p.provider_name || p.name })) };
        }
      }
      return null;
    }

    function applyFiltersAndRender() {
      const query = el.filterSearch ? el.filterSearch.value.toLowerCase() : '';
      const sort = homeFilterSort || 'year_desc';

      const selectedNamesFilterSet = new Set(
        currentProviders
          .filter(cp => selectedServiceIds.has(cp.id))
          .map(cp => cleanNormalize(cp.name))
      );
      const isSubscribedScan = (p) => {
        if (!p) return false;
        if (p.provider_id && selectedServiceIds.has(p.provider_id)) return true;
        if (p.id && selectedServiceIds.has(p.id)) return true;
        const norm = cleanNormalize(p.provider_name || p.name || '');
        return norm ? selectedNamesFilterSet.has(norm) : false;
      };

      const getMovieVpnMatch = (m) => findVpnMatch(m, isSubscribedScan);

      const qNormFilter = normalizeTitle(query);
      let filtered = scannedMovies.filter(m => {
        const matchQ = qNormFilter === '' || normalizeTitle(m.title).includes(qNormFilter);

        // Genre multi-select
        let matchG = true;
        if (homeFilterGenres && !homeFilterGenres.has('all') && homeFilterGenres.size > 0) {
          matchG = m.genreIds && m.genreIds.some(id => homeFilterGenres.has(GENRE_MAP[id]));
        }

        // Decade multi-select
        let matchD = true;
        if (homeFilterDecades && !homeFilterDecades.has('all') && homeFilterDecades.size > 0) {
          if (!m.releaseDate) matchD = false;
          else {
            const year = parseInt(m.releaseDate.split('-')[0]);
            const decStr = String(Math.floor(year / 10) * 10);
            matchD = homeFilterDecades.has(decStr) || homeFilterDecades.has(`${decStr}s`) || (year < 1950 && homeFilterDecades.has('older'));
          }
        }

        // Provider multi-select
        let matchProv = true;
        if (homeFilterProviders && !homeFilterProviders.has('all') && homeFilterProviders.size > 0) {
          const localData = m.allProviders ? (m.allProviders[currentRegion] || null) : m.regionData;
          const localFlatrate = localData?.flatrate || [];

          let isMatch = false;
          if (homeFilterProviders.has('vpn')) {
            if (getMovieVpnMatch(m)) isMatch = true;
          }

          if (!isMatch) {
            for (const provName of homeFilterProviders) {
              if (provName === 'vpn') continue;
              const pNorm = provName.toLowerCase();
              const hasLocal = localFlatrate.some(p => {
                const pn = (p.provider_name || p.name || '').toLowerCase();
                return pn === pNorm || pn.includes(pNorm);
              });
              if (hasLocal) {
                isMatch = true;
                break;
              }
              if (vpnModeEnabled && m.allProviders) {
                for (const code of Object.keys(REGION_META)) {
                  if (code === currentRegion || !m.allProviders[code]) continue;
                  const altFlat = m.allProviders[code]?.flatrate || [];
                  if (altFlat.some(p => {
                    const pn = (p.provider_name || p.name || '').toLowerCase();
                    return pn === pNorm || pn.includes(pNorm);
                  })) {
                    isMatch = true;
                    break;
                  }
                }
                if (isMatch) break;
              }
            }
          }
          matchProv = isMatch;
        }

        const rVal = parseFloat(getCachedRating(m) || 0);
        const matchR = (!window.homeFilterRating || window.homeFilterRating === 'all') ? true : (rVal >= parseFloat(window.homeFilterRating));

        const cachedDetails = movieDetailsCache.get(`${m.mediaType || 'movie'}_${m.id}`);
        const runVal = m.runtime || (cachedDetails?.runtime) || (cachedDetails?.episode_run_time?.[0]) || (cachedDetails?.last_episode_to_air?.runtime) || 0;
        let matchRun = true;
        if (window.homeFilterRuntime === 'short') matchRun = runVal > 0 && runVal < 90;
        else if (window.homeFilterRuntime === 'medium') matchRun = runVal >= 90 && runVal <= 120;
        else if (window.homeFilterRuntime === 'long') matchRun = runVal > 120;

        return matchQ && matchG && matchD && matchProv && matchR && matchRun;
      });

      filtered.sort((a, b) => {
        if (sort === 'popularity') return getMoviePopularity(b) - getMoviePopularity(a);
        if (sort === 'az') return a.title.localeCompare(b.title);
        if (sort === 'za') return b.title.localeCompare(a.title);
        if (sort === 'rating_desc') return (parseFloat(getCachedRating(b) || 0)) - (parseFloat(getCachedRating(a) || 0));
        if (sort === 'year_desc') return (b.releaseDate || '0').localeCompare(a.releaseDate || '0');
        if (sort === 'year_asc') return (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999');
        return 0;
      });
      currentGroupedResults = { stream: [], rentbuy: [], other: [], unavailable: [] };

      filtered.forEach(movie => {
        const localData = movie.allProviders ? (movie.allProviders[currentRegion] || null) : movie.regionData;
        const vpnInfo = getMovieVpnMatch(movie);
        const baseObj = { ...movie, regionData: localData, vpnInfo };
        if (!localData && !vpnInfo) { baseObj.subtext = 'Not streaming in region'; currentGroupedResults.unavailable.push(baseObj); return; }

        const localFlatrate = (localData?.flatrate || []).filter(p => p.provider_name !== "Amazon Prime Video with Ads");
        const localRent = (localData?.rent || []).filter(p => p.provider_name !== "Amazon Prime Video with Ads");
        const localBuy = (localData?.buy || []).filter(p => p.provider_name !== "Amazon Prime Video with Ads");

        const matchedSubscribed = localFlatrate.filter(isSubscribedScan);
        const matchedUnsubscribed = localFlatrate.filter(p => !isSubscribedScan(p));

        if (matchedSubscribed.length > 0) {
          baseObj.subtext = matchedSubscribed.map(s => s.provider_name).join(', ');
          currentGroupedResults.stream.push(baseObj);
        } else if (vpnInfo && movie.allProviders && movie.allProviders[vpnInfo.region]) {
          const vpnFlat = (movie.allProviders[vpnInfo.region]?.flatrate || []).filter(isSubscribedScan);
          baseObj.subtext = `${vpnInfo.services[0]?.label || vpnFlat[0]?.provider_name || 'VPN'} · ${REGION_META[vpnInfo.region]?.flag || ''} VPN`;
          currentGroupedResults.stream.push(baseObj);
        } else if (matchedUnsubscribed.length > 0) {
          baseObj.subtext = matchedUnsubscribed.map(s => s.provider_name).join(', ');
          currentGroupedResults.other.push(baseObj);
        } else if (localRent.length > 0 || localBuy.length > 0) {
          const p = [...localRent, ...localBuy];
          const rawNames = [...new Set(p.map(x => x.provider_name))];
          baseObj.subtext = rawNames.slice(0, 2).join(', ');
          currentGroupedResults.rentbuy.push(baseObj);
        } else if (vpnModeEnabled && movie.allProviders) {
          let vpnRb = null;
          let vpnRbCode = null;
          for (const code of Object.keys(REGION_META)) {
            if (code === currentRegion || !movie.allProviders[code]) continue;
            const r = (movie.allProviders[code]?.rent || []).filter(p => p.provider_name !== "Amazon Prime Video with Ads");
            const b = (movie.allProviders[code]?.buy || []).filter(p => p.provider_name !== "Amazon Prime Video with Ads");
            if (r.length > 0 || b.length > 0) {
              vpnRb = [...r, ...b];
              vpnRbCode = code;
              break;
            }
          }
          if (vpnRb && vpnRbCode) {
            const rawNames = [...new Set(vpnRb.map(x => x.provider_name))];
            baseObj.subtext = `${rawNames.slice(0, 2).join(', ')} · ${REGION_META[vpnRbCode]?.flag || ''} VPN`;
            currentGroupedResults.rentbuy.push(baseObj);
          } else {
            baseObj.subtext = 'Not streaming in region';
            currentGroupedResults.unavailable.push(baseObj);
          }
        } else {
          baseObj.subtext = 'Not streaming in region';
          currentGroupedResults.unavailable.push(baseObj);
        }
      });
      const streamC = document.getElementById('tabCount-stream'); if (streamC) streamC.textContent = currentGroupedResults.stream.length; const rentC = document.getElementById('tabCount-rentbuy'); if (rentC) rentC.textContent = currentGroupedResults.rentbuy.length; const otherC = document.getElementById('tabCount-other'); if (otherC) otherC.textContent = currentGroupedResults.other.length; const unavC = document.getElementById('tabCount-unavailable'); if (unavC) unavC.textContent = currentGroupedResults.unavailable.length;
      renderActiveGrid();
    }
    function renderActiveGrid() {
      const container = el.activeGridContainer; if (!container) return; container.innerHTML = ''; const currentData = currentGroupedResults[activeTab] || [];
      if (activeTab === 'other' && currentData.length > 0 && currentPage === 1) { let serviceTally = {}; currentData.forEach(m => { const flatrate = m.regionData?.flatrate || []; flatrate.filter(p => !selectedServiceIds.has(p.provider_id)).forEach(p => { serviceTally[p.provider_name] = (serviceTally[p.provider_name] || 0) + 1; }); }); const topService = Object.keys(serviceTally).sort((a, b) => serviceTally[b] - serviceTally[a])[0]; if (topService) { const count = serviceTally[topService]; const countText = count === 1 ? '1 film' : `${count} films`; const banner = document.createElement('div'); banner.className = 'col-span-full mb-2 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 border border-blue-500/20 rounded-2xl p-5 flex items-center justify-between shadow-lg'; banner.innerHTML = `<div><h3 class="text-blue-400 font-bold text-xs uppercase tracking-widest mb-1">Subscription Optimizer</h3><p class="text-sm text-gray-300 font-medium">Subscribe to <strong class="text-white">${escapeHTML(topService)}</strong> to instantly unlock <strong class="text-white">${countText}</strong> from your watchlist.</p></div><div class="text-3xl opacity-80">💡</div>`; container.appendChild(banner); } }
      if (currentData.length === 0) {
        const hasActiveFilter = (el.filterSearch && el.filterSearch.value.trim() !== '') || (el.filterGenre && el.filterGenre.value !== 'all') || (el.filterDecade && el.filterDecade.value !== 'all');
        const emptyIcon = hasActiveFilter ? '🔍' : '🎬';
        const emptyMsg = hasActiveFilter ? 'No titles match your filters' : 'No films in this category';
        const emptySub = hasActiveFilter ? 'Try a different search, genre, or decade.' : 'Nothing landed here for your current selection.';
        container.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center min-h-[300px] text-gray-500 gap-2"><span class="text-3xl opacity-60">${emptyIcon}</span><span class="font-bold uppercase tracking-widest text-sm">${emptyMsg}</span><span class="text-xs text-gray-600 font-medium normal-case tracking-normal">${emptySub}</span></div>`;
        if (el.paginationControls) { el.paginationControls.innerHTML = ''; el.paginationControls.classList.add('hidden'); }
        return;
      }
      const maxPage = Math.ceil(currentData.length / ITEMS_PER_PAGE); if (currentPage > maxPage) currentPage = maxPage || 1; const start = (currentPage - 1) * ITEMS_PER_PAGE; const pageMovies = currentData.slice(start, start + ITEMS_PER_PAGE); pageMovies.forEach((m, idx) => container.appendChild(createMovieCard(m, idx))); renderPagination(maxPage);
    }
    document.addEventListener('click', (e) => { if (el.quickSearchInput && el.searchDropdown) { if (!el.quickSearchInput.contains(e.target) && !el.searchDropdown.contains(e.target)) el.searchDropdown.classList.add('hidden'); } });
    if (el.quickSearchInput) {
      el.quickSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim(); if (query.length > 0) { if (el.clearSearchBtn) el.clearSearchBtn.classList.remove('hidden'); } else { if (el.clearSearchBtn) el.clearSearchBtn.classList.add('hidden'); if (el.quickSearchResult) { el.quickSearchResult.classList.add('hidden'); } } if (query.length < 2) { if (el.searchDropdown) el.searchDropdown.classList.add('hidden'); return; } clearTimeout(searchTimeout); searchTimeout = setTimeout(async () => {
          const results = await searchMultiMedia(query); if (results.length === 0) { if (el.searchDropdown) { el.searchDropdown.innerHTML = `<div class="p-6 flex flex-col items-center justify-center gap-1.5 text-center"><span class="text-2xl opacity-60">🔍</span><span class="font-bold uppercase tracking-widest text-xs text-gray-400">No results found</span><span class="text-[11px] text-gray-500 font-medium normal-case tracking-normal">Try searching for a different title or person.</span></div>`; el.searchDropdown.classList.remove('hidden'); } return; } if (el.searchDropdown) {
            el.searchDropdown.innerHTML = '';
            results.sort((a, b) => scoreSearchResult(b, query) - scoreSearchResult(a, query)).slice(0, 15).forEach(item => {
              const isPerson = item.__mediaType === 'person';
              const displayTitle = getResultTitle(item);
              const date = getResultDate(item);
              const year = date ? date.split('-')[0] : '';
              const imagePath = isPerson ? item.profile_path : item.poster_path;
              const poster = imagePath ? `https://image.tmdb.org/t/p/w92${imagePath}` : '';
              const row = document.createElement('div');
              row.className = 'flex items-center gap-4 p-3 hover:bg-white/5 cursor-pointer border-b border-white/5 transition-colors last:border-0';
              const safeTitle = escapeHTML(displayTitle);
              let badgeLabel = '';
              let badgeColor = '';
              if (item.__mediaType === 'tv') {
                badgeLabel = 'TV';
                badgeColor = 'text-blue-400 border-blue-500/30';
              } else if (item.__mediaType === 'person') {
                const dept = item.known_for_department;
                if (dept === 'Directing') badgeLabel = 'DIRECTOR';
                else if (dept === 'Writing') badgeLabel = 'WRITER';
                else if (dept === 'Production') badgeLabel = 'PRODUCER';
                else if (dept === 'Sound') badgeLabel = 'COMPOSER';
                else badgeLabel = 'ACTOR';
                badgeColor = 'text-purple-400 border-purple-500/30';
              } else {
                badgeLabel = 'FILM';
                badgeColor = 'text-gray-400 border-gray-500/30';
              }
              const searchImdbRating = isPerson ? null : getRatingInfo({ ...item }).rating;
              const searchYear = (item.release_date || item.first_air_date || '').slice(0, 4);
              const ratingOrYear = searchImdbRating ? `IMDb ${searchImdbRating}` : searchYear;
              const ratingOrDept = item.matchedRole
                ? `${item.matchedRole}${searchImdbRating ? ` • IMDb ${searchImdbRating}` : ''}`
                : (isPerson ? (item.known_for_department || 'Person') : ratingOrYear);
              const subtitleColor = item.matchedRole ? 'text-amber-400 font-extrabold' : 'text-blue-400';
              row.innerHTML = `<div class="w-10 h-14 bg-black/50 rounded overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">${poster ? `<img src="${poster}" alt="${safeTitle}" loading="lazy" decoding="async" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center font-bold text-gray-500 text-xs">${safeTitle.charAt(0)}</div>`}</div><div class="flex-1 min-w-0"><h4 class="text-white text-sm font-bold truncate">${safeTitle} ${year ? `<span class="text-gray-500 font-normal ml-1">(${year})</span>` : ''}<span class="${badgeColor} font-bold text-[9px] uppercase tracking-widest border rounded px-1 py-0.5 ml-1.5">${badgeLabel}</span></h4><span class="${subtitleColor} text-[10px]">${escapeHTML(ratingOrDept)}</span></div>`;
              row.addEventListener('click', () => {
                el.quickSearchInput.value = displayTitle;
                el.searchDropdown.classList.add('hidden');
                if (item.__mediaType === 'person') {
                  openActorPage(item.id, item.name, item.known_for_department === 'Directing' ? 'Director' : 'Actor');
                } else {
                  renderSingleMovieResult(item);
                }
              });
              el.searchDropdown.appendChild(row);
            });
            el.searchDropdown.classList.remove('hidden');
          }
        }, 250);
      });
    }
    async function renderSingleMovieResult(movie) {
      if (el.searchDropdown) el.searchDropdown.classList.add('hidden');
      const mediaType = movie.__mediaType === 'tv' ? 'tv' : 'movie';
      const displayTitle = getResultTitle(movie) || movie.title || movie.name || '';
      openMoviePageById(movie.id, displayTitle, mediaType);
    }
    if (el.quickSearchBtn) {
      el.quickSearchBtn.addEventListener('click', async () => {
        if (!el.quickSearchInput) return;
        const query = el.quickSearchInput.value.trim();
        if (!query) return;
        const results = await searchMultiMedia(query);
        if (results.length === 0) {
          if (el.quickSearchResult) {
            el.quickSearchResult.innerHTML = `<div class="bg-red-950/20 border border-red-900/30 p-5 rounded-2xl"><p class="text-red-400 text-sm text-center font-bold">Target not found.</p></div>`;
            el.quickSearchResult.classList.remove('hidden');
          }
          return;
        }
        results.sort((a, b) => scoreSearchResult(b, query) - scoreSearchResult(a, query));
        const topResult = results[0];
        if (topResult.__mediaType === 'person') {
          openActorPage(topResult.id, topResult.name, topResult.known_for_department === 'Directing' ? 'Director' : 'Actor');
        } else {
          renderSingleMovieResult(topResult);
        }
      });
    }
    if (el.stopButton) {
      el.stopButton.addEventListener('click', () => {
        if (isScanning) {
          activeScanSessionId++;
          cancelRequested = true;
          isScanning = false;
          scannedMovies = [];
          if (el.progressSection) el.progressSection.classList.add('hidden');
          if (el.progressLabel) el.progressLabel.textContent = '';
          if (el.progressBar) el.progressBar.style.width = '0%';
          if (el.progressPercent) el.progressPercent.textContent = '0%';
          if (el.formError) {
            el.formError.textContent = 'Scan aborted by user.';
            el.formError.classList.remove('hidden');
          }
          if (el.resultsSection) el.resultsSection.classList.add('hidden');
          if (el.statsBar) el.statsBar.classList.add('hidden');
          resetUI();
        }
      });
    }
