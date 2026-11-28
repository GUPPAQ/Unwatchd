    // ---------------- Full-page movie view ----------------
    window.currentMoviePageObj = null;

    async function getCanonicalMovieSlug(movieObj, details = null) {
      const title = (details && (details.title || details.name)) || (movieObj && (movieObj.title || movieObj.name)) || '';
      const baseSlug = slugify(title);
      if (!baseSlug) return '';
      const dateStr = (details && (details.release_date || details.first_air_date)) || (movieObj && (movieObj.releaseDate || movieObj.release_date || movieObj.first_air_date)) || '';
      const mYear = dateStr ? dateStr.split('-')[0] : '';
      const mediaType = (details && details.first_air_date) || (movieObj && movieObj.mediaType === 'tv') ? 'tv' : 'movie';
      const mId = (details && details.id) || (movieObj && movieObj.id);

      // If movieObj already has a disambiguated slug ending with a duplicate index (e.g. -2025-1 or -2025-2), keep it!
      if (movieObj && movieObj.slug && movieObj.slug.startsWith(baseSlug)) {
        if (mYear && new RegExp(`-${mYear}-\\d+$`).test(movieObj.slug)) {
          return movieObj.slug;
        }
      }

      // 1. Check if scannedMovies already has multiple films with the same title
      if (Array.isArray(scannedMovies) && scannedMovies.length > 0) {
        const sameTitleScanned = scannedMovies.filter(m => slugify(m.title) === baseSlug);
        if (sameTitleScanned.length > 1 && mYear) {
          const sortedScanned = sortExactMediaMatches(sameTitleScanned);
          const sameYear = sortedScanned.filter(m => (m.releaseDate || '').startsWith(mYear));
          if (sameYear.length > 1) {
            const dupIdx = sameYear.findIndex(m => m.id === mId);
            if (dupIdx > 0) return `${baseSlug}-${mYear}-${dupIdx}`;
            return `${baseSlug}-${mYear}`;
          }
          if (sortedScanned[0].id !== mId) {
            return `${baseSlug}-${mYear}`;
          }
        }
      }

      if (!mYear) return baseSlug;

      // 2. Query TMDB search to see if this is an original, newer, or duplicate-year release
      try {
        const combined = await fetchMediaCandidates(title, mYear, mediaType);
        if (combined && combined.length > 0) {
          const exacts = combined.filter(m => slugify(m.title || m.original_title || m.name || m.original_name) === baseSlug);
          if (exacts.length > 1) {
            const sorted = sortExactMediaMatches(exacts);
            const sameYear = sorted.filter(m => (m.release_date || m.first_air_date || '').startsWith(mYear));
            if (sameYear.length > 1) {
              const dupIdx = sameYear.findIndex(m => m.id === mId);
              if (dupIdx > 0) return `${baseSlug}-${mYear}-${dupIdx}`;
              return `${baseSlug}-${mYear}`;
            }
            if (sorted[0].id !== mId) {
              return `${baseSlug}-${mYear}`;
            }
          }
        }
      } catch (e) { console.warn('[Canonical Slug Fetch]', e); }

      return baseSlug;
    }

    async function getCanonicalPersonSlug(person) {
      if (!person || !person.name) return '';
      const baseSlug = slugify(person.name);
      if (!baseSlug) return '';
      const personId = person.id;

      try {
        const query = baseSlug.replace(/-/g, ' ');
        const res = await tmdbFetch(`https://api.themoviedb.org/3/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data && Array.isArray(data.results) && data.results.length > 0) {
          const exacts = data.results.filter(p => slugify(p.name || '') === baseSlug);
          if (exacts.length > 1) {
            exacts.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
            const dupIdx = exacts.findIndex(p => p.id === personId);
            if (dupIdx > 0) {
              return `${baseSlug}-${dupIdx}`;
            }
          }
        }
      } catch (e) {
        console.warn('[Canonical Person Slug Fetch]', e);
      }

      return baseSlug;
    }

    async function openMoviePage(movieObj, pushHistory = true, preserveScroll = false) {
      const container = document.getElementById('moviePageView');
      if (!container || !movieObj) return;

      const savedScrollTop = preserveScroll ? container.scrollTop : 0;
      window.currentMoviePageObj = movieObj;
      document.body.classList.add('modal-open');
      container.classList.remove('hidden');
      try { hideActorPageView(); } catch (e) { logIgnored('openMoviePage', e); }
      try { hideAllCastModalView(); } catch (e) { logIgnored('openMoviePage', e); }
      if (!preserveScroll) {
        container.scrollTop = 0;
        container.innerHTML = `<div class="min-h-screen flex items-center justify-center"><div class="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>`;
      }

      // Initial fast fallback slug push before async resolution
      let initialSlug = movieObj.slug || '';
      const initialBaseSlug = slugify(movieObj.title || '');
      const initialYear = movieObj.releaseDate ? movieObj.releaseDate.split('-')[0] : (movieObj.release_date ? movieObj.release_date.split('-')[0] : '');
      if (initialSlug && initialSlug.startsWith(initialBaseSlug) && initialYear && initialSlug.includes(`-${initialYear}`)) {
        // initialSlug is already valid with year (e.g. rocky-1976 or presence-2025-1)
      } else {
        initialSlug = initialBaseSlug;
      }
      const initialMediaType = movieObj.mediaType === 'tv' ? 'series' : 'film';
      if (initialSlug) registerSlug(initialSlug, movieObj.id, initialMediaType);
      if (pushHistory) {
        try { history.pushState({ moviePage: movieObj.id }, '', `#${initialMediaType}/${initialSlug}`); } catch (e) { logIgnored('openMoviePage', e); }
      }

      try {
        const mediaType = movieObj.mediaType === 'tv' ? 'tv' : 'movie';
        let details = null;
        try {
          details = await getFullMovieDetails(movieObj.id, mediaType);
        } catch (e) {
          console.warn('[Full Movie Details Fetch]', e);
        }

        // Canonical slug refinement
        try {
          const mediaRoute = mediaType === 'tv' ? 'series' : 'film';
          const refinedSlug = await getCanonicalMovieSlug(movieObj, details);
          if (refinedSlug) {
            movieObj.slug = refinedSlug;
            registerSlug(refinedSlug, movieObj.id, mediaRoute);
            if (pushHistory) {
              try { history.replaceState({ moviePage: movieObj.id }, '', `#${mediaRoute}/${refinedSlug}`); } catch (e) { logIgnored('openMoviePage', e); }
            }
          }
        } catch (e) { logIgnored('openMoviePage', e); }

        if (window.currentMoviePageObj !== movieObj) return;

        try { await resolveTitleLogo(details); } catch (e) { logIgnored('openMoviePage', e); }
        try { await ensureFranchiseDetailsLoaded(movieObj, details); } catch (e) { logIgnored('openMoviePage', e); }
        if (details) {
          const imdbId = details.external_ids?.imdb_id || movieObj.imdbId || movieToImdbIdMap.get(`${mediaType}_${movieObj.id}`);
          if (imdbId) {
            movieObj.imdbId = imdbId;
            const key = `${mediaType}_${movieObj.id}`;
            movieToImdbIdMap.set(key, imdbId);
            saveMovieToImdbIdMap();
            if (!imdbRatingCache.has(imdbId)) {
              try {
                await Promise.race([
                  fetchImdbRating(imdbId, mediaType === 'tv'),
                  new Promise(r => setTimeout(r, 600))
                ]);
              } catch (e) { logIgnored('openMoviePage', e); }
            }
            const r = imdbRatingCache.get(imdbId);
            if (r) {
              movieObj.imdbRating = r;
              movieObj.rating = r;
              updatePosterRatingBadgeInDom(movieObj.id, r);
              const sm = scannedMovies.find(m => m.id === movieObj.id && (m.mediaType || 'movie') === mediaType);
              if (sm) {
                sm.imdbId = imdbId;
                sm.imdbRating = r;
                sm.rating = r;
              }
            }
          }
        }

        if (window.currentMoviePageObj !== movieObj) return;

        let collectionData = null;
        if (details && details.belongs_to_collection && details.belongs_to_collection.id) {
          try {
            collectionData = await getCollectionDetails(details.belongs_to_collection.id);
          } catch (e) { logIgnored('openMoviePage', e); }
        }

        const backdropUrl = details && details.backdrop_path ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}` : movieObj.backdrop;
        if (backdropUrl && !preserveScroll) {
          try {
            const img = new Image();
            img.src = backdropUrl;
            await Promise.race([
              new Promise(r => { img.onload = r; img.onerror = r; }),
              new Promise(r => setTimeout(r, 250))
            ]);
          } catch (e) { logIgnored('openMoviePage', e); }
        }

        if (window.currentMoviePageObj !== movieObj) return;
        window.currentMoviePageDetails = details;
        const html = generateFullMovieHTML(movieObj, details, true, 'lookup', true, collectionData);
        if (preserveScroll) {
          container.innerHTML = `<div id="moviePageInnerContent">${html}</div>`;
          container.scrollTop = savedScrollTop;
        } else {
          container.innerHTML = `<div id="moviePageInnerContent" class="opacity-0 transition-opacity duration-200">${html}</div>`;
          requestAnimationFrame(() => {
            const inner = document.getElementById('moviePageInnerContent');
            if (inner) inner.classList.remove('opacity-0');
          });
          container.scrollTop = 0;
        }
        try { verifyTitleLogos(); } catch (e) { logIgnored('openMoviePage', e); }
        try { applyTiltToSimilarGrid(); } catch (e) { logIgnored('openMoviePage', e); }
        try { bindCastCrewDrag(); } catch (e) { logIgnored('openMoviePage', e); }
        try { updateMoviePageVpnNote(movieObj, details); } catch (e) { logIgnored('openMoviePage', e); }
        try {
          const pageImdbId = details?.external_ids?.imdb_id || movieObj.imdbId;
          if (pageImdbId) resolveImdbRatingBadges(pageImdbId, mediaType === 'tv');
          const similarToPreload = [
            ...((collectionData && collectionData.parts) || []),
            ...((details?.recommendations?.results) || []),
            ...((details?.similar?.results) || [])
          ].slice(0, 16);
          similarToPreload.forEach(m => enqueueImdbResolution(m, true));
        } catch (e) { logIgnored('openMoviePage', e); }
        if (preserveScroll) {
          container.scrollTop = savedScrollTop;
        }
        setTimeout(() => { const f = document.getElementById('heroVideoIframe'); if (f) fitHeroVideoCover(f); }, 500);
      } catch (e) {
        console.error('[Movie Page Render]', e);
        container.innerHTML = `<div class="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-6"><p class="text-red-400 font-bold">Couldn't load this title.</p><button onclick="closeMoviePage()" class="text-blue-400 text-sm font-bold underline">Go back</button></div>`;
      }
    }

    async function openMoviePageById(movieId, movieTitle = '', mediaType = 'movie', pushHistory = true, slug = '') {
      const existing = scannedMovies.find(m => m.id === movieId && (m.mediaType || 'movie') === mediaType);
      if (existing) { return openMoviePage(existing.slug ? existing : { ...existing, slug }, pushHistory); }
      try {
        let endpoint = mediaType === 'tv' ? 'tv' : 'movie';
        let res = await tmdbFetch(`https://api.themoviedb.org/3/${endpoint}/${movieId}?api_key=${TMDB_API_KEY}`);
        let movie = await res.json();

        // If a title slug is present and the fetched result does not match the slug, check if the alternate media type (tv vs movie) is the true match
        if (slug && movie && movie.id) {
          const fetchedSlug = slugify(movie.title || movie.name || '');
          const cleanTargetSlug = slug.replace(/^(\d{5,})-/, '').replace(/-cast$/, '');
          if (cleanTargetSlug && !fetchedSlug.includes(cleanTargetSlug) && !cleanTargetSlug.includes(fetchedSlug)) {
            const altEndpoint = endpoint === 'tv' ? 'movie' : 'tv';
            try {
              const altRes = await tmdbFetch(`https://api.themoviedb.org/3/${altEndpoint}/${movieId}?api_key=${TMDB_API_KEY}`);
              const altMovie = await altRes.json();
              if (altMovie && altMovie.id) {
                const altSlug = slugify(altMovie.title || altMovie.name || '');
                if (altSlug.includes(cleanTargetSlug) || cleanTargetSlug.includes(altSlug)) {
                  movie = altMovie;
                  endpoint = altEndpoint;
                  mediaType = altEndpoint === 'tv' ? 'tv' : 'movie';
                }
              }
            } catch (e) { logIgnored('openMoviePageById', e); }
          }
        }

        if (!movie || !movie.id) return;
        const knownImdbId = getStoredImdbId(mediaType, movie.id);
        const knownImdbRating = knownImdbId ? getStoredImdbRating(knownImdbId) : null;
        const movieObj = {
          id: movie.id,
          mediaType: mediaType,
          title: movie.title || movie.name || movieTitle,
          poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
          backdrop: movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null,
          imdbId: knownImdbId || '',
          imdbRating: knownImdbRating || null,
          rating: knownImdbRating || (movie.vote_average ? movie.vote_average.toFixed(1) : null),
          releaseDate: movie.release_date || movie.first_air_date || null,
          genreIds: movie.genre_ids || (movie.genres ? movie.genres.map(g => g.id) : []),
          url: `https://www.themoviedb.org/${endpoint}/${movie.id}`,
          slug: slug || '',
          regionData: null,
          allProviders: null
        };
        try {
          const pRes = await tmdbFetch(`https://api.themoviedb.org/3/${endpoint}/${movie.id}/watch/providers?api_key=${TMDB_API_KEY}`);
          const pData = await pRes.json();
          if (pData && pData.results) {
            movieObj.regionData = pData.results[currentRegion] || null;
            movieObj.allProviders = pData.results;
          }
        } catch (pe) { console.warn('[Movie/TV Page Providers Fetch]', pe); }
        return openMoviePage(movieObj, pushHistory);
      } catch (e) { console.error('[Movie Page By Id]', e); }
    }

    // A visit that started on a film's own address (/film/<slug>, served by api/film-page.js):
    // once that page is closed, the address goes back to the home page.
    function leaveFilmPath() {
      if (/^\/(film|series)\//.test(window.location.pathname)) {
        try { history.replaceState({}, '', '/' + window.location.search); } catch (e) { logIgnored('leaveFilmPath', e); }
      }
    }

    function goHomeFromPage() {
      clearQuickSearchInput();
      hideMoviePageView();
      hideActorPageView();
      if (window.location.hash) {
        try { history.replaceState({}, document.title, window.location.pathname + window.location.search); } catch (e) { logIgnored('goHomeFromPage', e); }
      }
      leaveFilmPath();
    }

    function closeMoviePage() {
      clearQuickSearchInput();
      if (window.location.hash) {
        history.back();
      } else {
        hideMoviePageView();
        leaveFilmPath();
      }
    }

    function hideMoviePageView() {
      const container = document.getElementById('moviePageView');
      if (!container || container.classList.contains('hidden')) return;
      stopHeroVideo();
      window.currentMoviePageObj = null;
      container.classList.add('hidden');
      container.innerHTML = '';
      document.body.classList.remove('modal-open');
    }

    function hideAllCastModalView() {
      const modal = document.getElementById('allCastModal');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    }

    window.addEventListener('popstate', () => {
      const rawRoute = parseRouteInfo();
      if (rawRoute) {
        resolveRouteToId(rawRoute).then(routeInfo => {
          if (!routeInfo || !routeInfo.id) {
            hideAllCastModalView();
            hideMoviePageView();
            hideActorPageView();
            return;
          }
          if (routeInfo.type === 'cast') {
            hideActorPageView();
            const container = document.getElementById('moviePageView');
            const isMoviePageOpen = container && !container.classList.contains('hidden');
            const isCurrentMatch = isMoviePageOpen && window.currentMoviePageObj && window.currentMoviePageObj.id === routeInfo.id && (window.currentMoviePageObj.mediaType || 'movie') === (routeInfo.mediaType || 'movie') && window.currentMovieFullCredits;
            if (!isCurrentMatch) {
              const existing = scannedMovies.find(m => m.id === routeInfo.id && (m.mediaType || 'movie') === (routeInfo.mediaType || 'movie'));
              const p = existing
                ? openMoviePage(existing.slug ? existing : { ...existing, slug: routeInfo.slug }, false)
                : openMoviePageById(routeInfo.id, '', routeInfo.mediaType || 'movie', false, routeInfo.slug);
              Promise.resolve(p).then(() => {
                openFullCastModal(true, false);
              });
            } else {
              openFullCastModal(true, false);
            }
          } else if (routeInfo.type === 'film') {
            hideAllCastModalView();
            const container = document.getElementById('moviePageView');
            if (container) container.classList.remove('hidden');
            const isCurrentMatch = window.currentMoviePageObj && window.currentMoviePageObj.id === routeInfo.id && (window.currentMoviePageObj.mediaType || 'movie') === (routeInfo.mediaType || 'movie');
            if (!isCurrentMatch) {
              const existing = scannedMovies.find(m => m.id === routeInfo.id && (m.mediaType || 'movie') === (routeInfo.mediaType || 'movie'));
              if (existing) openMoviePage(existing.slug ? existing : { ...existing, slug: routeInfo.slug }, false); else openMoviePageById(routeInfo.id, '', routeInfo.mediaType || 'movie', false, routeInfo.slug);
            }
            hideActorPageView();
          } else if (routeInfo.type === 'actor') {
            hideAllCastModalView();
            const container = document.getElementById('actorPageView');
            if (container) container.classList.remove('hidden');
            if (window.currentActorPageId !== routeInfo.id || window.currentActorRoleHint !== routeInfo.role) {
              openActorPage(routeInfo.id, '', routeInfo.role || '', false);
            }
            hideMoviePageView();
          }
        });
      } else {
        hideAllCastModalView();
        hideMoviePageView();
        hideActorPageView();
        clearQuickSearchInput();
      }
    });

    async function openMovieModal(movieObj, forceInline = null, isWatchlistFlip = false, preserveScroll = false) {
      stopHeroVideo();
      if (isWatchlistFlip) {
        watchlistModalHistoryStack.length = 0;
      }
      const isInlineCall = forceInline !== null ? forceInline : isQuickSearchContext();
      if (isInlineCall) {
        if (!isNavigatingBack && !preserveScroll) {
          if (currentActorId) {
            const person = actorDetailsCache.get(currentActorId);
            pushToHistoryStack(quickSearchHistoryStack, { type: 'actor', data: { id: currentActorId, name: person ? person.name : '', roleHint: currentActorRoleHint } });
          } else if (window.currentActiveMovieObj && window.currentActiveMovieObj.id !== movieObj.id) {
            pushToHistoryStack(quickSearchHistoryStack, { type: 'movie', data: window.currentActiveMovieObj });
          }
        }
        currentActorId = null;
        window.currentActiveMovieObj = movieObj;

        if (!preserveScroll) {
          el.quickSearchResult.innerHTML = `<div class="glass-panel p-10 rounded-2xl text-center flex flex-col items-center justify-center min-h-[250px]"><div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div><p class="text-blue-400 text-xs font-bold uppercase tracking-widest animate-pulse">Loading ${escapeHTML(movieObj.title)}...</p></div>`;
        }
        el.quickSearchResult.classList.remove('hidden');

        getFullMovieDetails(movieObj.id, movieObj.mediaType).then(async details => {
          await ensureFranchiseDetailsLoaded(movieObj, details);
          if (!window.currentActiveMovieObj || window.currentActiveMovieObj.id !== movieObj.id) return;
          let collectionData = null;
          if (details && details.belongs_to_collection && details.belongs_to_collection.id) {
            collectionData = await getCollectionDetails(details.belongs_to_collection.id);
          }
          el.quickSearchResult.innerHTML = `<div class="glass-panel rounded-2xl sm:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-blue-500/20 animate-fade flex flex-col bg-[#0a0a0b] overflow-hidden relative">${generateFullMovieHTML(movieObj, details, false, 'lookup', false, collectionData)}</div>`;
          const closeBtn = document.getElementById('closeModalBtn');
          if (closeBtn) closeBtn.onclick = () => { el.quickSearchResult.classList.add('hidden'); el.quickSearchResult.innerHTML = ''; quickSearchHistoryStack.length = 0; window.currentActiveMovieObj = null; };
          const backBtn = document.getElementById('movieBackBtn');
          if (backBtn) backBtn.onclick = navGoBack;

          applyTiltToSimilarGrid();
          bindCastCrewDrag();
          try { updateMoviePageVpnNote(movieObj, details); } catch (e) { logIgnored('openMovieModal', e); }
          if (!preserveScroll) scrollToQuickSearchResult();
        });
        return;
      }

      if (!isNavigatingBack && !isWatchlistFlip && !preserveScroll) {
        if (modalActiveActorId) {
          const person = actorDetailsCache.get(modalActiveActorId);
          pushToHistoryStack(watchlistModalHistoryStack, { type: 'actor', data: { id: modalActiveActorId, name: person ? person.name : '', roleHint: modalActiveActorRoleHint } });
        } else if (modalActiveMovieObj && modalActiveMovieObj.id !== movieObj.id) {
          pushToHistoryStack(watchlistModalHistoryStack, { type: 'movie', data: modalActiveMovieObj });
        }
      }
      modalActiveActorId = null;
      modalActiveMovieObj = movieObj;
      const modal = document.getElementById('movieModal'); const backdrop = document.getElementById('modalBackdrop'); const content = document.getElementById('modalContent'); const prevBtn = document.getElementById('modalPrevBtn'); const nextBtn = document.getElementById('modalNextBtn');
      if (!modal || !content) return;

      const savedScroll = preserveScroll ? content.scrollTop : 0;
      const actorModal = document.getElementById('actorModal');
      if (actorModal) { actorModal.classList.add('hidden'); actorModal.classList.remove('flex'); }

      const cacheKey = `${movieObj.mediaType === 'tv' ? 'tv' : 'movie'}_${movieObj.id}`;
      const isAlreadyCached = movieDetailsCache.has(cacheKey);

      content.dataset.movieId = movieObj.id;
      if (!isAlreadyCached && !preserveScroll) {
        content.innerHTML = `<div class="p-20 flex flex-col items-center justify-center w-full min-h-[300px]"><div class="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div><p class="text-blue-400 font-bold uppercase tracking-widest text-xs animate-pulse">Loading…</p></div>`;
      }

      modal.classList.remove('hidden'); modal.classList.add('flex'); document.body.classList.add('modal-open'); requestAnimationFrame(() => { backdrop.classList.remove('opacity-0'); content.classList.remove('translate-y-8', 'opacity-0'); });
      let currentList = currentGroupedResults[activeTab] || [];
      let currentIndex = currentList.findIndex(m => m.id === movieObj.id);
      if (currentIndex !== -1 && currentList.length > 1) {
        if (prevBtn) {
          if (currentIndex > 0) {
            prevBtn.classList.remove('hidden'); requestAnimationFrame(() => prevBtn.classList.remove('opacity-0'));
            prevBtn.onclick = (e) => { e.stopPropagation(); openMovieModal(currentList[currentIndex - 1], false, true); };
          } else {
            prevBtn.classList.add('hidden', 'opacity-0');
          }
        }
        if (nextBtn) {
          if (currentIndex < currentList.length - 1) {
            nextBtn.classList.remove('hidden'); requestAnimationFrame(() => nextBtn.classList.remove('opacity-0'));
            nextBtn.onclick = (e) => { e.stopPropagation(); openMovieModal(currentList[currentIndex + 1], false, true); };
          } else {
            nextBtn.classList.add('hidden', 'opacity-0');
          }
        }
      } else {
        if (prevBtn) { prevBtn.classList.add('hidden', 'opacity-0'); }
        if (nextBtn) { nextBtn.classList.add('hidden', 'opacity-0'); }
      }

      preloadAdjacentMovies(currentList, currentIndex);

      const closeModal = () => { stopHeroVideo(); modalActiveMovieObj = null; modalActiveActorId = null; watchlistModalHistoryStack.length = 0; backdrop.classList.add('opacity-0'); content.classList.add('translate-y-8', 'opacity-0'); if (prevBtn) prevBtn.classList.add('opacity-0'); if (nextBtn) nextBtn.classList.add('opacity-0'); setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); document.body.classList.remove('modal-open'); if (prevBtn) prevBtn.classList.add('hidden'); if (nextBtn) nextBtn.classList.add('hidden'); }, 300); }; backdrop.onclick = closeModal; window.closeModal = closeModal;
      try {
        const details = await getFullMovieDetails(movieObj.id, movieObj.mediaType);
        let collectionData = null;
        if (details && details.belongs_to_collection && details.belongs_to_collection.id) {
          collectionData = await getCollectionDetails(details.belongs_to_collection.id);
        }
        await resolveTitleLogo(details);
        await ensureFranchiseDetailsLoaded(movieObj, details);
        const modalImdbId = details?.external_ids?.imdb_id || movieObj.imdbId || movieToImdbIdMap.get(`${movieObj.mediaType || 'movie'}_${movieObj.id}`);
        if (modalImdbId) {
          movieObj.imdbId = modalImdbId;
          const key = `${movieObj.mediaType || 'movie'}_${movieObj.id}`;
          movieToImdbIdMap.set(key, modalImdbId);
          saveMovieToImdbIdMap();
          if (!imdbRatingCache.has(modalImdbId)) {
            try {
              await Promise.race([
                fetchImdbRating(modalImdbId, movieObj.mediaType === 'tv'),
                new Promise(r => setTimeout(r, 500))
              ]);
            } catch (e) { logIgnored('closeModal', e); }
          }
          const r = imdbRatingCache.get(modalImdbId);
          if (r) {
            movieObj.imdbRating = r;
            movieObj.rating = r;
            updatePosterRatingBadgeInDom(movieObj.id, r, true, modalImdbId);
            const sm = scannedMovies.find(m => m.id === movieObj.id && (m.mediaType || 'movie') === (movieObj.mediaType || 'movie'));
            if (sm) {
              sm.imdbId = modalImdbId;
              sm.imdbRating = r;
              sm.rating = r;
            }
          }
        }
        content.innerHTML = generateFullMovieHTML(movieObj, details, true, 'sync', false, collectionData);
        verifyTitleLogos();
        try {
          if (modalImdbId) resolveImdbRatingBadges(modalImdbId, movieObj.mediaType === 'tv');
          const similarToPreload = [
            ...(collectionData?.parts || []),
            ...((details?.recommendations?.results) || []),
            ...((details?.similar?.results) || [])
          ].slice(0, 16);
          similarToPreload.forEach(m => enqueueImdbResolution(m, true));
        } catch (e) { logIgnored('closeModal', e); }
        document.getElementById('closeModalBtn').onclick = closeModal;
        const movieBack = document.getElementById('movieBackBtn');
        if (movieBack) movieBack.onclick = navGoBack;
        applyTiltToSimilarGrid();
        bindCastCrewDrag();
        try { updateMoviePageVpnNote(movieObj, details); } catch (e) { logIgnored('closeModal', e); }
        if (preserveScroll) {
          content.scrollTop = savedScroll;
        } else {
          const castTrack = document.getElementById('castCrewTrack'); if (castTrack) castTrack.scrollLeft = 0;
          const similarTrack = document.getElementById('similarMoviesTrack'); if (similarTrack) similarTrack.scrollLeft = 0;
          content.scrollTop = 0;
        }
      } catch (e) { console.warn('[Modal Detail Load]', e); content.innerHTML = `<div class="p-10 text-center text-red-400">Error loading details.</div>`; }
    }

    function toggleSocialsDrawer(btn) {
      const rawData = btn.getAttribute('data-socials');
      let payload = null;
      try { payload = JSON.parse(rawData); } catch (e) { logIgnored('toggleSocialsDrawer', e); }

      if (window.innerWidth < 640) {
        if (payload) {
          openMobileSocialsSheet(payload.title, payload.subtitle, payload.socials);
        }
        return;
      }

      const container = btn.closest('.relative');
      const drawer = container ? container.querySelector('.social-drawer') : null;
      if (!drawer) return;

      const isOpen = drawer.classList.contains('is-open');
      document.querySelectorAll('.social-drawer.is-open').forEach(d => {
        d.classList.remove('is-open');
        const b = d.closest('.relative')?.querySelector('.drawer-btn');
        if (b) b.classList.remove('is-active');
      });

      if (!isOpen) {
        drawer.classList.add('is-open');
        btn.classList.add('is-active');
      }
    }

    function openMobileSocialsSheet(title, subtitle, socials) {
      const modal = document.getElementById('mobileSocialSheet');
      if (!modal) return;
      const titleEl = document.getElementById('mobileSocialSheetTitle');
      const subEl = document.getElementById('mobileSocialSheetSubtitle');
      if (titleEl) titleEl.textContent = title ? `Official Links • ${title}` : 'Official Links';
      if (subEl) subEl.textContent = subtitle || '';

      const listEl = document.getElementById('mobileSocialSheetList');
      if (listEl && Array.isArray(socials)) {
        listEl.innerHTML = socials.map(s => `
          <a href="${s.url}" target="_blank" class="flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-[0.98] transition-all border border-white/5 group cursor-pointer">
            <div class="flex items-center gap-3.5 min-w-0">
              <img src="${s.icon}" alt="${escapeHTML(s.name)}" class="w-10 h-10 rounded-[22.5%] shrink-0 shadow-sm object-cover">
              <div class="truncate">
                <div class="text-sm font-bold text-white leading-tight group-hover:text-blue-400 transition-colors">${escapeHTML(s.name)}</div>
                <div class="text-xs text-gray-400 font-medium truncate">${escapeHTML(s.handle || '')}</div>
              </div>
            </div>
            <svg class="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
          </a>
        `).join('');
      }

      modal.classList.remove('hidden');
      requestAnimationFrame(() => {
        modal.classList.add('is-open');
      });
    }

    function closeMobileSocialsSheet(e) {
      if (e && e.target && e.target.id !== 'mobileSocialSheet' && !e.target.closest('button[aria-label="Close"]')) {
        return;
      }
      const modal = document.getElementById('mobileSocialSheet');
      if (!modal) return;
      modal.classList.remove('is-open');
      setTimeout(() => {
        modal.classList.add('hidden');
      }, 280);
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.drawer-btn') && !e.target.closest('.social-drawer')) {
        document.querySelectorAll('.social-drawer.is-open').forEach(d => {
          d.classList.remove('is-open');
          const b = d.closest('.relative')?.querySelector('.drawer-btn');
          if (b) b.classList.remove('is-active');
        });
      }
    });

    function openTrailerModal(videoKey, movieTitle) {
      document.body.classList.add('trailer-open');
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      stopHeroVideo();
      const modal = document.getElementById('trailerModal');
      const backdrop = document.getElementById('trailerModalBackdrop');
      const container = document.getElementById('trailerModalContainer');
      const wrapper = document.getElementById('trailerIframeWrapper');
      const titleEl = document.getElementById('trailerModalTitle');
      if (!modal || !wrapper) return;

      titleEl.textContent = movieTitle ? `${movieTitle} — Official Trailer` : 'Official Trailer';

      if (trailerPlayer) {
        try {
          if (typeof trailerPlayer.stopVideo === 'function') trailerPlayer.stopVideo();
          if (typeof trailerPlayer.destroy === 'function') trailerPlayer.destroy();
        } catch (e) { logIgnored('openTrailerModal', e); }
        trailerPlayer = null;
      }

      wrapper.innerHTML = `<div id="trailerPlayerDiv" class="w-full h-full"></div>`;

      // Append fallback watch link below iframe in footer if embedding is blocked
      const fallbackUrl = `https://www.youtube.com/watch?v=${videoKey}`;
      const footerBtn = document.getElementById('trailerModalFooter');
      if (footerBtn) footerBtn.href = fallbackUrl;

      modal.classList.remove('hidden'); modal.classList.add('flex');
      requestAnimationFrame(() => {
        backdrop.classList.remove('opacity-0');
        container.classList.remove('translate-y-8', 'opacity-0');
      });

      // Shown when the video can't be embedded, or YouTube's player script didn't load.
      const showTrailerFallback = () => {
        const modalWrapper = document.getElementById('trailerIframeWrapper');
        if (!modalWrapper) return;
        modalWrapper.innerHTML = `
          <div class="w-full h-full flex flex-col items-center justify-center bg-black/90 p-6 text-center rounded-2xl gap-3">
            <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-2xl"><svg class="w-6 h-6 text-red-300" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg></div>
            <div class="flex flex-col gap-1">
              <span class="text-white font-extrabold text-sm sm:text-base">Trailer can't play here</span>
              <span class="text-gray-400 text-xs sm:text-sm max-w-sm">YouTube didn't load, or the uploader doesn't allow this video to play outside YouTube.</span>
            </div>
            <a href="${fallbackUrl}" target="_blank" rel="noopener noreferrer" class="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-lg active:scale-95">
              <span>Watch on YouTube</span>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
            </a>
          </div>`;
      };

      ensureYouTubeApi(() => {
        try {
          trailerPlayer = new YT.Player('trailerPlayerDiv', {
            height: '100%',
            width: '100%',
            videoId: videoKey,
            playerVars: {
              autoplay: 1,
              controls: 1,
              modestbranding: 1,
              rel: 0,
              iv_load_policy: 3,
              playsinline: 1,
              enablejsapi: 1,
              hl: 'en',
              vq: 'hd1080'
            },
            events: {
              onReady: (event) => {
                try { event.target.playVideo(); } catch (e) { logIgnored('openTrailerModal', e); }
                const iframe = wrapper.querySelector('iframe');
                if (iframe) {
                  iframe.focus();
                  try { iframe.contentWindow.focus(); } catch (e) { logIgnored('openTrailerModal', e); }
                }
              },
              onError: showTrailerFallback
            }
          });
        } catch (err) {
          console.warn('[YT Player Embed]', err);
          showTrailerFallback();
        }
      }, showTrailerFallback);

      const closeHandler = () => closeTrailerModal();
      backdrop.onclick = closeHandler;
      document.getElementById('closeTrailerModalBtn').onclick = closeHandler;
    }

    function closeTrailerModal() {
      document.body.classList.remove('trailer-open');
      const modal = document.getElementById('trailerModal');
      const backdrop = document.getElementById('trailerModalBackdrop');
      const container = document.getElementById('trailerModalContainer');
      const wrapper = document.getElementById('trailerIframeWrapper');
      if (!modal) return;

      if (trailerPlayer) {
        try {
          if (typeof trailerPlayer.stopVideo === 'function') trailerPlayer.stopVideo();
          if (typeof trailerPlayer.destroy === 'function') trailerPlayer.destroy();
        } catch (e) { logIgnored('closeTrailerModal', e); }
        trailerPlayer = null;
      }

      backdrop.classList.add('opacity-0');
      container.classList.add('translate-y-8', 'opacity-0');
      setTimeout(() => {
        modal.classList.add('hidden'); modal.classList.remove('flex');
        if (wrapper) wrapper.innerHTML = '';
      }, 300);
    }

    let currentAllCastActiveTab = 'all';
    let currentAllCastMovieContext = null;
    let allCastCurrentPage = 1;
    const ALL_CAST_PER_PAGE = 48;

    function setAllCastPage(p) {
      allCastCurrentPage = p;
      renderAllCastGrid();
      const modal = document.getElementById('allCastModal');
      if (modal) modal.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function renderAllCastPaginationHtml(currentPage, maxPage) {
      if (maxPage <= 1) return '';
      let btnsHtml = '';

      const createBtn = (text, disabled, page, isActive = false) => {
        if (isActive) {
          return `<button type="button" class="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 text-white font-bold text-sm shadow-[0_0_12px_rgba(255,90,54,0.6)]">${text}</button>`;
        } else if (disabled && text !== '...') {
          return `<button type="button" disabled class="w-9 h-9 flex items-center justify-center rounded-full bg-transparent text-gray-600 font-bold text-sm cursor-not-allowed">${text}</button>`;
        } else if (text === '...') {
          return `<button type="button" disabled class="w-9 h-9 flex items-center justify-center bg-transparent text-gray-500 font-bold text-sm pointer-events-none">...</button>`;
        } else {
          return `<button type="button" onclick="setAllCastPage(${page})" class="w-9 h-9 flex items-center justify-center rounded-full liquid-glass text-white font-bold text-sm transition-all active:scale-95 cursor-pointer">${text}</button>`;
        }
      };

      const prevDisabled = currentPage === 1;
      btnsHtml += createBtn('<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>', prevDisabled, currentPage - 1);

      if (maxPage <= 5) {
        for (let i = 1; i <= maxPage; i++) btnsHtml += createBtn(i, false, i, i === currentPage);
      } else {
        if (currentPage <= 3) {
          for (let i = 1; i <= 4; i++) btnsHtml += createBtn(i, false, i, i === currentPage);
          btnsHtml += createBtn('...', true, 0);
          btnsHtml += createBtn(maxPage, false, maxPage, maxPage === currentPage);
        } else if (currentPage >= maxPage - 2) {
          btnsHtml += createBtn(1, false, 1, 1 === currentPage);
          btnsHtml += createBtn('...', true, 0);
          for (let i = maxPage - 3; i <= maxPage; i++) btnsHtml += createBtn(i, false, i, i === currentPage);
        } else {
          btnsHtml += createBtn(1, false, 1, 1 === currentPage);
          btnsHtml += createBtn('...', true, 0);
          btnsHtml += createBtn(currentPage - 1, false, currentPage - 1, false);
          btnsHtml += createBtn(currentPage, false, currentPage, true);
          btnsHtml += createBtn(currentPage + 1, false, currentPage + 1, false);
          btnsHtml += createBtn('...', true, 0);
          btnsHtml += createBtn(maxPage, false, maxPage, false);
        }
      }

      const nextDisabled = currentPage === maxPage;
      btnsHtml += createBtn('<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>', nextDisabled, currentPage + 1);

      return `<div class="col-span-full flex justify-center items-center gap-2 mt-6 sm:mt-7 mb-0">${btnsHtml}</div>`;
    }

    function openFullCastModal(isPage = false, pushHistory = true) {
      if (!window.currentMovieFullCredits) return;
      const modal = document.getElementById('allCastModal');
      if (!modal) return;

      stopHeroVideo();

      currentAllCastActiveTab = 'all';
      currentAllCastMovieContext = isPage;
      allCastCurrentPage = 1;

      if (isPage && pushHistory && !location.hash.includes('/cast') && !location.hash.includes('-cast')) {
        const mId = window.currentMovieFullCredits?.movieId || window.currentMoviePageObj?.id || '0';
        const castMovieObj = scannedMovies.find(m => m.id === Number(mId)) || window.currentActiveMovieObj || window.currentMoviePageObj;
        const isTv = castMovieObj?.mediaType === 'tv' || window.currentMoviePageObj?.mediaType === 'tv';
        const mediaRoute = isTv ? 'series' : 'film';
        const rawSlug = castMovieObj?.slug || window.currentMoviePageObj?.slug || slugify(castMovieObj?.title || window.currentMovieFullCredits?.movieTitle || '');
        const cleanSlug = rawSlug ? rawSlug.replace(/-cast$/, '') : '';
        const targetSlug = cleanSlug || `${mId}`;
        try { history.pushState({ allCastPage: true, movieId: mId, mediaType: isTv ? 'tv' : 'movie' }, '', `#${mediaRoute}/${targetSlug}/cast`); } catch (e) { logIgnored('openFullCastModal', e); }
      }

      const searchInput = document.getElementById('allCastSearchInput');
      if (searchInput) searchInput.value = '';

      const { movieTitle, backdrop, titleLogo, cast = [], crew = [], directors = [] } = window.currentMovieFullCredits;

      const bannerArtEl = document.getElementById('allCastBannerArt');
      if (bannerArtEl) bannerArtEl.innerHTML = backdrop ? `<img src="${backdrop}" alt="" decoding="async">` : '';
      const filmLink = document.getElementById('allCastFilmLink');
      if (filmLink) filmLink.textContent = movieTitle;
      const subEl = document.getElementById('allCastModalSubtitle');
      const people = new Set([...directors, ...cast, ...crew].map(p => p.id)).size;
      if (subEl) subEl.textContent = `· ${people.toLocaleString()} ${people === 1 ? 'person' : 'people'}`;
      updateAllCastTabsUI();
      renderAllCastGrid();

      modal.classList.remove('hidden'); modal.classList.add('flex');
      document.body.classList.add('modal-open');
      modal.scrollTop = 0;
    }

    function closeAllCastModal() {
      const modal = document.getElementById('allCastModal');
      if (!modal) return;

      modal.classList.add('hidden'); modal.classList.remove('flex');
      const actorModal = document.getElementById('actorModal');
      const movieModal = document.getElementById('movieModal');
      const isActorOpen = actorModal && !actorModal.classList.contains('hidden');
      const isMovieOpen = movieModal && !movieModal.classList.contains('hidden');
      const isMoviePageOpen = document.getElementById('moviePageView') && !document.getElementById('moviePageView').classList.contains('hidden');
      const isActorPageOpen = document.getElementById('actorPageView') && !document.getElementById('actorPageView').classList.contains('hidden');
      if (!isActorOpen && !isMovieOpen && !isMoviePageOpen && !isActorPageOpen) {
        document.body.classList.remove('modal-open');
      }
    }

    function setAllCastTab(tab) {
      currentAllCastActiveTab = tab;
      allCastCurrentPage = 1;
      updateAllCastTabsUI();
      renderAllCastGrid();
    }

    function updateAllCastTabsUI() {
      ['all', 'cast', 'crew'].forEach(t => {
        const btn = document.getElementById(`allCastTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (!btn) return;
        btn.classList.toggle('active', t === currentAllCastActiveTab);
      });
      if (window.currentMovieFullCredits) {
        const { cast = [], crew = [], directors = [] } = window.currentMovieFullCredits;
        const seenAll = new Set();
        directors.forEach(d => seenAll.add(d.id));
        cast.forEach(c => seenAll.add(c.id));
        crew.forEach(cr => seenAll.add(cr.id));
        const countAll = seenAll.size || (directors.length + cast.length + crew.length);
        const countCast = cast.length;
        const countCrew = directors.length + crew.length;
        const countAllEl = document.getElementById('allCastTabCountAll');
        const countCastEl = document.getElementById('allCastTabCountCast');
        const countCrewEl = document.getElementById('allCastTabCountCrew');
        const infoEl = document.getElementById('allCastCountInfo');
        if (countAllEl) countAllEl.textContent = countAll;
        if (countCastEl) countCastEl.textContent = countCast;
        if (countCrewEl) countCrewEl.textContent = countCrew;
        if (infoEl) {
          const currentCount = currentAllCastActiveTab === 'cast' ? countCast : (currentAllCastActiveTab === 'crew' ? countCrew : countAll);
          infoEl.textContent = String(currentCount);
        }
      }
    }

    function filterAllCastGrid() {
      const searchInput = document.getElementById('allCastSearchInput');
      const clearBtn = document.getElementById('allCastSearchClear');
      if (clearBtn && searchInput) {
        clearBtn.classList.toggle('hidden', !searchInput.value);
      }
      allCastCurrentPage = 1;
      renderAllCastGrid();
    }

    function clearAllCastSearch() {
      const searchInput = document.getElementById('allCastSearchInput');
      const clearBtn = document.getElementById('allCastSearchClear');
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      if (clearBtn) clearBtn.classList.add('hidden');
      allCastCurrentPage = 1;
      renderAllCastGrid();
    }

    // Credits grouped the way a film's credits read: who made it, who's in it, then the crew by
    // department. Directors, writers and cast get portraits; the wider crew is a compact list.
    const CAST_DEPT_ORDER = ['Directing', 'Writing', 'Cast', 'Directing team', 'Production', 'Camera', 'Editing', 'Sound', 'Art', 'Costume & Make-Up', 'Visual Effects', 'Lighting', 'Crew'];
    const CAST_DEPT_NAMES = { 'Directing': 'Directed by', 'Writing': 'Written by', 'Cast': 'Cast', 'Directing team': 'Assistant directors and script', 'Production': 'Production', 'Camera': 'Camera', 'Editing': 'Editing', 'Sound': 'Sound and music', 'Art': 'Art and design', 'Costume & Make-Up': 'Costume and make-up', 'Visual Effects': 'Visual effects', 'Lighting': 'Lighting', 'Crew': 'Crew' };
    function groupFullCredits() {
      const { cast = [], crew = [], directors = [] } = window.currentMovieFullCredits || {};
      const groups = new Map();
      const add = (dept, person, role) => {
        if (!groups.has(dept)) groups.set(dept, new Map());
        const g = groups.get(dept);
        const prev = g.get(person.id);
        if (prev) { if (role && !prev.roles.includes(role)) prev.roles.push(role); return; }
        g.set(person.id, { ...person, roles: role ? [role] : [] });
      };
      directors.forEach(d => add('Directing', d, d._role || d.job || 'Director'));
      cast.forEach(c => add('Cast', c, c.character || ''));
      // "Directed by" is the director(s) only; the rest of the directing department (assistant
      // directors, script supervisor) gets its own list further down.
      crew.forEach(c => {
        let dept = CAST_DEPT_ORDER.includes(c.department) ? c.department : 'Crew';
        if (dept === 'Directing' && c.job !== 'Director') dept = 'Directing team';
        add(dept, c, c.job || '');
      });
      return CAST_DEPT_ORDER.filter(d => groups.has(d)).map(d => ({ dept: d, people: [...groups.get(d).values()] }));
    }

    function renderAllCastGrid() {
      const grid = document.getElementById('allCastGrid');
      if (!grid || !window.currentMovieFullCredits) return;
      const searchInput = document.getElementById('allCastSearchInput');
      const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

      let groups = groupFullCredits();
      if (currentAllCastActiveTab === 'cast') groups = groups.filter(g => g.dept === 'Cast');
      else if (currentAllCastActiveTab === 'crew') groups = groups.filter(g => g.dept !== 'Cast');

      const roleText = (p) => p.roles.filter(Boolean).join(', ');
      const portrait = (p, i) => personCardHTML(p, { role: roleText(p), index: i });
      const row = (p) => {
        const img = p.profile_path ? `https://image.tmdb.org/t/p/w92${p.profile_path}` : null;
        const name = escapeHTML(p.name || 'Unknown');
        return `<button type="button" class="crew-row" data-person-id="${p.id}" data-person-name="${name}" data-role-hint="Actor" onclick="openActorPage(Number(this.dataset.personId), this.dataset.personName, this.dataset.roleHint)"><span class="crew-row-photo">${img ? `<img src="${img}" alt="" loading="lazy" decoding="async">` : name.charAt(0)}</span><span class="crew-row-text"><span class="crew-row-name">${name}</span><span class="crew-row-role">${escapeHTML(roleText(p))}</span></span></button>`;
      };

      if (query) {
        const seen = new Set();
        const matches = [];
        groups.forEach(g => g.people.forEach(p => {
          if (seen.has(p.id)) return;
          if ((p.name || '').toLowerCase().includes(query) || roleText(p).toLowerCase().includes(query)) { seen.add(p.id); matches.push(p); }
        }));
        grid.innerHTML = matches.length
          ? `<section class="page-section"><div class="section-head"><h2 class="section-title">${matches.length === 1 ? '1 match' : `${matches.length} matches`}</h2></div><div class="people-grid">${matches.map(portrait).join('')}</div></section>`
          : `<p class="page-empty">Nobody on this film matches “${escapeHTML(query)}”.</p>`;
        return;
      }
      if (!groups.length) { grid.innerHTML = '<p class="page-empty">No credits listed for this yet.</p>'; return; }

      grid.innerHTML = groups.map(g => {
        const big = g.dept === 'Directing' || g.dept === 'Writing' || g.dept === 'Cast';
        const body = big
          ? `<div class="people-grid${g.dept === 'Cast' ? '' : ' people-grid-key'}">${g.people.map(portrait).join('')}</div>`
          : `<div class="crew-list">${g.people.map(row).join('')}</div>`;
        return `<section class="page-section cast-dept"><div class="section-head"><h2 class="section-title">${CAST_DEPT_NAMES[g.dept] || g.dept}</h2><span class="section-count">${g.people.length}</span></div>${body}</section>`;
      }).join('');
    }
    let touchStartX = 0; let touchStartY = 0; let touchEndX = 0; let touchEndY = 0; let isSwipingModal = false;
    const modalContentEl = document.getElementById('modalContent');
    if (modalContentEl) {
      modalContentEl.addEventListener('touchstart', (e) => {
        const trailerM = document.getElementById('trailerModal');
        if (trailerM && !trailerM.classList.contains('hidden')) { isSwipingModal = false; return; }
        const actorM = document.getElementById('actorModal');
        if (actorM && !actorM.classList.contains('hidden')) { isSwipingModal = false; return; }
        if (e.touches.length === 1) {
          if (e.target && e.target.closest('.overflow-x-auto, .touch-pan-x, #castCrewTrack, #relatedMoviesTrack, #similarMoviesTrack')) {
            isSwipingModal = false;
            return;
          }
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          isSwipingModal = true;
        }
      }, { passive: true });
      modalContentEl.addEventListener('touchend', (e) => {
        const trailerM = document.getElementById('trailerModal');
        if (trailerM && !trailerM.classList.contains('hidden')) { isSwipingModal = false; return; }
        const actorM = document.getElementById('actorModal');
        if (actorM && !actorM.classList.contains('hidden')) { isSwipingModal = false; return; }
        if (!isSwipingModal) return;
        isSwipingModal = false;
        if (e.changedTouches.length === 1) {
          if (e.target && e.target.closest('.overflow-x-auto, .touch-pan-x, #castCrewTrack, #relatedMoviesTrack, #similarMoviesTrack')) return;
          touchEndX = e.changedTouches[0].clientX;
          touchEndY = e.changedTouches[0].clientY;
          const deltaX = touchEndX - touchStartX;
          const deltaY = touchEndY - touchStartY;
          if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
            const modal = document.getElementById('movieModal');
            if (!modal || modal.classList.contains('hidden')) return;
            let currentList = currentGroupedResults[activeTab] || [];
            const content = document.getElementById('modalContent');
            if (!content || !content.dataset.movieId) return;
            const currentId = content.dataset.movieId;
            const curIdx = currentList.findIndex(m => m.id == currentId);
            if (curIdx === -1) return;
            if (deltaX < 0 && curIdx < currentList.length - 1) { openMovieModal(currentList[curIdx + 1], false, true); }
            else if (deltaX > 0 && curIdx > 0) { openMovieModal(currentList[curIdx - 1], false, true); }
          }
        }
      }, { passive: true });
    }
    const trailerModalEl = document.getElementById('trailerModal');
    if (trailerModalEl) {
      ['touchstart', 'touchmove', 'touchend', 'pointerdown'].forEach(evt => {
        trailerModalEl.addEventListener(evt, (e) => { e.stopPropagation(); }, { passive: true });
      });
    }
