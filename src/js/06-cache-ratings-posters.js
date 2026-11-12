    const imdbRatingCache = new Map();
    const imdbRatingFetchedAt = new Map();
    const IMDB_RATING_TTL_MS = 14 * 24 * 60 * 60 * 1000;
    try {
      const stored = localStorage.getItem('unwatchd_imdb_ratings');
      const storedTimes = JSON.parse(localStorage.getItem('unwatchd_imdb_rating_times') || '{}') || {};
      const now = Date.now();
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [k, v] of Object.entries(parsed)) {
          if (!k || !v) continue;
          const fetchedAt = Number(storedTimes[k]) || now; // ratings saved before timestamps existed start their 14 days now
          if (now - fetchedAt > IMDB_RATING_TTL_MS) continue; // stale: will be fetched again
          imdbRatingCache.set(k, String(v));
          imdbRatingFetchedAt.set(k, fetchedAt);
        }
      }
    } catch (e) { console.warn('[IMDb Rating Cache Load]', e); }

    function setImdbRating(imdbId, rating) {
      imdbRatingCache.delete(imdbId); // re-insert so it counts as newest when trimming to 4000
      imdbRatingCache.set(imdbId, rating);
      imdbRatingFetchedAt.set(imdbId, Date.now());
    }

    let saveImdbCacheTimer = null;
    function saveImdbRatingCache() {
      if (saveImdbCacheTimer) return;
      saveImdbCacheTimer = setTimeout(() => {
        saveImdbCacheTimer = null;
        try {
          const obj = {};
          const times = {};
          const entries = Array.from(imdbRatingCache.entries()).slice(-4000);
          for (const [k, v] of entries) {
            obj[k] = v;
            times[k] = imdbRatingFetchedAt.get(k) || Date.now();
          }
          localStorage.setItem('unwatchd_imdb_ratings', JSON.stringify(obj));
          localStorage.setItem('unwatchd_imdb_rating_times', JSON.stringify(times));
        } catch (e) { console.warn('[IMDb Rating Cache Save]', e); }
      }, 200);
    }

    const movieToImdbIdMap = new Map();
    try {
      const storedImdbIds = localStorage.getItem('unwatchd_movie_imdb_ids');
      if (storedImdbIds) {
        const parsed = JSON.parse(storedImdbIds);
        for (const [k, v] of Object.entries(parsed)) {
          if (k && v) movieToImdbIdMap.set(k, String(v));
        }
      }
    } catch (e) { logIgnored('saveImdbRatingCache', e); }

    let saveImdbIdsTimer = null;
    function saveMovieToImdbIdMap() {
      if (saveImdbIdsTimer) return;
      saveImdbIdsTimer = setTimeout(() => {
        saveImdbIdsTimer = null;
        try {
          const obj = {};
          const entries = Array.from(movieToImdbIdMap.entries()).slice(-4000);
          for (const [k, v] of entries) obj[k] = v;
          localStorage.setItem('unwatchd_movie_imdb_ids', JSON.stringify(obj));
        } catch (e) { logIgnored('saveMovieToImdbIdMap', e); }
      }, 300);
    }

    function getStoredImdbId(mediaType, movieId) {
      if (!movieId) return null;
      const key = `${mediaType || 'movie'}_${movieId}`;
      if (movieToImdbIdMap.has(key)) return movieToImdbIdMap.get(key);
      try {
        const stored = localStorage.getItem('unwatchd_movie_imdb_ids');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed[key]) {
            movieToImdbIdMap.set(key, parsed[key]);
            return parsed[key];
          }
        }
      } catch (e) { logIgnored('getStoredImdbId', e); }
      return null;
    }

    function getStoredImdbRating(imdbId) {
      if (!imdbId) return null;
      return imdbRatingCache.get(imdbId) || null;
    }

    async function saveScanToStorage(movies, isFriendMatch) {
      if (!Array.isArray(movies)) return;
      assignUniqueScannedSlugs(movies);
      movies.forEach(m => {
        if (!m.imdbId) m.imdbId = getStoredImdbId(m.mediaType, m.id);
        if (m.imdbId && !movieToImdbIdMap.has(`${m.mediaType || 'movie'}_${m.id}`)) {
          movieToImdbIdMap.set(`${m.mediaType || 'movie'}_${m.id}`, m.imdbId);
        }
        if (!m.imdbRating && m.imdbId) {
          const r = getStoredImdbRating(m.imdbId);
          if (r) {
            m.imdbRating = r;
            m.rating = r;
          }
        }
      });
      try {
        const db = await openDB();
        if (db) {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put({ movies, isFriendMatch, timestamp: Date.now() }, 'last_scan');
        }
      } catch (err) { console.warn('IndexedDB save error:', err); }

      try {
        localStorage.setItem('ps_last_scan', JSON.stringify(movies));
      } catch (err) {
        try {
          const compact = movies.map(m => {
            const effectiveImdbId = m.imdbId || getStoredImdbId(m.mediaType, m.id) || null;
            return {
              id: m.id, mediaType: m.mediaType, title: m.title, poster: m.poster,
              backdrop: m.backdrop, rating: m.rating, releaseDate: m.releaseDate,
              popularity: m.popularity || 0, vote_count: m.vote_count || 0,
              genreIds: m.genreIds, url: m.url, allProviders: m.allProviders,
              slug: m.slug || null,
              imdbId: effectiveImdbId,
              imdbRating: m.imdbRating || (effectiveImdbId ? getStoredImdbRating(effectiveImdbId) : null) || null
            };
          });
          localStorage.setItem('ps_last_scan', JSON.stringify(compact));
        } catch (e2) { console.warn('[Compact Scan Storage localStorage Write]', e2); }
      }
    }

    async function loadScanFromStorage() {
      try {
        const db = await openDB();
        if (db) {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const data = await new Promise((resolve) => {
            const req = store.get('last_scan');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          });
          if (data && data.movies && Array.isArray(data.movies) && data.movies.length > 0) {
            data.movies.forEach(m => {
              if (!m.imdbId) m.imdbId = getStoredImdbId(m.mediaType, m.id);
              if (!m.imdbRating && m.imdbId) {
                const r = getStoredImdbRating(m.imdbId);
                if (r) { m.imdbRating = r; m.rating = r; }
              }
            });
            return data;
          }
        }
      } catch (err) { console.warn('[Scan Storage IndexedDB Read]', err); }

      const cachedScan = localStorage.getItem('ps_last_scan');
      if (cachedScan) {
        try {
          const movies = JSON.parse(cachedScan);
          if (Array.isArray(movies) && movies.length > 0) {
            movies.forEach(m => {
              if (!m.imdbId) m.imdbId = getStoredImdbId(m.mediaType, m.id);
              if (!m.imdbRating && m.imdbId) {
                const r = getStoredImdbRating(m.imdbId);
                if (r) { m.imdbRating = r; m.rating = r; }
              }
            });
            return { movies, isFriendMatch: localStorage.getItem('ps_is_friend_match_active') === 'true' };
          }
        } catch (e) { console.warn('[Scan Storage localStorage Read]', e); }
      }
      return null;
    }

    async function clearScanStorage() {
      try {
        const db = await openDB();
        if (db) {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.delete('last_scan');
        }
      } catch (err) { console.warn('[Scan Storage Clear]', err); }
      localStorage.removeItem('ps_last_scan');
      localStorage.removeItem('ps_is_friend_match_active');
    }

    loadScanFromStorage().then(scanData => {
      if (scanData && scanData.movies && scanData.movies.length > 0) {
        scannedMovies = scanData.movies;
        assignUniqueScannedSlugs(scannedMovies);
        scannedMovies.forEach(m => {
          const key = `${m.mediaType || 'movie'}_${m.id}`;
          if (!m.imdbId) {
            const mapped = movieToImdbIdMap.get(key) || movieDetailsCache.get(key)?.external_ids?.imdb_id;
            if (mapped) m.imdbId = mapped;
          }
          const iId = m.imdbId || m.imdb_id;
          if (iId && imdbRatingCache.has(iId)) {
            const r = imdbRatingCache.get(iId);
            m.imdbRating = r;
            m.rating = r;
          }
        });
        if (scanData.isFriendMatch !== undefined) {
          isFriendMatchActive = scanData.isFriendMatch;
        } else {
          isFriendMatchActive = localStorage.getItem('ps_is_friend_match_active') === 'true';
        }
        const renderCachedGallery = () => {
          try {
            populateFilterDropdowns();
            updateStats();
            applyFiltersAndRender();
            if (el.resultsSection) el.resultsSection.classList.remove('hidden');
            toggleClearSyncBtn();
            syncWatchlistImdbRatings(scannedMovies);
          } catch (e) { console.warn('[Cached Gallery Render]', e); }
        };
        if (document.readyState === 'complete') {
          renderCachedGallery();
        } else {
          window.addEventListener('load', renderCachedGallery, { once: true });
        }
      }
    });
    let isUserScrolling = false;
    let scrollEndTimer = null;
    window.addEventListener('scroll', () => {
      isUserScrolling = true;
      if (scrollEndTimer) clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(() => { isUserScrolling = false; }, 100);
    }, { passive: true });

    function apply3DTilt(cardElement) {
      if (isMobile) return;
      let rafId = null;
      cardElement.addEventListener('mousemove', (e) => {
        if (isUserScrolling || rafId) return;
        const w = cardElement.offsetWidth || 180;
        const h = cardElement.offsetHeight || 270;
        const x = e.offsetX !== undefined ? e.offsetX : w / 2;
        const y = e.offsetY !== undefined ? e.offsetY : h / 2;
        rafId = requestAnimationFrame(() => {
          const rotateX = ((y - (h / 2)) / (h / 2)) * -10;
          const rotateY = ((x - (w / 2)) / (w / 2)) * 10;
          cardElement.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03, 1.03, 1.03)`;
          rafId = null;
        });
      }, { passive: true });
      cardElement.addEventListener('mouseleave', () => {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        cardElement.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
      });
    }
    const movieDetailsCache = new Map();
    const preloadedImagesSet = new Set();

    function preloadImage(url) {
      if (!url || preloadedImagesSet.has(url)) return;
      preloadedImagesSet.add(url);
      const img = new Image();
      img.src = url;
    }

    function getTextlessPosterUrl(details, fallbackPoster = null) {
      if (details && details.images && Array.isArray(details.images.posters)) {
        const noLangPosters = details.images.posters.filter(p => !p.iso_639_1 || p.iso_639_1 === 'null' || p.iso_639_1 === 'xx');
        if (noLangPosters.length > 0) {
          return "https://image.tmdb.org/t/p/w780" + noLangPosters[0].file_path;
        }
      }
      if (details && details.poster_path) {
        return "https://image.tmdb.org/t/p/w780" + details.poster_path;
      }
      return fallbackPoster || null;
    }

    async function getFullMovieDetails(movieId, mediaType = 'movie') {
      const cacheKey = `${mediaType}_${movieId}`;
      if (movieDetailsCache.has(cacheKey)) {
        const cached = movieDetailsCache.get(cacheKey);
        if (cached && (cached.credits || cached.aggregate_credits) && (cached.recommendations || cached.similar)) {
          return cached;
        }
      }
      const appendParams = mediaType === 'tv'
        ? 'credits,aggregate_credits,videos,external_ids,recommendations,similar,watch/providers,images'
        : 'credits,videos,external_ids,recommendations,similar,watch/providers,images';
      const url = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${movieId}?api_key=${TMDB_API_KEY}&append_to_response=${appendParams}&include_image_language=en,null,sv`;
      try {
        const res = await tmdbFetch(url);
        const data = await res.json();
        if (data && data.id) {
          movieDetailsCache.set(cacheKey, data);
          if (data.external_ids?.imdb_id) {
            fetchImdbRating(data.external_ids.imdb_id, mediaType === 'tv');
          }
          if (data.backdrop_path) preloadImage(`https://image.tmdb.org/t/p/w1280${data.backdrop_path}`);
          const textless = getTextlessPosterUrl(data, data.poster_path ? `https://image.tmdb.org/t/p/w780${data.poster_path}` : null);
          if (textless) preloadImage(textless);
          else if (data.poster_path) preloadImage(`https://image.tmdb.org/t/p/w500${data.poster_path}`);
        }
        return data;
      } catch (e) {
        console.warn('[Full Movie Details Fetch]', e);
        return null;
      }
    }

    const imdbNoRatingSet = new Set();
    const imdbFetchPromises = new Map();
    async function fetchImdbRating(imdbId, isTv = false) {
      if (!imdbId) return null;
      if (imdbRatingCache.has(imdbId)) return imdbRatingCache.get(imdbId);
      if (imdbNoRatingSet.has(imdbId)) return null;
      if (imdbFetchPromises.has(imdbId)) return imdbFetchPromises.get(imdbId);

      const promise = (async () => {
        try {
          const type = isTv ? 'series' : 'movie';
          const fetchWithTimeout = async (url) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 4000);
            try {
              const res = await fetch(url, { signal: controller.signal });
              clearTimeout(timer);
              return res;
            } catch (err) {
              clearTimeout(timer);
              return null;
            }
          };

          // A timeout or server error is not the same as "this title has no rating":
          // only remember a title as unrated when Cinemeta actually answered.
          const isTransientFailure = (r) => !r || (!r.ok && r.status !== 404);
          let res = await fetchWithTimeout(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`);
          let transientFailure = isTransientFailure(res);
          let data = res && res.ok ? await res.json().catch(() => null) : null;
          let rating = data?.meta?.imdbRating ? String(data.meta.imdbRating) : null;

          if (!rating) {
            const altType = isTv ? 'movie' : 'series';
            const altRes = await fetchWithTimeout(`https://v3-cinemeta.strem.io/meta/${altType}/${imdbId}.json`);
            transientFailure = transientFailure || isTransientFailure(altRes);
            if (altRes && altRes.ok) {
              const altData = await altRes.json().catch(() => null);
              rating = altData?.meta?.imdbRating ? String(altData.meta.imdbRating) : null;
            }
          }

          if (rating) {
            setImdbRating(imdbId, rating);
            saveImdbRatingCache();
            return rating;
          } else {
            if (!transientFailure) imdbNoRatingSet.add(imdbId);
            return null;
          }
        } catch (e) {
          console.warn('[IMDb Rating Fetch Error]', e);
          return null;
        } finally {
          imdbFetchPromises.delete(imdbId);
        }
      })();

      imdbFetchPromises.set(imdbId, promise);
      return promise;
    }

    async function resolveImdbRatingBadges(imdbId, isTvMedia = false) {
      if (!imdbId) return;
      const rating = await fetchImdbRating(imdbId, isTvMedia);
      const badges = document.querySelectorAll(`.imdb-rating-badge[data-imdb-id="${imdbId}"]`);
      badges.forEach(badge => {
        if (rating) {
          const numEl = badge.querySelector('.imdb-rating-num');
          if (numEl) {
            numEl.textContent = rating;
            numEl.classList.remove('animate-pulse');
          }
          badge.title = `IMDb Rating: ${rating}/10`;
        } else {
          badge.remove();
          document.querySelectorAll('.rating-sep').forEach(s => s.remove());
        }
      });
      if (rating) {
        if (window.currentMoviePageObj && (window.currentMoviePageObj.imdbId === imdbId || window.currentMoviePageDetails?.external_ids?.imdb_id === imdbId)) {
          window.currentMoviePageObj.imdbRating = rating;
          window.currentMoviePageObj.rating = rating;
          updatePosterRatingBadgeInDom(window.currentMoviePageObj.id, rating, true, imdbId);
        }
        updatePosterRatingBadgeInDom(imdbId, rating, true);
      }
    }

    function updatePosterRatingBadgeInDom(movieIdOrImdbId, rating, _unused = true, knownImdbId = '') {
      if (!movieIdOrImdbId || !rating) return;
      const idStr = String(movieIdOrImdbId);
      const isTt = idStr.startsWith('tt');
      let imdbIdStr = knownImdbId ? String(knownImdbId) : (isTt ? idStr : (movieToImdbIdMap.get(`movie_${idStr}`) || movieToImdbIdMap.get(`tv_${idStr}`) || ''));

      let reverseMovieId = '';
      if (isTt) {
        for (const [k, v] of movieToImdbIdMap.entries()) {
          if (v === idStr) {
            reverseMovieId = k.replace(/^(movie|tv)_/, '');
            break;
          }
        }
      }

      const selectorList = [];
      if (isTt) {
        selectorList.push(`.poster-rating-badge[data-imdb-id="${idStr}"]`);
        if (reverseMovieId) {
          selectorList.push(`#poster-rating-${reverseMovieId}`);
          selectorList.push(`.poster-rating-badge[data-movie-id="${reverseMovieId}"]`);
        }
      } else {
        selectorList.push(`#poster-rating-${idStr}`);
        selectorList.push(`.poster-rating-badge[data-movie-id="${idStr}"]`);
        if (imdbIdStr) {
          selectorList.push(`.poster-rating-badge[data-imdb-id="${imdbIdStr}"]`);
        }
      }

      const badges = document.querySelectorAll(selectorList.join(', '));
      if (badges.length > 0) {
        badges.forEach(b => {
          b.dataset.ratingSource = 'imdb';
          if (imdbIdStr) b.dataset.imdbId = imdbIdStr;
          b.title = `IMDb Rating: ${rating}/10`;
          const valEl = b.querySelector('.poster-rating-val');
          if (valEl) valEl.textContent = rating;
        });
      } else if (!isTt) {
        const card = document.querySelector(`[data-movie-card-id="${idStr}"]`);
        if (card && !card.querySelector('.poster-rating-badge')) {
          const badge = document.createElement('div');
          badge.id = `poster-rating-${idStr}`;
          badge.className = 'poster-corner-badge poster-rating-badge';
          badge.dataset.movieId = idStr;
          badge.dataset.ratingSource = 'imdb';
          if (imdbIdStr) badge.dataset.imdbId = imdbIdStr;
          badge.title = `IMDb Rating: ${rating}/10`;
          const tagHtml = IMDB_TAG_HTML;
          badge.innerHTML = `${tagHtml}<span class="poster-rating-val font-black text-white text-[11px] sm:text-xs leading-none tracking-tight">${rating}</span>`;
          card.appendChild(badge);
        }
      }
    }

    const imdbQueue = [];
    let activeImdbWorkers = 0;
    const MAX_CONCURRENT_IMDB_REQUESTS = 4;
    const queuedMovieKeys = new Set();

    function enqueueImdbResolution(movieObj, priority = false) {
      if (!movieObj || !movieObj.id) return;
      const mediaType = movieObj.mediaType || movieObj.media_type || (movieObj.name && !movieObj.title ? 'tv' : 'movie');
      movieObj.mediaType = mediaType;
      const key = `${mediaType}_${movieObj.id}`;

      const imdbId = movieObj.imdbId || movieObj.imdb_id || getStoredImdbId(mediaType, movieObj.id);
      if (imdbId && imdbRatingCache.has(imdbId)) {
        const cached = imdbRatingCache.get(imdbId);
        movieObj.imdbRating = cached;
        movieObj.rating = cached;
        return;
      }
      if (movieObj.imdbRating) return;

      if (queuedMovieKeys.has(key)) return;
      queuedMovieKeys.add(key);

      const item = { movieObj, key, mediaType, imdbId: imdbId || '' };
      if (priority) {
        imdbQueue.unshift(item);
      } else {
        imdbQueue.push(item);
      }
      processImdbQueue();
    }

    async function processImdbQueue() {
      if (activeImdbWorkers >= MAX_CONCURRENT_IMDB_REQUESTS || imdbQueue.length === 0) return;
      activeImdbWorkers++;
      const item = imdbQueue.shift();
      try {
        await resolveMovieImdbWorker(item);
      } catch (e) {
      } finally {
        activeImdbWorkers--;
        setTimeout(processImdbQueue, 35);
      }
    }

    async function resolveMovieImdbWorker({ movieObj, key, mediaType, imdbId }) {
      try {
        let iId = imdbId || movieObj.imdbId || movieObj.imdb_id || getStoredImdbId(mediaType, movieObj.id);
        if (!iId) {
          const cachedDetails = movieDetailsCache.get(key);
          if (cachedDetails?.external_ids?.imdb_id) {
            iId = cachedDetails.external_ids.imdb_id;
          }
        }
        if (!iId) {
          const res = await tmdbFetch(`https://api.themoviedb.org/3/${mediaType}/${movieObj.id}/external_ids?api_key=${TMDB_API_KEY}`);
          if (res.ok) {
            const data = await res.json().catch(() => null);
            if (data?.imdb_id) {
              iId = data.imdb_id;
            }
          }
        }
        if (iId) {
          movieObj.imdbId = iId;
          movieToImdbIdMap.set(key, iId);
          saveMovieToImdbIdMap();
          const rating = await fetchImdbRating(iId, mediaType === 'tv');
          if (rating) {
            movieObj.imdbRating = rating;
            movieObj.rating = rating;
            updatePosterRatingBadgeInDom(movieObj.id, rating, true, iId);
            updatePosterRatingBadgeInDom(iId, rating, true);
            const sm = scannedMovies.find(m => m.id === movieObj.id && (m.mediaType || 'movie') === mediaType);
            if (sm) {
              sm.imdbId = iId;
              sm.imdbRating = rating;
              sm.rating = rating;
            }
            if (window.homeFilterRating && window.homeFilterRating !== 'all') debouncedApplyFilters();
            if (window.actorFilterRating && window.actorFilterRating !== 'all') debouncedRefreshActorGrid();
          }
        }
      } catch (err) {
        console.warn('[resolveMovieImdbWorker Error]', err);
      } finally {
        queuedMovieKeys.delete(key);
      }
    }

    function getPosterRatingData(movieObj) {
      if (!movieObj) return null;
      const mediaType = movieObj.mediaType || movieObj.media_type || (movieObj.name && !movieObj.title ? 'tv' : 'movie');
      movieObj.mediaType = mediaType;
      const imdbId = movieObj.imdbId || movieObj.imdb_id || getStoredImdbId(mediaType, movieObj.id);
      if (imdbId) {
        const r = getStoredImdbRating(imdbId);
        if (r) {
          movieObj.imdbRating = r;
          movieObj.rating = r;
          return { rating: r, isImdb: true, imdbId };
        }
      }
      if (movieObj.imdbRating) {
        return { rating: String(movieObj.imdbRating), isImdb: true, imdbId: imdbId || '' };
      }
      const key = `${mediaType}_${movieObj.id}`;
      const cachedDetails = movieDetailsCache.get(key);
      const detailsImdbId = cachedDetails?.external_ids?.imdb_id;
      if (detailsImdbId) {
        const r = getStoredImdbRating(detailsImdbId);
        if (r) {
          movieObj.imdbRating = r;
          movieObj.rating = r;
          return { rating: r, isImdb: true, imdbId: detailsImdbId };
        }
      }

      // Enqueue for background resolution
      enqueueImdbResolution(movieObj, false);
      return null;
    }

    function renderPosterRatingBadgeHtml(movieObj) {
      if (!movieObj) return '';
      const data = getPosterRatingData(movieObj);
      if (!data || !data.rating) return '';
      const tagHtml = IMDB_TAG_HTML;
      const imdbAttr = data.imdbId ? ` data-imdb-id="${data.imdbId}"` : '';
      const sourceAttr = ' data-rating-source="imdb"';
      const titleAttr = `IMDb Rating: ${data.rating}/10`;
      return `<div class="poster-corner-badge poster-rating-badge" data-movie-id="${movieObj.id}"${imdbAttr}${sourceAttr} title="${titleAttr}">${tagHtml}<span class="poster-rating-val font-black text-white text-[11px] sm:text-xs leading-none tracking-tight">${data.rating}</span></div>`;
    }

    let debouncedApplyFiltersTimer = null;
    function debouncedApplyFilters() {
      if (debouncedApplyFiltersTimer) clearTimeout(debouncedApplyFiltersTimer);
      debouncedApplyFiltersTimer = setTimeout(() => {
        debouncedApplyFiltersTimer = null;
        try { applyFiltersAndRender(); } catch (e) { logIgnored('debouncedApplyFilters', e); }
      }, 150);
    }

    let debouncedRefreshActorGridTimer = null;
    function debouncedRefreshActorGrid() {
      if (debouncedRefreshActorGridTimer) clearTimeout(debouncedRefreshActorGridTimer);
      debouncedRefreshActorGridTimer = setTimeout(() => {
        debouncedRefreshActorGridTimer = null;
        try { refreshActorFilmographyGrid(); } catch (e) { logIgnored('debouncedRefreshActorGrid', e); }
      }, 150);
    }

    let isSyncingWatchlistRatings = false;
    async function syncWatchlistImdbRatings(movies) {
      if (!Array.isArray(movies) || movies.length === 0 || isSyncingWatchlistRatings) return;
      isSyncingWatchlistRatings = true;

      try {
        let anyUpdatedFromCache = false;
        movies.forEach(m => {
          const mediaType = m.mediaType === 'tv' ? 'tv' : 'movie';
          const key = `${mediaType}_${m.id}`;
          if (!m.imdbId) {
            const mappedId = movieToImdbIdMap.get(key) || movieDetailsCache.get(key)?.external_ids?.imdb_id;
            if (mappedId) m.imdbId = mappedId;
          }
          const iId = m.imdbId || m.imdb_id;
          if (iId && imdbRatingCache.has(iId)) {
            const cached = imdbRatingCache.get(iId);
            if (m.imdbRating !== cached) {
              m.imdbRating = cached;
              m.rating = cached;
              anyUpdatedFromCache = true;
              updatePosterRatingBadgeInDom(m.id, cached);
            }
          }
        });
        if (anyUpdatedFromCache) {
          if ((window.homeFilterRating && window.homeFilterRating !== 'all') || (window.homeFilterSort === 'rating_desc')) {
            debouncedApplyFilters();
          }
        }

        const needingRating = movies.filter(m => {
          const key = `${m.mediaType === 'tv' ? 'tv' : 'movie'}_${m.id}`;
          const iId = m.imdbId || m.imdb_id || movieToImdbIdMap.get(key);
          if (!iId) return true;
          return !imdbRatingCache.has(iId);
        });

        if (needingRating.length === 0) return;

        // Prioritize currently visible cards first for instant responsiveness
        const visibleList = (currentGroupedResults && currentGroupedResults[activeTab]) ? currentGroupedResults[activeTab] : movies.slice(0, 24);
        const visibleIds = new Set(visibleList.map(m => m.id));
        needingRating.sort((a, b) => {
          const aVis = visibleIds.has(a.id) ? 0 : 1;
          const bVis = visibleIds.has(b.id) ? 0 : 1;
          return aVis - bVis;
        });

        const CHUNK_SIZE = 6;
        let anyNewSynced = false;
        for (let i = 0; i < needingRating.length; i += CHUNK_SIZE) {
          const chunk = needingRating.slice(i, i + CHUNK_SIZE);
          let chunkHasNewRatings = false;

          await Promise.all(chunk.map(async (m) => {
            try {
              const mediaType = m.mediaType === 'tv' ? 'tv' : 'movie';
              const key = `${mediaType}_${m.id}`;
              let iId = m.imdbId || m.imdb_id || movieToImdbIdMap.get(key);
              if (!iId) {
                const cached = movieDetailsCache.get(key);
                if (cached?.external_ids?.imdb_id) {
                  iId = cached.external_ids.imdb_id;
                  m.imdbId = iId;
                  movieToImdbIdMap.set(key, iId);
                } else {
                  const res = await tmdbFetch(`https://api.themoviedb.org/3/${mediaType}/${m.id}/external_ids?api_key=${TMDB_API_KEY}`);
                  const data = await res.json().catch(() => ({}));
                  if (data?.imdb_id) {
                    iId = data.imdb_id;
                    m.imdbId = iId;
                    movieToImdbIdMap.set(key, iId);
                  }
                }
              }

              if (iId) {
                const isTv = mediaType === 'tv';
                const r = await fetchImdbRating(iId, isTv);
                if (r) {
                  m.imdbRating = r;
                  m.rating = r;
                  chunkHasNewRatings = true;
                  anyNewSynced = true;
                  updatePosterRatingBadgeInDom(m.id, r);
                }
              }
            } catch (e) { logIgnored('syncWatchlistImdbRatings', e); }
          }));

          if (chunkHasNewRatings) {
            saveImdbRatingCache();
            saveMovieToImdbIdMap();
          }
          // Non-blocking gentle pause so the main thread & scrolling stay butter smooth
          await new Promise(r => setTimeout(r, 100));
        }

        if (anyNewSynced) {
          saveScanToStorage(movies, isFriendMatchActive);
          updateStats();
          if ((window.homeFilterRating && window.homeFilterRating !== 'all') || (window.homeFilterSort === 'rating_desc')) {
            debouncedApplyFilters();
          }
        }
      } catch (err) {
        console.warn('[Sync Watchlist IMDb Ratings Error]', err);
      } finally {
        isSyncingWatchlistRatings = false;
      }
    }

    async function ensureActorRatingsFetched(movies) {
      if (!Array.isArray(movies) || movies.length === 0) return;
      const missing = movies.filter(m => {
        const iId = m.imdbId || m.imdb_id;
        return !iId || !imdbRatingCache.has(iId);
      });
      if (missing.length === 0) return;

      for (let i = 0; i < missing.length; i += 10) {
        const chunk = missing.slice(i, i + 10);
        let hadNew = false;
        await Promise.all(chunk.map(async (m) => {
          try {
            let iId = m.imdbId || m.imdb_id;
            const mediaType = m.mediaType === 'tv' ? 'tv' : 'movie';
            if (!iId) {
              const cached = movieDetailsCache.get(`${mediaType}_${m.id}`);
              if (cached?.external_ids?.imdb_id) {
                iId = cached.external_ids.imdb_id;
                m.imdbId = iId;
              } else {
                const res = await tmdbFetch(`https://api.themoviedb.org/3/${mediaType}/${m.id}/external_ids?api_key=${TMDB_API_KEY}`);
                const data = await res.json().catch(() => ({}));
                if (data?.imdb_id) {
                  iId = data.imdb_id;
                  m.imdbId = iId;
                }
              }
            }
            if (iId) {
              const r = await fetchImdbRating(iId, mediaType === 'tv');
              if (r) {
                m.imdbRating = r;
                m.rating = r;
                hadNew = true;
                updatePosterRatingBadgeInDom(m.id, r);
              }
            }
          } catch (e) { logIgnored('ensureActorRatingsFetched', e); }
        }));
        if (hadNew && window.actorFilterRating && window.actorFilterRating !== 'all') {
          debouncedRefreshActorGrid();
        }
        await new Promise(r => setTimeout(r, 40));
      }
    }

    const collectionCache = new Map();
    async function getCollectionDetails(collectionId) {
      if (!collectionId) return null;
      if (collectionCache.has(collectionId)) return collectionCache.get(collectionId);
      try {
        const res = await tmdbFetch(`https://api.themoviedb.org/3/collection/${collectionId}?api_key=${TMDB_API_KEY}`);
        const data = await res.json();
        if (data && data.parts) {
          collectionCache.set(collectionId, data);
          return data;
        }
      } catch (e) {
        console.warn('[Collection Fetch]', e);
      }
      return null;
    }

    function preloadAdjacentMovies(currentList, currentIndex) {
      if (!Array.isArray(currentList) || currentIndex === -1) return;
      const indices = [currentIndex - 1, currentIndex + 1, currentIndex + 2];
      indices.forEach(idx => {
        if (idx >= 0 && idx < currentList.length) {
          const m = currentList[idx];
          if (m) {
            if (m.poster) preloadImage(m.poster);
            if (m.backdrop) preloadImage(m.backdrop);
            getFullMovieDetails(m.id, m.mediaType);
          }
        }
      });
    }

    function getBestTrailer(details) {
      if (!details || !details.videos || !Array.isArray(details.videos.results)) return null;
      const ytVideos = details.videos.results.filter(v => v.site === 'YouTube' && v.key);
      if (ytVideos.length === 0) return null;

      const badWords = /\b(audio description|audio described|descriptive audio|described video|\bad\b|commentary|narration|reaction|review|blooper|spoof|behind the scenes|featurette|interview|b-roll|lego|fan|parody|honest|concept|recap|dubbed)\b/i;
      const nonBad = ytVideos.filter(v => !badWords.test(v.name || ''));

      // A video's TMDB `type` (Trailer/Teaser) is a much more reliable signal than its name.
      // A featurette or clip can easily have a name with no blacklisted words in it (e.g. a
      // costume-department featurette), so if a real trailer/teaser exists, always prefer it.
      const trailerTypes = nonBad.filter(v => v.type === 'Trailer' || v.type === 'Teaser');
      const candidates = trailerTypes.length > 0 ? trailerTypes : (nonBad.length > 0 ? nonBad : ytVideos);
      const list = candidates;

      list.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();

        if (a.official) scoreA += 20;
        if (b.official) scoreB += 20;
        if (a.type === 'Trailer') scoreA += 15;
        if (b.type === 'Trailer') scoreB += 15;
        if (nameA.includes('official trailer')) scoreA += 10;
        if (nameB.includes('official trailer')) scoreB += 10;
        if (nameA.includes('official')) scoreA += 5;
        if (nameB.includes('official')) scoreB += 5;
        if (a.iso_639_1 === 'en') scoreA += 3;
        if (b.iso_639_1 === 'en') scoreB += 3;

        // Heavily penalize audio descriptions or commentary if any slipped through
        if (nameA.includes('audio description') || nameA.includes('descriptive') || /\bad\b/i.test(nameA)) scoreA -= 50;
        if (nameB.includes('audio description') || nameB.includes('descriptive') || /\bad\b/i.test(nameB)) scoreB -= 50;

        return scoreB - scoreA;
      });

      return list[0];
    }

    const validatedLogoCache = new Map();
    function preloadImageCheck(url, timeoutMs = 2500) {
      return new Promise((resolve) => {
        if (!url) { resolve(false); return; }
        const img = new Image();
        const timer = setTimeout(() => resolve(false), timeoutMs);
        img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 0 && img.naturalHeight > 0); };
        img.onerror = () => { clearTimeout(timer); resolve(false); };
        img.src = url;
      });
    }
