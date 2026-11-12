    // Text-normalisering som tar bort mellanslag, specialtecken och ersätter "+" med "plus"
    const TIER_SUFFIX_RE = /\b(standard|premium|plus|basic|essential|with ads?|ads?|mobile|lite)\b/gi;
    const cleanNormalize = (name) => {
      if (!name) return '';
      let norm = name.toLowerCase()
        .replace(/\bamazon\s+channel\b/gi, '')
        .replace(/\bapple\s?tv\s+channel\b/gi, '')
        .replace(TIER_SUFFIX_RE, '')
        .replace(/\s+/g, '')
        .replace(/[+]/g, 'plus')
        .replace(/[^a-z0-9]/g, '');

      if (norm.includes('hbomax') || norm.includes('max')) norm = 'max';
      if (norm.includes('peacock')) norm = 'peacock';
      if (norm.includes('disney')) norm = 'disneyplus';
      if (norm.includes('paramount')) norm = 'paramountplus';
      if (norm.includes('discovery')) norm = 'discoveryplus';
      if (norm.includes('amc')) norm = 'amcplus';
      if (norm.includes('mgm')) norm = 'mgmplus';
      if (norm.includes('tubi')) norm = 'tubi';
      if (norm === 'amazonprimevideo' || norm === 'amazonvideo' || norm === 'amazonprime' || norm === 'primevideo' || norm === 'amazon') norm = 'primevideo';
      if (norm.startsWith('appletv') || norm.includes('appleitunes') || norm === 'itunes') norm = 'appletv';
      if (norm.startsWith('triart')) norm = 'triartplay';
      if (norm.startsWith('draken')) norm = 'drakenfilm';
      if (norm.startsWith('cineas')) norm = 'cineasterna';
      if (norm.startsWith('rakuten')) norm = 'rakutentv';
      if (norm.startsWith('blockbuster')) norm = 'blockbuster';
      if (norm.startsWith('teliaplay') || norm === 'telia') norm = 'teliaplay';
      if (norm.startsWith('tele2') || norm.startsWith('comhem')) norm = 'tele2play';
      if (norm === 'bfiplayer' || norm === 'bfiplayeramazonchannel') norm = 'bfiplayer';
      if (norm.startsWith('svt')) norm = 'svtplay';
      return norm;
    };

    const CANONICAL_DISPLAY_NAMES = {
      'peacock': 'Peacock',
      'disneyplus': 'Disney+',
      'paramountplus': 'Paramount+',
      'primevideo': 'Prime Video',
      'appletv': 'Apple TV+',
      'tubi': 'Tubi',
      'discoveryplus': 'Discovery+',
      'amcplus': 'AMC+',
      'mgmplus': 'MGM+',
      'max': 'Max',
      'svtplay': 'SVT Play',
      'tv4play': 'TV4 Play',
      'tele2play': 'Tele2 Play',
      'teliaplay': 'Telia Play',
      'skyshowtime': 'SkyShowtime',
      'viaplay': 'Viaplay',
      'sfanytime': 'SF Anytime',
      'plutotv': 'Pluto TV',
      'nrktv': 'NRK TV',
      'tv2play': 'TV 2 Play',
      'yleareena': 'Yle Areena',
      'ruutu': 'Ruutu',
      'triartplay': 'TriArt Play',
      'drakenfilm': 'Draken Film',
      'cineasterna': 'Cineasterna',
      'blockbuster': 'Blockbuster',
      'rakutentv': 'Rakuten TV',
      'chili': 'Chili',
      'hulu': 'Hulu',
      'crunchyroll': 'Crunchyroll',
      'bbciplayer': 'BBC iPlayer',
      'itvx': 'ITVX',
      'channel4': 'Channel 4',
      'nowtv': 'Now TV',
      'stan': 'Stan',
      'binge': 'BINGE',
      'abciview': 'ABC iview',
      'neon': 'Neon',
      'crave': 'Crave',
      'cbcgem': 'CBC Gem',
      'mubi': 'MUBI',
      'shudder': 'Shudder',
      'criterionchannel': 'Criterion Channel',
      'starz': 'Starz',
      'hoopla': 'Hoopla',
      'kanopy': 'Kanopy'
    };

    const getCanonicalDisplayName = (rawName) => {
      if (!rawName) return '';
      const norm = cleanNormalize(rawName);
      if (CANONICAL_DISPLAY_NAMES[norm]) return CANONICAL_DISPLAY_NAMES[norm];
      return rawName
        .replace(/^amazon\s+/i, '')
        .replace(TIER_SUFFIX_RE, '')
        .replace(/\bchannel\b/gi, '')
        .replace(/\bapp ?store\b/gi, '')
        .trim();
    };

    // Global, utökad whitelist för 100% täckning över alla 21 regioner
    const ALLOWED_SERVICES = [
      // Sverige / Norden
      "Netflix", "Max", "Disney Plus", "Disney+", "Viaplay", "Amazon Prime Video", "Prime Video",
      "Apple TV Plus", "Apple TV+", "SVT Play", "TV4 Play", "SF Anytime", "SkyShowtime", "Discovery Plus", "Discovery+",
      "HBO Max", "Pluto TV", "NRK TV", "TV 2 Play", "Yle Areena", "Ruutu", "TriArt Play", "TriArt", "Draken Film", "Cineasterna", "Blockbuster", "Rakuten TV", "Chili", "Telia Play", "Telia", "Tele2 Play", "Comhem Play",
      // USA / Kanada / UK / AU / NZ / EU / ASIA / LATAM
      "Hulu", "Peacock", "Peacock Premium", "Paramount Plus", "Paramount+", "Crunchyroll", "Tubi TV", "Tubi",
      "Freevee", "AMC Plus", "AMC+", "Shudder", "Criterion Channel", "Starz", "MGM Plus", "MGM+", "Hoopla", "Kanopy",
      "Vudu", "Fandango at Home", "Crave", "CBC Gem", "The Roku Channel", "MUBI",
      "BBC iPlayer", "ITVX", "Channel 4", "My5", "Now TV", "Now", "BritBox", "BFI Player", "BFI Player Amazon Channel",
      "Stan", "BINGE", "SBS On Demand", "ABC iview", "7plus", "9Now", "10 play", "Neon", "ThreeNow",
      "RTL+", "Movistar+", "Canal+", "M6+", "FlixOlé", "TIMVISION", "RaiPlay", "U-Next", "Wavve", "Watcha", "Joyn"
    ];

    const NORMALIZED_WHITELIST = ALLOWED_SERVICES.map(s => cleanNormalize(s));

    // Fix: Paths kept relative as originally requested
    const LOCAL_ICON_OVERRIDES = {
      // Existing
      'netflix': './icons/netflix.png',
      'hbomax': './icons/hbomax.png',
      'max': './icons/hbomax.png',
      'disney': './icons/disneyplus.png',
      'disneyplus': './icons/disneyplus.png',
      'primevideo': './icons/primevideo.png',
      'amazonprimevideo': './icons/primevideo.png',
      'appletv': './icons/appletv.png',
      'appletvplus': './icons/appletv.png',
      'viaplay': './icons/viaplay.png',
      'svtplay': './icons/svtplay.png',
      'tv4play': './icons/tv4play.png',
      'skyshowtime': './icons/skyshowtime.png',
      'discoveryplus': './icons/discoveryplus.png',
      // 32 Local Icons
      'hulu': './icons/hulu.png',
      'peacock': './icons/peacock.png',
      'paramountplus': './icons/paramountplus.png',
      'tubi': './icons/tubi.png',
      'plutotv': './icons/plutotv.png',
      'mubi': './icons/mubi.png',
      'crunchyroll': './icons/crunchyroll.png',
      'crave': './icons/crave.png',
      'bbciplayer': './icons/bbciplayer.png',
      'itvx': './icons/itvx.png',
      'channel4': './icons/channel4.png',
      'nowtv': './icons/nowtv.png',
      'now': './icons/nowtv.png',
      'nrktv': './icons/nrktv.png',
      'tv2play': './icons/tv2play.png',
      'yleareena': './icons/yleareena.png',
      'binge': './icons/binge.png',
      'stan': './icons/stan.png',
      'abciview': './icons/abciview.png',
      'rtlplus': './icons/rtlplus.png',
      'movistarplus': './icons/movistarplus.png',
      'unext': './icons/unext.png',
      'wavve': './icons/wavve.png',
      'watcha': './icons/watcha.png',
      'neon': './icons/neon.png',
      'joyn': './icons/joyn.png',
      'canalplus': './icons/canalplus.png',
      'm6plus': './icons/m6plus.png',
      'flixole': './icons/flixole.png',
      'timvision': './icons/timvision.png',
      'raiplay': './icons/raiplay.png',
      'cbcgem': './icons/cbcgem.png',
      'bfiplayer': './icons/bfiplayer.png',
      'tele2play': './icons/tele2play.png'
    };

    const KNOWN_DOMAINS = {
      'netflix': 'netflix.com', 'hbomax': 'max.com', 'max': 'max.com', 'disneyplus': 'disneyplus.com', 'primevideo': 'primevideo.com', 'amazonprimevideo': 'primevideo.com', 'appletv': 'tv.apple.com', 'appletvplus': 'tv.apple.com',
      'viaplay': 'viaplay.se', 'svtplay': 'svtplay.se', 'tv4play': 'tv4play.se', 'skyshowtime': 'skyshowtime.com', 'discoveryplus': 'discoveryplus.com', 'sfanytime': 'sfanytime.com', 'blockbuster': 'blockbuster.dk', 'rakutentv': 'rakuten.tv',
      'triartplay': 'triartplay.se', 'drakenfilm': 'drakenfilm.se', 'cineasterna': 'cineasterna.com', 'chili': 'chili.com', 'teliaplay': 'teliaplay.se', 'tele2play': 'tele2play.se',
      'hulu': 'hulu.com', 'peacock': 'peacocktv.com', 'paramountplus': 'paramountplus.com', 'crunchyroll': 'crunchyroll.com', 'tubi': 'tubitv.com', 'plutotv': 'pluto.tv', 'mubi': 'mubi.com', 'crave': 'crave.ca', 'cbcgem': 'gem.cbc.ca',
      'freevee': 'amazon.com/freevee', 'amcplus': 'amcplus.com', 'shudder': 'shudder.com', 'criterionchannel': 'criterionchannel.com', 'starz': 'starz.com', 'mgmplus': 'mgmplus.com', 'hoopla': 'hoopladigital.com', 'kanopy': 'kanopy.com', 'vudu': 'vudu.com', 'fandangoathome': 'athome.fandango.com', 'therokuchannel': 'therokuchannel.roku.com',
      'bbciplayer': 'bbc.co.uk', 'itvx': 'itv.com', 'channel4': 'channel4.com', 'nowtv': 'nowtv.com', 'now': 'nowtv.com', 'my5': 'channel5.com', 'britbox': 'britbox.com', 'bfiplayer': 'player.bfi.org.uk',
      'stan': 'stan.com.au', 'binge': 'binge.com.au', 'abciview': 'iview.abc.net.au', 'sbsondemand': 'sbs.com.au/ondemand', '7plus': '7plus.com.au', '9now': '9now.com.au', '10play': '10play.com.au', 'neon': 'neontv.co.nz', 'threenow': 'threenow.co.nz',
      'nrktv': 'tv.nrk.no', 'tv2play': 'tv2.no', 'yleareena': 'areena.yle.fi',
      'rtlplus': 'plus.rtl.de', 'movistarplus': 'movistarplus.es', 'unext': 'video.unext.jp', 'wavve': 'wavve.com', 'watcha': 'watcha.com', 'joyn': 'joyn.de', 'canalplus': 'canalplus.com', 'm6plus': '6play.fr', 'flixole': 'flixole.com', 'timvision': 'timvision.it', 'raiplay': 'raiplay.it'
    };

    function getRegionServiceUrl(providerName, region = 'SE', movieTitle = '') {
      const norm = cleanNormalize(providerName);
      const r = (region || 'SE').toLowerCase();

      if (norm === 'teliaplay') {
        if (r === 'fi') return `https://www.teliaplay.fi`;
        if (r === 'no') return `https://www.teliaplay.no`;
        if (r === 'lt') return `https://www.teliaplay.lt`;
        if (r === 'ee') return `https://www.teliaplay.ee`;
        return `https://www.teliaplay.se`;
      }
      if (norm === 'tele2play') {
        return `https://www.tele2play.se`;
      }
      if (norm === 'svtplay') {
        return `https://www.svtplay.se`;
      }
      if (norm === 'triartplay') {
        return `https://www.triartplay.se/home?locale=${r === 'se' ? 'sv' : 'en'}`;
      }
      if (norm === 'drakenfilm') {
        return `https://www.drakenfilm.se`;
      }
      if (norm === 'cineasterna') {
        return `https://www.cineasterna.com`;
      }
      if (norm === 'appletv') {
        return `https://tv.apple.com/${r}`;
      }
      if (norm === 'blockbuster') {
        if (r === 'sv' || r === 'se') return `https://blockbuster.dk/sv`;
        if (r === 'no') return `https://blockbuster.no`;
        if (r === 'fi') return `https://blockbuster.fi`;
        return `https://blockbuster.dk`;
      }
      if (norm === 'viaplay') {
        if (['se', 'no', 'dk', 'fi', 'is', 'pl'].includes(r)) return `https://viaplay.${r}`;
        if (r === 'gb' || r === 'uk') return `https://viaplay.com/gb-en`;
        if (r === 'nl') return `https://viaplay.com/nl-nl`;
        return `https://viaplay.se`;
      }
      if (norm === 'sfanytime') {
        const langMap = { se: 'sv', no: 'no', dk: 'da', fi: 'fi' };
        return `https://www.sfanytime.com/${langMap[r] || 'sv'}`;
      }
      if (norm === 'tv2play') {
        if (r === 'dk') return `https://tv2play.dk`;
        return `https://tv2.no`;
      }
      if (norm === 'skyshowtime') {
        return `https://www.skyshowtime.com/${r}`;
      }
      if (norm === 'disneyplus') {
        return `https://www.disneyplus.com/${r}`;
      }
      if (norm === 'plutotv') {
        return `https://pluto.tv/${r}`;
      }
      if (norm === 'rakutentv') {
        return `https://www.rakuten.tv/${r}`;
      }
      if (norm === 'chili') {
        if (['uk', 'gb', 'it', 'de', 'pl'].includes(r)) return `https://${r}.chili.com`;
        return `https://ww.chili.com`;
      }
      if (norm === 'primevideo') {
        if (r === 'gb' || r === 'uk') return `https://www.amazon.co.uk/primevideo`;
        if (r === 'de') return `https://www.amazon.de/primevideo`;
        if (r === 'jp') return `https://www.amazon.co.jp/primevideo`;
        if (r === 'fr') return `https://www.amazon.fr/primevideo`;
        if (r === 'it') return `https://www.amazon.it/primevideo`;
        if (r === 'es') return `https://www.amazon.es/primevideo`;
        return `https://www.primevideo.com`;
      }
      if (norm === 'paramountplus') {
        if (['gb', 'uk', 'ca', 'au'].includes(r)) return `https://www.paramountplus.com/${r}/`;
        return `https://www.paramountplus.com`;
      }
      if (norm === 'bbciplayer') {
        return `https://www.bbc.co.uk/iplayer`;
      }
      if (norm === 'britbox') {
        if (r === 'gb' || r === 'uk') return `https://www.britbox.co.uk`;
        return `https://www.britbox.com`;
      }

      let domain = domainFor(providerName);
      if (!domain) {
        const regionTldMap = {
          se: '.se', no: '.no', dk: '.dk', fi: '.fi', de: '.de', fr: '.fr', it: '.it', es: '.es',
          gb: '.co.uk', uk: '.co.uk', jp: '.co.jp', ca: '.ca', au: '.com.au', nz: '.co.nz',
          nl: '.nl', pl: '.pl'
        };
        const tld = regionTldMap[r] || '.com';
        domain = norm + tld;
      }
      if (domain.startsWith('http://') || domain.startsWith('https://')) return domain;
      if (domain.includes('.') && (domain.startsWith('tv.') || domain.startsWith('areena.') || domain.startsWith('plus.') || domain.startsWith('video.') || domain.startsWith('gem.') || domain.startsWith('play.') || domain.startsWith('www.') || domain.startsWith('player.') || domain.startsWith('iview.'))) {
        return `https://${domain}`;
      }
      return `https://www.${domain}`;
    }

    const localIconFor = (name) => {
      const norm = cleanNormalize(name);
      return LOCAL_ICON_OVERRIDES[norm] || null;
    };

    const domainFor = (name) => {
      const norm = cleanNormalize(name);
      return KNOWN_DOMAINS[norm] || null;
    };

    const LOGO_DEV_TOKEN = 'pk_MV3eG1YwSxC6c5sSZyG0JA';
    const logoDevIcon = (domain) => `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&size=256&format=png`;

    const REGION_ONLY_SERVICES = {
      'bfiplayer': ['GB'],
      'bbciplayer': ['GB'],
      'itvx': ['GB'],
      'channel4': ['GB'],
      'svtplay': ['SE'],
      'tv4play': ['SE'],
      'tele2play': ['SE'],
      'nrktv': ['NO'],
      'tv2play': ['NO', 'DK'],
      'yleareena': ['FI'],
      'crave': ['CA'],
      'stan': ['AU'],
      'binge': ['AU'],
      'abciview': ['AU'],
      'neon': ['NZ'],
      'hulu': ['US']
    };

    function getCanonicalProvider(p, isRentBuy = false) {
      if (!p || !p.provider_name) return null;
      const norm = cleanNormalize(p.provider_name);
      if (norm.includes('googleplay') || norm === 'googleplaymovies' || norm === 'youtube' || norm === 'microsoftstore') return null;
      if (!NORMALIZED_WHITELIST.includes(norm)) return null;

      if (Object.prototype.hasOwnProperty.call(REGION_ONLY_SERVICES, norm) && Array.isArray(REGION_ONLY_SERVICES[norm]) && !REGION_ONLY_SERVICES[norm].includes(currentRegion)) {
        return null;
      }

      const match = currentProviders.find(cp => cleanNormalize(cp.name) === norm);
      if (match) {
        return { provider_name: match.name, provider_id: match.id, logoPath: match.logoPath, logo_path: p.logo_path };
      }
      const rawClean = p.provider_name.replace(/^Amazon\s+/i, '').replace(TIER_SUFFIX_RE, '').trim();
      const cleanName = getCanonicalDisplayName(rawClean);
      const local = localIconFor(cleanName);
      const rawLogo = p.logo_path || p.logoPath;
      const tmdbLogo = rawLogo ? (rawLogo.startsWith('http') ? rawLogo : `https://image.tmdb.org/t/p/original${rawLogo.startsWith('/') ? '' : '/'}${rawLogo}`) : null;
      const logoDev = logoDevIcon(domainFor(cleanName) || cleanNormalize(cleanName) + '.com');
      const logoPath = local || tmdbLogo || logoDev;

      return { provider_name: cleanName, provider_id: p.provider_id, logoPath, logo_path: p.logo_path };
    }

    function getProviderPriority(p) {
      if (!p) return 9999;
      const pId = p.provider_id || p.id;
      const norm = cleanNormalize(p.provider_name || p.name || '');

      if (Array.isArray(currentProviders) && currentProviders.length > 0) {
        const idx = currentProviders.findIndex(cp => (pId && cp.id === pId) || (norm && cleanNormalize(cp.name) === norm));
        if (idx !== -1) return idx;
      }

      if (typeof p.display_priority === 'number') {
        return 1000 + p.display_priority;
      }
      return 9999;
    }

    function filterAndDeduplicateProviders(list, isRentBuy = false) {
      if (!Array.isArray(list)) return [];
      const map = new Map();
      for (const item of list) {
        const canon = getCanonicalProvider(item, isRentBuy);
        if (canon) {
          const normKey = cleanNormalize(canon.provider_name);
          if (!map.has(normKey)) {
            map.set(normKey, canon);
          }
        }
      }
      return [...map.values()].sort((a, b) => getProviderPriority(a) - getProviderPriority(b));
    }

    async function fetchProvidersForRegion(region) {
      const cacheKey = TMDB_PROVIDER_CACHE_KEY(region);
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (cached && cached.fetchedAt && (Date.now() - cached.fetchedAt) < TMDB_PROVIDER_CACHE_TTL_MS && Array.isArray(cached.providers) && cached.providers.length > 0) {
          return cached.providers;
        }
      } catch (e) { console.warn('[TMDB Provider Cache Read]', e); }
      const url = `https://api.themoviedb.org/3/watch/providers/movie?api_key=${TMDB_API_KEY}&watch_region=${region}`;
      const res = await tmdbFetch(url);
      const data = await res.json().catch(() => ({}));
      const rawList = data.results || [];

      if (region === 'SE') {
        const hasSVT = rawList.some(p => cleanNormalize(p.provider_name) === 'svtplay');
        if (!hasSVT) {
          rawList.push({ provider_id: 385, provider_name: 'SVT Play', display_priority: 11 });
        }
        const hasTele2 = rawList.some(p => cleanNormalize(p.provider_name) === 'tele2play');
        if (!hasTele2) {
          rawList.push({ provider_id: 497, provider_name: 'Tele2 Play', display_priority: 20 });
        }
      }

      const JUNK_SUFFIX_RE = /\b(channel|app ?store|amazon channel|store)\b/i;

      const normalizeProviderName = (n) => {
        let name = (n || '');
        if (name.toLowerCase() === "amazon prime video with ads") return null;
        return name.replace(/^amazon\s+/i, '')
          .replace(/\bchannel\b/gi, '')
          .replace(/\bapp ?store\b/gi, '')
          .trim();
      };

      const KNOWN_PRIORITY = {
        'netflix': 0, 'disneyplus': 1, 'primevideo': 2, 'amazonprimevideo': 2, 'max': 3, 'appletv': 4,
        'appletvplus': 4, 'hbomax': 3, 'viaplay': 10, 'svtplay': 11,
        'tv4play': 12, 'skyshowtime': 13, 'discoveryplus': 14, 'sfanytime': 15, 'tele2play': 16
      };

      const knownPriorityFor = (name) => {
        const norm = cleanNormalize(name);
        return Object.prototype.hasOwnProperty.call(KNOWN_PRIORITY, norm) ? KNOWN_PRIORITY[norm] : null;
      };

      const byNormalizedName = new Map();
      rawList.forEach(p => {
        if (!p.provider_id || !p.provider_name) return;

        const normName = cleanNormalize(p.provider_name);

        // Whitelist check
        if (!NORMALIZED_WHITELIST.includes(normName)) return;
        if (JUNK_SUFFIX_RE.test(p.provider_name)) return;

        const key = normalizeProviderName(p.provider_name);
        if (!key) return;

        const tmdbPriority = typeof p.display_priority === 'number' ? p.display_priority : 9999;
        const known = knownPriorityFor(p.provider_name);
        const effectivePriority = known !== null ? known : (100 + tmdbPriority);

        const normKey = cleanNormalize(key);
        const existing = byNormalizedName.get(normKey);
        if (!existing || effectivePriority < existing.__priority) {
          byNormalizedName.set(normKey, { ...p, __key: key, __priority: effectivePriority });
        }
      });

      const providers = [...byNormalizedName.values()]
        .map(p => {
          const rawClean = p.__key.replace(/^Amazon\s+/i, '');
          const cleanName = getCanonicalDisplayName(rawClean);
          const local = localIconFor(cleanName);

          // EXCLUSIVE SELECTION RULE: Only show services in the selector grid if we have a local PNG icon!
          if (!local) return null;

          const normCleanName = cleanNormalize(cleanName);
          const domain = domainFor(cleanName) || `${normCleanName}.com`;
          const logoDev = domain ? logoDevIcon(domain) : null;
          const tmdbLogoPath = p.logo_path ? `https://image.tmdb.org/t/p/original${p.logo_path}` : null;

          return {
            id: p.provider_id,
            name: cleanName,
            logoPath: local,
            localPath: local,
            logoDevPath: logoDev,
            tmdbLogoPath: tmdbLogoPath,
            priority: p.__priority
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

      if (providers.length > 0) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), providers }));
        } catch (e) { console.warn('[TMDB Provider Cache Write]', e); }
      }
      return providers;
    }

    const KNOWN_DEEPLINKS = {
      'netflix': { searchUrl: (t) => `https://www.netflix.com/search?q=${encodeTitle(t)}`, appUrl: (t) => `nflx://www.netflix.com/search?q=${encodeTitle(t)}` },
      'amazon prime video': { searchUrl: (t) => `https://www.primevideo.com/search/ref=atv_sr_sug_1?phrase=${encodeTitle(t)}` },
      'prime video': { searchUrl: (t) => `https://www.primevideo.com/search/ref=atv_sr_sug_1?phrase=${encodeTitle(t)}` },
      'disney plus': { searchUrl: () => `https://www.disneyplus.com/`, appUrl: () => `disneyplus://` },
      'apple tv': { searchUrl: (t) => `https://tv.apple.com/search?q=${encodeTitle(t)}`, appUrl: (t) => `videos://search?term=${encodeTitle(t)}` },
      'apple tv plus': { searchUrl: (t) => `https://tv.apple.com/search?q=${encodeTitle(t)}`, appUrl: (t) => `videos://search?term=${encodeTitle(t)}` },
      'apple tv store': { searchUrl: (t) => `https://tv.apple.com/search?q=${encodeTitle(t)}`, appUrl: (t) => `videos://search?term=${encodeTitle(t)}` },
      'max': { searchUrl: (t) => `https://play.max.com/search?q=${encodeTitle(t)}`, appUrl: (t) => `max://search?q=${encodeTitle(t)}` }
    };
    function getDeeplinkFor(providerName) {
      const key = (providerName || '').toLowerCase().trim();
      return KNOWN_DEEPLINKS[key] || null;
    }
    let scannedMovies = [];
    let selectedServiceIds = new Set((JSON.parse(localStorage.getItem('ps_services') || '[]')).map(id => Number(id)).filter(id => !isNaN(id) && id > 0));
    let cachedSelectedProviders = [];
    try { cachedSelectedProviders = JSON.parse(localStorage.getItem('ps_selected_providers') || '[]'); } catch (e) { console.warn('[Selected Providers Cache Read]', e); cachedSelectedProviders = []; }
    let currentProviders = [];
    let activeScanSessionId = 0;
    let isScanning = false; let cancelRequested = false;
    let activeTab = 'stream'; let currentPage = 1; let currentGroupedResults = { stream: [], other: [], rentbuy: [], unavailable: [] }; let isFriendMatchActive = false;
    let el = {};
    function toggleClearSyncBtn() { if (isScanning) { el.clearSyncBtn.classList.add('hidden'); return; } if (el.clearSyncBtn) el.clearSyncBtn.classList.toggle('hidden', !(el.usernameInput && el.usernameInput.value.trim().length > 0)); }
    el = {
      regionSelect: document.getElementById('regionSelect'),
      vpnToggleBtn: document.getElementById('vpnToggleBtn'),
      vpnToggleDot: document.getElementById('vpnToggleDot'),
      vpnToggleBtnInline: document.getElementById('vpnToggleBtnInline'),
      vpnToggleDotInline: document.getElementById('vpnToggleDotInline'),
      regionContainer: document.getElementById('regionContainer'),
      serviceSelectedGrid: document.getElementById('serviceSelectedGrid'),
      usernameInput: document.getElementById('usernameInput'),
      clearSyncBtn: document.getElementById('clearSyncBtn'),
      startButton: document.getElementById('startButton'),
      stopButton: document.getElementById('stopButton'),
      formError: document.getElementById('formError'),
      progressSection: document.getElementById('progressSection'),
      progressPercent: document.getElementById('progressPercent'),
      progressBar: document.getElementById('progressBar'),
      progressLabel: document.getElementById('progressLabel'),
      quickSearchInput: document.getElementById('quickSearchInput'),
      quickSearchBtn: document.getElementById('quickSearchBtn'),
      clearSearchBtn: document.getElementById('clearSearchBtn'),
      searchDropdown: document.getElementById('searchDropdown'),
      quickSearchResult: document.getElementById('quickSearchResult'),
      resultsSection: document.getElementById('resultsSection'),
      activeGridContainer: document.getElementById('activeGridContainer'),
      filterSearch: document.getElementById('resultsSearch'),
      clearResultsBtn: document.getElementById('clearResultsBtn'),
      filterSort: document.getElementById('resultsSort'),
      filterGenre: document.getElementById('resultsGenre'),
      filterDecade: document.getElementById('resultsDecade'),
      filterRuntime: document.getElementById('resultsRuntime'),
      tabBtns: document.querySelectorAll('.tab-btn'),
      paginationControls: document.getElementById('paginationControls'),
      friendInputWrapper: document.getElementById('friendInputWrapper'),
      friendInput: document.getElementById('friendInput'),
      toggleFriendBtn: document.getElementById('toggleFriendBtn'),
      removeFriendBtn: document.getElementById('removeFriendBtn'),
      rouletteBtn: document.getElementById('rouletteBtn'),
      statsBtn: document.getElementById('statsBtn'),
      statsBar: document.getElementById('statsBar')
    };

    const savedRegion = localStorage.getItem('ps_region');
    if (savedRegion && REGION_META[savedRegion]) { currentRegion = savedRegion; }

    function renderRegionDropdown() {
      const activeLabel = document.getElementById('regionActiveLabel');
      if (activeLabel && REGION_META[currentRegion]) {
        activeLabel.innerHTML = `${REGION_META[currentRegion].flag} <span class="hidden min-[400px]:inline">${escapeHTML(REGION_META[currentRegion].name)}</span>`;
      }
      const popover = document.getElementById('regionPopover');
      if (popover) {
        popover.innerHTML = Object.keys(REGION_META).map(code => `
          <button type="button" onclick="selectRegion('${code}', event)" class="custom-filter-item ${code === currentRegion ? 'selected' : ''}">
            <div class="flex items-center gap-2.5 truncate min-w-0">
              <span class="text-sm shrink-0">${REGION_META[code].flag}</span>
              <span class="truncate font-bold text-xs">${escapeHTML(REGION_META[code].name)}</span>
            </div>
            <div class="custom-filter-radio">
              ${code === currentRegion ? '<div class="custom-filter-radio-dot"></div>' : ''}
            </div>
          </button>
        `).join('');
      }
    }

    async function selectRegion(code, e) {
      if (e) e.stopPropagation();
      closeAllCustomFilterPopovers();
      if (currentRegion === code) return;
      currentRegion = code;
      localStorage.setItem('ps_region', currentRegion);
      renderRegionDropdown();
      currentProviders = [];
      await loadAndRenderProviders();

      // Fix: Refresh the service browser if it's currently open
      const browser = document.getElementById('serviceBrowser');
      if (browser && !browser.classList.contains('hidden')) {
        const availableIds = new Set(currentProviders.map(p => p.id));
        pendingSelectedIds = new Set([...pendingSelectedIds].filter(id => availableIds.has(id)));
        renderBrowserGrid();
        updateBrowserSaveBtn();
      }

      if (scannedMovies.length > 0) applyFiltersAndRender();
      if (el.quickSearchResult && !el.quickSearchResult.classList.contains('hidden') && el.quickSearchInput && el.quickSearchInput.value.trim()) {
        el.quickSearchBtn.click();
      }
    }

    function selectActorRole(newRole, e) {
      if (e) e.stopPropagation();
      closeAllCustomFilterPopovers();
      changeActorRole(newRole);
    }

    renderRegionDropdown();

    function setVpnMode(enabled) {
      vpnModeEnabled = enabled;
      localStorage.setItem('ps_vpn_mode', vpnModeEnabled);
      updateVpnToggleVisual();
      if (scannedMovies.length > 0) {
        populateFilterDropdowns();
        applyFiltersAndRender();
      }
      if (el.quickSearchResult && !el.quickSearchResult.classList.contains('hidden') && el.quickSearchInput && el.quickSearchInput.value.trim()) {
        el.quickSearchBtn.click();
      }
      refreshMovieVpnView();
    }
    function updateVpnToggleVisual() {
      const desktopBtn = document.getElementById('vpnToggleBtnDesktop');
      const desktopDot = document.getElementById('vpnToggleDotDesktop');
      const pairs = [
        [el.vpnToggleBtn, el.vpnToggleDot],
        [el.vpnToggleBtnInline, el.vpnToggleDotInline],
        [desktopBtn, desktopDot]
      ];
      pairs.forEach(([btn, dot]) => {
        if (!btn) return;
        if (vpnModeEnabled) {
          btn.classList.add('vpn-active'); btn.classList.remove('text-gray-500', 'text-gray-400');
          if (dot) { dot.classList.remove('bg-gray-600'); dot.classList.add('bg-blue-400'); dot.classList.remove('shadow-[0_0_6px_rgba(96,165,250,0.8)]'); }
        } else {
          btn.classList.remove('vpn-active');
          if (btn.id === 'vpnToggleBtn') btn.classList.add('text-gray-500'); else btn.classList.add('text-gray-400');
          if (dot) { dot.classList.add('bg-gray-600'); dot.classList.remove('bg-blue-400', 'shadow-[0_0_6px_rgba(96,165,250,0.8)]'); }
        }
      });
      // Also update any inline Watch Now VPN toggle buttons currently visible
      document.querySelectorAll('.watchnow-vpn-toggle').forEach(btn => {
        if (vpnModeEnabled) {
          btn.classList.add('vpn-active');
          btn.setAttribute('aria-pressed', 'true');
          btn.title = 'VPN unlocks are on — tap to turn off';
        } else {
          btn.classList.remove('vpn-active');
          btn.setAttribute('aria-pressed', 'false');
          btn.title = 'Also show titles you could unlock by switching your VPN';
        }
      });
    }
    updateVpnToggleVisual();
    if (el.vpnToggleBtn) el.vpnToggleBtn.addEventListener('click', () => setVpnMode(!vpnModeEnabled));
    if (el.vpnToggleBtnInline) el.vpnToggleBtnInline.addEventListener('click', () => { setVpnMode(!vpnModeEnabled); el.vpnToggleBtnInline.blur(); });
    const vpnDesktopBtn = document.getElementById('vpnToggleBtnDesktop');
    if (vpnDesktopBtn) vpnDesktopBtn.addEventListener('click', () => { setVpnMode(!vpnModeEnabled); vpnDesktopBtn.blur(); });
    function toggleWatchNowVpn() {
      setVpnMode(!vpnModeEnabled);
    }
    function refreshMovieVpnView() {
      try {
        const moviePageEl = document.getElementById('moviePageView');
        if (moviePageEl && !moviePageEl.classList.contains('hidden') && window.currentMoviePageObj) {
          const details = window.currentMoviePageDetails || (typeof movieDetailsCache !== 'undefined' && movieDetailsCache.get(`${window.currentMoviePageObj.mediaType === 'tv' ? 'tv' : 'movie'}_${window.currentMoviePageObj.id}`));
          const mobBox = document.getElementById('mobileWatchOptionsBox');
          const deskBox = document.getElementById('desktopWatchOptionsBox');
          if (mobBox || deskBox) {
            if (mobBox) mobBox.innerHTML = renderMovieWatchOptionsBox(window.currentMoviePageObj, details, false, false);
            if (deskBox) deskBox.innerHTML = renderMovieWatchOptionsBox(window.currentMoviePageObj, details, true, false);
            updateMoviePageVpnNote(window.currentMoviePageObj, details);
            return;
          }
          openMoviePage(window.currentMoviePageObj, false, true);
          return;
        }
      } catch (e) { logIgnored('refreshMovieVpnView', e); }
      try {
        const modalEl = document.getElementById('movieModal');
        if (modalEl && !modalEl.classList.contains('hidden') && typeof modalActiveMovieObj !== 'undefined' && modalActiveMovieObj) {
          const details = typeof movieDetailsCache !== 'undefined' && movieDetailsCache.get(`${modalActiveMovieObj.mediaType === 'tv' ? 'tv' : 'movie'}_${modalActiveMovieObj.id}`);
          const modalBox = document.getElementById('modalWatchOptionsBox');
          if (modalBox) {
            modalBox.innerHTML = renderMovieWatchOptionsBox(modalActiveMovieObj, details, false, true);
            updateMoviePageVpnNote(modalActiveMovieObj, details);
            const modalVpnBtn = modalEl.querySelector('.watchnow-vpn-toggle');
            if (modalVpnBtn) {
              if (vpnModeEnabled) modalVpnBtn.classList.add('vpn-active');
              else modalVpnBtn.classList.remove('vpn-active');
              modalVpnBtn.setAttribute('aria-pressed', vpnModeEnabled ? 'true' : 'false');
            }
            return;
          }
          openMovieModal(modalActiveMovieObj, false, false, true);
          return;
        }
      } catch (e) { logIgnored('refreshMovieVpnView', e); }
      try {
        if (el.quickSearchResult && !el.quickSearchResult.classList.contains('hidden') && window.currentActiveMovieObj) {
          openMovieModal(window.currentActiveMovieObj, true, false, true);
        }
      } catch (e) { logIgnored('refreshMovieVpnView', e); }
    }

