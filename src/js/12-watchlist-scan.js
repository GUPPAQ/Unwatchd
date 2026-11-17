    // Fetches a Letterboxd page through our own proxy (/api/proxy), and nowhere else:
    // usernames never go to third-party services, and no third party can hand us a page.
    // Returns the page text, LETTERBOXD_NOT_FOUND when Letterboxd answered 404 (no such
    // user), or null when the page couldn't be fetched or doesn't look like the right page.
    const LETTERBOXD_NOT_FOUND = '__LETTERBOXD_404__';
    const fetchLetterboxdPage = async (targetUrl, validatorFn, timeoutMs = 6000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`, { cache: 'no-store', signal: controller.signal });
        if (res.status === 404) return LETTERBOXD_NOT_FOUND;
        if (!res.ok) {
          console.warn(`[Letterboxd proxy] HTTP ${res.status} for ${targetUrl}`);
          return null;
        }
        const txt = await res.text();
        if (validatorFn(txt)) return txt;
        console.warn(`[Letterboxd proxy] Unexpected content for ${targetUrl}, length=${txt ? txt.length : 0}`);
        return null;
      } catch (e) {
        console.warn(`[Letterboxd proxy] ${e.name === 'AbortError' ? `Timed out after ${timeoutMs}ms` : 'Request failed'} for ${targetUrl}`, e);
        return null;
      } finally {
        clearTimeout(timer);
      }
    };

    const fetchWatchlist = async (targetUser, labelPrefix) => {
      if (el.progressLabel) el.progressLabel.textContent = `${labelPrefix}…`;
      // No cache-busting query on these URLs: our proxy drops it anyway and caches pages for
      // two minutes, so repeat scans don't hit Letterboxd again.

      // There is no RSS step: Letterboxd has no public watchlist feed (the URL is behind a
      // Cloudflare challenge), so trying it only made every scan fail through all proxies first.
      const htmlTarget = `https://letterboxd.com/${targetUser}/watchlist/page/1/`;
      const page1Html = await fetchLetterboxdPage(htmlTarget, (txt) => {
        if (!txt) return false;
        if (txt.includes('Page not found') || txt.includes('404 Not Found')) return true; // Let downstream handle user not found
        return isGenuineWatchlistPage(txt, targetUser);
      }, 6000);

      if (!page1Html) { throw new Error(`PROXY_FAILURE:${targetUser}`); }
      if (page1Html === LETTERBOXD_NOT_FOUND || page1Html.includes('Page not found') || page1Html.includes('404 Not Found')) {
        throw new Error(`USER_NOT_FOUND:${targetUser}`);
      }
      // Letterboxd states the watchlist size on the page itself. Reading it lets us tell a
      // genuinely empty (or hidden) watchlist apart from a page we failed to parse.
      const entriesMatch = page1Html.match(/data-num-entries="(\d+)"/);
      const reportedEntries = entriesMatch ? parseInt(entriesMatch[1], 10) : null;
      if (reportedEntries === 0) { throw new Error(`WATCHLIST_EMPTY:${targetUser}`); }

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
      // Cross-check against the film count, so a pagination markup change can't silently
      // shrink the scan to page 1.
      if (reportedEntries) totalPages = Math.max(totalPages, Math.ceil(reportedEntries / LETTERBOXD_PAGE_SIZE));
      const pagesBeyondCap = Math.max(0, totalPages - MAX_WATCHLIST_PAGES);
      totalPages = Math.min(MAX_WATCHLIST_PAGES, totalPages);

      const fetchSinglePage = async (page) => {
        if (page === 1) return page1Html;
        const target = `https://letterboxd.com/${targetUser}/watchlist/page/${page}/`;
        const txt = await fetchLetterboxdPage(target, (txt) => {
          return txt && !txt.includes('Just a moment...') && isGenuineWatchlistPage(txt, targetUser);
        }, 5000);
        return txt === LETTERBOXD_NOT_FOUND ? null : txt;
      };

      // Pages are stored by page number so retried pages keep their place in watchlist order.
      const pageHtmlByNumber = new Map([[1, page1Html]]);
      const PARALLEL_PAGE_BATCH = 5;

      // Fetches the given pages in batches. Stops early if a whole batch fails (the proxies
      // are probably down, so hammering on would only add timeouts). Returns pages not fetched.
      const fetchPages = async (pages, retrying) => {
        const failed = [];
        for (let i = 0; i < pages.length; i += PARALLEL_PAGE_BATCH) {
          if (cancelRequested) return [];
          const chunk = pages.slice(i, i + PARALLEL_PAGE_BATCH);
          if (el.progressLabel) el.progressLabel.textContent = retrying
            ? `${labelPrefix} (Retrying ${pages.length} page${pages.length === 1 ? '' : 's'})...`
            : `${labelPrefix} (Pages ${chunk[0]}-${chunk[chunk.length - 1]} of ${totalPages})...`;
          const chunkHtmls = await Promise.all(chunk.map(p => fetchSinglePage(p)));
          chunkHtmls.forEach((html, k) => {
            if (html) pageHtmlByNumber.set(chunk[k], html); else failed.push(chunk[k]);
          });
          if (chunkHtmls.every(html => !html)) return failed.concat(pages.slice(i + PARALLEL_PAGE_BATCH));
          await new Promise(r => setTimeout(r, 100));
        }
        return failed;
      };

      const pagesToFetch = [];
      for (let p = 2; p <= totalPages; p++) pagesToFetch.push(p);
      let missingPages = await fetchPages(pagesToFetch, false);
      if (missingPages.length && !cancelRequested) {
        console.warn(`[fetchWatchlist] ${missingPages.length} page(s) failed for ${targetUser}, retrying once:`, missingPages);
        missingPages = await fetchPages(missingPages, true);
      }
      if (missingPages.length && !cancelRequested) {
        console.error(`[fetchWatchlist] Gave up on ${missingPages.length} of ${totalPages} page(s) for ${targetUser}:`, missingPages);
      }
      const rawPageResults = [...pageHtmlByNumber.keys()].sort((a, b) => a - b).map(p => pageHtmlByNumber.get(p));

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
      if (deduped.length === 0 && !cancelRequested) {
        // The page loaded and Letterboxd didn't say it was empty, yet we found no films:
        // that's our parser failing, not anything the user did.
        console.error(`[fetchWatchlist] Parsed 0 films for ${targetUser}; Letterboxd reported ${reportedEntries ?? 'unknown'} entries`);
        throw new Error(`PARSE_FAILURE:${targetUser}`);
      }
      return { films: deduped, reportedEntries, totalPages, missingPages: missingPages.length, pagesBeyondCap };
    };
    // Builds the warning shown when a scan finished without every watchlist page.
    // `who` is "your" or "name's".
    const describeIncompleteScan = (who, scan) => {
      const notes = [];
      if (scan.missingPages) {
        const pages = `${scan.missingPages} of ${scan.totalPages} page${scan.totalPages === 1 ? '' : 's'}`;
        notes.push(`Letterboxd didn't send ${pages} of ${who} watchlist, so up to ${scan.missingPages * LETTERBOXD_PAGE_SIZE} films are missing. Scan again to try for the rest.`);
      }
      if (scan.pagesBeyondCap) {
        notes.push(`Only the first ${(MAX_WATCHLIST_PAGES * LETTERBOXD_PAGE_SIZE).toLocaleString()} films of ${who} watchlist were scanned.`);
      }
      return notes;
    };
    const setScanNotice = (notes) => {
      const box = document.getElementById('scanNotice');
      if (!box) return;
      box.textContent = notes.join(' ');
      box.classList.toggle('hidden', notes.length === 0);
    };
    function resetUI() {
      isScanning = false; cancelRequested = false;
      const startBtn = document.getElementById('startButton');
      if (startBtn) { startBtn.disabled = false; startBtn.innerHTML = 'Find my films'; }
      if (el.usernameInput) el.usernameInput.disabled = false; if (el.friendInput) el.friendInput.disabled = false; if (el.regionSelect) el.regionSelect.disabled = false; if (el.regionContainer) el.regionContainer.classList.remove('opacity-50', 'pointer-events-none');
      const pill = document.getElementById('servicePill'); if (pill) pill.disabled = false;
      syncFriendClearBtn(); toggleClearSyncBtn();
    }
    if (el.startButton) {
      el.startButton.addEventListener('click', async () => {
        if (isScanning) return;
        const browserEl = document.getElementById('serviceBrowser');
        if (browserEl && !browserEl.classList.contains('hidden')) {
          saveBrowser();
        }
        if (el.formError) el.formError.classList.add('hidden'); setScanNotice([]); if (el.usernameInput) localStorage.setItem('ps_username', el.usernameInput.value); if (el.friendInput) localStorage.setItem('ps_friend_username', el.friendInput.value);
        const normalizeLetterboxdUser = (v) => {
          let u = (v || '').trim().toLowerCase();
          const m = u.match(/letterboxd\.com\/([^/?#\s]+)/); // accept a pasted profile link
          if (m) u = m[1];
          return u.replace(/^@/, '');
        };
        const isValidLetterboxdUser = (u) => /^[a-z0-9_]{1,40}$/.test(u);
        const username = normalizeLetterboxdUser(el.usernameInput ? el.usernameInput.value : ''); let friendName = normalizeLetterboxdUser(el.friendInput ? el.friendInput.value : '');
        if ((username && !isValidLetterboxdUser(username)) || (friendName && !isValidLetterboxdUser(friendName))) { if (el.formError) { el.formError.textContent = 'Letterboxd usernames only use letters, numbers and underscores.'; el.formError.classList.remove('hidden'); } return; }
        if (selectedServiceIds.size === 0) { if (el.formError) { el.formError.textContent = 'Pick at least one streaming service first.'; el.formError.classList.remove('hidden'); } return; }
        if (!username && friendName) { if (el.formError) { el.formError.textContent = 'Enter your own username too, to compare with a friend.'; el.formError.classList.remove('hidden'); } return; }
        if (!username) { if (el.formError) { el.formError.textContent = 'Enter your Letterboxd username.'; el.formError.classList.remove('hidden'); } return; }
        if (username === friendName) { if (el.formError) { el.formError.textContent = 'That\'s your own username. Enter a friend\'s to compare.'; el.formError.classList.remove('hidden'); } return; }
        const myScanSessionId = ++activeScanSessionId; scanPanelExpanded = false; tonightPickKey = null;
        isScanning = true; cancelRequested = false; if (el.startButton) el.startButton.disabled = true; if (el.usernameInput) el.usernameInput.disabled = true; if (el.friendInput) el.friendInput.disabled = true; if (el.clearSyncBtn) el.clearSyncBtn.classList.add('hidden'); if (el.removeFriendBtn) el.removeFriendBtn.classList.add('hidden'); { const pill = document.getElementById('servicePill'); if (pill) pill.disabled = true; } if (el.startButton) el.startButton.innerHTML = '<span class="animate-pulse">Scanning...</span>';
        scannedMovies = []; if (el.resultsSection) el.resultsSection.classList.add('hidden');
        if (el.filterSearch) el.filterSearch.value = ''; if (el.clearResultsBtn) el.clearResultsBtn.classList.add('hidden');
        if (el.filterSort) el.filterSort.value = 'year_desc'; if (el.filterGenre) el.filterGenre.value = 'all'; if (el.filterDecade) el.filterDecade.value = 'all'; if (el.filterRuntime) el.filterRuntime.value = 'all';
        try {
          if (el.progressSection) el.progressSection.classList.remove('hidden'); if (el.progressBar) el.progressBar.style.width = `0%`; if (el.progressPercent) el.progressPercent.textContent = '0%';
          const myScan = await fetchWatchlist(username, 'Reading your watchlist');
          if (myScanSessionId !== activeScanSessionId || cancelRequested) return;
          const myTitles = myScan.films;
          if (myTitles.length === 0) throw new Error(`WATCHLIST_EMPTY:${username}`);
          const incompleteNotes = describeIncompleteScan('your', myScan);
          let titlesToProcess = myTitles;
          if (friendName) {
            if (el.progressBar) el.progressBar.style.width = `10%`; if (el.progressPercent) el.progressPercent.textContent = '10%';
            const friendScan = await fetchWatchlist(friendName, 'Reading your friend\'s watchlist');
            if (myScanSessionId !== activeScanSessionId || cancelRequested) return;
            const friendTitles = friendScan.films;
            if (friendTitles.length === 0) throw new Error(`WATCHLIST_EMPTY:${friendName}`);
            incompleteNotes.push(...describeIncompleteScan(`${friendName}'s`, friendScan));
            const friendKeys = new Set(friendTitles.map(getFilmKey)); titlesToProcess = myTitles.filter(t => friendKeys.has(getFilmKey(t))); if (titlesToProcess.length === 0) { throw new Error('You and your friend don\'t have any films in common on your watchlists.'); }
          }
          titlesToProcess.forEach((t, idx) => { t.extractedIndex = idx; }); // watchlist order, used to order the saved scan
          // Films are resolved by a rolling pool of workers: when one film finishes, that worker
          // takes the next. (They used to go in groups of 30 that each waited for their slowest
          // request, so one slow TMDB answer held up 29 finished films.)
          const totalFilms = titlesToProcess.length;
          let nextFilmIndex = 0; let filmsDone = 0;
          const showScanProgress = () => {
            const pct = 15 + ((filmsDone / totalFilms) * 85);
            if (el.progressLabel) el.progressLabel.textContent = `Finding where your films stream (${Math.min(filmsDone + 1, totalFilms)} of ${totalFilms})…`; if (el.progressBar) el.progressBar.style.width = `${pct}%`; if (el.progressPercent) el.progressPercent.textContent = Math.round(pct) + '%';
          };
          showScanProgress();
          const processFilm = async (qObj) => {
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
                const filterAndDeduplicateProvidersScan = (list, isRentBuy, region) => {
                  if (!list || !Array.isArray(list)) return [];
                  const map = new Map();
                  for (const item of list) {
                    const canon = getCanonicalProvider(item, isRentBuy, region);
                    if (canon && !map.has(canon.provider_id)) {
                      map.set(canon.provider_id, slimProviderForStorage(canon));
                    }
                  }
                  return [...map.values()];
                };

                const optimizedProviders = {};
                if (provResults) {
                  for (const region in provResults) {
                    // Keep only regions the app can show (the region picker and VPN mode both
                    // go by REGION_META). TMDB returns about 60 per film.
                    if (!REGION_META[region]) continue;
                    optimizedProviders[region] = {};
                    if (provResults[region].link) optimizedProviders[region].link = provResults[region].link;
                    if (provResults[region].flatrate) optimizedProviders[region].flatrate = filterAndDeduplicateProvidersScan(provResults[region].flatrate, false, region);
                    if (provResults[region].rent) optimizedProviders[region].rent = filterAndDeduplicateProvidersScan(provResults[region].rent, true, region);
                    if (provResults[region].buy) optimizedProviders[region].buy = filterAndDeduplicateProvidersScan(provResults[region].buy, true, region);
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
          };
          const scanWorker = async () => {
            while (nextFilmIndex < totalFilms) {
              if (myScanSessionId !== activeScanSessionId || cancelRequested) return;
              await processFilm(titlesToProcess[nextFilmIndex++]);
              filmsDone++;
              if (myScanSessionId === activeScanSessionId && !cancelRequested) showScanProgress();
            }
          };
          await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, totalFilms) }, scanWorker));
          if (myScanSessionId !== activeScanSessionId || cancelRequested) return;
          if (el.progressLabel) el.progressLabel.textContent = 'Almost done…'; if (el.progressBar) el.progressBar.style.width = '100%'; if (el.progressPercent) el.progressPercent.textContent = '100%';
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
            } catch (err) { console.warn('[Post-Scan Render]', err); }
            resetUI();
            setScanNotice(incompleteNotes);
            syncWatchlistImdbRatings(scannedMovies);
          }, 600);
        } catch (err) {
          if (myScanSessionId !== activeScanSessionId || cancelRequested) return;
          if (el.progressSection) el.progressSection.classList.add('hidden');
          let msg = err.message || '';
          if (msg.startsWith('USER_NOT_FOUND:')) {
            const u = msg.split(':')[1];
            msg = `Couldn't find a Letterboxd profile called ${u}. Check the spelling.`;
          } else if (msg.startsWith('PROXY_FAILURE:')) {
            msg = `Couldn't reach Letterboxd right now. That's a problem on our side, not your privacy settings. Please try again in a moment.`;
          } else if (msg.startsWith('WATCHLIST_EMPTY:')) {
            const u = msg.split(':')[1];
            msg = `Letterboxd shows no films on ${u}'s watchlist. If that's wrong, the watchlist may be hidden in their Letterboxd privacy settings.`;
          } else if (msg.startsWith('PARSE_FAILURE:')) {
            const u = msg.split(':')[1];
            msg = `We reached Letterboxd but couldn't read ${u}'s watchlist. Letterboxd may have changed its page. This is on our side, please try again later.`;
          }
          if (el.formError) {
            el.formError.textContent = msg;
            el.formError.classList.remove('hidden');
          }
          resetUI();
        }
      });
    }
