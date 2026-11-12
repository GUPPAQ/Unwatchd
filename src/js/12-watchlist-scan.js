    // Own Vercel proxy first. Only if it fails do we fall back to the public CORS
    // proxies (raced against each other, losers aborted), so usernames normally
    // never leave our own infrastructure and we don't hit four services per page.
    const raceProxies = async (targetUrl, validatorFn, timeoutMs = 6000) => {
      const tryProxy = async (idx, sharedSignal = null) => {
        const label = PROXY_LABELS[idx] || `proxy-${idx}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        if (sharedSignal) sharedSignal.addEventListener('abort', () => controller.abort(), { once: true });
        try {
          const res = await fetch(CORS_PROXIES[idx](targetUrl), { cache: 'no-store', signal: controller.signal });
          if (!res.ok) {
            console.warn(`[Proxy: ${label}] HTTP ${res.status} for ${targetUrl}`);
            throw new Error(`HTTP ${res.status}`);
          }
          const txt = unwrapProxyResponse(await res.text());
          if (validatorFn(txt)) return txt;
          console.warn(`[Proxy: ${label}] Invalid content for ${targetUrl}, length=${txt ? txt.length : 0}`);
          throw new Error('Invalid content');
        } catch (e) {
          if (e.name === 'AbortError' && !sharedSignal?.aborted) {
            console.warn(`[Proxy: ${label}] TIMEOUT after ${timeoutMs}ms for ${targetUrl}`);
          }
          throw e;
        } finally {
          clearTimeout(timer);
        }
      };

      try {
        return await tryProxy(0);
      } catch (e) { /* fall through to public proxies */ }

      const shared = new AbortController();
      try {
        const fallbacks = CORS_PROXIES.slice(1).map((_, k) => tryProxy(k + 1, shared.signal));
        return await Promise.any(fallbacks);
      } catch (err) {
        console.error(`[raceProxies] All proxies failed for ${targetUrl}`, err.errors || err);
        return null;
      } finally {
        shared.abort();
      }
    };

    const fetchWatchlist = async (targetUser, labelPrefix) => {
      if (el.progressLabel) el.progressLabel.textContent = `${labelPrefix} (Verifying)...`;
      const cacheBust = Date.now();

      // Engine 1: Race RSS Feed across all proxies in parallel
      const rssTarget = `https://letterboxd.com/${targetUser}/watchlist/rss/?_=${cacheBust}`;
      const rssTxt = await raceProxies(rssTarget, (txt) => txt && (txt.includes('<item') || txt.includes('<rss')), 5000);
      if (rssTxt) {
        const rssFilms = parseLetterboxdRSS(rssTxt);
        if (rssFilms && rssFilms.length > 0) {
          console.log(`[Letterboxd RSS Engine] Parallel race won! Extracted ${rssFilms.length} films from RSS.`);
          return rssFilms;
        }
      }

      // Engine 2: Race HTML Watchlist Page 1 across all proxies in parallel
      const htmlTarget = `https://letterboxd.com/${targetUser}/watchlist/page/1/?_=${cacheBust}`;
      const page1Html = await raceProxies(htmlTarget, (txt) => {
        if (!txt) return false;
        if (txt.includes('Page not found') || txt.includes('404 Not Found')) return true; // Let downstream handle user not found
        return isGenuineWatchlistPage(txt, targetUser);
      }, 6000);

      if (!page1Html) { throw new Error(`PROXY_FAILURE:${targetUser}`); }
      if (page1Html.includes('Page not found') || page1Html.includes('404 Not Found')) {
        throw new Error(`USER_NOT_FOUND:${targetUser}`);
      }

      let totalPages = 1;
      try {
        const doc1 = new DOMParser().parseFromString(page1Html, 'text/html');
        const pageLinks = Array.from(doc1.querySelectorAll('.paginate-pages li a, .pagination a'));
        pageLinks.forEach(a => {
          const txt = a.textContent.trim();
          const pNum = parseInt(txt, 10);
          if (!isNaN(pNum) && pNum > totalPages) totalPages = pNum;
        });
      } catch (e) { console.warn('[Letterboxd Total Pages Parse]', e); }
      totalPages = Math.min(MAX_WATCHLIST_PAGES, totalPages);

      const fetchSinglePage = async (page) => {
        if (page === 1) return page1Html;
        const target = `https://letterboxd.com/${targetUser}/watchlist/page/${page}/?_=${cacheBust}`;
        return await raceProxies(target, (txt) => {
          return txt && !txt.includes('Just a moment...') && isGenuineWatchlistPage(txt, targetUser);
        }, 5000);
      };

      const pagesToFetch = [];
      for (let p = 2; p <= totalPages; p++) pagesToFetch.push(p);

      const rawPageResults = [page1Html];
      const PARALLEL_PAGE_BATCH = 5;

      for (let i = 0; i < pagesToFetch.length; i += PARALLEL_PAGE_BATCH) {
        if (cancelRequested) break;
        const chunk = pagesToFetch.slice(i, i + PARALLEL_PAGE_BATCH);
        if (el.progressLabel) el.progressLabel.textContent = `${labelPrefix} (Pages ${chunk[0]}-${chunk[chunk.length - 1]} of ${totalPages})...`;
        const chunkHtmls = await Promise.all(chunk.map(p => fetchSinglePage(p)));
        let anySuccess = false;
        chunkHtmls.forEach(html => {
          if (html) { rawPageResults.push(html); anySuccess = true; }
        });
        if (!anySuccess && chunk[0] > 1) break;
        await new Promise(r => setTimeout(r, 100));
      }

      const extracted = [];
      for (let pageIdx = 0; pageIdx < rawPageResults.length; pageIdx++) {
        if (cancelRequested) break;
        const html = rawPageResults[pageIdx];
        if (!html) continue;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        let candidatePosters = [];
        const inExcludedRegion = (elem) => !!(elem.closest('aside') || elem.closest('footer') || elem.closest('.sidebar') || elem.closest('.popular-films') || elem.closest('#popular-films') || elem.closest('.footer'));
        // Current Letterboxd markup (server-rendered, i.e. what a proxy fetch actually sees before
        // the page hydrates) wraps every watchlist poster in a LazyPoster react-component that
        // carries the real title/year/slug as data attributes directly. The .film-poster div nested
        // inside it is just an empty placeholder (no year, no slug) until the poster image lazy-loads
        // client-side - reading from it is what caused "Nowhere" (1997) to resolve to "Nowhere" (2023).
        candidatePosters = Array.from(doc.querySelectorAll('.react-component[data-component-class="LazyPoster"]')).filter(elem => !inExcludedRegion(elem));
        if (candidatePosters.length === 0) {
          const allLists = Array.from(doc.querySelectorAll('ul.poster-list')).filter(ul => {
            return !ul.closest('aside') && !ul.closest('footer') && !ul.closest('.sidebar') && !ul.closest('.popular-films') && !ul.closest('#popular-films') && !ul.closest('.footer');
          });
          let targetUl = null;
          if (allLists.length === 0) {
            targetUl = doc.querySelector('ul.poster-list');
          } else if (allLists.length === 1) {
            targetUl = allLists[0];
          } else {
            const mainCandidates = allLists.filter(ul => ul.closest('.col-17') || ul.closest('.col-16') || ul.closest('.col-main') || ul.closest('#content') || ul.closest('.content-wrap') || ul.closest('section.col-17'));
            const pool = mainCandidates.length ? mainCandidates : allLists;
            pool.sort((a, b) => b.querySelectorAll('.film-poster').length - a.querySelectorAll('.film-poster').length);
            targetUl = pool[0];
          }
          if (targetUl) {
            candidatePosters = Array.from(targetUl.querySelectorAll('.film-poster'));
          }
        }
        if (candidatePosters.length === 0) {
          const flat = Array.from(doc.querySelectorAll('.poster-list .film-poster, .film-poster')).filter(elem => {
            return !elem.closest('aside') && !elem.closest('footer') && !elem.closest('.sidebar') && !elem.closest('.popular-films');
          });
          const seenIds = new Set();
          for (const elem of flat) {
            const id = elem.getAttribute('data-film-id') || elem.getAttribute('data-film-slug') || elem.getAttribute('data-film-name');
            if (!id) { candidatePosters.push(elem); continue; }
            if (!seenIds.has(id)) { seenIds.add(id); candidatePosters.push(elem); }
            if (candidatePosters.length >= 28) break;
          }
          if (candidatePosters.length === 0) {
            candidatePosters = Array.from(doc.querySelectorAll('.poster-list .film-poster')).slice(0, 28);
          }
        }
        const AD_HINT_RE = /\b(ad|ads|advert|sponsor|sponsored|promo|promoted|suggested|favourite|favorite)\b/i;
        const looksLikeAd = (elem) => {
          let node = elem;
          while (node && node.nodeType === 1) {
            const cls = node.getAttribute('class') || '';
            const id = node.getAttribute('id') || '';
            if (AD_HINT_RE.test(cls) || AD_HINT_RE.test(id)) return true;
            if (node.tagName === 'UL' && node.classList.contains('poster-list')) break;
            node = node.parentElement;
          }
          return false;
        };
        candidatePosters = candidatePosters.filter(elem => !looksLikeAd(elem));
        candidatePosters.forEach(element => {
          // IMPORTANT: the raw HTML the app fetches (before Letterboxd's own JS hydrates the page)
          // wraps each poster like this:
          //   <div class="react-component" data-component-class="LazyPoster"
          //        data-item-name="Nowhere (1997)" data-item-slug="nowhere"
          //        data-item-link="/film/nowhere/" data-item-full-display-name="Nowhere (1997)"
          //        data-postered-identifier='{"lid":"286E","uid":"film:50782",...}'>
          //     <div class="poster film-poster">
          //       <img alt="Nowhere" src=".../empty-poster....png"/>   <-- lazy placeholder, NO year
          //       <span class="frame"><span class="frame-title"></span></span>  <-- empty until hydrated
          //     </div>
          //   </div>
          // All the reliable data (title WITH year, slug, link, internal id) lives on the *wrapper*,
          // not on the inner .film-poster div or its children - those are still empty placeholders
          // at fetch time. Reading from the inner div is exactly why "Nowhere" (1997) had no year
          // attached and got resolved to the wrong, unrelated "Nowhere" (2023) TMDB match.
          const wrapper = element.closest('[data-component-class="LazyPoster"]') || element.parentElement;

          let filmId = wrapper?.getAttribute('data-film-id') || element.getAttribute('data-film-id') || element.getAttribute('data-item-id') || element.dataset?.filmId || element.dataset?.itemId || null;
          if (!filmId) {
            const posteredRaw = (wrapper && wrapper.getAttribute('data-postered-identifier')) || element.getAttribute('data-postered-identifier');
            if (posteredRaw) {
              try {
                const posteredObj = JSON.parse(posteredRaw);
                if (posteredObj && posteredObj.uid) {
                  const m = String(posteredObj.uid).match(/(\d+)$/);
                  if (m) filmId = m[1];
                }
              } catch (e) { /* not JSON, ignore */ }
            }
          }

          const anchor = element.querySelector('a[href*="/film/"]') || element.closest('a[href*="/film/"]');
          const frameTitleEl = element.querySelector('.frame-title');
          const img = element.querySelector('img');

          // Build a clean "Title (YYYY)" string, wrapper attributes take priority since they're
          // reliably populated in the raw HTML; everything else is a best-effort fallback.
          let rawDisplay = (wrapper && (wrapper.getAttribute('data-item-full-display-name') || wrapper.getAttribute('data-item-name')))
            || (anchor && anchor.getAttribute('data-original-title'))
            || (frameTitleEl && frameTitleEl.textContent)
            || element.getAttribute('data-film-name') || element.getAttribute('data-item-name') || element.getAttribute('data-item-full-display-name')
            || '';
          rawDisplay = (rawDisplay || '').trim();
          if (!rawDisplay && img) {
            // Fall back to alt text, stripping the "Poster for " prefix Letterboxd sometimes adds.
            rawDisplay = (img.getAttribute('alt') || '').replace(/^poster for\s+/i, '').trim();
          }

          let title = rawDisplay;
          let year = (wrapper && (wrapper.getAttribute('data-item-release-year') || wrapper.getAttribute('data-item-year'))) || element.getAttribute('data-film-release-year') || element.getAttribute('data-film-year') || null;
          const yearMatch = rawDisplay.match(/\((\d{4})\)\s*$/);
          if (yearMatch) {
            if (!year) year = yearMatch[1];
            title = rawDisplay.slice(0, yearMatch.index).trim();
          }
          if (!title && img) { title = (img.getAttribute('alt') || '').replace(/^poster for\s+/i, '').replace(/\(\d{4}\)\s*$/i, '').trim(); }

          let slug = (wrapper && (wrapper.getAttribute('data-item-slug') || wrapper.getAttribute('data-item-link') || wrapper.getAttribute('data-target-link'))) || null;
          if (!slug) slug = element.getAttribute('data-film-slug') || element.getAttribute('data-item-slug') || element.getAttribute('data-target-link') || element.getAttribute('data-linked-film-slug') || element.dataset?.filmSlug || element.dataset?.itemSlug || element.dataset?.targetLink || null;
          if (!slug && anchor) slug = anchor.getAttribute('href');
          if (!slug) {
            const a = element.closest('a') || (element.parentElement ? element.parentElement.closest('a') : null);
            if (a) {
              const href = a.getAttribute('href') || '';
              if (href.includes('/film/')) slug = href;
            }
          }
          if (!slug && element.parentElement) {
            const parentA = element.parentElement.querySelector('a[href*="/film/"]') || element.parentElement.closest('a[href*="/film/"]');
            if (parentA) slug = parentA.getAttribute('href');
          }
          if (slug) {
            if (slug.includes('/film/')) slug = slug.replace(/^.*\/film\//, '').replace(/\/.*$/, '').trim();
          }
          if (!year && slug) {
            const sm = slug.match(/-(\d{4})$/);
            if (sm) year = sm[1];
          }
          if (title && title.toLowerCase() !== 'film poster' && title.trim().length > 0) {
            extracted.push({ filmId: filmId ? String(filmId).trim() : null, title: title.trim(), year: year ? String(year).trim() : null, slug: slug ? String(slug).trim() : null });
          }
        });
      }
      const seen = new Set(); const deduped = [];
      for (const obj of extracted) { const k = getFilmKey(obj); if (!seen.has(k)) { seen.add(k); deduped.push(obj); } }
      return deduped;
    };
    function resetUI() {
      isScanning = false; cancelRequested = false;
      const startBtn = document.getElementById('startButton');
      if (startBtn) { startBtn.disabled = false; startBtn.innerHTML = 'Execute'; }
      if (el.usernameInput) el.usernameInput.disabled = false; if (el.friendInput) el.friendInput.disabled = false; if (el.regionSelect) el.regionSelect.disabled = false; if (el.regionContainer) el.regionContainer.classList.remove('opacity-50', 'pointer-events-none');
      if (el.toggleFriendBtn) el.toggleFriendBtn.classList.remove('pointer-events-none', 'opacity-50'); document.querySelectorAll('.service-btn').forEach(b => b.classList.remove('locked'));
      const friendWrapperVisible = el.friendInputWrapper && !el.friendInputWrapper.classList.contains('hidden'); if (friendWrapperVisible) { if (el.removeFriendBtn) el.removeFriendBtn.classList.remove('hidden'); if (el.toggleFriendBtn) el.toggleFriendBtn.classList.add('hidden'); } else { if (el.toggleFriendBtn) el.toggleFriendBtn.classList.remove('hidden'); if (el.removeFriendBtn) el.removeFriendBtn.classList.add('hidden'); } toggleClearSyncBtn();
    }
    if (el.startButton) {
      el.startButton.addEventListener('click', async () => {
        if (isScanning) return;
        const browserEl = document.getElementById('serviceBrowser');
        if (browserEl && !browserEl.classList.contains('hidden')) {
          saveBrowser();
        }
        if (el.formError) el.formError.classList.add('hidden'); if (el.usernameInput) localStorage.setItem('ps_username', el.usernameInput.value); if (el.friendInput) localStorage.setItem('ps_friend_username', el.friendInput.value);
        const normalizeLetterboxdUser = (v) => {
          let u = (v || '').trim().toLowerCase();
          const m = u.match(/letterboxd\.com\/([^/?#\s]+)/); // accept a pasted profile link
          if (m) u = m[1];
          return u.replace(/^@/, '');
        };
        const isValidLetterboxdUser = (u) => /^[a-z0-9_]{1,40}$/.test(u);
        const username = normalizeLetterboxdUser(el.usernameInput ? el.usernameInput.value : ''); let friendName = normalizeLetterboxdUser(el.friendInput ? el.friendInput.value : '');
        if ((username && !isValidLetterboxdUser(username)) || (friendName && !isValidLetterboxdUser(friendName))) { if (el.formError) { el.formError.textContent = 'ERROR: Letterboxd usernames can only contain letters, numbers and underscores.'; el.formError.classList.remove('hidden'); } return; }
        if (el.friendInputWrapper && !el.friendInputWrapper.classList.contains('hidden') && friendName === '') { if (el.removeFriendBtn) el.removeFriendBtn.click(); friendName = ''; }
        if (selectedServiceIds.size === 0) { if (el.formError) { el.formError.textContent = 'ERROR: Minimum one network subscription required.'; el.formError.classList.remove('hidden'); } return; }
        if (!username && friendName) { if (el.formError) { el.formError.textContent = 'ERROR: Enter your own username to match with a friend.'; el.formError.classList.remove('hidden'); } return; }
        if (!username) { if (el.formError) { el.formError.textContent = 'ERROR: Letterboxd username required.'; el.formError.classList.remove('hidden'); } return; }
        if (username === friendName) { if (el.formError) { el.formError.textContent = 'ERROR: You cannot match with yourself.'; el.formError.classList.remove('hidden'); } return; }
        const myScanSessionId = ++activeScanSessionId;
        isScanning = true; cancelRequested = false; if (el.startButton) el.startButton.disabled = true; if (el.usernameInput) el.usernameInput.disabled = true; if (el.friendInput) el.friendInput.disabled = true; if (el.clearSyncBtn) el.clearSyncBtn.classList.add('hidden'); if (el.toggleFriendBtn) el.toggleFriendBtn.classList.add('pointer-events-none', 'opacity-50'); if (el.removeFriendBtn) el.removeFriendBtn.classList.add('hidden'); document.querySelectorAll('.service-btn').forEach(b => b.classList.add('locked')); if (el.startButton) el.startButton.innerHTML = '<span class="animate-pulse">Scanning...</span>';
        scannedMovies = []; if (el.resultsSection) el.resultsSection.classList.add('hidden'); if (el.statsBar) el.statsBar.classList.add('hidden');
        if (el.filterSearch) el.filterSearch.value = ''; if (el.clearResultsBtn) el.clearResultsBtn.classList.add('hidden');
        if (el.filterSort) el.filterSort.value = 'year_desc'; if (el.filterGenre) el.filterGenre.value = 'all'; if (el.filterDecade) el.filterDecade.value = 'all'; if (el.filterRuntime) el.filterRuntime.value = 'all';
        try {
          if (el.progressSection) el.progressSection.classList.remove('hidden'); if (el.progressBar) el.progressBar.style.width = `0%`; if (el.progressPercent) el.progressPercent.textContent = '0%';
          const myTitles = await fetchWatchlist(username, 'Pinging your servers');
          if (myScanSessionId !== activeScanSessionId || cancelRequested) return;
          if (myTitles.length === 0) throw new Error(`DATA EMPTY: Ensure ${username} is public.`);
          let titlesToProcess = myTitles;
          if (friendName) {
            if (el.progressBar) el.progressBar.style.width = `10%`; if (el.progressPercent) el.progressPercent.textContent = '10%';
            const friendTitles = await fetchWatchlist(friendName, 'Pinging friend servers');
            if (myScanSessionId !== activeScanSessionId || cancelRequested) return;
            if (friendTitles.length === 0) throw new Error(`DATA EMPTY: Ensure ${friendName} is public.`);
            const friendKeys = new Set(friendTitles.map(getFilmKey)); titlesToProcess = myTitles.filter(t => friendKeys.has(getFilmKey(t))); if (titlesToProcess.length === 0) { throw new Error('NO MATCHES: You and your friend have no movies in common!'); }
          }
          for (let i = 0; i < titlesToProcess.length; i += BATCH_SIZE) {
            if (myScanSessionId !== activeScanSessionId || cancelRequested) return;
            const batch = titlesToProcess.slice(i, i + BATCH_SIZE); const pct = 15 + ((i / titlesToProcess.length) * 85);
            if (el.progressLabel) el.progressLabel.textContent = `Cross-referencing global database (${i + 1} of ${titlesToProcess.length})...`; if (el.progressBar) el.progressBar.style.width = `${pct}%`; if (el.progressPercent) el.progressPercent.textContent = Math.round(pct) + '%';
            if (myScanSessionId !== activeScanSessionId || cancelRequested) return;
            await Promise.all(batch.map(async (qObj) => {
              if (myScanSessionId !== activeScanSessionId || cancelRequested) return;
              try {
                const best = await findBestMediaMatch(qObj);
                if (myScanSessionId !== activeScanSessionId || cancelRequested || !best) return;
                if (!best) return;
                const mediaType = best.__mediaType === 'tv' ? 'tv' : 'movie';
                const pUrl = `https://api.themoviedb.org/3/${mediaType}/${best.id}?api_key=${TMDB_API_KEY}&append_to_response=watch/providers,external_ids`;
                const pRes = await tmdbFetch(pUrl);
                const pData = await pRes.json().catch(() => ({}));
                if (pData && pData.id) {
                  const existing = movieDetailsCache.get(`${mediaType}_${best.id}`);
                  if (!existing || (!existing.credits && !existing.aggregate_credits)) {
                    movieDetailsCache.set(`${mediaType}_${best.id}`, pData);
                  }
                }
                const provResults = pData['watch/providers']?.results || pData.results || {};
                const filterAndDeduplicateProvidersScan = (list, isRentBuy = false) => {
                  if (!list || !Array.isArray(list)) return [];
                  const map = new Map();
                  for (const item of list) {
                    const canon = getCanonicalProvider(item, isRentBuy);
                    if (canon && !map.has(canon.provider_id)) {
                      map.set(canon.provider_id, canon);
                    }
                  }
                  return [...map.values()];
                };

                const optimizedProviders = {};
                if (provResults) {
                  for (const region in provResults) {
                    optimizedProviders[region] = {};
                    if (provResults[region].link) optimizedProviders[region].link = provResults[region].link;
                    if (provResults[region].flatrate) optimizedProviders[region].flatrate = filterAndDeduplicateProvidersScan(provResults[region].flatrate, false);
                    if (provResults[region].rent) optimizedProviders[region].rent = filterAndDeduplicateProvidersScan(provResults[region].rent, true);
                    if (provResults[region].buy) optimizedProviders[region].buy = filterAndDeduplicateProvidersScan(provResults[region].buy, true);
                  }
                }
                const bestTitle = getResultTitle(best);
                const bestDate = getResultDate(best);
                const filmSlug = qObj.slug || null;
                const runtimeMinutes = pData.runtime || (pData.episode_run_time ? pData.episode_run_time[0] : 0) || (pData.last_episode_to_air ? pData.last_episode_to_air.runtime : 0) || best.runtime || 0;
                if (myScanSessionId !== activeScanSessionId || cancelRequested) return;
                scannedMovies.push({
                  __scannedIndex: qObj.extractedIndex !== undefined ? qObj.extractedIndex : scannedMovies.length,
                  runtime: runtimeMinutes,
                  id: best.id,
                  mediaType,
                  title: bestTitle,
                  poster: best.poster_path ? `https://image.tmdb.org/t/p/w500${best.poster_path}` : null,
                  backdrop: best.backdrop_path ? `https://image.tmdb.org/t/p/w1280${best.backdrop_path}` : null,
                  rating: (typeof pData.vote_average === 'number' && pData.vote_average > 0) ? pData.vote_average.toFixed(1) : (best.vote_average ? best.vote_average.toFixed(1) : null),
                  releaseDate: bestDate,
                  originalLanguage: pData.original_language || best.original_language || 'en',
                  popularity: typeof pData.popularity === 'number' ? pData.popularity : (typeof best.popularity === 'number' ? best.popularity : 0),
                  vote_count: typeof pData.vote_count === 'number' ? pData.vote_count : (typeof best.vote_count === 'number' ? best.vote_count : 0),
                  genreIds: (pData.genres && pData.genres.length > 0) ? pData.genres.map(g => g.id) : (best.genre_ids || []),
                  url: (optimizedProviders[currentRegion] && optimizedProviders[currentRegion].link) ? optimizedProviders[currentRegion].link : `https://www.themoviedb.org/${mediaType}/${best.id}`,
                  allProviders: optimizedProviders,
                  slug: filmSlug,
                  imdbId: pData.external_ids?.imdb_id || null
                });
                if (filmSlug && best.id) {
                  registerSlug(filmSlug, best.id, mediaType === 'tv' ? 'series' : 'film');
                }
              } catch (e) { console.warn('[TMDB Watch Provider Scan Fetch]', e); }
            })); await new Promise(r => setTimeout(r, TMDB_REQUEST_DELAY_MS));
          }
          if (myScanSessionId !== activeScanSessionId || cancelRequested) return;
          if (el.progressLabel) el.progressLabel.textContent = 'Rendering Visual Matrix...'; if (el.progressBar) el.progressBar.style.width = '100%'; if (el.progressPercent) el.progressPercent.textContent = '100%';
          isFriendMatchActive = friendName !== ''; localStorage.setItem('ps_is_friend_match_active', isFriendMatchActive);

          // Deduplicate scannedMovies before sorting and storing
          const seenKeys = new Set();
          const uniqueScanned = [];
          for (const m of scannedMovies) {
            const k = `${m.mediaType || 'movie'}-${m.id}`;
            if (!seenKeys.has(k)) {
              seenKeys.add(k);
              uniqueScanned.push(m);
            }
          }
          scannedMovies = uniqueScanned;
          scannedMovies.sort((a, b) => (a.__scannedIndex || 0) - (b.__scannedIndex || 0)); saveScanToStorage(scannedMovies, isFriendMatchActive);
          setTimeout(() => {
            if (myScanSessionId !== activeScanSessionId || cancelRequested) return;
            if (el.progressSection) el.progressSection.classList.add('hidden');
            if (el.resultsSection) el.resultsSection.classList.remove('hidden');
            currentPage = 1; activeTab = 'stream';
            if (el.tabBtns) el.tabBtns.forEach(b => { b.classList.toggle('active', b.dataset.tab === 'stream'); });
            try {
              populateFilterDropdowns();
              applyFiltersAndRender();
              updateStats();
            } catch (err) { console.warn('[Post-Scan Render]', err); }
            resetUI();
            syncWatchlistImdbRatings(scannedMovies);
          }, 600);
        } catch (err) {
          if (myScanSessionId !== activeScanSessionId || cancelRequested) return;
          if (el.progressSection) el.progressSection.classList.add('hidden');
          let msg = err.message || '';
          if (msg.startsWith('USER_NOT_FOUND:')) {
            const u = msg.split(':')[1];
            msg = `Profile not found: ${u}. Make sure the username is spelled correctly and is public.`;
          } else if (msg.startsWith('PROXY_FAILURE:')) {
            msg = `Couldn't reach Letterboxd right now. Check your internet connection or try again in a moment.`;
          }
          if (el.formError) {
            el.formError.textContent = msg;
            el.formError.classList.remove('hidden');
          }
          resetUI();
        }
      });
    }
