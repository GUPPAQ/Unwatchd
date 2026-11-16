    const unwrapProxyResponse = (text) => {
      if (!text || typeof text !== 'string') return '';
      const trimmed = text.trim();
      if (trimmed.startsWith('{') && trimmed.includes('"contents"')) {
        try {
          const parsed = JSON.parse(trimmed);
          return parsed.contents || text;
        } catch (e) {
          return text;
        }
      }
      return text;
    };


    const isGenuineWatchlistPage = (rawHtml, targetUser) => {
      if (!rawHtml) return false;
      const html = unwrapProxyResponse(rawHtml);
      if (!html || typeof html !== 'string') return false;
      const lower = html.toLowerCase();
      if (lower.includes('page not found') || lower.includes('404 not found')) return false;
      if (lower.includes('film-poster') || lower.includes('data-film-id') || lower.includes('poster-list')) return true;
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const title = (doc.title || '').toLowerCase();
        const hasContainer = !!doc.querySelector('.poster-list, ul.poster-list, .film-poster');
        const titleLooksRight = title.includes('watchlist') || (targetUser && title.includes(targetUser.toLowerCase()));
        return hasContainer || titleLooksRight;
      } catch (e) {
        return false;
      }
    };
    function normalizeTitle(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
    function getFilmKey(obj) {
      if (obj.filmId) return 'lb-' + obj.filmId;
      const slugKey = obj.slug ? obj.slug.toLowerCase().trim() : '';
      const titleKey = normalizeTitle(obj.title);
      const yearKey = obj.year || (obj.slug ? (obj.slug.match(/-(\d{4})$/)?.[1] || '') : '');
      return (slugKey || titleKey) + '|' + yearKey;
    }
    function getResultTitle(r) { return r.title || r.name || ''; }
    function getResultOriginalTitle(r) { return r.original_title || r.original_name || ''; }
    function getResultDate(r) { return r.release_date || r.first_air_date || null; }

    const byVotesThenPopularity = (a, b) => (b.vote_count || 0) - (a.vote_count || 0) || (b.popularity || 0) - (a.popularity || 0);
    function getResultYear(r) {
      const d = getResultDate(r);
      const y = d ? parseInt(d.slice(0, 4), 10) : NaN;
      return isNaN(y) ? null : y;
    }
    function isExactTitleMatch(r, qNorm) {
      return normalizeTitle(getResultTitle(r)) === qNorm || normalizeTitle(getResultOriginalTitle(r)) === qNorm;
    }

    // How watchlist films are matched to TMDB entries. The rules were tuned against 505 real
    // watchlist films whose true TMDB ids were read from Letterboxd's own film pages:
    //  - Letterboxd takes titles from TMDB, so the title (or original title) matches exactly.
    //    Every correct match in the sample did; "similar title" guesses only produced wrong films.
    //  - Letterboxd's year is the film's earliest release anywhere (festivals included), while
    //    TMDB's date is the main release. So TMDB's year is the same (91%) or one later (9%),
    //    never earlier. A same-titled film from the year before is a different film.
    //  - Letterboxd is a film site: a film beats a TV show of the same title.
    //  - No year on Letterboxd means an unreleased film, which has no date on TMDB either.
    //    A dated namesake is a different film.
    // When nothing fits, the answer is "not found" rather than a popular film with the same name.
    const FAST_MATCH_MIN_VOTES = 25;

    // Best of `list` whose year is the Letterboxd year or the one after. The exact year wins
    // unless a next-year candidate is clearly the better-known film (3x the votes): festival
    // films often share a title with an obscure film from the festival year.
    function pickForLetterboxdYear(list, qYear) {
      let best = null, bestScore = -1;
      for (const r of list) {
        const y = getResultYear(r);
        if (y !== qYear && y !== qYear + 1) continue;
        const score = ((r.vote_count || 0) + 1) / (y === qYear ? 1 : 3);
        if (score > bestScore || (score === bestScore && (r.popularity || 0) > (best.popularity || 0))) { best = r; bestScore = score; }
      }
      return best;
    }

    function findBestTmdbMatch(queryObj, results) {
      if (!results || results.length === 0) return null;
      const qNorm = normalizeTitle(queryObj.title);
      let qYear = queryObj.year ? parseInt(queryObj.year) : null;
      if (!qYear && queryObj.slug) {
        const sm = queryObj.slug.match(/-(\d{4})$/);
        if (sm) qYear = parseInt(sm[1]);
      }
      if (!qNorm) return null;
      const films = results.filter(r => r.__mediaType === 'movie');
      const shows = results.filter(r => r.__mediaType === 'tv');

      for (const group of [films, shows]) {
        const exact = group.filter(r => isExactTitleMatch(r, qNorm));
        if (exact.length === 0) continue;
        if (qYear) {
          const inWindow = pickForLetterboxdYear(exact, qYear);
          if (inWindow) return inWindow;
        } else {
          const undated = exact.filter(r => getResultYear(r) === null);
          if (undated.length > 0) return undated.sort(byVotesThenPopularity)[0];
        }
      }

      // Last resort, only with a year to anchor on: TMDB may have retitled the film since
      // Letterboxd last synced (say, a subtitle was added). Accept a title that contains the
      // whole query, or the reverse, as complete words - and only for titles of two or more
      // words, since a single word like "Beau" turns up inside too many unrelated titles.
      if (qYear) {
        const containsWords = (long, short) => short.includes(' ') && ` ${long} `.includes(` ${short} `);
        const similar = films.filter(r => {
          const t = normalizeTitle(getResultTitle(r));
          return t && (containsWords(t, qNorm) || containsWords(qNorm, t));
        });
        return pickForLetterboxdYear(similar, qYear);
      }
      return null;
    }

    const personCreditsCache = new Map();
    async function getPersonCombinedCredits(personId) {
      if (!personId) return null;
      if (personCreditsCache.has(personId)) return personCreditsCache.get(personId);
      try {
        const res = await tmdbFetch(`https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${TMDB_API_KEY}`);
        const data = await res.json();
        personCreditsCache.set(personId, data);
        return data;
      } catch (e) {
        return null;
      }
    }

    const SEARCH_STOPWORDS = new Set([
      'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'is', 'it', 'as', 'be', 'this', 'that', 'movie', 'film', 'show', 'tv'
    ]);

    function stripArticles(s) {
      return (s || '').replace(/^(the|a|an)\s+/i, '').trim();
    }

    function scoreSearchResult(item, queryRaw) {
      if (!item || !queryRaw) return 0;
      let score = item.__keywordBoost || 0;

      const qNorm = normalizeTitle(queryRaw);
      const qNoArticles = stripArticles(qNorm);

      const yearMatch = queryRaw.match(/\b(19\d\d|20\d\d)\b/);
      const targetYear = yearMatch ? yearMatch[1] : null;
      const cleanQuery = targetYear ? queryRaw.replace(/\b(19\d\d|20\d\d)\b/, '').trim() : queryRaw;
      const cleanQNorm = normalizeTitle(cleanQuery);
      const cleanQNoArticles = stripArticles(cleanQNorm);

      const displayTitle = getResultTitle(item);
      const titleNorm = normalizeTitle(displayTitle);
      const titleNoArticles = stripArticles(titleNorm);

      const origTitle = getResultOriginalTitle(item);
      const origNorm = normalizeTitle(origTitle);
      const origNoArticles = stripArticles(origNorm);

      const date = getResultDate(item);
      const itemYear = (date && typeof date === 'string' && date.length >= 4) ? date.substring(0, 4) : '';
      const isPerson = item.__mediaType === 'person';

      const voteCount = item.vote_count || 0;
      const voteAvg = item.vote_average || 0;
      const popularity = item.popularity || 0;

      // Smart logarithmic popularity score: massive titles (thousands of votes) float up naturally over obscure 0-vote entries
      const popScore = (Math.log10(voteCount + 1) * 1500) + (Math.min(popularity, 200) * 20) + (voteAvg * 100);

      if (!isPerson) {
        // --- MOVIE / TV SHOW SCORING ---
        // 1. Exact Title Match (Highest priority)
        if (titleNorm === qNorm || origNorm === qNorm || titleNorm === cleanQNorm || origNorm === cleanQNorm) {
          score += 60000;
        } else if (titleNoArticles === qNoArticles || origNoArticles === qNoArticles || titleNoArticles === cleanQNoArticles || origNoArticles === cleanQNoArticles) {
          score += 55000;
        }
        // 2. Starts with query
        else if (titleNorm.startsWith(cleanQNorm) || origNorm.startsWith(cleanQNorm)) {
          score += 30000;
        } else if (titleNoArticles.startsWith(cleanQNoArticles) || origNoArticles.startsWith(cleanQNoArticles)) {
          score += 25000;
        }
        // 3. Contains as whole word / phrase
        else if (new RegExp('\\b' + cleanQNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(titleNorm) || new RegExp('\\b' + cleanQNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(origNorm)) {
          score += 18000;
        } else if (titleNorm.includes(cleanQNorm) || origNorm.includes(cleanQNorm)) {
          score += 12000;
        } else {
          // Word coverage
          const queryWords = cleanQNorm.split(/\s+/).filter(w => w.length >= 2 && !SEARCH_STOPWORDS.has(w));
          if (queryWords.length > 0) {
            let matchedWords = 0;
            queryWords.forEach(w => {
              if (titleNorm.includes(w) || origNorm.includes(w)) matchedWords++;
            });
            if (matchedWords === queryWords.length && queryWords.length > 1) {
              score += 22000;
            } else if (matchedWords > 0) {
              score += matchedWords * 3500;
            }
          }
        }

        // Year match handling
        if (targetYear) {
          if (itemYear === targetYear) {
            score += 30000;
          } else if (itemYear) {
            const diff = Math.abs(parseInt(itemYear, 10) - parseInt(targetYear, 10));
            if (diff > 1) score -= 12000;
          }
        }

        score += popScore;
      } else {
        // --- PERSON SCORING ---
        // 1. Exact Person Name Match (e.g. "Christopher Nolan")
        if (titleNorm === qNorm || titleNorm === cleanQNorm) {
          score += 58000;
        }
        // 2. Starts with person name
        else if (titleNorm.startsWith(cleanQNorm)) {
          const isSingleWordQuery = !cleanQNorm.includes(' ');
          score += isSingleWordQuery ? 15000 : 28000;
        } else if (new RegExp('\\b' + cleanQNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(titleNorm)) {
          score += 12000;
        } else if (titleNorm.includes(cleanQNorm)) {
          score += 6000;
        }

        // Popularity boost for person
        score += Math.min(popularity, 150) * 100;
      }

      return score;
    }

    async function searchMultiMedia(titleQuery) {
      if (!titleQuery || typeof titleQuery !== 'string') return [];
      const cleanRaw = titleQuery.trim();
      if (cleanRaw.length < 2) return [];

      const yearMatch = cleanRaw.match(/\b(19\d\d|20\d\d)\b/);
      const targetYear = yearMatch ? yearMatch[1] : null;
      const cleanQuery = targetYear ? cleanRaw.replace(/\b(19\d\d|20\d\d)\b/, '').replace(/\s+/g, ' ').trim() : cleanRaw;

      // Primary multi searches
      const searchPromises = [
        tmdbFetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&include_adult=false&query=${encodeURIComponent(cleanRaw)}`).then(r => r.json()).catch(() => ({}))
      ];
      if (cleanQuery && cleanQuery !== cleanRaw && cleanQuery.length >= 2) {
        searchPromises.push(
          tmdbFetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&include_adult=false&query=${encodeURIComponent(cleanQuery)}`).then(r => r.json()).catch(() => ({}))
        );
      }
      if (targetYear && cleanQuery.length >= 2) {
        searchPromises.push(
          tmdbFetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&include_adult=false&query=${encodeURIComponent(cleanQuery)}&primary_release_year=${targetYear}`).then(r => r.json()).catch(() => ({}))
        );
      }

      // Smart Decomposition into Title + Person or Keyword chunks (e.g. "fight club David Fincher", "oppenheimer Cillian Murphy")
      const strippedQuery = cleanQuery.replace(/\b(by|with|directed by|starring|dir|featuring|feat|and)\b/gi, ' ').replace(/\s+/g, ' ').trim();
      const words = strippedQuery.split(/\s+/).filter(Boolean);

      const candidateSplits = [];
      if (words.length >= 2) {
        for (let i = 1; i < words.length; i++) {
          const partA = words.slice(0, i).join(' ').trim();
          const partB = words.slice(i).join(' ').trim();
          const normA = normalizeTitle(partA);
          const normB = normalizeTitle(partB);
          // Ensure neither part is a stopword and both parts have substance (>= 3 chars)
          if (normA.length >= 3 && !SEARCH_STOPWORDS.has(normA) && normB.length >= 3 && !SEARCH_STOPWORDS.has(normB)) {
            candidateSplits.push([partA, partB]);
            candidateSplits.push([partB, partA]);
          }
        }
      }

      const personLookups = new Set();
      candidateSplits.forEach(([partA, partB]) => {
        personLookups.add(partA);
      });

      const personPromises = Array.from(personLookups).slice(0, 4).map(name =>
        tmdbFetch(`https://api.themoviedb.org/3/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}`)
          .then(r => r.json())
          .then(data => ({ name, results: (data.results || []).filter(p => (p.popularity || 0) >= 1.2).slice(0, 2) }))
          .catch(() => ({ name, results: [] }))
      );

      try {
        const [mainResponses, personResponses] = await Promise.all([
          Promise.all(searchPromises),
          Promise.all(personPromises)
        ]);

        const seenKeys = new Set();
        const results = [];

        function addResult(item, mediaType = null, extraData = {}) {
          const type = mediaType || item.media_type || item.__mediaType || (item.title ? 'movie' : (item.name && item.first_air_date ? 'tv' : (item.profile_path ? 'person' : 'movie')));
          if (type !== 'movie' && type !== 'tv' && type !== 'person') return;
          const key = `${type}_${item.id}`;
          if (seenKeys.has(key)) {
            const existing = results.find(r => `${r.__mediaType}_${r.id}` === key);
            if (existing) {
              if (extraData.matchedRole && !existing.matchedRole) existing.matchedRole = extraData.matchedRole;
              if (extraData.__keywordBoost && (!existing.__keywordBoost || existing.__keywordBoost < extraData.__keywordBoost)) {
                existing.__keywordBoost = extraData.__keywordBoost;
              }
            }
            return;
          }
          seenKeys.add(key);
          results.push({ ...item, __mediaType: type, ...extraData });
        }

        // 1. Add main multi-search results
        mainResponses.forEach(data => {
          (data.results || []).forEach(r => addResult(r));
        });

        // 2. Add reputable person search results and cross-reference film credits
        const allFoundPeople = [];
        personResponses.forEach(pObj => {
          pObj.results.forEach(p => {
            addResult(p, 'person');
            allFoundPeople.push({ person: p, queryTerm: pObj.name });
          });
        });

        const creditsPromises = allFoundPeople.slice(0, 4).map(async ({ person, queryTerm }) => {
          const credits = await getPersonCombinedCredits(person.id);
          if (!credits) return;

          const isDirector = (person.known_for_department === 'Directing') || ((person.job || '') === 'Director');
          const isWriter = person.known_for_department === 'Writing';

          const allCredits = [
            ...(credits.crew || []).map(c => ({ ...c, __crewRole: c.job || 'Crew' })),
            ...(credits.cast || []).map(c => ({ ...c, __castRole: c.character || 'Cast' }))
          ];

          const pNorm = normalizeTitle(person.name);
          const qTermNorm = normalizeTitle(queryTerm);
          if (!pNorm.includes(qTermNorm) && !qTermNorm.includes(pNorm)) return;

          candidateSplits.forEach(([partA, partB]) => {
            if (normalizeTitle(partA) !== qTermNorm) return;
            const targetTitleNorm = normalizeTitle(partB);
            const targetNoArticles = stripArticles(targetTitleNorm);
            if (targetTitleNorm.length < 2 || SEARCH_STOPWORDS.has(targetTitleNorm)) return;

            const targetRegex = new RegExp('\\b' + targetTitleNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');

            allCredits.forEach(cr => {
              const crTitle = normalizeTitle(cr.title || cr.name || cr.original_title || cr.original_name);
              if (!crTitle) return;
              const crNoArticles = stripArticles(crTitle);

              const exactTitle = (crTitle === targetTitleNorm || crNoArticles === targetNoArticles);
              const startsTitle = (crTitle.startsWith(targetTitleNorm) || crNoArticles.startsWith(targetNoArticles));
              const wordMatch = targetRegex.test(crTitle);

              if (exactTitle || startsTitle || wordMatch) {
                const wasDirector = cr.__crewRole === 'Director' || isDirector;
                const wasWriter = cr.__crewRole === 'Writer' || isWriter;
                let roleDescription = `Starring ${person.name}`;
                if (wasDirector) roleDescription = `Directed by ${person.name}`;
                else if (wasWriter) roleDescription = `Written by ${person.name}`;

                addResult(cr, cr.media_type || (cr.first_air_date ? 'tv' : 'movie'), {
                  matchedRole: roleDescription,
                  __keywordBoost: exactTitle ? 35000 : (startsTitle ? 20000 : 12000)
                });
              }
            });
          });
        });

        await Promise.all(creditsPromises);
        return results;
      } catch (e) {
        console.warn('[Enhanced Search Multi Error]', e);
        return searchBothMedia(titleQuery);
      }
    }
    // One TMDB title search (film or TV), optionally limited to a release year.
    async function searchMedia(mediaType, titleQuery, year) {
      const isTv = mediaType === 'tv';
      const yearParam = year ? `&${isTv ? 'first_air_date_year' : 'primary_release_year'}=${encodeURIComponent(year)}` : '';
      const url = `https://api.themoviedb.org/3/search/${isTv ? 'tv' : 'movie'}?api_key=${TMDB_API_KEY}&include_adult=false&query=${encodeURIComponent(titleQuery)}${yearParam}`;
      const data = await tmdbFetch(url).then(r => r.json()).catch((e) => { console.warn(`[TMDB Search ${isTv ? 'TV' : 'Movie'} Catch]`, e); return {}; });
      return (data.results || []).map(r => ({ ...r, __mediaType: isTv ? 'tv' : 'movie' }));
    }
    async function searchBothMedia(titleQuery, year) {
      const [movieResults, tvResults] = await Promise.all([searchMedia('movie', titleQuery, year), searchMedia('tv', titleQuery, year)]);
      return [...movieResults, ...tvResults];
    }

    // Remembers which TMDB entry each watchlist film resolved to, so repeat scans skip the
    // searches. v14: matching rules changed (exact year first, films before TV, undated for
    // unreleased films) and entries are stored slimmed down.
    const TMDB_MATCH_CACHE_KEY = 'ps_tmdb_matches_v14';
    try { localStorage.removeItem('ps_tmdb_matches_v13'); } catch (e) { logIgnored('TMDB match cache cleanup', e); }
    window.clearTmdbCache = function () {
      try {
        localStorage.removeItem(TMDB_MATCH_CACHE_KEY);
        tmdbMatchCache.clear();
        console.log('TMDB Match Cache successfully cleared!');
        return 'Cache cleared';
      } catch (e) { console.warn('Cache clear error', e); }
    };

    let tmdbMatchCache = new Map();
    try {
      const stored = localStorage.getItem(TMDB_MATCH_CACHE_KEY);
      if (stored) tmdbMatchCache = new Map(JSON.parse(stored));
    } catch (e) { console.warn('[TMDB Match Cache Read]', e); }

    // Only the fields the scan reads from a match (no plot text etc.), to keep the cache small.
    function slimTmdbMatch(r) {
      const slim = { id: r.id, __mediaType: r.__mediaType };
      for (const field of ['title', 'name', 'original_title', 'original_name', 'release_date', 'first_air_date', 'poster_path', 'backdrop_path', 'vote_average', 'vote_count', 'popularity', 'genre_ids', 'original_language']) {
        if (r[field] !== undefined && r[field] !== null && r[field] !== '') slim[field] = r[field];
      }
      return slim;
    }

    // Writing is debounced: a scan resolves hundreds of films, and serialising the whole
    // cache after each one froze the page for longer and longer as the cache grew.
    let saveTmdbMatchCacheTimer = null;
    function saveTmdbMatchCache() {
      if (saveTmdbMatchCacheTimer) return;
      saveTmdbMatchCacheTimer = setTimeout(() => {
        saveTmdbMatchCacheTimer = null;
        writeTmdbMatchCache();
      }, 1500);
    }
    function writeTmdbMatchCache() {
      // If the localStorage quota is exceeded, keep fewer of the most recent entries rather
      // than dropping the write, so the cache still helps on the next scan.
      const sizes = [3000, 1500, 750, 350, 150, 50];
      for (const size of sizes) {
        try {
          const entries = Array.from(tmdbMatchCache.entries()).slice(-size);
          localStorage.setItem(TMDB_MATCH_CACHE_KEY, JSON.stringify(entries));
          return;
        } catch (e) {
          if (size === sizes[sizes.length - 1]) console.warn('[TMDB Match Cache Write] giving up, quota still exceeded at minimum size', e);
        }
      }
    }

    // A festival film can reach its main release years after its premiere ("Neo Tokyo"
    // premiered in 1987 and was released in 1989). Letterboxd dates a film by its premiere, so
    // for same-titled films dated two or three years later, ask TMDB for the earliest release
    // anywhere and accept the film if that falls in the Letterboxd year.
    async function findLateReleaseMatch(results, qNorm, qYear) {
      const late = results
        .filter(r => r.__mediaType === 'movie' && isExactTitleMatch(r, qNorm))
        .filter(r => { const y = getResultYear(r); return y !== null && y > qYear + 1 && y <= qYear + 3; })
        .sort(byVotesThenPopularity)
        .slice(0, 3);
      for (const r of late) {
        try {
          const data = await tmdbFetch(`https://api.themoviedb.org/3/movie/${r.id}/release_dates?api_key=${TMDB_API_KEY}`).then(res => res.json());
          const earliest = (data.results || []).flatMap(c => c.release_dates || []).map(d => d.release_date).filter(Boolean).sort()[0];
          if (earliest && parseInt(earliest.slice(0, 4), 10) === qYear) return r;
        } catch (e) { logIgnored('findLateReleaseMatch', e); }
      }
      return null;
    }

    async function findBestMediaMatch(qObj) {
      const key = getFilmKey(qObj);
      if (tmdbMatchCache.has(key)) {
        return tmdbMatchCache.get(key);
      }
      let qYear = qObj.year ? parseInt(qObj.year) : null;
      if (!qYear && qObj.slug) {
        const sm = qObj.slug.match(/-(\d{4})$/);
        if (sm) qYear = parseInt(sm[1]);
      }
      const qNorm = normalizeTitle(qObj.title);
      let best = null;
      let combined = [];
      if (qYear && qNorm) {
        // Step 1: one film search limited to the Letterboxd year. A reasonably well-known film
        // with exactly this title settles it - the common case, at one request per film.
        const sameYear = await searchMedia('movie', qObj.title, qYear);
        const top = pickForLetterboxdYear(sameYear.filter(r => isExactTitleMatch(r, qNorm)), qYear);
        if (top && (top.vote_count || 0) >= FAST_MATCH_MIN_VOTES) {
          best = top;
        } else {
          // Step 2: also look one year later (see the notes above findBestTmdbMatch).
          const nextYear = await searchMedia('movie', qObj.title, qYear + 1);
          best = pickForLetterboxdYear([...sameYear, ...nextYear].filter(r => isExactTitleMatch(r, qNorm)), qYear);
          if (!best) {
            // Step 3: no film with this title in either year. Widen to TV and to searches
            // without a year, and let findBestTmdbMatch judge everything.
            const [scopedShows, films, shows] = await Promise.all([
              searchMedia('tv', qObj.title, qYear), searchMedia('movie', qObj.title), searchMedia('tv', qObj.title)
            ]);
            combined = dedupeMediaResults([...sameYear, ...nextYear, ...scopedShows, ...films, ...shows]);
          }
        }
      } else {
        combined = await searchBothMedia(qObj.title);
      }
      if (!best) {
        if (combined.length === 0 && /\b\d{4}\b/.test(qObj.title)) {
          const noYearLike = qObj.title.replace(/\b\d{4}\b/g, ' ').replace(/\s+/g, ' ').trim();
          if (noYearLike && noYearLike.length >= 3) {
            combined = await searchBothMedia(noYearLike);
          }
        }
        best = findBestTmdbMatch(qObj, combined);
        if (!best && qYear && qNorm) best = await findLateReleaseMatch(combined, qNorm, qYear);
      }
      if (best) {
        tmdbMatchCache.set(key, slimTmdbMatch(best));
        saveTmdbMatchCache();
      }
      return best;
    }
    const PROXY_LABELS = ['own-vercel', 'codetabs', 'allorigins'];
