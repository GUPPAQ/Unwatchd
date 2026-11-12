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


    const parseLetterboxdRSS = (xmlText) => {
      if (!xmlText || typeof xmlText !== 'string') return null;
      if (!xmlText.includes('<item') && !xmlText.includes('<rss')) return null;

      try {
        const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
        const items = Array.from(doc.querySelectorAll('item'));
        if (!items || items.length === 0) return null;

        const films = [];
        items.forEach(item => {
          const titleEl = item.querySelector('title');
          const linkEl = item.querySelector('link');
          const filmTitleEl = item.getElementsByTagName('letterboxd:filmTitle')[0] || item.querySelector('filmTitle');
          const filmYearEl = item.getElementsByTagName('letterboxd:filmYear')[0] || item.querySelector('filmYear');

          let rawTitle = titleEl ? titleEl.textContent.trim() : '';
          let link = linkEl ? linkEl.textContent.trim() : '';
          let title = filmTitleEl ? filmTitleEl.textContent.trim() : '';
          let year = filmYearEl ? parseInt(filmYearEl.textContent.trim(), 10) : null;

          if (!year && rawTitle) {
            const m = rawTitle.match(/\((19\d\d|20\d\d)\)/);
            if (m) year = parseInt(m[1], 10);
          }

          if (!title && rawTitle) {
            title = rawTitle.replace(/\s*\((19\d\d|20\d\d)\)\s*$/, '').trim();
          }

          let slug = '';
          if (link) {
            const m = link.match(/\/film\/([^\/]+)/);
            if (m) slug = m[1];
          }

          if (title) {
            films.push({
              title,
              year,
              slug,
              filmId: slug || normalizeTitle(title)
            });
          }
        });

        return films.length > 0 ? films : null;
      } catch (e) {
        console.warn('[Letterboxd RSS Parse Error]', e);
        return null;
      }
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

    function findBestTmdbMatch(queryObj, results) {
      if (!results || results.length === 0) return null;
      const qNorm = normalizeTitle(queryObj.title);
      let qYear = queryObj.year ? parseInt(queryObj.year) : null;
      if (!qYear && queryObj.slug) {
        const sm = queryObj.slug.match(/-(\d{4})$/);
        if (sm) qYear = parseInt(sm[1]);
      }
      if (!qNorm) return null;
      const nonPersonResults = results.filter(r => r.__mediaType !== 'person');
      const moviesOnly = nonPersonResults.filter(r => r.__mediaType === 'movie');
      const candidateList = (queryObj.type === 'movie' && moviesOnly.length > 0) ? moviesOnly : (nonPersonResults.length > 0 ? nonPersonResults : results);

      const exactMatches = candidateList.filter(r => {
        const t = normalizeTitle(getResultTitle(r));
        const orig = normalizeTitle(getResultOriginalTitle(r));
        return t === qNorm || orig === qNorm;
      });

      if (exactMatches.length > 0) {
        if (qYear) {
          const exactYearMatches = exactMatches.filter(r => {
            const d = getResultDate(r);
            return d && Math.abs(parseInt(d.split('-')[0]) - qYear) <= 1;
          });
          if (exactYearMatches.length > 0) {
            return exactYearMatches.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0) || (b.popularity || 0) - (a.popularity || 0))[0];
          }
        }
        return [...exactMatches].sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0) || (b.popularity || 0) - (a.popularity || 0))[0];
      }

      if (qYear) {
        const yearCandidates = candidateList.filter(r => {
          const d = getResultDate(r);
          return d && Math.abs(parseInt(d.split('-')[0]) - qYear) <= 1;
        });
        if (yearCandidates.length > 0) {
          return yearCandidates.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0) || (b.popularity || 0) - (a.popularity || 0))[0];
        }
      }

      const qWords = new Set(qNorm.split(' ').filter(w => w.length > 2));
      const filtered = candidateList.filter(r => {
        const t = normalizeTitle(getResultTitle(r));
        return [...qWords].some(w => t.includes(w));
      }).sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0) || (b.popularity || 0) - (a.popularity || 0));

      if (filtered.length > 0) return filtered[0];
      return [...candidateList].sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0) || (b.popularity || 0) - (a.popularity || 0))[0] || null;
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
    async function searchBothMedia(titleQuery, year) {
      const yearParamMovie = year ? `&primary_release_year=${encodeURIComponent(year)}` : '';
      const yearParamTv = year ? `&first_air_date_year=${encodeURIComponent(year)}` : '';
      const movieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&include_adult=false&query=${encodeURIComponent(titleQuery)}${yearParamMovie}`;
      const tvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&include_adult=false&query=${encodeURIComponent(titleQuery)}${yearParamTv}`;
      const [movieRes, tvRes] = await Promise.all([
        tmdbFetch(movieUrl).then(r => r.json()).catch((e) => { console.warn('[TMDB Search Movie Catch]', e); return {}; }),
        tmdbFetch(tvUrl).then(r => r.json()).catch((e) => { console.warn('[TMDB Search TV Catch]', e); return {}; })
      ]);
      const movieResults = (movieRes.results || []).map(r => ({ ...r, __mediaType: 'movie' }));
      const tvResults = (tvRes.results || []).map(r => ({ ...r, __mediaType: 'tv' }));
      return [...movieResults, ...tvResults];
    }
    const TMDB_MATCH_CACHE_KEY = 'ps_tmdb_matches_v13'; // bumped: extraction now reads title/year/slug from the LazyPoster wrapper, not the empty inner placeholder
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

    function saveTmdbMatchCache() {
      // If we blow the localStorage quota (this does happen in practice - full TMDB result
      // objects for ~1500 titles add up), don't just drop the write silently: progressively
      // keep fewer of the most-recent entries until it fits, so the cache still helps on the
      // next scan instead of being empty (and re-hitting the TMDB API for everything) every time.
      const sizes = [1500, 750, 350, 150, 50];
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
      let combined = await searchBothMedia(qObj.title);
      // When we know the release year (from Letterboxd), also run a year-scoped search and merge
      // it in. TMDB's plain title search ranks results by relevance/popularity, so an obscure
      // exact-title match (e.g. the 1997 cult film "Nowhere") can end up buried behind a far more
      // popular same-titled result (e.g. the 2023 Netflix film "Nowhere") and never surface. Scoping
      // the query by year makes TMDB itself resolve the ambiguity instead of relying purely on
      // whatever happened to come back from an unscoped text search.
      if (qYear) {
        const yearScoped = await searchBothMedia(qObj.title, qYear);
        if (yearScoped.length > 0) combined = dedupeMediaResults([...yearScoped, ...combined]);
      }
      if (combined.length === 0 && /\b\d{4}\b/.test(qObj.title)) {
        const noYearLike = qObj.title.replace(/\b\d{4}\b/g, ' ').replace(/\s+/g, ' ').trim();
        if (noYearLike && noYearLike.length >= 3) {
          combined = await searchBothMedia(noYearLike);
        }
      }
      if (combined.length === 0 && qObj.title.includes(',')) {
        const shortTitle = qObj.title.split(',')[0].trim();
        if (shortTitle && shortTitle.length >= 3) {
          combined = await searchBothMedia(shortTitle);
        }
      }
      const best = findBestTmdbMatch(qObj, combined);
      if (best) {
        tmdbMatchCache.set(key, best);
        saveTmdbMatchCache();
      }
      return best;
    }
    const PROXY_LABELS = ['own-vercel', 'corsproxy.io', 'codetabs', 'allorigins'];
