    // ---------------- Full-page actor view ----------------
    window.currentActorPageId = null;

    async function changeActorRole(newRole) {
      currentActorRoleHint = newRole;
      modalActiveActorRoleHint = newRole;
      actorCurrentPage = 1;
      actorFilterQuery = '';
      actorFilterProviders = new Set(['all']);
      actorFilterGenres = new Set(['all']);
      actorFilterDecades = new Set(['all']);
      actorFilterProvider = 'all';
      actorFilterGenre = 'all';
      actorFilterDecade = 'all';
      actorFilterRating = 'all';
      window.actorFilterRating = 'all';
      actorFilterRuntime = 'all';
      window.actorFilterRuntime = 'all';

      const searchInput = document.getElementById('actorFilmSearch');
      if (searchInput) searchInput.value = '';
      const clearBtn = document.getElementById('actorFilmSearchClear');
      if (clearBtn) clearBtn.classList.add('hidden');

      const actorId = window.currentActorPageId || modalActiveActorId || currentActorId;
      const person = (actorId ? actorDetailsCache.get(actorId) : null) || window.currentActorPersonObj;

      if (actorId && person) {
        let slug = slugify(person.name || '');
        try {
          const refinedSlug = await getCanonicalPersonSlug(person);
          if (refinedSlug) slug = refinedSlug;
        } catch (e) { logIgnored('changeActorRole', e); }
        const prefix = `#${newRole.toLowerCase()}/`;
        if (slug) registerSlug(slug, actorId, 'actor', newRole);
        try { history.replaceState({ actorPage: actorId }, '', `${prefix}${slug || actorId}`); } catch (e) { logIgnored('changeActorRole', e); }
      }

      refreshActorFilmographyGrid();
    }

    async function openActorPage(actorId, actorName = '', roleHint = '', pushHistory = true) {
      const container = document.getElementById('actorPageView');
      if (!container || !actorId) return;
      stopHeroVideo();

      window.currentActorPageId = actorId;
      currentActorRoleHint = roleHint;
      modalActiveActorRoleHint = roleHint;
      actorMediaTypeFilter = 'watchlist';
      actorFilterQuery = '';
      actorFilterProviders = new Set(['all']);
      actorFilterGenres = new Set(['all']);
      actorFilterDecades = new Set(['all']);
      actorFilterProvider = 'all';
      actorFilterGenre = 'all';
      actorFilterDecade = 'all';
      actorFilterRating = 'all';
      window.actorFilterRating = 'all';
      actorFilterRuntime = 'all';
      window.actorFilterRuntime = 'all';
      actorFilterSort = 'popularity';

      document.body.classList.add('modal-open');
      container.classList.remove('hidden');
      hideMoviePageView();
      hideAllCastModalView();
      document.body.classList.add('modal-open');
      container.scrollTop = 0;
      container.innerHTML = `<div class="min-h-screen flex items-center justify-center"><div class="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>`;

      try {
        const person = await getActorDetails(actorId);
        if (window.currentActorPageId !== actorId) return;
        window.currentActorPersonObj = person;
        const activeRole = determineActivePersonRole(person, roleHint);
        currentActorRoleHint = activeRole;
        modalActiveActorRoleHint = activeRole;
        let actorSlug = slugify(person.name || '');
        try {
          const refinedActorSlug = await getCanonicalPersonSlug(person);
          if (refinedActorSlug) actorSlug = refinedActorSlug;
        } catch (e) { logIgnored('openActorPage', e); }
        if (actorSlug) registerSlug(actorSlug, actorId, 'actor', activeRole);
        if (pushHistory) {
          const prefix = `#${activeRole.toLowerCase()}/`;
          try { history.pushState({ actorPage: actorId }, '', `${prefix}${actorSlug || actorId}`); } catch (e) { logIgnored('openActorPage', e); }
        }
        const { watchlistMovies } = getActorMoviesList(person, false, activeRole);
        if (watchlistMovies.length === 0) actorMediaTypeFilter = 'all';

        const profileUrl = person && person.profile_path ? `https://image.tmdb.org/t/p/h632${person.profile_path}` : null;
        if (profileUrl) {
          const img = new Image();
          img.src = profileUrl;
          await Promise.race([
            new Promise(r => { img.onload = r; img.onerror = r; }),
            new Promise(r => setTimeout(r, 250))
          ]);
        }

        if (window.currentActorPageId !== actorId) return;
        container.innerHTML = `<div id="actorPageInnerContent" class="opacity-0 transition-opacity duration-200">${generateActorHTML(person, false, activeRole, true, true)}</div>`;
        requestAnimationFrame(() => {
          const inner = document.getElementById('actorPageInnerContent');
          if (inner) inner.classList.remove('opacity-0');
        });
        container.scrollTop = 0;
        bindActorFilmControls();
        applyTiltToActorGrid();
        ensureActorProvidersFetched(person);
      } catch (e) {
        console.error('[Actor Page]', e);
        container.innerHTML = `<div class="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-6"><p class="text-red-400 font-bold">Couldn't load this person.</p><button onclick="closeActorPage()" class="text-blue-400 text-sm font-bold underline">Go back</button></div>`;
      }
    }

    function closeActorPage() {
      clearQuickSearchInput();
      if (window.location.hash) {
        history.back();
      } else {
        hideActorPageView();
      }
    }

    function hideActorPageView() {
      const container = document.getElementById('actorPageView');
      if (!container || container.classList.contains('hidden')) return;
      closeActorFilterSheet();
      stopHeroVideo();
      window.currentActorPageId = null;
      container.classList.add('hidden');
      container.innerHTML = '';
      const movieModal = document.getElementById('movieModal');
      const actorModal = document.getElementById('actorModal');
      const allCastModal = document.getElementById('allCastModal');
      const isMoviePageOpen = document.getElementById('moviePageView') && !document.getElementById('moviePageView').classList.contains('hidden');
      if (!movieModal?.classList.contains('flex') && !actorModal?.classList.contains('flex') && !allCastModal?.classList.contains('flex') && !isMoviePageOpen) {
        document.body.classList.remove('modal-open');
      }
    }

    async function openActorModal(actorId, actorName = '', roleHint = '', forceInline = null) {
      openActorPage(actorId, actorName, roleHint);
    }

    function closeActorModal() {
      stopHeroVideo();
      const modal = document.getElementById('actorModal');
      const backdrop = document.getElementById('actorModalBackdrop');
      const content = document.getElementById('actorModalContent');
      if (!modal) return;
      modalActiveActorId = null;
      modalActiveMovieObj = null;
      watchlistModalHistoryStack.length = 0;
      backdrop.classList.add('opacity-0'); content.classList.add('translate-y-8', 'opacity-0');
      setTimeout(() => {
        modal.classList.add('hidden'); modal.classList.remove('flex');
        document.body.classList.remove('modal-open');
      }, 300);
    }

    let isNavigatingBack = false;

    function navGoBack() {
      const actorModal = document.getElementById('actorModal');
      const movieModal = document.getElementById('movieModal');
      const isActorModalOpen = actorModal && !actorModal.classList.contains('hidden');
      const isMovieModalOpen = movieModal && !movieModal.classList.contains('hidden');
      const isModalActive = isActorModalOpen || isMovieModalOpen;

      const stack = isModalActive ? watchlistModalHistoryStack : quickSearchHistoryStack;
      if (stack.length === 0) return;

      const prev = stack.pop();
      isNavigatingBack = true;

      try {
        if (isModalActive) {
          if (movieModal) { movieModal.classList.add('hidden'); movieModal.classList.remove('flex'); }
          if (actorModal) { actorModal.classList.add('hidden'); actorModal.classList.remove('flex'); }
          if (prev.type === 'movie') {
            openMovieModal(prev.data, false);
          } else if (prev.type === 'actor') {
            openActorModal(prev.data.id, prev.data.name, prev.data.roleHint || '', false);
          }
        } else {
          if (prev.type === 'movie') {
            openMovieModal(prev.data, true);
          } else if (prev.type === 'actor') {
            openActorModal(prev.data.id, prev.data.name, prev.data.roleHint || '', true);
          }
        }
      } finally {
        isNavigatingBack = false;
      }
    }

    function bindActorFilmControls() {
      const searchInput = document.getElementById('actorFilmSearch');
      const clearBtn = document.getElementById('actorFilmSearchClear');
      const roleSelect = document.getElementById('actorRoleSelect');
      const roleLabel = document.getElementById('actorRoleLabel');
      const sortSelect = document.getElementById('actorFilmSort');
      const sortLabel = document.getElementById('actorSortLabel');
      const genreSelect = document.getElementById('actorFilmGenre');
      const genreLabel = document.getElementById('actorGenreLabel');
      const decadeSelect = document.getElementById('actorFilmDecade');
      const decadeLabel = document.getElementById('actorDecadeLabel');

      renderAllCustomFilters('actor');

      if (roleSelect) {
        roleSelect.addEventListener('change', (e) => {
          const newRole = e.target.value;
          currentActorRoleHint = newRole;
          modalActiveActorRoleHint = newRole;
          if (roleLabel) roleLabel.textContent = e.target.options[e.target.selectedIndex]?.text || e.target.value;
          changeActorRole(newRole);
          try { e.target.blur(); } catch (err) { console.warn('[Actor Filter Role Blur]', err); }
        });
      }
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          actorFilterQuery = e.target.value;
          actorCurrentPage = 1;
          refreshActorFilmographyGrid();
        });
      }
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          actorFilterQuery = '';
          actorCurrentPage = 1;
          refreshActorFilmographyGrid();
          const inp = document.getElementById('actorFilmSearch');
          if (inp) { inp.value = ''; inp.focus(); }
        });
      }
    }

    function applyTiltToActorGrid() {
      const grid = document.getElementById('actorFilmGrid');
      if (!grid) return;
      grid.querySelectorAll('.tilt-card').forEach(card => apply3DTilt(card));
    }

    function scrollSimilarTrack(direction, e) {
      if (e) { e.stopPropagation(); e.preventDefault(); }
      const track = document.getElementById('similarMoviesTrack');
      if (!track) return;
      const firstCard = track.querySelector('.tilt-card');
      if (!firstCard) return;
      const gap = parseFloat(window.getComputedStyle(track).gap) || 16;
      const cardWidth = firstCard.getBoundingClientRect().width + gap;
      const visibleCount = window.innerWidth >= 2200 ? 8 : (window.innerWidth >= 1536 ? 7 : (window.innerWidth >= 1280 ? 6 : (window.innerWidth >= 1024 ? 5 : (window.innerWidth >= 640 ? 3 : 2))));
      track.scrollBy({ left: cardWidth * visibleCount * direction, behavior: 'smooth' });
    }

    function scrollRelatedTrack(direction, e) {
      if (e) { e.stopPropagation(); e.preventDefault(); }
      const track = document.getElementById('relatedMoviesTrack');
      if (!track) return;
      const firstCard = track.querySelector('.tilt-card');
      if (!firstCard) return;
      const gap = parseFloat(window.getComputedStyle(track).gap) || 16;
      const cardWidth = firstCard.getBoundingClientRect().width + gap;
      const visibleCount = window.innerWidth >= 2200 ? 8 : (window.innerWidth >= 1536 ? 7 : (window.innerWidth >= 1280 ? 6 : (window.innerWidth >= 1024 ? 5 : (window.innerWidth >= 640 ? 3 : 2))));
      track.scrollBy({ left: cardWidth * visibleCount * direction, behavior: 'smooth' });
    }

    function scrollCastTrack(direction, e) {
      if (e) { e.stopPropagation(); e.preventDefault(); }
      const track = document.getElementById('castCrewTrack');
      if (!track) return;
      const firstCard = track.querySelector('.cast-chip-card');
      if (!firstCard) return;
      const gap = parseFloat(window.getComputedStyle(track).gap) || 12;
      const cardWidth = firstCard.getBoundingClientRect().width + gap;
      const visibleCount = window.innerWidth >= 2200 ? 8 : (window.innerWidth >= 1536 ? 7 : (window.innerWidth >= 1280 ? 6 : (window.innerWidth >= 1024 ? 5 : (window.innerWidth >= 640 ? 4 : 3))));
      track.scrollBy({ left: cardWidth * visibleCount * direction, behavior: 'smooth' });
    }

    function initDynamicScrollTrack(trackId, prevBtnId, nextBtnId, isCast) {
      const track = document.getElementById(trackId);
      const prevBtn = document.getElementById(prevBtnId);
      const nextBtn = document.getElementById(nextBtnId);
      if (!track) return;

      function updateUI() {
        const maxScroll = track.scrollWidth - track.clientWidth;
        const current = track.scrollLeft;

        if (prevBtn) {
          if (current <= 10) {
            prevBtn.classList.add('!hidden');
          } else {
            prevBtn.classList.remove('!hidden');
          }
        }

        if (nextBtn) {
          if (current >= maxScroll - 10 || maxScroll <= 10) {
            nextBtn.classList.add('!hidden');
          } else {
            nextBtn.classList.remove('!hidden');
          }
        }

        track.style.maskImage = 'none';
        track.style.webkitMaskImage = 'none';
      }

      track.addEventListener('scroll', updateUI, { passive: true });
      updateUI();
      setTimeout(updateUI, 100);
      setTimeout(updateUI, 300);

      let isDown = false;
      let startX = 0;
      let scrollLeft = 0;
      let isDragging = false;
      let velocity = 0;
      let lastX = 0;
      let lastT = 0;
      let momentumRAF = null;

      function stopMomentum() { if (momentumRAF) { cancelAnimationFrame(momentumRAF); momentumRAF = null; } }
      function applyMomentum() {
        if (Math.abs(velocity) < 0.5) { momentumRAF = null; return; }
        track.scrollLeft -= velocity;
        velocity *= 0.94;
        momentumRAF = requestAnimationFrame(applyMomentum);
      }

      track.onmousedown = (e) => {
        stopMomentum();
        isDown = true;
        isDragging = false;
        if (isCast) window.isCastDragging = false;
        startX = e.pageX - track.offsetLeft;
        scrollLeft = track.scrollLeft;
        lastX = e.pageX;
        lastT = performance.now();
        velocity = 0;
        track.style.cursor = 'grabbing';
      };
      track.onmouseleave = () => { if (isDown) { isDown = false; track.style.cursor = 'grab'; applyMomentum(); } };
      track.onmouseup = () => {
        isDown = false;
        track.style.cursor = 'grab';
        applyMomentum();
        if (isCast) setTimeout(() => { window.isCastDragging = false; }, 50);
      };
      track.onmousemove = (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - track.offsetLeft;
        const walk = (x - startX) * 1.5;
        if (Math.abs(walk) > 5) {
          isDragging = true;
          if (isCast) window.isCastDragging = true;
        }
        track.scrollLeft = scrollLeft - walk;
        const now = performance.now();
        const dt = now - lastT;
        if (dt > 0) velocity = ((e.pageX - lastX) * 1.5 / dt) * 16;
        lastX = e.pageX;
        lastT = now;
      };

      track.querySelectorAll('.tilt-card, .cast-chip-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (isDragging || (isCast && window.isCastDragging)) {
            e.preventDefault();
            e.stopPropagation();
          }
        }, true);
      });
    }

    function syncWatchNowHeight() {
      const track = document.getElementById('castCrewTrack');
      const box = document.getElementById('desktopWatchOptionsBox');
      if (!track || !box) return;
      const firstChip = track.querySelector('.cast-chip-card');
      if (firstChip && firstChip.offsetHeight > 40) {
        const exactH = Math.round(firstChip.offsetHeight);
        box.style.height = exactH + 'px';
        box.style.minHeight = exactH + 'px';
        box.style.maxHeight = exactH + 'px';
      }
    }

    let watchNowResizeObserver = null;
    function observeCastTrackHeight() {
      const track = document.getElementById('castCrewTrack');
      if (!track) return;
      syncWatchNowHeight();
      requestAnimationFrame(syncWatchNowHeight);
      setTimeout(syncWatchNowHeight, 80);
      setTimeout(syncWatchNowHeight, 250);
      setTimeout(syncWatchNowHeight, 600);
      if (!window.ResizeObserver) return;
      if (watchNowResizeObserver) {
        watchNowResizeObserver.disconnect();
      }
      watchNowResizeObserver = new ResizeObserver(() => {
        syncWatchNowHeight();
      });
      const firstChip = track.querySelector('.cast-chip-card');
      if (firstChip) watchNowResizeObserver.observe(firstChip);
      watchNowResizeObserver.observe(track);
    }
    let __watchNowResizeLastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      if (window.innerWidth === __watchNowResizeLastWidth) return;
      __watchNowResizeLastWidth = window.innerWidth;
      syncWatchNowHeight();
    });

    function bindCastCrewDrag() {
      initDynamicScrollTrack('castCrewTrack', 'castPrevBtn', 'castNextBtn', true);
      observeCastTrackHeight();
    }

    function applyTiltToSimilarGrid() {
      const track = document.getElementById('similarMoviesTrack');
      if (track) track.querySelectorAll('.tilt-card').forEach(card => apply3DTilt(card));
      initDynamicScrollTrack('similarMoviesTrack', 'similarPrevBtn', 'similarNextBtn', false);

      const relTrack = document.getElementById('relatedMoviesTrack');
      if (relTrack) relTrack.querySelectorAll('.tilt-card').forEach(card => apply3DTilt(card));
      initDynamicScrollTrack('relatedMoviesTrack', 'relatedPrevBtn', 'relatedNextBtn', false);
    }

    function refreshActorFilmographyGrid() {
      const actorPageContainer = document.getElementById('actorPageView');
      const isPageOpen = actorPageContainer && !actorPageContainer.classList.contains('hidden') && window.currentActorPageId;
      const actorModal = document.getElementById('actorModal');
      const isModalOpen = actorModal && !actorModal.classList.contains('hidden');
      const isInline = !isModalOpen && el.quickSearchResult && !el.quickSearchResult.classList.contains('hidden');
      const activeActorId = isPageOpen ? window.currentActorPageId : (isInline ? currentActorId : modalActiveActorId);
      const activeRoleHint = isPageOpen ? currentActorRoleHint : (isInline ? currentActorRoleHint : modalActiveActorRoleHint);

      if (!activeActorId) return;
      const person = actorDetailsCache.get(activeActorId);
      if (!person) return;

      const isPage = isPageOpen;
      const isModal = !isInline && !isPage;

      const grid = document.getElementById('actorFilmGrid');
      if (grid) {
        const { filmographyHtml, counts } = buildActorFilmographyGridHtml(person, actorModalWatchlistMode, activeRoleHint, isModal, isPage);
        grid.innerHTML = filmographyHtml;
        applyTiltToActorGrid();

        // Update tab buttons active state and badge counts smoothly without destroying hero / bio
        const container = isPage ? actorPageContainer : (isInline ? el.quickSearchResult : document.getElementById('actorModalContent'));
        if (container) {
          const tabBtns = container.querySelectorAll('.actor-tab-btn');
          if (tabBtns.length >= 4) {
            tabBtns[0].classList.toggle('active', actorMediaTypeFilter === 'watchlist');
            tabBtns[1].classList.toggle('active', actorMediaTypeFilter === 'all');
            tabBtns[2].classList.toggle('active', actorMediaTypeFilter === 'movie');
            tabBtns[3].classList.toggle('active', actorMediaTypeFilter === 'tv');
          }
          const tabBadges = container.querySelectorAll('.actor-tab-badge');
          if (tabBadges.length >= 4 && counts) {
            tabBadges[0].textContent = counts.watchlist;
            tabBadges[1].textContent = counts.all;
            tabBadges[2].textContent = counts.movie;
            tabBadges[3].textContent = counts.tv;
          }
          const totalCountEls = container.querySelectorAll('.actor-total-count');
          if (totalCountEls.length > 0 && counts) {
            totalCountEls.forEach(el => { el.textContent = `(${counts.all} total)`; });
          }

          // Update Role dropdown button label, icon, and popover state
          const roleLabelEl = document.getElementById('actorRoleLabel');
          const roleIcons = {
            'Actor': '🎭',
            'Director': '🎬',
            'Writer': '✍️',
            'Producer': '💼',
            'Composer': '🎵'
          };
          const activeRole = activeRoleHint || 'Actor';
          const activeIcon = roleIcons[activeRole] || '🎬';
          if (roleLabelEl) {
            roleLabelEl.textContent = activeRole;
            const trigger = roleLabelEl.closest('.custom-filter-trigger');
            if (trigger) {
              const iconSpan = trigger.querySelector('.text-sm');
              if (iconSpan) iconSpan.textContent = activeIcon;
            }
          }
          const rolePopover = document.getElementById('actorRolePopover');
          if (rolePopover) {
            rolePopover.querySelectorAll('.custom-filter-item').forEach(item => {
              const itemText = item.textContent || '';
              const isSel = itemText.includes(activeRole);
              item.classList.toggle('selected', isSel);
              const radio = item.querySelector('.custom-filter-radio');
              if (radio) {
                radio.innerHTML = isSel ? '<div class="custom-filter-radio-dot"></div>' : '';
              }
            });
          }
        }
        return;
      }

      if (isPageOpen) {
        const scrollTop = actorPageContainer.scrollTop;
        actorPageContainer.innerHTML = generateActorHTML(person, actorModalWatchlistMode, currentActorRoleHint, true, true);
        actorPageContainer.scrollTop = scrollTop;
        bindActorFilmControls();
        applyTiltToActorGrid();
        return;
      }

      if (isInline) {
        el.quickSearchResult.innerHTML = `<div class="glass-panel rounded-2xl sm:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-blue-500/20 animate-fade flex flex-col bg-[#0b1121] overflow-hidden relative">${generateActorHTML(person, actorModalWatchlistMode, currentActorRoleHint, false)}</div>`;
        const closeBtn = document.getElementById('closeActorModalBtn');
        if (closeBtn) closeBtn.onclick = () => { el.quickSearchResult.classList.add('hidden'); el.quickSearchResult.innerHTML = ''; quickSearchHistoryStack.length = 0; currentActorId = null; };
        const backBtnRefresh = document.getElementById('backToMovieBtn');
        if (backBtnRefresh) backBtnRefresh.onclick = navGoBack;
        bindActorFilmControls();
        applyTiltToActorGrid();
        return;
      }

      const content = document.getElementById('actorModalContent');
      if (!content) return;
      const scrollTop = content.scrollTop;
      content.innerHTML = generateActorHTML(person, actorModalWatchlistMode, modalActiveActorRoleHint, true);
      document.getElementById('closeActorModalBtn').onclick = closeActorModal;
      const backBtnRefresh = document.getElementById('backToMovieBtn');
      if (backBtnRefresh) backBtnRefresh.onclick = navGoBack;
      bindActorFilmControls();
      applyTiltToActorGrid();
      content.scrollTop = scrollTop;
    }

    async function refreshActorFilmography(isModal) {
      actorCurrentPage = 1;
      actorFilterQuery = '';
      actorFilterProviders = new Set(['all']);
      actorFilterGenres = new Set(['all']);
      actorFilterDecades = new Set(['all']);
      actorFilterProvider = 'all';
      actorFilterGenre = 'all';
      actorFilterDecade = 'all';
      actorFilterRating = 'all';
      window.actorFilterRating = 'all';
      actorFilterRuntime = 'all';
      window.actorFilterRuntime = 'all';
      actorFilterSort = 'popularity';
      refreshActorFilmographyGrid();
    }

    function setActorPage(p) {
      actorCurrentPage = p;
      refreshActorFilmographyGrid();
      const grid = document.getElementById('actorFilmGrid');
      if (grid) {
        if (isQuickSearchContext()) {
          const rect = grid.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          window.scrollTo({ top: Math.max(0, rect.top + scrollTop - 80), behavior: 'smooth' });
        } else {
          const content = document.getElementById('actorModalContent');
          if (content) content.scrollTop = grid.offsetTop - 40;
        }
      }
    }

    async function handleMovieClickFromContext(movieId, movieTitle, contextType, forceInline = null, mediaType = 'movie') {
      const isInline = forceInline !== null ? forceInline : isQuickSearchContext();
      const stack = isInline ? quickSearchHistoryStack : watchlistModalHistoryStack;

      const activeMovieObj = isInline ? window.currentActiveMovieObj : modalActiveMovieObj;
      const activeActorId = isInline ? currentActorId : modalActiveActorId;
      const activeRoleHint = isInline ? currentActorRoleHint : modalActiveActorRoleHint;

      if (!isNavigatingBack) {
        if (contextType === 'movie' && activeMovieObj) {
          pushToHistoryStack(stack, { type: 'movie', data: activeMovieObj });
        } else if (contextType === 'actor' && activeActorId) {
          const person = actorDetailsCache.get(activeActorId);
          pushToHistoryStack(stack, { type: 'actor', data: { id: activeActorId, name: person ? person.name : '', roleHint: activeRoleHint } });
        }
      }

      const watchlistMovie = scannedMovies.find(m => m.id === movieId && (m.mediaType || 'movie') === mediaType);
      if (watchlistMovie) {
        openMovieModal(watchlistMovie, isInline);
        return;
      }

      try {
        const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
        const res = await tmdbFetch(`https://api.themoviedb.org/3/${endpoint}/${movieId}?api_key=${TMDB_API_KEY}`);
        const movie = await res.json();
        if (movie && movie.id) {
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
          } catch (pe) { console.warn('[Movie Watch Providers Fetch]', pe); }
          openMovieModal(movieObj, isInline);
        }
      } catch (e) { console.error('Failed to load movie/tv:', e); }
    }

    async function handleSimilarMovieClick(movieId, movieTitle, forceInline = null, mediaType = 'movie') {
      return handleMovieClickFromContext(movieId, movieTitle, 'movie', forceInline, mediaType);
    }

    async function handleActorFilmClick(movieId, movieTitle, forceInline = null, mediaType = 'movie') {
      return handleMovieClickFromContext(movieId, movieTitle, 'actor', forceInline, mediaType);
    }

    // Filter tab rows (home results + actor page): decide per-row whether
    // all tabs fit without scrolling. If they fit, spread them evenly across
    // the bar; if not, let the row scroll.
    (function () {
      function layout(row) {
        // If the row isn't actually laid out yet (e.g. it just got inserted
        // into a modal that's still mid-reveal), clientWidth reads 0 and
        // "0 <= 0" would wrongly count as "fits", forcing all four tabs to
        // shrink into no space at all instead of scrolling. Skip and wait
        // for ResizeObserver to fire again once it has a real size.
        if (row.clientWidth === 0) return;
        row.classList.remove('tabs-fit');
        const fits = row.scrollWidth <= row.clientWidth + 1;
        row.classList.toggle('tabs-fit', fits);

        // iOS Safari quirk: a clickable descendant inside a native
        // (overflow: auto/scroll) container needs that scrolling container
        // itself to carry a click handler, or the first tap on the
        // descendant is silently consumed to stop scroll momentum instead
        // of firing its click - the tap visibly registers (:active flashes)
        // but nothing happens until a second tap. An empty handler is
        // enough to make WebKit treat taps on children normally.
        if (!row.dataset.tapFixBound) {
          row.dataset.tapFixBound = '1';
          row.addEventListener('click', function () { });
        }
      }

      // ResizeObserver only fires when a row's own box size actually
      // changes - it naturally re-measures once a hidden/mid-reveal row
      // gets its real size, and it's immune to Safari's address-bar
      // chrome resizing the viewport (that doesn't change this row's own
      // size unless the reflow actually affects it).
      const ro = new ResizeObserver((entries) => {
        entries.forEach((entry) => layout(entry.target));
      });
      function observe(row) {
        if (row.dataset.tabsObserved) return;
        row.dataset.tabsObserved = '1';
        ro.observe(row);
      }
      document.querySelectorAll('.filter-tabs-scroll').forEach(observe);

      // Still needed to catch freshly-inserted rows (e.g. the actor
      // filmography re-rendering) so we can start observing them.
      new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.matches && node.matches('.filter-tabs-scroll')) observe(node);
            if (node.querySelectorAll) node.querySelectorAll('.filter-tabs-scroll').forEach(observe);
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    })();

