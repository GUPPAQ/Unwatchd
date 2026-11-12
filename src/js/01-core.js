    const decodeHTMLEntities = (str) => {
      if (typeof str !== 'string') return str;
      return str
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    };
    const escapeHTML = (str) => {
      if (typeof str !== 'string') return str;
      const decoded = decodeHTMLEntities(str);
      return decoded
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };
    // Errors we deliberately swallow (best-effort UI work, optional caches, etc.).
    // Silent in normal use; open the site with ?debug (or set localStorage
    // 'unwatchd_debug' to '1') to see them in the console.
    const DEBUG_IGNORED_ERRORS = (() => {
      try { return new URLSearchParams(location.search).has('debug') || localStorage.getItem('unwatchd_debug') === '1'; }
      catch (e) { return false; }
    })();
    function logIgnored(context, error) {
      if (DEBUG_IGNORED_ERRORS) console.debug(`[ignored] ${context}:`, error);
    }

    const TMDB_API_KEY = "774f07552749a1ca68245403367e3218";
    const IMDB_TAG_HTML = `<span class="poster-rating-tag bg-[#F5C518] text-black font-black px-1 py-0.5 rounded-[2.5px] text-[9px] leading-none select-none tracking-tighter shrink-0" style="font-family: Impact, 'Arial Black', -apple-system, BlinkMacSystemFont, sans-serif; letter-spacing: -0.04em;">IMDb</span>`;


    // All TMDB requests go through here: at most TMDB_MAX_CONCURRENT in flight, and
    // "429 Too Many Requests" / 5xx / network errors are retried with backoff instead
    // of silently turning into "not streaming anywhere".
    const TMDB_MAX_CONCURRENT = 20;
    let tmdbActiveRequests = 0;
    const tmdbWaitQueue = [];
    async function tmdbFetch(url, init) {
      for (let attempt = 0; ; attempt++) {
        while (tmdbActiveRequests >= TMDB_MAX_CONCURRENT) await new Promise(r => tmdbWaitQueue.push(r));
        tmdbActiveRequests++;
        let res = null;
        try {
          res = await fetch(url, init);
        } catch (e) {
          if (init?.signal?.aborted || attempt >= 2) throw e;
        } finally {
          tmdbActiveRequests--;
          const next = tmdbWaitQueue.shift();
          if (next) next();
        }
        if (res && res.status !== 429 && res.status < 500) return res;
        if (attempt >= 3) return res;
        const retryAfter = res ? parseFloat(res.headers.get('Retry-After')) : NaN;
        const delay = !isNaN(retryAfter) ? retryAfter * 1000 : 500 * 2 ** attempt + Math.random() * 250;
        await new Promise(r => setTimeout(r, delay));
      }
    }
    function slugify(text) {
      if (!text) return '';
      return text.toString().toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+|-+$/g, '');
    }
    const slugCacheMap = new Map();
    function registerSlug(slug, id, type, role = '') {
      if (slug && id) {
        slugCacheMap.set(`${type}:${slug}`, { id, type, role });
        slugCacheMap.set(slug, { id, type, role });
      }
    }
    function dedupeMediaResults(list) {
      const seen = new Set();
      const out = [];
      for (const r of list) {
        const k = `${r.__mediaType || 'movie'}-${r.id}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(r);
      }
      return out;
    }

    async function fetchMediaCandidates(titleQuery, targetYear, mediaType = 'movie') {
      const baseSlug = slugify(titleQuery);
      const query = baseSlug.replace(/-/g, ' ');
      const endpoint = mediaType === 'tv' ? 'search/tv' : 'search/movie';
      const yearParam = targetYear ? (mediaType === 'tv' ? `&first_air_date_year=${targetYear}` : `&primary_release_year=${targetYear}`) : '';

      const url1 = `https://api.themoviedb.org/3/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
      const url2 = targetYear ? `https://api.themoviedb.org/3/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}${yearParam}` : null;

      const [res1, res2] = await Promise.all([
        tmdbFetch(url1).then(r => r.json()).catch(() => ({})),
        url2 ? tmdbFetch(url2).then(r => r.json()).catch(() => ({})) : Promise.resolve({})
      ]);

      let combined = dedupeMediaResults([...(res2.results || []).map(r => ({ ...r, __mediaType: mediaType })), ...(res1.results || []).map(r => ({ ...r, __mediaType: mediaType }))]);

      if (combined.length === 0 && targetYear) {
        const rawRes = await tmdbFetch(`https://api.themoviedb.org/3/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(titleQuery)}`).then(r => r.json()).catch(() => ({}));
        combined = (rawRes.results || []).map(r => ({ ...r, __mediaType: mediaType }));
      }
      return combined;
    }

    function sortExactMediaMatches(items) {
      return items.slice().sort((a, b) => {
        const dateA = a.release_date || a.first_air_date || a.releaseDate || '';
        const dateB = b.release_date || b.first_air_date || b.releaseDate || '';
        const yearA = dateA ? dateA.split('-')[0] : '9999';
        const yearB = dateB ? dateB.split('-')[0] : '9999';
        if (yearA !== yearB) return yearA.localeCompare(yearB);

        // Same year: primary/major release with higher vote count and popularity comes first
        const vcA = a.vote_count || a.voteCount || 0;
        const vcB = b.vote_count || b.voteCount || 0;
        if (vcA !== vcB) return vcB - vcA;

        const popA = a.popularity || 0;
        const popB = b.popularity || 0;
        if (popA !== popB) return popB - popA;

        if (dateA && dateB && dateA !== dateB) return dateA.localeCompare(dateB);
        return (a.id || 0) - (b.id || 0);
      });
    }
    function assignUniqueScannedSlugs(movies) {
      if (!Array.isArray(movies) || movies.length === 0) return;

      const titleGroups = new Map();
      movies.forEach(m => {
        const title = m.title || '';
        const base = slugify(title);
        if (!base) return;
        if (!titleGroups.has(base)) titleGroups.set(base, []);
        titleGroups.get(base).push(m);
      });

      titleGroups.forEach((group, base) => {
        const sorted = sortExactMediaMatches(group);
        const yearGroups = new Map();

        sorted.forEach(m => {
          const yr = (m.releaseDate || '').split('-')[0];
          if (!yearGroups.has(yr)) yearGroups.set(yr, []);
          yearGroups.get(yr).push(m);
        });

        yearGroups.forEach((mList, yr) => {
          mList.forEach((m, idx) => {
            if (yr) {
              m.slug = idx > 0 ? `${base}-${yr}-${idx}` : `${base}-${yr}`;
            } else {
              m.slug = idx > 0 ? `${base}-${idx}` : base;
            }
            registerSlug(m.slug, m.id, m.mediaType === 'tv' ? 'series' : 'film');
          });
        });
      });
    }
    function parseRouteInfo() {
      const hash = window.location.hash || '';
      const path = window.location.pathname || '';
      const rawRoute = (hash || path).replace(/^#/, '');
      if (!rawRoute) return null;

      const parts = rawRoute.split('/').filter(Boolean);
      if (parts.length === 0) return null;

      let category = parts[0].toLowerCase();
      let rawSlug = parts[1] || '';
      let subPath = parts[2] || '';

      // Legacy fallback (e.g. #movie-122 or #actor-287)
      if (category.startsWith('movie-')) {
        const id = parseInt(category.replace('movie-', ''), 10);
        if (!isNaN(id)) return { type: 'film', id, mediaType: 'movie' };
      }
      if (category.startsWith('series-') || category.startsWith('tv-')) {
        const id = parseInt(category.replace(/^(series|tv)-/, ''), 10);
        if (!isNaN(id)) return { type: 'film', id, mediaType: 'tv' };
      }
      if (category.startsWith('actor-')) {
        const id = parseInt(category.replace('actor-', ''), 10);
        if (!isNaN(id)) return { type: 'actor', id, role: 'Actor' };
      }

      if (!rawSlug && parts.length === 1) {
        rawSlug = parts[0];
        category = 'film';
      }
      if (!rawSlug) return null;

      const isCast = subPath === 'cast' || rawSlug.endsWith('-cast');
      const cleanSlug = rawSlug.replace(/-cast$/, '');
      const isTvCategory = category === 'series' || category === 'tv' || category === 'show';

      // Legacy/Numeric check (e.g. 122-pulp-fiction or 100757-outer-banks)
      const numMatch = cleanSlug.match(/^(\d{5,})(?:-(.*))$/);
      if (numMatch) {
        const id = parseInt(numMatch[1], 10);
        const titleSlug = numMatch[2] || '';
        const cached = slugCacheMap.get(cleanSlug) || (titleSlug ? slugCacheMap.get(titleSlug) : null);
        const mediaType = cached ? (cached.type === 'series' || cached.type === 'tv' ? 'tv' : (cached.type === 'film' || cached.type === 'movie' ? 'movie' : (isTvCategory ? 'tv' : 'movie'))) : (isTvCategory ? 'tv' : 'movie');

        if (category === 'film' || category === 'series' || category === 'movie' || category === 'tv') {
          return { type: isCast ? 'cast' : 'film', id, mediaType, slug: cleanSlug };
        }
        let role = 'Actor';
        if (category === 'director') role = 'Director';
        else if (category === 'writer') role = 'Writer';
        else if (category === 'producer') role = 'Producer';
        else if (category === 'composer') role = 'Composer';
        return { type: 'actor', id, role, slug: cleanSlug };
      }

      // Pure slug without numbers (e.g. pulp-fiction, outer-banks-2020, brad-pitt)
      let role = 'Actor';
      if (category === 'director') role = 'Director';
      else if (category === 'writer') role = 'Writer';
      else if (category === 'producer') role = 'Producer';
      else if (category === 'composer') role = 'Composer';

      const cached = slugCacheMap.get(`${category}:${cleanSlug}`) || slugCacheMap.get(cleanSlug);
      if (cached) {
        const isTvCached = cached.type === 'series' || cached.type === 'tv' || isTvCategory;
        return {
          type: isCast ? 'cast' : (category === 'actor' || category === 'director' || category === 'writer' || category === 'producer' || category === 'composer' ? 'actor' : 'film'),
          id: cached.id,
          role: role || cached.role,
          slug: cleanSlug,
          category,
          mediaType: isTvCached ? 'tv' : 'movie'
        };
      }

      return {
        type: isCast ? 'cast' : (category === 'actor' || category === 'director' || category === 'writer' || category === 'producer' || category === 'composer' ? 'actor' : 'film'),
        slug: cleanSlug,
        category,
        role,
        mediaType: isTvCategory ? 'tv' : 'movie'
      };
    }

    async function resolveRouteToId(routeInfo) {
      if (!routeInfo) return null;
      if (routeInfo.id) return routeInfo;
      if (!routeInfo.slug) return routeInfo;

      const slug = routeInfo.slug;
      const category = routeInfo.category || '';
      const isTvCategory = category === 'series' || category === 'tv' || category === 'show';

      // Check if this slug exists in scannedMovies (from Letterboxd or active scan)
      if (category === 'film' || category === 'movie' || category === 'series' || category === 'tv' || !category) {
        const cleanSlugPart = slug.replace(/^(\d{5,})-/, '');
        const foundInScan = scannedMovies.find(m => m.slug === slug || (cleanSlugPart && m.slug === cleanSlugPart));
        if (foundInScan) {
          routeInfo.id = foundInScan.id;
          routeInfo.mediaType = foundInScan.mediaType || (isTvCategory ? 'tv' : 'movie');
          registerSlug(slug, foundInScan.id, routeInfo.mediaType === 'tv' ? 'series' : 'film');
          return routeInfo;
        }
      }

      try {
        if (category === 'actor' || category === 'director' || category === 'writer' || category === 'producer' || category === 'composer') {
          const dupMatch = slug.match(/^(.+?)-(\d+)$/);
          const baseSlug = dupMatch ? dupMatch[1] : slug;
          const dupIdx = dupMatch ? parseInt(dupMatch[2], 10) : 0;
          const query = baseSlug.replace(/-/g, ' ');
          const res = await tmdbFetch(`https://api.themoviedb.org/3/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
          const data = await res.json();
          if (data && data.results && data.results.length > 0) {
            const literalMatch = data.results.find(p => slugify(p.name || '') === slug);
            if (literalMatch && !dupMatch) {
              routeInfo.id = literalMatch.id;
              registerSlug(slug, literalMatch.id, 'actor', routeInfo.role);
            } else {
              const exacts = data.results.filter(p => slugify(p.name || '') === baseSlug);
              if (exacts.length > 0) {
                exacts.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
                const match = exacts[dupIdx] || exacts[0];
                routeInfo.id = match.id;
                registerSlug(slug, match.id, 'actor', routeInfo.role);
              } else {
                const match = data.results[0];
                routeInfo.id = match.id;
                registerSlug(slug, match.id, 'actor', routeInfo.role);
              }
            }
          }
        } else {
          const mediaType = category === 'series' ? 'tv' : 'movie';
          let baseSlug = slug;
          let targetYear = null;
          let dupIdx = 0;
          const yearDupMatch = slug.match(/^(.+?)-((?:19|20)\d\d)-(\d+)$/);
          if (yearDupMatch) {
            baseSlug = yearDupMatch[1]; targetYear = yearDupMatch[2]; dupIdx = parseInt(yearDupMatch[3], 10);
          } else {
            const yearMatch = slug.match(/^(.+?)-((?:19|20)\d\d)$/);
            if (yearMatch) {
              baseSlug = yearMatch[1]; targetYear = yearMatch[2];
            } else {
              const dupMatch = slug.match(/^(.+?)-(\d{1,2})$/);
              if (dupMatch) {
                baseSlug = dupMatch[1]; dupIdx = parseInt(dupMatch[2], 10);
              }
            }
          }

          const combined = await fetchMediaCandidates(baseSlug, targetYear, mediaType);

          if (combined.length > 0) {
            let match = null;
            const exacts = combined.filter(m => slugify(m.title || m.original_title || m.name || m.original_name) === baseSlug);
            const sortedExacts = sortExactMediaMatches(exacts);

            if (targetYear) {
              let yearMatches = sortedExacts.filter(m => (m.release_date || m.first_air_date || '').startsWith(targetYear));
              if (yearMatches.length === 0) {
                yearMatches = sortedExacts.filter(m => {
                  const d = m.release_date || m.first_air_date || '';
                  return Math.abs(parseInt(d.slice(0, 4)) - parseInt(targetYear)) <= 1;
                });
              }
              if (yearMatches.length > 0) {
                match = yearMatches[dupIdx] || yearMatches[0];
              } else {
                const anyYear = sortExactMediaMatches(combined.filter(m => (m.release_date || m.first_air_date || '').startsWith(targetYear)));
                if (anyYear.length > 0) match = anyYear[dupIdx] || anyYear[0];
              }
            }
            if (!match) {
              if (sortedExacts.length > 0) {
                match = sortedExacts[dupIdx] || sortedExacts[0];
              } else {
                match = combined[0];
              }
            }
            if (match) {
              routeInfo.id = match.id;
              routeInfo.mediaType = mediaType;
              registerSlug(slug, match.id, mediaType === 'tv' ? 'series' : 'film');
            }
          }
        }
      } catch (e) { console.warn('[Resolve Slug Route]', e); }

      return routeInfo;
    }
    const ITEMS_PER_PAGE = 96;
    let currentRegion = localStorage.getItem('ps_region') || 'SE';
    let vpnModeEnabled = localStorage.getItem('ps_vpn_mode') === 'true';
    const encodeTitle = (title) => encodeURIComponent(title);
    const MAX_WATCHLIST_PAGES = 100; const BATCH_SIZE = 30; const TMDB_REQUEST_DELAY_MS = 0;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const REGION_META = { SE: { name: 'Sweden', flag: '🇸🇪' }, US: { name: 'United States', flag: '🇺🇸' }, GB: { name: 'United Kingdom', flag: '🇬🇧' }, CA: { name: 'Canada', flag: '🇨🇦' }, AU: { name: 'Australia', flag: '🇦🇺' }, IE: { name: 'Ireland', flag: '🇮🇪' }, NZ: { name: 'New Zealand', flag: '🇳🇿' }, DE: { name: 'Germany', flag: '🇩🇪' }, FR: { name: 'France', flag: '🇫🇷' }, IT: { name: 'Italy', flag: '🇮🇹' }, ES: { name: 'Spain', flag: '🇪🇸' }, NL: { name: 'Netherlands', flag: '🇳🇱' }, PL: { name: 'Poland', flag: '🇵🇱' }, BR: { name: 'Brazil', flag: '🇧🇷' }, MX: { name: 'Mexico', flag: '🇲🇽' }, IN: { name: 'India', flag: '🇮🇳' }, JP: { name: 'Japan', flag: '🇯🇵' }, KR: { name: 'South Korea', flag: '🇰🇷' }, NO: { name: 'Norway', flag: '🇳🇴' }, DK: { name: 'Denmark', flag: '🇩🇰' }, FI: { name: 'Finland', flag: '🇫🇮' } };
    if (REGION_META.NO) REGION_META.NO.flag = '🇳🇴'; // Safe fallback
    const GENRE_MAP = { 28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western' };
    function openStreamingService(webUrl, appUrl = null) { if (!isMobile || !appUrl || appUrl === 'null') { window.open(webUrl, "_blank"); return; } window.location.href = appUrl; setTimeout(() => { window.open(webUrl, "_blank"); }, 1200); }
    const CORS_PROXIES = [
      (url) => `/api/proxy?url=${encodeURIComponent(url)}`,
      (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
      (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
      (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    ];
    const TMDB_PROVIDER_CACHE_KEY = (region) => `ps_providers_${region}_v13`;
    const TMDB_PROVIDER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

