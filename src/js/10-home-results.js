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
      wrapper.className = 'poster-card';
      wrapper.style.setProperty('--i', Math.min(delayIndex, 24));
      const a = document.createElement('a');
      a.href = movieObj.url;
      a.dataset.movieCardId = movieObj.id;
      a.addEventListener('click', (e) => { e.preventDefault(); openMoviePage(movieObj, true); });
      a.className = 'poster-card-art';
      const innerClip = document.createElement('div');
      innerClip.className = 'poster-card-clip';
      if (movieObj.poster) {
        innerClip.innerHTML = `<img src="${movieObj.poster}" alt="" loading="lazy" decoding="async">`;
      } else {
        innerClip.innerHTML = `<div class="poster-card-fallback">${safeTitle}</div>`;
      }
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

      // Where it's available, as small service logos along the bottom of the poster.
      // `subtext` is "Netflix, Max" (or "Netflix · 🇺🇸 VPN" for a VPN unlock).
      const serviceNames = (movieObj.subtext || '').split(' · ')[0].split(', ').map(s => s.trim()).filter(s => s && s !== 'Not streaming in region');
      if (serviceNames.length > 0) {
        const logos = serviceNames.slice(0, 3).map(name => {
          const src = getProviderLogoUrl(name);
          return src ? `<img src="${escapeHTML(src)}" alt="${escapeHTML(name)}" loading="lazy" onerror="this.remove()">` : '';
        }).join('');
        if (logos) {
          const row = document.createElement('div');
          row.className = 'poster-services';
          row.innerHTML = logos + (serviceNames.length > 3 ? `<span class="poster-services-more">+${serviceNames.length - 3}</span>` : '');
          a.appendChild(row);
        }
      }

      if (movieObj.vpnInfo) {
        const vpnBadge = document.createElement('div');
        vpnBadge.className = 'poster-corner-badge poster-vpn-badge';
        vpnBadge.title = `Requires switching your VPN to ${REGION_META[movieObj.vpnInfo.region].name}`;
        vpnBadge.innerHTML = `${REGION_META[movieObj.vpnInfo.region].flag} VPN`;
        a.appendChild(vpnBadge);
      }

      a.setAttribute('aria-label', movieObj.title || 'Film');
      wrapper.appendChild(a);
      const year = (movieObj.releaseDate || '').slice(0, 4);
      const caption = document.createElement('div');
      caption.className = 'poster-card-caption';
      caption.innerHTML = `<span class="poster-card-title">${safeTitle}</span>${year ? `<span class="poster-card-year">${year}</span>` : ''}`;
      wrapper.appendChild(caption);
      return wrapper;
    }
    function renderPagination(maxPage) { const pagDiv = el.paginationControls; if (!pagDiv) return; pagDiv.innerHTML = ''; if (maxPage <= 1) { pagDiv.classList.add('hidden'); return; } pagDiv.classList.remove('hidden'); const createBtn = (text, disabled, onClick, isActive = false) => { const btn = document.createElement('button'); btn.innerHTML = text; btn.disabled = disabled; if (isActive) { btn.className = 'w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 text-white font-bold text-sm shadow-[0_0_12px_rgba(255,90,54,0.6)]'; } else if (disabled && text !== '...') { btn.className = 'w-9 h-9 flex items-center justify-center rounded-full bg-transparent text-gray-600 font-bold text-sm cursor-not-allowed'; } else if (text === '...') { btn.className = 'w-9 h-9 flex items-center justify-center bg-transparent text-gray-500 font-bold text-sm pointer-events-none'; } else { btn.className = 'w-9 h-9 flex items-center justify-center rounded-full liquid-glass text-white font-bold text-sm transition-all cursor-pointer'; btn.onclick = onClick; } return btn; }; const goToPage = (p) => { currentPage = p; renderActiveGrid(); window.scrollTo({ top: el.resultsSection.offsetTop - 100, behavior: 'smooth' }); }; pagDiv.appendChild(createBtn('<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>', currentPage === 1, () => goToPage(currentPage - 1))); const addPage = (p) => { pagDiv.appendChild(createBtn(p, false, () => goToPage(p), p === currentPage)); }; if (maxPage <= 5) { for (let i = 1; i <= maxPage; i++) addPage(i); } else { if (currentPage <= 3) { for (let i = 1; i <= 4; i++) addPage(i); pagDiv.appendChild(createBtn('...', true)); addPage(maxPage); } else if (currentPage >= maxPage - 2) { addPage(1); pagDiv.appendChild(createBtn('...', true)); for (let i = maxPage - 3; i <= maxPage; i++) addPage(i); } else { addPage(1); pagDiv.appendChild(createBtn('...', true)); addPage(currentPage - 1); addPage(currentPage); addPage(currentPage + 1); pagDiv.appendChild(createBtn('...', true)); addPage(maxPage); } } pagDiv.appendChild(createBtn('<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>', currentPage === maxPage, () => goToPage(currentPage + 1))); }
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
      currentGroupedResults = groupMoviesByAvailability(filtered, isSubscribedScan);
      const streamC = document.getElementById('tabCount-stream'); if (streamC) streamC.textContent = currentGroupedResults.stream.length; const rentC = document.getElementById('tabCount-rentbuy'); if (rentC) rentC.textContent = currentGroupedResults.rentbuy.length; const otherC = document.getElementById('tabCount-other'); if (otherC) otherC.textContent = currentGroupedResults.other.length; const unavC = document.getElementById('tabCount-unavailable'); if (unavC) unavC.textContent = currentGroupedResults.unavailable.length;
      renderActiveGrid();
      renderResultsHero();
    }

    // Sorts movies into the four home tabs (stream / rentbuy / other / unavailable) for the
    // current region, selected services and VPN mode. Used for the visible (filtered) grid and,
    // unfiltered, for the results headline.
    function groupMoviesByAvailability(movies, isSubscribedScan = buildSubscribedMatcher()) {
      const getMovieVpnMatch = (m) => findVpnMatch(m, isSubscribedScan);
      const groups = { stream: [], rentbuy: [], other: [], unavailable: [] };

      movies.forEach(movie => {
        const localData = movie.allProviders ? (movie.allProviders[currentRegion] || null) : movie.regionData;
        const vpnInfo = getMovieVpnMatch(movie);
        const baseObj = { ...movie, regionData: localData, vpnInfo };
        if (!localData && !vpnInfo) { baseObj.subtext = 'Not streaming in region'; groups.unavailable.push(baseObj); return; }

        const localFlatrate = (localData?.flatrate || []).filter(p => p.provider_name !== "Amazon Prime Video with Ads");
        const localRent = (localData?.rent || []).filter(p => p.provider_name !== "Amazon Prime Video with Ads");
        const localBuy = (localData?.buy || []).filter(p => p.provider_name !== "Amazon Prime Video with Ads");

        const matchedSubscribed = localFlatrate.filter(isSubscribedScan);
        const matchedUnsubscribed = localFlatrate.filter(p => !isSubscribedScan(p));

        if (matchedSubscribed.length > 0) {
          baseObj.subtext = matchedSubscribed.map(s => s.provider_name).join(', ');
          groups.stream.push(baseObj);
        } else if (vpnInfo && movie.allProviders && movie.allProviders[vpnInfo.region]) {
          const vpnFlat = (movie.allProviders[vpnInfo.region]?.flatrate || []).filter(isSubscribedScan);
          baseObj.subtext = `${vpnInfo.services[0]?.label || vpnFlat[0]?.provider_name || 'VPN'} · ${REGION_META[vpnInfo.region]?.flag || ''} VPN`;
          groups.stream.push(baseObj);
        } else if (matchedUnsubscribed.length > 0) {
          baseObj.subtext = matchedUnsubscribed.map(s => s.provider_name).join(', ');
          groups.other.push(baseObj);
        } else if (localRent.length > 0 || localBuy.length > 0) {
          const p = [...localRent, ...localBuy];
          const rawNames = [...new Set(p.map(x => x.provider_name))];
          baseObj.subtext = rawNames.slice(0, 2).join(', ');
          groups.rentbuy.push(baseObj);
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
            groups.rentbuy.push(baseObj);
          } else {
            baseObj.subtext = 'Not streaming in region';
            groups.unavailable.push(baseObj);
          }
        } else {
          baseObj.subtext = 'Not streaming in region';
          groups.unavailable.push(baseObj);
        }
      });
      return groups;
    }
    function renderActiveGrid() {
      const container = el.activeGridContainer; if (!container) return; container.innerHTML = ''; const currentData = currentGroupedResults[activeTab] || [];
      if (activeTab === 'other' && currentData.length > 0 && currentPage === 1) { let serviceTally = {}; currentData.forEach(m => { const flatrate = m.regionData?.flatrate || []; flatrate.filter(p => !selectedServiceIds.has(p.provider_id)).forEach(p => { serviceTally[p.provider_name] = (serviceTally[p.provider_name] || 0) + 1; }); }); const topService = Object.keys(serviceTally).sort((a, b) => serviceTally[b] - serviceTally[a])[0]; if (topService) { const count = serviceTally[topService]; const countText = count === 1 ? '1 film' : `${count} films`; const banner = document.createElement('div'); banner.className = 'col-span-full mb-2 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 border border-blue-500/20 rounded-2xl p-5 flex items-center justify-between shadow-lg'; banner.innerHTML = `<div><h3 class="text-blue-400 font-bold text-xs uppercase tracking-widest mb-1">Subscription Optimizer</h3><p class="text-sm text-gray-300 font-medium">Subscribe to <strong class="text-white">${escapeHTML(topService)}</strong> to instantly unlock <strong class="text-white">${countText}</strong> from your watchlist.</p></div><div class="text-3xl opacity-80"></div>`; container.appendChild(banner); } }
      if (currentData.length === 0) {
        const hasActiveFilter = (el.filterSearch && el.filterSearch.value.trim() !== '') || (el.filterGenre && el.filterGenre.value !== 'all') || (el.filterDecade && el.filterDecade.value !== 'all');
        const emptyIcon = hasActiveFilter ? '' : '';
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
          const results = await searchMultiMedia(query); if (results.length === 0) { if (el.searchDropdown) { el.searchDropdown.innerHTML = `<p class="search-empty">Nothing matches “${escapeHTML(query)}” yet. Keep typing, or try a person's name.</p>`; el.searchDropdown.classList.remove('hidden'); } return; } if (el.searchDropdown) {
            el.searchDropdown.innerHTML = '';
            results.sort((a, b) => scoreSearchResult(b, query) - scoreSearchResult(a, query)).slice(0, 15).forEach(item => {
              const isPerson = item.__mediaType === 'person';
              const displayTitle = getResultTitle(item);
              const date = getResultDate(item);
              const year = date ? date.split('-')[0] : '';
              const imagePath = isPerson ? item.profile_path : item.poster_path;
              const poster = imagePath ? `https://image.tmdb.org/t/p/w92${imagePath}` : '';
              const row = document.createElement('button');
              row.type = 'button';
              row.className = 'search-row';
              const safeTitle = escapeHTML(displayTitle);
              const dept = item.known_for_department;
              const kind = item.__mediaType === 'tv' ? 'TV series'
                : isPerson ? (dept === 'Directing' ? 'Director' : dept === 'Writing' ? 'Writer' : dept === 'Production' ? 'Producer' : dept === 'Sound' ? 'Composer' : 'Actor')
                : 'Film';
              const searchImdbRating = isPerson ? null : getRatingInfo({ ...item }).rating;
              const sub = [item.matchedRole || kind, !isPerson && year ? year : null, searchImdbRating ? `IMDb ${searchImdbRating}` : null].filter(Boolean).join(' · ');
              row.innerHTML = `<span class="search-row-thumb${isPerson ? ' is-person' : ''}">${poster ? `<img src="${poster}" alt="" loading="lazy" decoding="async">` : `<span>${safeTitle.charAt(0)}</span>`}</span><span class="search-row-text"><span class="search-row-title">${safeTitle}</span><span class="search-row-sub">${escapeHTML(sub)}</span></span>`;
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
          if (el.searchDropdown) {
            el.searchDropdown.innerHTML = `<p class="search-empty">Nothing matches “${escapeHTML(query)}”. Try the original title, or a person's name.</p>`;
            el.searchDropdown.classList.remove('hidden');
          }
          return;
        }
        if (el.quickSearchInput) el.quickSearchInput.blur();
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
            el.formError.textContent = 'Scan stopped.';
            el.formError.classList.remove('hidden');
          }
          if (el.resultsSection) el.resultsSection.classList.add('hidden');
         
          resetUI();
        }
      });
    }
