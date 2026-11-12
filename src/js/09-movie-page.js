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

    function goHomeFromPage() {
      clearQuickSearchInput();
      hideMoviePageView();
      hideActorPageView();
      if (window.location.hash) {
        try { history.replaceState({}, document.title, window.location.pathname + window.location.search); } catch (e) { logIgnored('goHomeFromPage', e); }
      }
    }

    function closeMoviePage() {
      clearQuickSearchInput();
      if (window.location.hash) {
        history.back();
      } else {
        hideMoviePageView();
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
          el.quickSearchResult.innerHTML = `<div class="glass-panel rounded-2xl sm:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-blue-500/20 animate-fade flex flex-col bg-[#0b1121] overflow-hidden relative">${generateFullMovieHTML(movieObj, details, false, 'lookup', false, collectionData)}</div>`;
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
        content.innerHTML = `<div class="p-20 flex flex-col items-center justify-center w-full min-h-[300px]"><div class="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div><p class="text-blue-400 font-bold uppercase tracking-widest text-xs animate-pulse">Decrypting Data...</p></div>`;
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
              onError: () => {
                const modalWrapper = document.getElementById('trailerIframeWrapper');
                if (modalWrapper) {
                  modalWrapper.innerHTML = `
                    <div class="w-full h-full flex flex-col items-center justify-center bg-black/90 p-6 text-center rounded-2xl gap-3">
                      <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-2xl">
                        🎬
                      </div>
                      <div class="flex flex-col gap-1">
                        <span class="text-white font-extrabold text-sm sm:text-base">Trailer playback restricted in player</span>
                        <span class="text-gray-400 text-xs sm:text-sm max-w-sm">This video is geoblocked or disallowed from third-party embedded players by the uploader.</span>
                      </div>
                      <a href="${fallbackUrl}" target="_blank" rel="noopener noreferrer" class="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-lg active:scale-95">
                        <span>Watch on YouTube</span>
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                      </a>
                    </div>`;
                }
              }
            }
          });
        } catch (err) {
          console.warn('[YT Player Embed]', err);
        }
      });

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
          return `<button type="button" class="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 text-white font-bold text-sm shadow-[0_0_12px_rgba(59,130,246,0.6)]">${text}</button>`;
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
      const totalCount = directors.length + cast.length;

      const bannerArtEl = document.getElementById('allCastBannerArt');
      if (bannerArtEl) {
        bannerArtEl.innerHTML = backdrop
          ? `<img src="${backdrop}" alt="${escapeHTML(movieTitle)} banner" class="w-full h-full object-cover object-[center_20%] scale-105 transform-gpu">`
          : `<div class="w-full h-full bg-gradient-to-br from-blue-950/40 via-gray-900 to-[#0b1121]"></div>`;
      }

      const titleContainer = document.getElementById('allCastModalTitleContainer');
      const titleEl = document.getElementById('allCastModalTitle');
      const subEl = document.getElementById('allCastModalSubtitle');

      if (titleContainer) {
        if (titleLogo) {
          titleContainer.innerHTML = `<img src="${titleLogo}" alt="${escapeHTML(movieTitle)}" loading="eager" decoding="async" class="titleLogoImg pageTitleImg max-h-20 min-[400px]:max-h-24 sm:max-h-36 max-w-[280px] min-[400px]:max-w-[340px] sm:max-w-[560px] object-contain mb-2 shrink-0 drop-shadow-[0_8px_20px_rgba(0,0,0,0.95)]" onerror="onTitleLogoError(this)" onload="if(this.naturalWidth===0)onTitleLogoError(this)">`;
        } else {
          titleContainer.innerHTML = `<h1 id="allCastModalTitle" class="text-3xl min-[400px]:text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-white tracking-tight drop-shadow-[0_8px_20px_rgba(0,0,0,0.95)] leading-tight mb-0.5">${escapeHTML(movieTitle)}</h1>`;
        }
      } else if (titleEl) {
        titleEl.textContent = movieTitle;
      }

      if (subEl) subEl.textContent = `${totalCount} actors, directors & crew members`;

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
          infoEl.textContent = `${currentCount} Total`;
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

    function renderAllCastGrid() {
      const grid = document.getElementById('allCastGrid');
      if (!grid || !window.currentMovieFullCredits) return;

      const { cast = [], crew = [], directors = [] } = window.currentMovieFullCredits;
      const searchInput = document.getElementById('allCastSearchInput');
      const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

      let list = [];
      if (currentAllCastActiveTab === 'cast') {
        list = cast.map(c => ({ ...c, _role: c.character || 'Cast' }));
      } else if (currentAllCastActiveTab === 'crew') {
        list = [...directors.map(d => ({ ...d, _role: 'Director' })), ...crew.map(c => ({ ...c, _role: c.job || 'Crew' }))];
      } else {
        const seenIds = new Set();
        directors.forEach(d => { seenIds.add(d.id); list.push({ ...d, _role: 'Director' }); });
        cast.forEach(c => {
          if (!seenIds.has(c.id)) {
            seenIds.add(c.id);
            list.push({ ...c, _role: c.character || 'Actor' });
          }
        });
        crew.forEach(cr => {
          if (!seenIds.has(cr.id)) {
            seenIds.add(cr.id);
            list.push({ ...cr, _role: cr.job || 'Crew' });
          }
        });
      }

      if (query) {
        list = list.filter(p => (p.name || '').toLowerCase().includes(query) || (p._role || '').toLowerCase().includes(query));
      }

      if (list.length === 0) {
        const emptyIcon = query ? '🔍' : '👥';
        const emptyMsg = query ? 'No people match your search' : 'No cast or crew found';
        const emptySub = query ? 'Try searching for a different name or department.' : 'Nothing listed for this selection.';
        grid.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center min-h-[260px] text-gray-500 gap-2 text-center py-10"><span class="text-3xl opacity-60">${emptyIcon}</span><span class="font-bold uppercase tracking-widest text-sm text-gray-400">${emptyMsg}</span><span class="text-xs text-gray-600 font-medium normal-case tracking-normal">${emptySub}</span></div>`;
        return;
      }

      const maxPage = Math.ceil(list.length / ALL_CAST_PER_PAGE);
      if (allCastCurrentPage > maxPage) allCastCurrentPage = maxPage || 1;
      const start = (allCastCurrentPage - 1) * ALL_CAST_PER_PAGE;
      const pageItems = list.slice(start, start + ALL_CAST_PER_PAGE);

      const isPage = currentAllCastMovieContext;
      const cardsHtml = pageItems.map(p => {
        const pImg = p.profile_path ? `https://image.tmdb.org/t/p/w185${p.profile_path}` : null;
        const pName = escapeHTML(p.name || 'Unknown');
        const pRole = escapeHTML(p._role || '');
        const roleHint = p._role === 'Director' ? 'Director' : 'Actor';

        return `<div data-person-id="${p.id}" data-person-name="${pName}" data-role-hint="${roleHint}" onclick="${isPage ? 'openActorPage(Number(this.dataset.personId), this.dataset.personName, this.dataset.roleHint)' : 'closeAllCastModal(); openActorModal(Number(this.dataset.personId), this.dataset.personName, this.dataset.roleHint, true)'};" onmouseenter="handleSpotifyMarqueeEnter(this)" onmouseleave="handleSpotifyMarqueeLeave(this)" class="cast-chip-card flex flex-col items-center gap-1.5 w-full shrink-0 group/person cursor-pointer select-none relative">
          <div class="glow-card w-full aspect-square rounded-full border ${p._role === 'Director' ? 'border-blue-400 ring-2 ring-blue-500/50 shadow-[inset_0_0_8px_rgba(59,130,246,0.6)]' : 'border-white/10'} shadow-lg bg-gray-800 shrink-0 relative">
            <div class="w-full h-full rounded-full overflow-hidden">
              ${pImg ? `<img src="${pImg}" alt="${pName}" loading="lazy" decoding="async" class="w-full h-full object-cover pointer-events-none">` : `<div class="w-full h-full flex items-center justify-center text-xl font-bold text-gray-500 pointer-events-none">${pName.charAt(0)}</div>`}
            </div>
          </div>
          <div class="spotify-marquee-container w-full pointer-events-none text-center">
            <span class="spotify-marquee-text text-xs sm:text-sm text-gray-200 font-bold text-center leading-snug pointer-events-none">${pName}</span>
          </div>
          ${pRole ? `<div class="spotify-marquee-container w-full pointer-events-none -mt-0.5 text-center"><span class="spotify-marquee-text text-[11px] sm:text-xs text-gray-400 font-medium text-center leading-tight pointer-events-none">${pRole}</span></div>` : ''}
        </div>`;
      }).join('');

      const pagHtml = renderAllCastPaginationHtml(allCastCurrentPage, maxPage);
      grid.innerHTML = cardsHtml + pagHtml;
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
