    // ── Actor Modal ──────────────────────────────────────────────────────────────
    const actorDetailsCache = new Map();
    let actorModalWatchlistMode = true;
    let actorMediaTypeFilter = 'all';
    let actorFilterQuery = '';
    let actorFilterSort = 'popularity';
    let actorFilterProviders = new Set(['all']);
    let actorFilterGenres = new Set(['all']);
    let actorFilterDecades = new Set(['all']);
    let actorFilterProvider = 'all';
    let actorFilterGenre = 'all';
    let actorFilterDecade = 'all';
    let actorFilterRating = 'all';
    let actorFilterRuntime = 'all';
    window.actorFilterRating = 'all';
    window.actorFilterRuntime = 'all';
    let actorCurrentPage = 1;
    const ACTOR_ITEMS_PER_PAGE = 60;


    async function getActorDetails(actorId) {
      if (actorDetailsCache.has(actorId)) return actorDetailsCache.get(actorId);
      const url = `https://api.themoviedb.org/3/person/${actorId}?api_key=${TMDB_API_KEY}&append_to_response=combined_credits,movie_credits,external_ids,images`;
      try {
        const res = await tmdbFetch(url);
        const data = await res.json();
        if (data && data.id) actorDetailsCache.set(actorId, data);
        return data;
      } catch (e) { console.warn('[Actor Details Fetch]', e); return null; }
    }


    function getPersonAvailableRoles(person) {
      const roles = [];
      if (!person) return ["Actor"];
      const creditsObj = person.combined_credits || person.movie_credits;
      if (!creditsObj) return ["Actor"];

      if (creditsObj.cast && creditsObj.cast.some(m => m.poster_path)) roles.push("Actor");
      if (creditsObj.crew) {
        if (creditsObj.crew.some(m => m.poster_path && (m.job === "Director" || m.department === "Directing"))) roles.push("Director");
        if (creditsObj.crew.some(m => m.poster_path && (m.department === "Writing" || m.job === "Writer" || m.job === "Screenplay" || m.job === "Story"))) roles.push("Writer");
        if (creditsObj.crew.some(m => m.poster_path && (m.department === "Production" || m.job === "Producer" || m.job === "Executive Producer"))) roles.push("Producer");
        if (creditsObj.crew.some(m => m.poster_path && (m.department === "Sound" || m.job === "Original Music Composer" || m.job === "Music" || m.job === "Composer"))) roles.push("Composer");
      }
      return roles.length > 0 ? roles : ["Actor"];
    }

    function determineActivePersonRole(person, roleHint = "") {
      const avail = getPersonAvailableRoles(person);
      if (roleHint) {
        const rNorm = roleHint.toLowerCase();
        if ((rNorm.includes("director") || rNorm.includes("directing")) && avail.includes("Director")) return "Director";
        if ((rNorm.includes("writer") || rNorm.includes("writing")) && avail.includes("Writer")) return "Writer";
        if ((rNorm.includes("producer") || rNorm.includes("production")) && avail.includes("Producer")) return "Producer";
        if ((rNorm.includes("composer") || rNorm.includes("sound") || rNorm.includes("music")) && avail.includes("Composer")) return "Composer";
        if (rNorm.includes("actor") && avail.includes("Actor")) return "Actor";
      }
      const dept = person?.known_for_department;
      if (dept === "Directing" && avail.includes("Director")) return "Director";
      if (dept === "Writing" && avail.includes("Writer")) return "Writer";
      if (dept === "Production" && avail.includes("Producer")) return "Producer";
      if (dept === "Sound" && avail.includes("Composer")) return "Composer";
      if (dept === "Acting" && avail.includes("Actor")) return "Actor";

      return avail[0] || "Actor";
    }

    function isPersonDirector(person, roleHint = '') {
      if (!person) return false;
      if (roleHint === 'Director') return true;
      if (roleHint === 'Actor') return false;
      if (person.known_for_department === 'Directing') return true;
      const directedCount = (person.movie_credits && person.movie_credits.crew)
        ? person.movie_credits.crew.filter(m => m.poster_path && m.title && m.job === 'Director').length
        : 0;
      return directedCount > 0 && person.known_for_department !== 'Acting';
    }

    function getActorMoviesList(person, showWatchlistOnly, roleHint = '') {
      const activeRole = determineActivePersonRole(person, roleHint);
      const availableRoles = getPersonAvailableRoles(person);
      let allMovies = [];
      const creditsObj = (person && person.combined_credits) ? person.combined_credits : (person ? person.movie_credits : null);
      if (!creditsObj) return { allMovies: [], watchlistMovies: [], moviesToShow: [], activeRole, availableRoles: ['Actor'] };

      const seen = new Set();
      if (activeRole === 'Actor' && creditsObj.cast) {
        creditsObj.cast.forEach(m => {
          const mTitle = m.title || m.name || m.original_name || m.original_title;
          const mediaType = m.media_type || (m.first_air_date ? 'tv' : 'movie');
          const key = `${mediaType}-${m.id}`;
          if (m.poster_path && mTitle && !seen.has(key)) {
            const gIds = m.genre_ids || [];
            const isTalkOrNews = gIds.includes(10767) || gIds.includes(10763);
            const charStr = (m.character || '').trim();
            const isSelfGuest = mediaType === 'tv' && (
              charStr === 'Self' ||
              charStr === 'Himself' ||
              charStr === 'Herself' ||
              charStr.startsWith('Self -') ||
              charStr.includes('archive footage')
            );
            if (mediaType === 'tv' && (isTalkOrNews || isSelfGuest)) {
              return;
            }
            seen.add(key);
            allMovies.push({
              ...m,
              mediaType: mediaType,
              title: mTitle,
              release_date: m.release_date || m.first_air_date || ''
            });
          }
        });
      } else if (creditsObj.crew) {
        creditsObj.crew.forEach(m => {
          const mTitle = m.title || m.name || m.original_name || m.original_title;
          const mediaType = m.media_type || (m.first_air_date ? 'tv' : 'movie');
          const key = `${mediaType}-${m.id}`;
          if (!m.poster_path || !mTitle || seen.has(key)) return;

          let match = false;
          const dept = (m.department || '').toLowerCase();
          const job = (m.job || '').toLowerCase();

          if (activeRole === 'Director') match = job === 'director' || dept === 'directing';
          else if (activeRole === 'Writer') match = dept === 'writing' || job === 'writer' || job === 'screenplay' || job === 'story';
          else if (activeRole === 'Producer') match = dept === 'production' || job === 'producer' || job === 'executive producer';
          else if (activeRole === 'Composer') match = dept === 'sound' || job === 'original music composer' || job === 'composer' || job === 'music';

          if (match) {
            seen.add(key);
            allMovies.push({
              ...m,
              mediaType: mediaType,
              title: mTitle,
              release_date: m.release_date || m.first_air_date || ''
            });
          }
        });
      }
      const watchlistKeySet = new Set(scannedMovies.map(m => `${m.mediaType || 'movie'}-${m.id}`));
      const watchlistMovies = allMovies.filter(m => watchlistKeySet.has(`${m.mediaType || 'movie'}-${m.id}`));

      function filterActorMovieItem(m) {
        if (actorFilterQuery) {
          const q = normalizeTitle(actorFilterQuery);
          const titleStr = m.title || m.name || '';
          if (!normalizeTitle(titleStr).includes(q)) return false;
        }

        // Genre multi-select
        if (actorFilterGenres && !actorFilterGenres.has('all') && actorFilterGenres.size > 0) {
          const gIds = m.genre_ids || (m.genres ? m.genres.map(g => g.id) : []);
          const matchG = gIds.some(gid => actorFilterGenres.has(GENRE_MAP[gid]) || actorFilterGenres.has(String(gid)));
          if (!matchG) return false;
        }

        // Decade multi-select
        if (actorFilterDecades && !actorFilterDecades.has('all') && actorFilterDecades.size > 0) {
          const dateStr = m.release_date || m.first_air_date || '';
          if (!dateStr) return false;
          const year = parseInt(dateStr.split('-')[0], 10);
          if (isNaN(year)) return false;
          const decStr = String(Math.floor(year / 10) * 10);
          const matchD = actorFilterDecades.has(decStr) || actorFilterDecades.has(`${decStr}s`) || (year < 1950 && actorFilterDecades.has('older'));
          if (!matchD) return false;
        }

        // Rating
        if (actorFilterRating && actorFilterRating !== 'all') {
          const minR = parseFloat(actorFilterRating);
          const r = parseFloat(getCachedRating(m) || 0);
          if (r < minR) return false;
        }

        // Provider multi-select
        if (actorFilterProviders && !actorFilterProviders.has('all') && actorFilterProviders.size > 0) {
          const cachedDetails = movieDetailsCache.get(`${m.mediaType || 'movie'}_${m.id}`);
          const allProv = m.allProviders || cachedDetails?.['watch/providers']?.results || null;
          if (!allProv && !m.regionData) return false;

          let isMatch = false;
          if (actorFilterProviders.has('vpn')) {
            const tempObj = { ...m, allProviders: allProv, regionData: m.regionData || (allProv ? allProv[currentRegion] : null) };
            const vpn = findVpnMatch(tempObj);
            if (vpn) isMatch = true;
          }

          if (!isMatch) {
            const localData = allProv ? (allProv[currentRegion] || null) : (m.regionData || null);
            const flatrate = localData?.flatrate || [];

            for (const provName of actorFilterProviders) {
              if (provName === 'vpn') continue;
              const pNorm = provName.toLowerCase();
              const hasLocal = flatrate.some(p => {
                const pn = (p.provider_name || p.name || '').toLowerCase();
                return pn === pNorm || pn.includes(pNorm);
              });
              if (hasLocal) {
                isMatch = true;
                break;
              }
              if (vpnModeEnabled && allProv) {
                for (const code of Object.keys(REGION_META)) {
                  if (code === currentRegion || !allProv[code]) continue;
                  const altFlat = allProv[code]?.flatrate || [];
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
          if (!isMatch) return false;
        }

        // Runtime
        if (window.actorFilterRuntime && window.actorFilterRuntime !== 'all') {
          const cachedDetails = movieDetailsCache.get(`${m.mediaType || 'movie'}_${m.id}`);
          const runVal = m.runtime || (cachedDetails?.runtime) || (m.episode_run_time ? m.episode_run_time[0] : 0) || (cachedDetails?.episode_run_time?.[0]) || (cachedDetails?.last_episode_to_air?.runtime) || 0;
          if (runVal <= 0) return false;
          if (window.actorFilterRuntime === 'short' && runVal >= 90) return false;
          if (window.actorFilterRuntime === 'medium' && (runVal < 90 || runVal > 120)) return false;
          if (window.actorFilterRuntime === 'long' && runVal <= 120) return false;
        }
        return true;
      }

      const filteredAll = allMovies.filter(filterActorMovieItem);
      const filteredWatchlist = watchlistMovies.filter(filterActorMovieItem);
      const filteredMovie = filteredAll.filter(m => m.mediaType === 'movie');
      const filteredTv = filteredAll.filter(m => m.mediaType === 'tv');

      let moviesToShow = filteredAll;
      if (actorMediaTypeFilter === 'watchlist') {
        moviesToShow = filteredWatchlist;
      } else if (actorMediaTypeFilter === 'movie') {
        moviesToShow = filteredMovie;
      } else if (actorMediaTypeFilter === 'tv') {
        moviesToShow = filteredTv;
      }

      const counts = {
        watchlist: filteredWatchlist.length,
        movie: filteredMovie.length,
        tv: filteredTv.length,
        all: filteredAll.length
      };

      // Apply sort
      moviesToShow = [...moviesToShow];
      switch (actorFilterSort) {
        case 'az': moviesToShow.sort((a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || '')); break;
        case 'za': moviesToShow.sort((a, b) => (b.title || b.name || '').localeCompare(a.title || a.name || '')); break;
        case 'rating_desc': moviesToShow.sort((a, b) => {
          const rA = parseFloat(getCachedRating(a) || 0);
          const rB = parseFloat(getCachedRating(b) || 0);
          return rB - rA;
        }); break;
        case 'year_asc': moviesToShow.sort((a, b) => (a.release_date || a.first_air_date || '9999').localeCompare(b.release_date || b.first_air_date || '9999')); break;
        case 'popularity': moviesToShow.sort((a, b) => (b.popularity || 0) - (a.popularity || 0)); break;
        case 'year_desc':
        default: moviesToShow.sort((a, b) => (b.release_date || b.first_air_date || '0').localeCompare(a.release_date || a.first_air_date || '0')); break;
      }

      return { allMovies, watchlistMovies, moviesToShow, activeRole, availableRoles, counts };
    }



    function renderActorPaginationHtml(currentPage, maxPage) {
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
          return `<button type="button" onclick="setActorPage(${page})" class="w-9 h-9 flex items-center justify-center rounded-full liquid-glass text-white font-bold text-sm transition-all active:scale-95 cursor-pointer">${text}</button>`;
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

      return `<div class="col-span-full flex items-center justify-center gap-1.5 sm:gap-2 mt-4 sm:mt-6 pb-2 select-none">${btnsHtml}</div>`;
    }

    function buildActorFilmographyGridHtml(person, showWatchlistOnly, roleHint = '', isModal = true, isPage = false) {
      const isDirector = isPersonDirector(person, roleHint);
      const { allMovies, watchlistMovies, moviesToShow, activeRole, availableRoles, counts } = getActorMoviesList(person, showWatchlistOnly, roleHint);
      const watchlistKeySet = new Set(scannedMovies.map(m => `${m.mediaType || 'movie'}-${m.id}`));

      const ACTOR_ITEMS_PER_PAGE = 60;
      const maxActorPage = Math.ceil(moviesToShow.length / ACTOR_ITEMS_PER_PAGE) || 1;
      if (actorCurrentPage > maxActorPage) actorCurrentPage = maxActorPage;
      const startIdx = (actorCurrentPage - 1) * ACTOR_ITEMS_PER_PAGE;
      const pageMovies = moviesToShow.slice(startIdx, startIdx + ACTOR_ITEMS_PER_PAGE);

      let filmographyHtml = '';
      if (moviesToShow.length === 0) {
        const isFiltered = actorFilterQuery || (!actorFilterProviders.has('all') && actorFilterProviders.size > 0) || (!actorFilterGenres.has('all') && actorFilterGenres.size > 0) || (!actorFilterDecades.has('all') && actorFilterDecades.size > 0) || (actorFilterRating && actorFilterRating !== 'all') || (actorFilterRuntime && actorFilterRuntime !== 'all');
        let emptyIcon = isFiltered ? '🔍' : (actorMediaTypeFilter === 'watchlist' ? '📋' : (actorMediaTypeFilter === 'tv' ? '📺' : '🎬'));
        let emptyMsg = 'No credits found';
        let emptySub = 'Nothing landed here for your current selection.';
        if (isFiltered) {
          emptyMsg = 'No titles match your filters';
          emptySub = 'Try a different search, genre, or decade.';
        } else if (actorMediaTypeFilter === 'watchlist') {
          emptyMsg = `No watchlist titles found`;
          emptySub = `No titles from your scanned watchlist for this ${activeRole.toLowerCase()}.`;
        } else if (actorMediaTypeFilter === 'movie') {
          emptyMsg = `No films found`;
          emptySub = `No feature films listed for this ${activeRole.toLowerCase()}.`;
        } else if (actorMediaTypeFilter === 'tv') {
          emptyMsg = `No series found`;
          emptySub = `No television series listed for this ${activeRole.toLowerCase()}.`;
        } else {
          emptyMsg = `No credits found`;
          emptySub = `No available credits for this ${activeRole.toLowerCase()}.`;
        }
        filmographyHtml = `<div class="col-span-full flex flex-col items-center justify-center min-h-[260px] text-gray-500 gap-2 text-center py-10"><span class="text-3xl opacity-60">${emptyIcon}</span><span class="font-bold uppercase tracking-widest text-sm text-gray-400">${emptyMsg}</span><span class="text-xs text-gray-600 font-medium normal-case tracking-normal">${emptySub}</span></div>`;
      } else {
        pageMovies.forEach((m, idx) => {
          const mTitle = escapeHTML(m.title);
          const mYear = m.release_date ? m.release_date.split('-')[0] : '';
          const mPoster = m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null;
          const mChar = m.character ? escapeHTML(m.character) : '';
          const isInWatchlist = watchlistKeySet.has(`${m.mediaType || 'movie'}-${m.id}`);
          const mediaBadge = m.mediaType === 'tv' ? ' · TV Series' : '';
          const roleStr = isDirector ? 'Director' : (mChar ? mChar : '');
          const subtext = `${mYear ? mYear : ''}${mediaBadge}${roleStr ? ' · ' + roleStr : ''}`;
          const actorRatingHtml = renderPosterRatingBadgeHtml(m);
          filmographyHtml += `<div class="tilt-card animate-fade shrink-0 cursor-pointer z-10 hover:z-30 relative" style="animation-delay: ${idx * 0.02}s" title="${mTitle}${mYear ? ' (' + mYear + ')' : ''}" onclick="${isPage ? `openMoviePageById(${m.id}, '', '${m.mediaType || 'movie'}')` : `handleActorFilmClick(${m.id}, '', ${!isModal}, '${m.mediaType || 'movie'}')`}">
            <div class="tilt-card-inner glow-card block relative rounded-2xl aspect-[2/3] bg-gray-900 shadow-[0_10px_25px_rgba(0,0,0,0.6)] border border-white/5 h-full" data-movie-card-id="${m.id}">
              <div class="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                ${mPoster ? `<img src="${mPoster}" alt="${mTitle} poster" loading="lazy" decoding="async" class="w-full h-full object-cover">` : `<div class="absolute inset-0 flex items-center justify-center p-3 text-center font-bold text-gray-500 text-xs">${mTitle}</div>`}
                <div class="glare"></div>
              </div>
              ${actorRatingHtml}
              ${isInWatchlist ? `<div class="poster-badge-glass absolute top-2.5 left-2.5 bg-[#030712]/92 w-7.5 h-7.5 rounded-[7px] text-blue-400 border border-blue-400/30 shadow-md flex items-center justify-center z-20" title="In Watchlist"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"></circle><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 7v5l3 3"></path></svg></div>` : ''}
            </div>
          </div>`;
        });
        filmographyHtml += renderActorPaginationHtml(actorCurrentPage, maxActorPage);
      }

      return { filmographyHtml, allMovies, watchlistMovies, moviesToShow, activeRole, availableRoles, counts };
    }

    function generateActorHTML(person, showWatchlistOnly, roleHint = '', isModal = true, isPage = false) {
      if (!person) {
        return `<div class="p-10 text-center text-red-400">Error loading actor details.</div>`;
      }
      const isDirector = isPersonDirector(person, roleHint);
      const safeName = escapeHTML(person.name || 'Unknown');
      const profileImg = person.profile_path ? `https://image.tmdb.org/t/p/h632${person.profile_path}` : null;
      const birthday = person.birthday ? person.birthday : null;
      const deathday = person.deathday ? person.deathday : null;
      const birthplace = person.place_of_birth ? escapeHTML(person.place_of_birth) : null;
      const bio = person.biography ? escapeHTML(person.biography) : null;
      const imdbId = person.external_ids && person.external_ids.imdb_id ? person.external_ids.imdb_id : null;
      const tmdbId = person.id;

      // Build age string
      let ageStr = '';
      if (birthday) {
        const bDate = new Date(birthday);
        const endDate = deathday ? new Date(deathday) : new Date();
        let age = endDate.getFullYear() - bDate.getFullYear();
        const m = endDate.getMonth() - bDate.getMonth();
        if (m < 0 || (m === 0 && endDate.getDate() < bDate.getDate())) age--;
        ageStr = deathday ? `${age} (deceased)` : `${age} years old`;
      }

      const { filmographyHtml, allMovies, watchlistMovies, moviesToShow, activeRole, availableRoles, counts } = buildActorFilmographyGridHtml(person, showWatchlistOnly, roleHint, isModal, isPage);
      const safeCounts = counts || { watchlist: watchlistMovies.length, movie: allMovies.filter(m => m.mediaType === 'movie').length, tv: allMovies.filter(m => m.mediaType === 'tv').length, all: allMovies.length };

      // Compute actor's unique available genres across all movies
      const actorGenresSet = new Set();
      allMovies.forEach(m => {
        const gIds = m.genre_ids || (m.genres ? m.genres.map(g => g.id) : []);
        gIds.forEach(gid => {
          if (GENRE_MAP[gid]) actorGenresSet.add(GENRE_MAP[gid]);
        });
      });
      const availableActorGenres = Array.from(actorGenresSet).sort();

      window.currentActorPersonObj = person;
      window.currentActorAvailableRoles = availableRoles;
      window.currentActorActiveRole = activeRole;
      window.currentActorAvailableGenres = availableActorGenres;

      // Sort label map
      const sortLabels = { year_desc: 'Newest First', popularity: 'Popular', az: 'A-Z', za: 'Z-A', rating_desc: 'Highest Rated', rating_asc: 'Lowest Rated', year_asc: 'Oldest First' };
      const currentSortLabel = sortLabels[actorFilterSort] || 'Newest First';

      // Letterboxd slug
      const lbSlug = person.name ? person.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : '';

      const btnClass = 'w-9 h-9 min-[360px]:w-10 min-[360px]:h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 rounded-xl sm:rounded-2xl transition-all text-white shadow-sm shrink-0 cursor-pointer';
      const actionBtnClass = 'w-9 h-9 min-[360px]:w-10 min-[360px]:h-10 sm:w-12 sm:h-12 rounded-[22.5%] overflow-hidden shadow-sm shrink-0 active:scale-95 hover:brightness-110 transition-all block cursor-pointer';
      const socialBtnClass = `${actionBtnClass} grayscale hover:grayscale-0`;

      const watchlistBtnActive = showWatchlistOnly ? 'active' : '';
      const allBtnActive = showWatchlistOnly ? '' : 'active';

      const hasActiveActorFilters = (actorFilterSort !== 'popularity') || (!actorFilterProviders.has('all') && actorFilterProviders.size > 0) || (!actorFilterGenres.has('all') && actorFilterGenres.size > 0) || (!actorFilterDecades.has('all') && actorFilterDecades.size > 0) || (window.actorFilterRating && window.actorFilterRating !== 'all') || (window.actorFilterRuntime && window.actorFilterRuntime !== 'all');

      const mediaFilterTabsHtml = `
        <div class="filter-tabs-scroll flex gap-1.5 p-1.5 bg-black/40 border border-white/10 rounded-xl w-full items-center">
          <button type="button" class="tab-btn actor-tab-btn tab-btn-flexrow font-bold flex items-center justify-center ${actorMediaTypeFilter === 'watchlist' ? 'active' : ''}" onclick="setActorTab('watchlist')"><span>Watchlist</span> <span class="tab-badge actor-tab-badge">${safeCounts.watchlist}</span></button>
          <button type="button" class="tab-btn actor-tab-btn tab-btn-flexrow font-bold flex items-center justify-center ${actorMediaTypeFilter === 'all' ? 'active' : ''}" onclick="setActorTab('all')"><span>All</span> <span class="tab-badge actor-tab-badge">${safeCounts.all}</span></button>
          <button type="button" class="tab-btn actor-tab-btn tab-btn-flexrow font-bold flex items-center justify-center ${actorMediaTypeFilter === 'movie' ? 'active' : ''}" onclick="setActorTab('movie')"><span>Films</span> <span class="tab-badge actor-tab-badge">${safeCounts.movie}</span></button>
          <button type="button" class="tab-btn actor-tab-btn tab-btn-flexrow font-bold flex items-center justify-center ${actorMediaTypeFilter === 'tv' ? 'active' : ''}" onclick="setActorTab('tv')"><span>Series</span> <span class="tab-badge actor-tab-badge">${safeCounts.tv}</span></button>
        </div>`;

      const roleIcons = {
        'Actor': '🎭',
        'Director': '🎬',
        'Writer': '✍️',
        'Producer': '💼',
        'Composer': '🎵'
      };
      const activeRoleIcon = roleIcons[activeRole] || '🎭';

      const roleSelectWrapper = availableRoles.length > 1 ? `
        <div class="custom-filter-dropdown-container shrink-0 min-w-[130px] sm:min-w-[145px] max-w-[185px]">
          <button type="button" onclick="toggleCustomFilterMenu(this, 'actorRolePopover')" class="custom-filter-trigger h-[42px] px-3">
            <div class="flex items-center gap-2 truncate min-w-0">
              <span class="text-sm shrink-0">${activeRoleIcon}</span>
              <span class="truncate font-bold text-xs uppercase tracking-wider text-white" id="actorRoleLabel">${activeRole}</span>
            </div>
            <svg class="custom-filter-chevron w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
          </button>
          <div id="actorRolePopover" class="custom-filter-popover hidden space-y-1 w-full min-w-[160px] right-0 left-auto">
            ${availableRoles.map(r => `
              <button type="button" onclick="selectActorRole('${r}', event)" class="custom-filter-item ${r === activeRole ? 'selected' : ''}">
                <div class="flex items-center gap-2.5 truncate min-w-0">
                  <span class="text-sm shrink-0">${roleIcons[r] || '🎬'}</span>
                  <span class="truncate font-bold text-xs uppercase tracking-wider">${r}</span>
                </div>
                <div class="custom-filter-radio">
                  ${r === activeRole ? '<div class="custom-filter-radio-dot"></div>' : ''}
                </div>
              </button>
            `).join('')}
          </div>
        </div>` : '';
      const actorFilterGridColsClass = availableRoles.length > 1 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3';

      const movieCountIcon = isDirector
        ? `<svg class="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>`
        : `<svg class="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

      const hasActorHistory = isModal ? watchlistModalHistoryStack.length > 0 : quickSearchHistoryStack.length > 0;
      const backBtn = hasActorHistory ? `<button id="backToMovieBtn" type="button" onclick="navGoBack()" aria-label="Back" class="pointer-events-auto mt-[max(1rem,calc(env(safe-area-inset-top,0px)+0.5rem))] ml-4 w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center liquid-glass active:scale-95 text-white transition-all cursor-pointer shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg></button>` : '';
      const closeBtn = `<div class="sticky top-0 z-[60] w-full h-0 flex ${backBtn ? 'justify-between' : 'justify-end'} pointer-events-none">${backBtn}<button id="closeActorModalBtn" type="button" onclick="${isModal ? 'closeModal()' : 'closeQuickSearchInline()'}" aria-label="Close" class="pointer-events-auto mt-[max(1rem,calc(env(safe-area-inset-top,0px)+0.5rem))] mr-4 w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center liquid-glass active:scale-95 text-white transition-all cursor-pointer shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>`;
      const extIds = person.external_ids || {};
      const letterboxdBtn = lbSlug ? `<a href="https://letterboxd.com/actor/${escapeHTML(lbSlug)}/" target="_blank" title="Letterboxd" aria-label="Letterboxd" class="${actionBtnClass}"><img src="./icons/letterboxd.png" alt="Letterboxd" class="w-full h-full object-cover"></a>` : '';
      const imdbBtn = imdbId ? `<a href="https://www.imdb.com/name/${escapeHTML(imdbId)}/" target="_blank" title="IMDb" aria-label="IMDb" class="${actionBtnClass}"><img src="./icons/imdb.png" alt="IMDb" class="w-full h-full object-cover"></a>` : '';
      const tmdbBtn = `<a href="https://www.themoviedb.org/person/${tmdbId}" target="_blank" title="TMDB" aria-label="TMDB" class="${actionBtnClass} lg:hidden"><img src="./icons/tmdb.png" alt="TMDB" class="w-full h-full object-cover"></a>`;
      const socialsList = [];
      if (extIds.instagram_id) socialsList.push({ name: 'Instagram', handle: '@' + extIds.instagram_id.replace(/^@/, ''), url: `https://instagram.com/${escapeHTML(extIds.instagram_id)}`, icon: './icons/instagram.png' });
      if (extIds.twitter_id) socialsList.push({ name: 'X (Twitter)', handle: '@' + extIds.twitter_id.replace(/^@/, ''), url: `https://x.com/${escapeHTML(extIds.twitter_id)}`, icon: './icons/x.png' });
      if (extIds.tiktok_id) socialsList.push({ name: 'TikTok', handle: '@' + extIds.tiktok_id.replace(/^@/, ''), url: `https://tiktok.com/@${escapeHTML(extIds.tiktok_id.replace(/^@/, ''))}`, icon: './icons/tiktok.png' });
      if (extIds.facebook_id) socialsList.push({ name: 'Facebook', handle: extIds.facebook_id, url: `https://facebook.com/${escapeHTML(extIds.facebook_id)}`, icon: './icons/facebook.png' });

      let socialsDrawerHtml = '';
      if (socialsList.length > 0) {
        const socialsPayload = escapeHTML(JSON.stringify({
          title: safeName,
          subtitle: activeRole || person.known_for_department || '',
          socials: socialsList
        }));
        socialsDrawerHtml = `
          <div class="relative flex items-center shrink-0">
            <button type="button" onclick="toggleSocialsDrawer(this)" data-socials="${socialsPayload}" class="${btnClass} text-gray-300 hover:text-white drawer-btn" title="Official Socials" aria-label="Official Socials">
              <svg class="w-4 h-4 min-[360px]:w-5 min-[360px]:h-5 sm:w-5 sm:h-5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"></path>
              </svg>
            </button>
            <div class="social-drawer hidden sm:flex">
              ${socialsList.map(s => `<a href="${s.url}" target="_blank" title="${s.name}" aria-label="${s.name}" class="${actionBtnClass} grayscale hover:grayscale-0"><img src="${s.icon}" alt="${s.name}" class="w-full h-full object-cover"></a>`).join('')}
            </div>
          </div>
        `;
      }
      const shareBtn = `<button onclick="navigator.clipboard.writeText('${window.location.origin}${window.location.pathname}?actor=${tmdbId}'); const t=this; const old=t.innerHTML; t.innerHTML='<svg class=\\'w-4 h-4 min-[360px]:w-5 min-[360px]:h-5 text-green-400\\' fill=\\'none\\' stroke=\\'currentColor\\' viewBox=\\'0 0 24 24\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'2\\' d=\\'M5 13l4 4L19 7\\'/></svg>'; setTimeout(()=>t.innerHTML=old, 2000);" title="Copy Link" aria-label="Copy Link" class="${btnClass} cursor-pointer"><svg class="w-4 h-4 min-[360px]:w-5 min-[360px]:h-5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg></button>`;
      const primaryActorBtns = [letterboxdBtn, imdbBtn, tmdbBtn].filter(Boolean);
      const divider = (primaryActorBtns.length > 0 && (socialsDrawerHtml || shareBtn))
        ? '<div class="w-px h-5 sm:h-6 bg-white/10 my-auto shrink-0 mx-0.5 sm:mx-1"></div>'
        : '';
      const actorActionBtns = [...primaryActorBtns, divider, shareBtn, socialsDrawerHtml].filter(Boolean);
      const actorActionBtnsHtml = `<div class="flex items-center justify-center lg:justify-start gap-1.5 min-[360px]:gap-2 sm:gap-3 flex-nowrap w-full lg:w-auto overflow-x-auto max-w-full no-scrollbar">${actorActionBtns.join('')}</div>`;

      const bioHtml = createExpandableTextHtml(bio, 'actorBioText');

      // Find top backdrop from actor's credits for "Known for" hero banner
      let knownForBackdrop = null;
      let knownForTitle = '';
      const creditsObj = person.combined_credits || person.movie_credits;
      if (creditsObj) {
        const rawCredits = [
          ...(creditsObj.cast || []),
          ...(creditsObj.crew || [])
        ];
        const isVoiceRole = (m) => {
          if (!m.character) return false;
          return /voice|uncredited|\bself\b/i.test(m.character);
        };
        const isObscure = (m) => {
          const votes = m.vote_count || 0;
          const pop = m.popularity || 0;
          return votes < 25 && pop < 5.0;
        };

        const validCredits = rawCredits.filter(m => (m.title || m.name) && m.backdrop_path && !isVoiceRole(m));
        const wellKnownCredits = validCredits.filter(m => !isObscure(m));
        const pool = wellKnownCredits.length > 0 ? wellKnownCredits : validCredits;

        const creditScore = (m) => {
          const votes = m.vote_count || 0;
          const pop = m.popularity || 0;
          const avg = m.vote_average || 0;
          const eps = m.episode_count || 0;
          const isTv = m.media_type === 'tv';

          const fame = Math.min(votes, 8000) / 80 + Math.min(pop, 100) * 0.6 + avg * 8;

          let involvement;
          if (isTv) {
            const epsFactor = Math.min(eps, 80) / 80;
            const orderFactor = typeof m.order === 'number' ? Math.max(0, (10 - Math.min(m.order, 10)) / 10) : 0.25;
            involvement = epsFactor * 0.6 + orderFactor * 0.4;
          } else {
            involvement = typeof m.order === 'number' ? Math.max(0, (8 - Math.min(m.order, 8)) / 8) : 0.2;
          }

          return fame * (0.2 + involvement * 0.8);
        };

        const singleMainLeadCredits = pool.filter(m =>
          (m.media_type !== 'tv' && m.order === 0) ||
          (m.media_type === 'tv' && (m.episode_count || 0) >= 10 && (typeof m.order !== 'number' || m.order <= 5)) ||
          (isDirector && m.job === 'Director')
        ).sort((a, b) => creditScore(b) - creditScore(a) || (b.popularity || 0) - (a.popularity || 0));

        const topCoLeadCredits = pool.filter(m =>
          (m.media_type !== 'tv' && typeof m.order === 'number' && m.order < 3) ||
          (m.media_type === 'tv' && (m.episode_count || 0) >= 3 && (typeof m.order !== 'number' || m.order <= 8))
        ).sort((a, b) => creditScore(b) - creditScore(a) || (b.popularity || 0) - (a.popularity || 0));

        const sortedAll = pool.sort((a, b) => creditScore(b) - creditScore(a) || (b.popularity || 0) - (a.popularity || 0));

        const chosenCredit = singleMainLeadCredits[0] || topCoLeadCredits[0] || sortedAll[0] || null;
        if (chosenCredit) {
          knownForBackdrop = `https://image.tmdb.org/t/p/original${chosenCredit.backdrop_path}`;
          knownForTitle = chosenCredit.title || chosenCredit.name || '';
        }
      }

      const knownForSubtitle = knownForTitle
        ? `<p class="text-xs sm:text-sm font-medium text-gray-300 drop-shadow mt-0.5 sm:mt-1"><span class="text-blue-400 font-extrabold uppercase text-[10px] sm:text-xs tracking-wider">Known for</span> <span class="text-white font-bold ml-1">${escapeHTML(knownForTitle)}</span></p>`
        : '';

      const desktopBackdropImg = knownForBackdrop || profileImg;
      const filterPlaceholder = (typeof window !== 'undefined' && window.innerWidth < 640) ? 'Search...' : 'Filter by title...';

      const actorControlsHtml = `
        <div class="relative w-full z-50" id="actorControlsCard">
          <div class="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5 sm:gap-3 lg:gap-3">
            <div id="actorCategoriesBar" class="flex shrink-0 w-full lg:w-auto lg:min-w-[460px] xl:min-w-[490px]">
              ${mediaFilterTabsHtml}
            </div>
            <div class="hidden lg:block w-px h-6 bg-white/15 shrink-0 my-auto"></div>
            <div class="relative flex-1 min-w-0" id="actorControlsBarRow">
              <div class="flex items-center gap-2 w-full">
                <div class="flex-1 relative flex bg-black/40 border border-white/10 rounded-xl overflow-hidden blue-focus transition-all h-[42px]">
                  <svg class="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  <input id="actorFilmSearch" type="text" autocomplete="off" spellcheck="false" placeholder="${filterPlaceholder}" value="${escapeHTML(actorFilterQuery)}" class="w-full bg-transparent pl-9 sm:pl-10 pr-9 sm:pr-10 py-2.5 text-sm text-white font-medium focus:outline-none placeholder:text-gray-500 transition-colors truncate">
                  ${actorFilterQuery ? `<button id="actorFilmSearchClear" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>` : ''}
                </div>

                <!-- Options / Filter Toggle Button for Actor -->
                <button id="actorFilterToggleBtn" type="button" onclick="toggleActorFilterDropdown(event)" aria-label="Filters and sorting" class="shrink-0 h-[42px] px-3.5 flex items-center justify-center bg-black/40 border ${hasActiveActorFilters ? 'border-blue-500 text-blue-400 bg-blue-500/10' : 'border-white/10 text-gray-300'} rounded-xl transition-all active:scale-95 font-bold text-xs cursor-pointer">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4"></path>
                  </svg>
                </button>

                ${roleSelectWrapper}
              </div>
            </div>
          </div>

          <!-- Actor Filter Backdrop (Mobile bottom sheet backdrop) -->
          <div id="actorFilterBackdrop" class="hidden filter-backdrop-responsive" onclick="closeActorFilterDropdown()"></div>

          <!-- Responsive Filter Panel for Actor (Spans full bar width on desktop, bottom sheet on mobile) -->
          <div id="actorFilterDropdownMenu" class="hidden filter-panel-responsive space-y-4">
            <!-- Mobile Drag Handle -->
            <div class="w-10 h-1 rounded-full bg-white/20 mx-auto mb-2 sm:hidden pointer-events-none"></div>

            <!-- Header -->
            <div class="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4"></path>
                </svg>
                <span class="text-xs font-bold uppercase tracking-widest text-white">Filters &amp; Sorting</span>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" onclick="resetActorFilters()" class="text-xs font-bold text-gray-400 hover:text-white px-2.5 py-1 rounded-lg hover:bg-white/5 transition-all cursor-pointer">
                  Reset all
                </button>
                <button type="button" onclick="closeActorFilterDropdown()" aria-label="Close"
                  class="sm:hidden w-8 h-8 rounded-full flex items-center justify-center liquid-glass active:scale-95 text-white transition-all cursor-pointer shrink-0">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Full-width multi-column grid on desktop! -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4" id="actorFilterGridSlots">
              <div id="actorFilterSlot-sort" class="custom-filter-dropdown-container"></div>
              <div id="actorFilterSlot-provider" class="custom-filter-dropdown-container"></div>
              <div id="actorFilterSlot-genre" class="custom-filter-dropdown-container"></div>
              <div id="actorFilterSlot-decade" class="custom-filter-dropdown-container"></div>
              <div id="actorFilterSlot-rating" class="custom-filter-dropdown-container"></div>
              <div id="actorFilterSlot-runtime" class="custom-filter-dropdown-container"></div>
            </div>

            <!-- Mobile Close / Apply Button -->
            <button type="button" onclick="closeActorFilterDropdown()" class="w-full sm:hidden py-3 mt-2 rounded-xl bg-blue-600 hover:bg-blue-500 font-extrabold text-xs uppercase tracking-wider text-white shadow-lg active:scale-98 transition-all">
              Show Results
            </button>
          </div>
        </div>
      `;

      if (isPage) {
        return `<nav id="actorPageNav" class="movie-page-nav fixed top-0 inset-x-0 z-[70] flex items-center justify-between gap-4 px-4 sm:px-8 lg:px-12 2xl:px-16 pointer-events-none">
            <button type="button" onclick="closeActorPage()" aria-label="Back" class="pointer-events-auto shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center liquid-glass active:scale-95 text-white transition-all cursor-pointer"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg></button>
            <button type="button" onclick="goHomeFromPage()" aria-label="Close" class="pointer-events-auto shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center liquid-glass active:scale-95 text-white transition-all cursor-pointer"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
          </nav>
          <div class="relative w-full h-[52dvh] min-h-[380px] sm:h-[74dvh] sm:min-h-[420px] actor-hero-container">
            <div id="actorPageHeroArt" class="absolute inset-0 overflow-hidden bg-[#0b1121] clip-mask">
              ${desktopBackdropImg ? `<img src="${desktopBackdropImg}" alt="${safeName} backdrop" loading="eager" decoding="async" onload="this.style.opacity='1'" style="opacity:0; transition: opacity 0.35s ease-out;" class="w-full h-full object-cover object-[center_20%] scale-105 transform-gpu">` : `<div class="w-full h-full bg-gradient-to-b from-blue-900/30 via-[#0b1121]/80 to-[#0b1121]"></div>`}
              <div class="absolute inset-x-0 bottom-0 h-[65%] sm:h-[56%] bg-gradient-to-t from-[#0b1121] from-0% via-[#0b1121] sm:via-[#0b1121]/85 via-40% to-transparent to-100% pointer-events-none z-20"></div>
            </div>
            <div class="absolute inset-0 z-30 flex flex-col justify-end pointer-events-none pb-6 sm:pb-14 2xl:pb-16 actor-hero-content">
              <div class="w-full max-w-[1400px] xl:max-w-[1760px] 2xl:max-w-[2160px] min-[2500px]:max-w-[2400px] mx-auto px-4 sm:px-8 lg:px-12 2xl:px-16 flex flex-col gap-3 sm:gap-4">
                <div class="flex flex-row items-center gap-4 sm:gap-8">
                  ${profileImg ? `<img src="${profileImg}" alt="${safeName}" loading="eager" decoding="async" class="w-28 min-[400px]:w-32 sm:w-48 2xl:w-56 rounded-2xl shadow-[0_15px_30px_rgba(0,0,0,0.8)] border border-white/10 aspect-[2/3] object-cover shrink-0 pointer-events-auto">` : `<div class="w-28 min-[400px]:w-32 sm:w-48 2xl:w-56 rounded-2xl shadow-[0_15px_30px_rgba(0,0,0,0.8)] border border-white/10 bg-gray-800 flex items-center justify-center text-3xl font-bold text-gray-500 aspect-[2/3] shrink-0 pointer-events-auto">${safeName.charAt(0)}</div>`}
                  <div class="pointer-events-auto min-w-0 flex-1 flex flex-col justify-center gap-1 sm:gap-2">
                    <h1 class="actor-hero-name text-2xl min-[400px]:text-3xl sm:text-7xl 2xl:text-8xl font-black text-white tracking-tight drop-shadow-[0_8px_20px_rgba(0,0,0,0.95)] leading-[1.08] sm:leading-[0.98]">${safeName}</h1>
                    ${knownForTitle ? `<p class="actor-hero-known-for text-xs sm:text-base 2xl:text-lg font-medium text-gray-300 drop-shadow"><span class="text-blue-400 font-extrabold uppercase text-[10px] sm:text-xs tracking-wider">Known for</span> <span class="text-white font-bold ml-1">${escapeHTML(knownForTitle)}</span></p>` : ''}
                    <div class="mt-1 sm:mt-2 max-w-3xl 2xl:max-w-4xl">${bio ? createHeroOverviewHtml(bio, safeName) : ''}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="w-full max-w-[1400px] xl:max-w-[1760px] 2xl:max-w-[2160px] min-[2500px]:max-w-[2400px] mx-auto px-4 sm:px-8 lg:px-12 2xl:px-16 pt-4 sm:pt-0 pb-0 flex flex-col gap-6 sm:gap-10">
            <div>
              <div class="flex flex-col gap-3 mb-4 relative z-40">
                <h3 class="text-base sm:text-lg font-extrabold uppercase tracking-widest text-gray-400">Filmography &amp; Series <span class="actor-total-count text-gray-500 text-xs sm:text-sm normal-case tracking-normal">(${safeCounts.all} total)</span></h3>
                ${actorControlsHtml}
              </div>
              <div id="actorFilmGrid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 min-[2200px]:grid-cols-8 gap-4 sm:gap-5 lg:gap-5 xl:gap-5 2xl:gap-6 min-[2200px]:gap-7 content-start">${filmographyHtml}</div>
            </div>
          </div>
          <div class="w-full max-w-[1400px] xl:max-w-[1760px] 2xl:max-w-[2160px] min-[2500px]:max-w-[2400px] mx-auto px-4 sm:px-8 lg:px-12 2xl:px-16 mt-6 sm:mt-7 pb-8 sm:pb-10">
            <div class="pt-6 border-t border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              ${actorActionBtnsHtml}
              <div class="flex flex-col items-center lg:items-end gap-1.5 w-full lg:w-auto text-center lg:text-right">
                <div class="flex flex-col sm:flex-row items-center justify-center lg:justify-end gap-1.5 sm:gap-2.5">
                  <a href="https://www.themoviedb.org/" target="_blank" class="hidden lg:inline-block shrink-0 opacity-80 hover:opacity-100 transition-opacity"><img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" alt="TMDB Logo" class="h-3 sm:h-3.5"></a>
                  <span class="text-[10px] sm:text-[11px] text-gray-400 font-medium sm:whitespace-nowrap">This product uses the TMDB API but is not endorsed or certified by TMDB.<br>Streaming availability data provided by <a href="https://www.justwatch.com" target="_blank" rel="noopener" class="underline hover:text-white">JustWatch</a>.</span>
                </div>
              </div>
            </div>
          </div>`;
      }
      return `${closeBtn}<div class="relative w-full h-56 sm:h-72 shrink-0 rounded-t-3xl overflow-hidden"><div class="absolute inset-0 overflow-hidden clip-mask bg-[#0b1121]">${desktopBackdropImg ? `<img src="${desktopBackdropImg}" alt="${safeName} backdrop" loading="eager" decoding="async" class="w-full h-full object-cover object-[center_20%] scale-105 transform-gpu">` : `<div class="w-full h-full bg-gradient-to-b from-blue-900/30 via-[#0b1121]/80 to-[#0b1121]"></div>`}<div class="absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-[#0b1121] via-[#0b1121]/70 to-transparent pointer-events-none z-10"></div></div><div class="absolute inset-x-0 bottom-0 p-5 sm:p-8 flex items-center gap-3.5 sm:gap-6 z-20">${profileImg ? `<img src="${profileImg}" alt="${safeName}" loading="lazy" decoding="async" class="w-24 sm:w-36 rounded-xl sm:rounded-2xl shadow-[0_15px_30px_rgba(0,0,0,0.8)] border border-white/10 aspect-[2/3] object-cover shrink-0 z-20">` : `<div class="flex w-24 sm:w-36 rounded-xl sm:rounded-2xl shadow-[0_15px_30px_rgba(0,0,0,0.8)] border border-white/10 bg-gray-800 items-center justify-center text-2xl sm:text-3xl font-bold text-gray-500 aspect-[2/3] shrink-0 z-20">${safeName.charAt(0)}</div>`}<div class="flex flex-col justify-center items-start flex-1 min-w-0 z-20"><h2 class="text-2xl min-[400px]:text-3xl sm:text-6xl font-black text-white tracking-tight drop-shadow-[0_8px_20px_rgba(0,0,0,0.95)] leading-tight mb-0.5">${safeName}</h2>${knownForSubtitle}</div></div></div><div class="relative p-5 sm:p-8 flex flex-col gap-5 sm:gap-6 bg-[#0b1121] z-0">${bioHtml ? `<div class="space-y-3">${bioHtml}</div>` : ''}<div><div class="flex flex-col gap-3 mb-4 relative z-40"><h3 class="text-base sm:text-lg font-extrabold uppercase tracking-widest text-gray-400">Filmography &amp; Series <span class="actor-total-count text-gray-500 text-xs sm:text-sm normal-case tracking-normal">(${safeCounts.all} total)</span></h3>${actorControlsHtml}</div><div id="actorFilmGrid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 min-[2200px]:grid-cols-8 gap-4 sm:gap-5 lg:gap-5 xl:gap-5 2xl:gap-6 min-[2200px]:gap-7 content-start">${filmographyHtml}</div></div></div><div class="bg-[#0b1121] p-5 sm:px-8 sm:py-5 rounded-b-3xl border-t border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">${actorActionBtnsHtml}<div class="flex flex-col items-center lg:items-end gap-1.5 w-full lg:w-auto text-center lg:text-right"><div class="flex flex-col sm:flex-row items-center justify-center lg:justify-end gap-1.5 sm:gap-2.5"><a href="https://www.themoviedb.org/" target="_blank" class="hidden lg:inline-block shrink-0 opacity-80 hover:opacity-100 transition-opacity"><img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" alt="TMDB Logo" class="h-3 sm:h-3.5"></a><span class="text-[10px] sm:text-[11px] text-gray-400 font-medium sm:whitespace-nowrap">This product uses the TMDB API but is not endorsed or certified by TMDB.<br>Streaming availability data provided by <a href="https://www.justwatch.com" target="_blank" rel="noopener" class="underline hover:text-white">JustWatch</a>.</span></div></div></div>`;
    }

    let currentActorId = null;
    let currentActorRoleHint = '';

    let modalActiveMovieObj = null;
    let modalActiveActorId = null;
    let modalActiveActorRoleHint = '';

    const ACTOR_SORT_OPTIONS = [
      { value: 'year_desc', label: 'Newest First' },
      { value: 'year_asc', label: 'Oldest First' },
      { value: 'popularity', label: 'Popular' },
      { value: 'rating_desc', label: 'Highest Rated' },
      { value: 'az', label: 'A-Z' },
      { value: 'za', label: 'Z-A' }
    ];

    const ACTOR_DECADE_OPTIONS = [
      { value: 'all', label: 'All Decades' },
      { value: '2020s', label: '2020s' },
      { value: '2010s', label: '2010s' },
      { value: '2000s', label: '2000s' },
      { value: '1990s', label: '1990s' },
      { value: '1980s', label: '1980s' },
      { value: '1970s', label: '1970s' },
      { value: '1960s', label: '1960s' },
      { value: '1950s', label: '1950s' },
      { value: 'older', label: 'Older' }
    ];

    function setActorTab(mediaType) {
      if (!mediaType) return;
      actorMediaTypeFilter = mediaType;
      actorCurrentPage = 1;
      const tabBtns = document.querySelectorAll('#actorCategoriesBar .actor-tab-btn');
      if (tabBtns.length >= 4) {
        tabBtns[0].classList.toggle('active', actorMediaTypeFilter === 'watchlist');
        tabBtns[1].classList.toggle('active', actorMediaTypeFilter === 'all');
        tabBtns[2].classList.toggle('active', actorMediaTypeFilter === 'movie');
        tabBtns[3].classList.toggle('active', actorMediaTypeFilter === 'tv');
      }
      refreshActorFilmographyGrid();
    }
    window.setActorTab = setActorTab;

    function toggleActorFilterDropdown(e) {
      if (e) e.stopPropagation();
      try { e?.currentTarget?.blur(); } catch (err) { logIgnored('toggleActorFilterDropdown', err); }
      try { document.getElementById('actorFilterToggleBtn')?.blur(); } catch (err) { logIgnored('toggleActorFilterDropdown', err); }
      try { document.activeElement?.blur(); } catch (err) { logIgnored('toggleActorFilterDropdown', err); }
      const menu = document.getElementById('actorFilterDropdownMenu');
      if (!menu) return;
      const isOpen = !menu.classList.contains('hidden');
      if (isOpen) {
        closeActorFilterDropdown();
      } else {
        openActorFilterDropdown();
      }
    }

    function openActorFilterDropdown() {
      const menu = document.getElementById('actorFilterDropdownMenu');
      const backdrop = document.getElementById('actorFilterBackdrop');
      const btn = document.getElementById('actorFilterToggleBtn');
      if (!menu) return;
      closeHomeFilterDropdown();

      renderAllCustomFilters('actor');

      if (window.innerWidth < 640) {
        if (backdrop && backdrop.parentElement !== document.body) document.body.appendChild(backdrop);
        if (menu.parentElement !== document.body) document.body.appendChild(menu);
        if (backdrop) backdrop.classList.remove('hidden');
        document.body.classList.add('modal-open');
      } else {
        const card = document.getElementById('actorControlsCard') || document.getElementById('actorControlsBarRow');
        if (card) {
          card.classList.add('filter-open');
          if (backdrop && backdrop.parentElement !== card) card.appendChild(backdrop);
          if (menu.parentElement !== card) card.appendChild(menu);
        }
      }
      menu.classList.remove('hidden');
      syncActorFilterButtonState();
      try { btn?.blur(); } catch (err) { logIgnored('openActorFilterDropdown', err); }
    }

    function closeActorFilterDropdown() {
      closeAllCustomFilterPopovers();
      const menu = document.getElementById('actorFilterDropdownMenu');
      const backdrop = document.getElementById('actorFilterBackdrop');
      if (menu) menu.classList.add('hidden');
      if (backdrop) backdrop.classList.add('hidden');
      document.body.classList.remove('modal-open');
      const card = document.getElementById('actorControlsCard') || document.getElementById('actorControlsBarRow');
      if (card) {
        card.classList.remove('filter-open');
        if (backdrop && backdrop.parentElement !== card) card.appendChild(backdrop);
        if (menu && menu.parentElement !== card) card.appendChild(menu);
      }
      try { document.getElementById('actorFilterToggleBtn')?.blur(); } catch (err) { logIgnored('closeActorFilterDropdown', err); }
      try { document.activeElement?.blur(); } catch (err) { logIgnored('closeActorFilterDropdown', err); }
      syncActorFilterButtonState();
    }

    // Aliases
    function toggleActorFilterSheet(e) { toggleActorFilterDropdown(e); }
    function openActorFilterSheet() { openActorFilterDropdown(); }
    function closeActorFilterSheet() { closeActorFilterDropdown(); }

    async function ensureActorRuntimesFetched(person) {
      if (!person || !person.id) return;
      const { allMovies } = getActorMoviesList(person, false, currentActorRoleHint || modalActiveActorRoleHint);
      const missing = allMovies.filter(m => !m.runtime || m.runtime === 0);
      if (missing.length === 0) return;

      for (let i = 0; i < missing.length; i += 12) {
        const chunk = missing.slice(i, i + 12);
        await Promise.all(chunk.map(async (m) => {
          try {
            const cached = movieDetailsCache.get(`${m.mediaType || 'movie'}_${m.id}`);
            if (cached && (cached.runtime || cached.episode_run_time)) {
              m.runtime = cached.runtime || (cached.episode_run_time ? cached.episode_run_time[0] : 0) || (cached.last_episode_to_air ? cached.last_episode_to_air.runtime : 0) || 0;
            } else {
              const d = await getFullMovieDetails(m.id, m.mediaType || 'movie');
              if (d) {
                m.runtime = d.runtime || (d.episode_run_time ? d.episode_run_time[0] : 0) || (d.last_episode_to_air ? d.last_episode_to_air.runtime : 0) || 0;
              }
            }
          } catch (e) { logIgnored('ensureActorRuntimesFetched', e); }
        }));
        if (window.actorFilterRuntime && window.actorFilterRuntime !== 'all') {
          refreshActorFilmographyGrid();
        }
      }
    }

    async function ensureActorProvidersFetched(person) {
      if (!person || !person.id) return;
      const { allMovies } = getActorMoviesList(person, false, currentActorRoleHint || modalActiveActorRoleHint);
      if (!Array.isArray(allMovies) || allMovies.length === 0) return;

      // Immediately apply any already-cached ratings
      let cachedApplied = false;
      allMovies.forEach(m => {
        const iId = m.imdbId || m.imdb_id;
        if (iId && imdbRatingCache.has(iId)) {
          const r = imdbRatingCache.get(iId);
          if (m.imdbRating !== r) {
            m.imdbRating = r;
            m.rating = r;
            cachedApplied = true;
          }
        }
      });
      if (cachedApplied && window.actorFilterRating && window.actorFilterRating !== 'all') {
        debouncedRefreshActorGrid();
      }

      const missing = allMovies.filter(m => !m.allProviders || !m.imdbId);
      if (missing.length === 0) {
        ensureActorRatingsFetched(allMovies);
        return;
      }

      for (let i = 0; i < missing.length; i += 10) {
        const chunk = missing.slice(i, i + 10);
        await Promise.all(chunk.map(async (m) => {
          try {
            const mediaType = m.mediaType === 'tv' ? 'tv' : 'movie';
            const cachedDetails = movieDetailsCache.get(`${mediaType}_${m.id}`);
            let pData = cachedDetails;
            if (!pData || !pData['watch/providers'] || !pData.external_ids) {
              const pUrl = `https://api.themoviedb.org/3/${mediaType}/${m.id}?api_key=${TMDB_API_KEY}&append_to_response=watch/providers,external_ids`;
              const pRes = await tmdbFetch(pUrl);
              pData = await pRes.json().catch(() => ({}));
              if (pData && pData.id) {
                const existing = movieDetailsCache.get(`${mediaType}_${m.id}`);
                if (!existing || (!existing.credits && !existing.aggregate_credits)) {
                  movieDetailsCache.set(`${mediaType}_${m.id}`, pData);
                }
              }
            }
            if (pData) {
              const provResults = pData['watch/providers']?.results || pData.results || {};
              m.allProviders = provResults;
              if (pData.runtime || pData.episode_run_time) {
                m.runtime = pData.runtime || (pData.episode_run_time ? pData.episode_run_time[0] : 0) || (pData.last_episode_to_air ? pData.last_episode_to_air.runtime : 0) || 0;
              }
              const iId = pData.external_ids?.imdb_id || null;
              if (iId) {
                m.imdbId = iId;
                fetchImdbRating(iId, mediaType === 'tv').then(r => {
                  if (r) {
                    m.imdbRating = r;
                    m.rating = r;
                    updatePosterRatingBadgeInDom(m.id, r);
                    if (window.actorFilterRating && window.actorFilterRating !== 'all') {
                      debouncedRefreshActorGrid();
                    }
                  }
                }).catch(() => {});
              }
            }
          } catch (e) { logIgnored('ensureActorProvidersFetched', e); }
        }));
        if (actorFilterProvider && actorFilterProvider !== 'all') {
          refreshActorFilmographyGrid();
        }
        await new Promise(r => setTimeout(r, 40));
      }
    }

    function setActorRating(val) {
      actorFilterRating = val;
      window.actorFilterRating = val;
      actorCurrentPage = 1;
      renderAllCustomFilters('actor');
      refreshActorFilmographyGrid();
      syncActorFilterButtonState();
      if (val !== 'all') {
        const actorId = window.currentActorPageId || modalActiveActorId || currentActorId;
        const person = (actorId ? actorDetailsCache.get(actorId) : null) || window.currentActorPersonObj;
        if (person) {
          const { allMovies } = getActorMoviesList(person, false, currentActorRoleHint || modalActiveActorRoleHint);
          ensureActorRatingsFetched(allMovies);
        }
      }
    }

    function setActorRuntime(val) {
      actorFilterRuntime = val;
      window.actorFilterRuntime = val;
      actorCurrentPage = 1;
      renderAllCustomFilters('actor');
      refreshActorFilmographyGrid();
      syncActorFilterButtonState();
      if (val !== 'all') {
        const actorId = window.currentActorPageId || modalActiveActorId || currentActorId;
        const person = (actorId ? actorDetailsCache.get(actorId) : null) || window.currentActorPersonObj;
        if (person) ensureActorRuntimesFetched(person);
      }
    }

    function resetActorFilters() {
      actorFilterSort = 'popularity';
      actorFilterProviders = new Set(['all']);
      actorFilterGenres = new Set(['all']);
      actorFilterDecades = new Set(['all']);
      actorFilterRating = 'all';
      actorFilterRuntime = 'all';
      window.actorFilterRating = 'all';
      window.actorFilterRuntime = 'all';

      actorCurrentPage = 1;
      renderAllCustomFilters('actor');
      refreshActorFilmographyGrid();
      syncActorFilterButtonState();
    }

    function syncActorFilterButtonState() {
      const btn = document.getElementById('actorFilterToggleBtn');
      const hasActive = (actorFilterSort !== 'popularity' || (!actorFilterProviders.has('all') && actorFilterProviders.size > 0) || (!actorFilterGenres.has('all') && actorFilterGenres.size > 0) || (!actorFilterDecades.has('all') && actorFilterDecades.size > 0) || (window.actorFilterRating && window.actorFilterRating !== 'all') || (window.actorFilterRuntime && window.actorFilterRuntime !== 'all'));
      const menu = document.getElementById('actorFilterDropdownMenu');
      const isOpen = menu && !menu.classList.contains('hidden');
      if (btn) {
        btn.classList.toggle('border-blue-500', hasActive || isOpen);
        btn.classList.toggle('text-blue-400', hasActive || isOpen);
        btn.classList.toggle('bg-blue-500/10', hasActive || isOpen);
        btn.classList.toggle('border-white/10', !hasActive && !isOpen);
        btn.classList.toggle('text-gray-300', !hasActive && !isOpen);
      }
    }

    // Dismiss floating dropdowns on outside click or Escape key
    document.addEventListener('click', (e) => {
      const homeMenu = document.getElementById('homeFilterDropdownMenu');
      const homeBtn = document.getElementById('homeFilterToggleBtn');
      if (homeMenu && !homeMenu.classList.contains('hidden')) {
        if (!homeMenu.contains(e.target) && (!homeBtn || !homeBtn.contains(e.target))) {
          closeHomeFilterDropdown();
        }
      }

      const actorMenu = document.getElementById('actorFilterDropdownMenu');
      const actorBtn = document.getElementById('actorFilterToggleBtn');
      if (actorMenu && !actorMenu.classList.contains('hidden')) {
        if (!actorMenu.contains(e.target) && (!actorBtn || !actorBtn.contains(e.target))) {
          closeActorFilterDropdown();
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeHomeFilterDropdown();
        closeActorFilterDropdown();
      }
    });

