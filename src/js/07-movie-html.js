    // Resolves whether this movie's title logo genuinely renders, using a real image load test
    // (not the DOM <img> tag's own onerror, which has proven unreliable for some TMDB entries).
    // Caches the definitive answer so generateFullMovieHTML's own getBestTitleLogo call — which
    // can't be made async — just reads the confirmed result instead of guessing.
    function getDetailsCacheKey(details) {
      if (!details || !details.id) return null;
      const isTv = !!(details.first_air_date || details.number_of_seasons || details.name);
      return `${isTv ? 'tv' : 'movie'}_${details.id}`;
    }

    async function resolveTitleLogo(details) {
      const key = getDetailsCacheKey(details);
      if (!key) return;
      if (validatedLogoCache.has(key)) return;
      try {
        const raw = getBestTitleLogoRaw(details);
        if (!raw) { validatedLogoCache.set(key, null); return; }
        let ok = await preloadImageCheck(raw, 8000);
        if (!ok) ok = await preloadImageCheck(raw, 6000); // retry once
        validatedLogoCache.set(key, ok ? raw : null);
      } catch (err) {
        console.warn('[Title Logo Resolve]', err);
        validatedLogoCache.set(key, null);
      }
    }

    function getBestTitleLogo(details) {
      const key = getDetailsCacheKey(details);
      if (key && validatedLogoCache.has(key)) return validatedLogoCache.get(key);
      return getBestTitleLogoRaw(details);
    }

    function getBestTitleLogoRaw(details) {
      if (!details || !details.images || !Array.isArray(details.images.logos) || details.images.logos.length === 0) return null;
      // Exclude SVG logos (which render transparent/blank due to browser SVG sandbox policies) and allow PNG logos up to aspect ratio 18.0
      const validLogos = details.images.logos.filter(l => {
        if (!l.file_path || l.file_path.toLowerCase().endsWith('.svg')) return false;
        const ar = l.aspect_ratio;
        return ar == null || (ar >= 1.1 && ar <= 18.0);
      });
      if (validLogos.length === 0) return null;

      // Prefer English ('en') and textless/universal (null or empty) logos
      const primaryLogos = validLogos.filter(l => !l.iso_639_1 || l.iso_639_1 === 'en' || l.iso_639_1 === 'null');
      const candidates = primaryLogos.length > 0 ? primaryLogos : validLogos;

      candidates.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;

        if (a.iso_639_1 === 'en') scoreA += 100;
        if (b.iso_639_1 === 'en') scoreB += 100;

        const arA = a.aspect_ratio || 0;
        const arB = b.aspect_ratio || 0;
        if (arA >= 1.8 && arA <= 6.0) scoreA += 50;
        if (arB >= 1.8 && arB <= 6.0) scoreB += 50;

        scoreA += (a.vote_average || 0) * (a.vote_count || 1);
        scoreB += (b.vote_average || 0) * (b.vote_count || 1);

        return scoreB - scoreA;
      });

      const bestLogo = candidates[0];
      return `https://image.tmdb.org/t/p/w500${bestLogo.file_path}`;
    }

    window.onTitleLogoError = function (imgEl) {
      if (!imgEl || imgEl.dataset.fallbackDone) return;
      imgEl.dataset.fallbackDone = 'true';
      const isPage = imgEl.classList.contains('pageTitleImg');
      const safeTitle = imgEl.alt || '';
      const tag = isPage ? 'h1' : 'h2';
      const fontClasses = isPage
        ? 'movie-hero-title text-4xl min-[400px]:text-5xl sm:text-7xl md:text-8xl lg:text-[5.5rem] font-black text-white tracking-tight drop-shadow-[0_8px_20px_rgba(0,0,0,0.95)] leading-[0.95] mb-3'
        : 'movie-hero-title text-3xl min-[400px]:text-4xl sm:text-6xl md:text-7xl font-black text-white tracking-tight drop-shadow-[0_8px_20px_rgba(0,0,0,0.95)] leading-tight mb-2';

      const heading = document.createElement(tag);
      heading.className = fontClasses;
      heading.textContent = safeTitle;
      imgEl.replaceWith(heading);
    };

    const FRANCHISE_GROUPS = [
      // Breaking Bad Universe (TV + Movie)
      [
        { id: 1396, type: 'tv' },       // Breaking Bad
        { id: 60059, type: 'tv' },      // Better Call Saul
        { id: 559969, type: 'movie' },  // El Camino: A Breaking Bad Movie
        { id: 158704, type: 'tv' }      // Slippin' Jimmy
      ],
      // Dexter Universe
      [
        { id: 1405, type: 'tv' },       // Dexter
        { id: 131927, type: 'tv' },     // Dexter: New Blood
        { id: 219937, type: 'tv' },     // Dexter: Original Sin
        { id: 259909, type: 'tv' },     // Dexter: Resurrection
        { id: 49530, type: 'tv' }       // Dexter: Early Cuts
      ],
      // Game of Thrones Universe
      [
        { id: 1399, type: 'tv' },       // Game of Thrones
        { id: 94997, type: 'tv' },      // House of the Dragon
        { id: 224372, type: 'tv' }      // A Knight of the Seven Kingdoms
      ],
      // Yellowstone Universe
      [
        { id: 73586, type: 'tv' },      // Yellowstone
        { id: 118357, type: 'tv' },     // 1883
        { id: 157744, type: 'tv' }      // 1923
      ],
      // The Batman Epic Crime Saga (Matt Reeves)
      [
        { id: 414906, type: 'movie' },  // The Batman (2022)
        { id: 194764, type: 'tv' }       // The Penguin (2024)
      ],
      // DC Extended Universe: Suicide Squad & Peacemaker
      [
        { id: 436969, type: 'movie' },  // The Suicide Squad (2021)
        { id: 110492, type: 'tv' }      // Peacemaker (2022)
      ],
      // Dune Universe (Movies + TV)
      [
        { id: 438631, type: 'movie' },  // Dune (2021)
        { id: 693134, type: 'movie' },  // Dune: Part Two
        { id: 93740, type: 'tv' }       // Dune: Prophecy
      ],
      // Star Wars Rogue One & Andor
      [
        { id: 330459, type: 'movie' },  // Rogue One: A Star Wars Story
        { id: 83867, type: 'tv' }       // Andor
      ],
      // Big Bang Theory Universe
      [
        { id: 1418, type: 'tv' },       // Big Bang Theory
        { id: 71728, type: 'tv' },      // Young Sheldon
        { id: 243875, type: 'tv' }      // Georgie & Mandy
      ],
      // Walking Dead Universe
      [
        { id: 1402, type: 'tv' },
        { id: 62286, type: 'tv' },
        { id: 194583, type: 'tv' },
        { id: 211684, type: 'tv' },
        { id: 206586, type: 'tv' }
      ],
      // The Boys Universe
      [
        { id: 76479, type: 'tv' },
        { id: 205715, type: 'tv' },
        { id: 152483, type: 'tv' }
      ],
      // Firefly & Serenity (TV + Movie)
      [
        { id: 1437, type: 'tv' },       // Firefly
        { id: 9334, type: 'movie' }     // Serenity
      ],
      // Deadwood (TV + Movie)
      [
        { id: 1407, type: 'tv' },       // Deadwood
        { id: 501307, type: 'movie' }   // Deadwood: The Movie
      ],
      // Twin Peaks (TV + Movie)
      [
        { id: 1920, type: 'tv' },        // Twin Peaks
        { id: 1923, type: 'movie' }      // Twin Peaks: Fire Walk with Me
      ],
      // Rick and Morty Universe
      [
        { id: 60625, type: 'tv' },       // Rick and Morty
        { id: 202282, type: 'tv' }       // Rick and Morty: The Anime
      ],
      // Star Wars TV Universe
      [
        { id: 82856, type: 'tv' },      // The Mandalorian
        { id: 115036, type: 'tv' },     // The Book of Boba Fett
        { id: 114461, type: 'tv' },     // Ahsoka
        { id: 83867, type: 'tv' },      // Andor
        { id: 202879, type: 'tv' },     // Skeleton Crew
        { id: 92830, type: 'tv' }       // Obi-Wan Kenobi
      ],
      // Marvel MCU TV Universe
      [
        { id: 85271, type: 'tv' },
        { id: 138501, type: 'tv' },
        { id: 84958, type: 'tv' },
        { id: 88396, type: 'tv' },
        { id: 88329, type: 'tv' },
        { id: 122226, type: 'tv' },
        { id: 202555, type: 'tv' },
        { id: 67178, type: 'tv' }
      ],
      // Power Universe
      [
        { id: 54650, type: 'tv' },
        { id: 97890, type: 'tv' },
        { id: 124394, type: 'tv' },
        { id: 119845, type: 'tv' }
      ],
      // Star Trek Universe
      [
        { id: 655, type: 'tv' },
        { id: 85949, type: 'tv' },
        { id: 103516, type: 'tv' },
        { id: 67198, type: 'tv' }
      ],
      // CSI Universe
      [
        { id: 1431, type: 'tv' },
        { id: 1620, type: 'tv' },
        { id: 2458, type: 'tv' },
        { id: 122194, type: 'tv' }
      ],
      // NCIS Universe
      [
        { id: 4614, type: 'tv' },
        { id: 17610, type: 'tv' },
        { id: 61387, type: 'tv' },
        { id: 124271, type: 'tv' },
        { id: 243006, type: 'tv' }
      ],
      // Law & Order Universe
      [
        { id: 549, type: 'tv' },
        { id: 2734, type: 'tv' },
        { id: 106158, type: 'tv' }
      ],
      // Chicago Universe
      [
        { id: 44006, type: 'tv' },
        { id: 58841, type: 'tv' },
        { id: 62650, type: 'tv' }
      ],
      // FBI Universe
      [
        { id: 80748, type: 'tv' },
        { id: 94372, type: 'tv' },
        { id: 121658, type: 'tv' }
      ],
      // Suits Universe
      [
        { id: 37680, type: 'tv' },
        { id: 85950, type: 'tv' },
        { id: 259453, type: 'tv' }
      ],
      // Bridgerton Universe
      [
        { id: 91239, type: 'tv' },
        { id: 196454, type: 'tv' }
      ],
      // The Office Universe
      [
        { id: 2316, type: 'tv' },
        { id: 253941, type: 'tv' }
      ],
      // Sons of Anarchy Universe
      [
        { id: 1409, type: 'tv' },
        { id: 76231, type: 'tv' }
      ],
      // Vampire Diaries Universe
      [
        { id: 18165, type: 'tv' },
        { id: 46896, type: 'tv' },
        { id: 79460, type: 'tv' }
      ],
      // Avatar TLA Universe
      [
        { id: 82452, type: 'tv' },
        { id: 33880, type: 'tv' }
      ],
      // Money Heist Universe
      [
        { id: 71446, type: 'tv' },
        { id: 146176, type: 'tv' }
      ]
    ];

    const TV_FRANCHISE_MAP = {};
    FRANCHISE_GROUPS.forEach(group => {
      group.forEach(item => {
        TV_FRANCHISE_MAP[item.id] = group.filter(other => other.id !== item.id);
      });
    });

    async function ensureFranchiseDetailsLoaded(movieObj, details) {
      if (!details || !movieObj) return;
      const franchiseItems = TV_FRANCHISE_MAP[movieObj.id] || [];
      if (franchiseItems.length === 0) return;

      const recResults = (details.recommendations && details.recommendations.results) || [];
      const simResults = (details.similar && details.similar.results) || [];
      const existingIds = new Set([...recResults, ...simResults].map(m => m.id));

      const missingItems = franchiseItems.filter(item => !existingIds.has(item.id));
      if (missingItems.length > 0) {
        const fetchedList = await Promise.all(
          missingItems.map(item => tmdbFetch(`https://api.themoviedb.org/3/${item.type}/${item.id}?api_key=${TMDB_API_KEY}`).then(r => r.json()).catch(() => null))
        );
        if (!details.recommendations) details.recommendations = { results: [] };
        fetchedList.forEach((item, idx) => {
          if (item && item.id) {
            item.media_type = missingItems[idx].type;
            details.recommendations.results.unshift(item);
          }
        });
      }
    }

    function renderMovieWatchOptionsBox(movieObj, details, isDesktop = false, isModal = false) {
      if (!movieObj) return '';
      // JustWatch sometimes knows a film only by its original title (see requestJustWatchLinks).
      if (details && !movieObj.originalTitle) movieObj.originalTitle = details.original_title || details.original_name || '';

      // Resolve full providers dictionary across all available regions
      const allProvidersMap = movieObj.allProviders
        || (details && details['watch/providers'] && details['watch/providers'].results)
        || (typeof movieDetailsCache !== 'undefined' && movieDetailsCache.get(`${movieObj.mediaType === 'tv' ? 'tv' : 'movie'}_${movieObj.id}`)?.['watch/providers']?.results)
        || null;

      if (!movieObj.allProviders && allProvidersMap) {
        movieObj.allProviders = allProvidersMap;
      }

      // True provider data for the user's active home region
      const homeRegionData = (allProvidersMap && allProvidersMap[currentRegion])
        || (details && details['watch/providers'] && details['watch/providers'].results ? details['watch/providers'].results[currentRegion] : null)
        || (!movieObj.vpnInfo ? movieObj.regionData : null)
        || null;

      // Helper to match against user's selected services by ID or normalized name
      const selectedNamesSet = new Set(
        currentProviders
          .filter(cp => selectedServiceIds.has(cp.id))
          .map(cp => cleanNormalize(cp.name))
      );
      const isSubscribedProvider = (p) => {
        if (!p) return false;
        if (p.provider_id && selectedServiceIds.has(p.provider_id)) return true;
        if (p.id && selectedServiceIds.has(p.id)) return true;
        const norm = cleanNormalize(p.provider_name || p.name || '');
        return norm ? selectedNamesSet.has(norm) : false;
      };

      // Helper to prioritize VPN providers: Netflix > HBO / Max > Prime Video > Disney > Apple > others
      const sortVpnProvidersByPriority = (provList) => {
        return [...provList].sort((a, b) => {
          const nameA = cleanNormalize(a.provider_name || a.name || '');
          const nameB = cleanNormalize(b.provider_name || b.name || '');
          const getScore = (n) => {
            if (n.includes('netflix')) return 100;
            if (n.includes('hbo') || n.includes('max')) return 90;
            if (n.includes('amazon') || n.includes('prime')) return 80;
            if (n.includes('disney')) return 70;
            if (n.includes('apple')) return 60;
            return 10;
          };
          return getScore(nameB) - getScore(nameA);
        });
      };

      let effectiveVpnInfo = null;
      let isVpnUnlocked = false;
      let vpnMatchedProviders = [];

      const homeFlatrate = filterAndDeduplicateProviders(homeRegionData?.flatrate || []);
      const userHomeFlatrate = homeFlatrate.filter(isSubscribedProvider);

      if (userHomeFlatrate.length > 0) {
        effectiveVpnInfo = null;
      } else if (vpnModeEnabled && allProvidersMap) {
        if (movieObj.vpnInfo && movieObj.vpnInfo.region && allProvidersMap[movieObj.vpnInfo.region]) {
          const altData = allProvidersMap[movieObj.vpnInfo.region];
          const altFlat = filterAndDeduplicateProviders(altData?.flatrate || []);
          const matched = altFlat.filter(isSubscribedProvider);
          if (matched.length > 0) {
            const sortedMatched = sortVpnProvidersByPriority(matched);
            sortedMatched.forEach(p => { p.__isVpn = true; p.__vpnRegion = movieObj.vpnInfo.region; });
            effectiveVpnInfo = {
              region: movieObj.vpnInfo.region,
              services: sortedMatched.map(p => ({ label: p.provider_name || p.name }))
            };
            isVpnUnlocked = true;
            vpnMatchedProviders = sortedMatched;
          }
        }

        if (!effectiveVpnInfo) {
          for (const code of Object.keys(REGION_META)) {
            if (code === currentRegion || !allProvidersMap[code]) continue;
            const altData = allProvidersMap[code];
            const altFlat = filterAndDeduplicateProviders(altData?.flatrate || []);
            const matched = altFlat.filter(isSubscribedProvider);
            if (matched.length > 0) {
              const sortedMatched = sortVpnProvidersByPriority(matched);
              sortedMatched.forEach(p => { p.__isVpn = true; p.__vpnRegion = code; });
              effectiveVpnInfo = {
                region: code,
                services: sortedMatched.map(p => ({ label: p.provider_name || p.name }))
              };
              isVpnUnlocked = true;
              vpnMatchedProviders = sortedMatched;
              break;
            }
          }
        }
      }

      const makeProviderLink = (p, extraText = '', mode = 'pill', modeExtra = null) => {
        let safeName = (p.provider_name || p.name || '').replace("with Ads", "").trim();

        const providerMeta = currentProviders.find(cp => cp.id === (p.provider_id || p.id)) || null;
        let logoSrc = providerMeta ? providerMeta.logoPath : (p.logoPath || null);
        if (!logoSrc) {
          const local = localIconFor(safeName);
          const rawPath = p.logo_path || p.tmdbLogoPath;
          const tmdbLogo = rawPath ? (rawPath.startsWith('http') ? rawPath : `https://image.tmdb.org/t/p/original${rawPath.startsWith('/') ? '' : '/'}${rawPath}`) : null;
          const domain = domainFor(safeName) || (cleanNormalize(safeName) + '.com');
          const logoDev = domain ? logoDevIcon(domain) : null;
          logoSrc = local || tmdbLogo || logoDev;
        }

        const isVpnProvider = !!p.__isVpn;
        const vpnRegionCode = p.__vpnRegion || (isVpnProvider && effectiveVpnInfo ? effectiveVpnInfo.region : currentRegion);
        const vpnArticle = (vpnRegionCode === 'GB' || vpnRegionCode === 'US' || vpnRegionCode === 'NL') ? 'the ' : '';
        const vpnRegionName = isVpnProvider ? (vpnRegionCode === 'GB' ? 'UK' : (vpnRegionCode === 'US' ? 'US' : (REGION_META[vpnRegionCode]?.name || vpnRegionCode || ''))) : '';
        const vpnRegionFlag = isVpnProvider ? (REGION_META[vpnRegionCode]?.flag || '🌐') : '🌐';

        const effectiveRegion = isVpnProvider ? vpnRegionCode : currentRegion;
        let link = getRegionServiceUrl(safeName, effectiveRegion, movieObj.title);

        const deeplink = getDeeplinkFor(safeName);
        let appLink = deeplink && deeplink.appUrl ? deeplink.appUrl(movieObj.title) : null;

        if (deeplink && deeplink.searchUrl) {
          link = deeplink.searchUrl(movieObj.title);
        }
        // The title's own page on the service, when JustWatch knows it (these also open the app on
        // phones by themselves, so the app-search fallback isn't needed).
        const isRentBuyLink = mode === 'popup' && /Rent|Buy/.test(extraText || (modeExtra && modeExtra.type) || '');
        const directLink = getJustWatchLink(movieObj, effectiveRegion, safeName, isRentBuyLink);
        if (directLink) { link = directLink; appLink = null; }

        const appAttr = appLink ? `data-app-link="${escapeHTML(appLink)}"` : '';
        const openApp = `onclick="const app = this.getAttribute('data-app-link'); if(app && app !== 'null') { event.preventDefault(); openStreamingService(this.href, app); }"`;
        const logoHtml = logoSrc ? `<img src="${logoSrc}" alt="" loading="lazy">` : `<span>${escapeHTML(safeName.slice(0, 2))}</span>`;
        const vpnText = isVpnProvider ? `In ${vpnArticle}${escapeHTML(vpnRegionName)} with a VPN` : '';

        // Just the logo, for the little logo stacks on the panel's buttons.
        if (mode === 'logo') return `<span class="wp-stack-logo">${logoHtml}</span>`;

        // A row in the "Rent or buy" and "Other services" popups.
        if (mode === 'popup') {
          const actionLabel = extraText || (modeExtra && modeExtra.type ? modeExtra.type : 'Stream');
          const tag = { 'Rent': 'Rent', 'Buy': 'Buy', 'Rent/Buy': 'Rent or buy', 'Unsubscribed': 'Needs a subscription', 'Subscription': 'Included with your subscription', 'Subscription (VPN)': 'Included with your subscription' }[actionLabel] || actionLabel;
          return `<a href="${escapeHTML(link)}" target="_blank" rel="noopener" ${appAttr} ${openApp} class="wp-row wp-row-pop">
            <span class="wp-logo">${logoHtml}</span>
            <span class="wp-text"><span class="wp-name">${escapeHTML(safeName)}</span><span class="wp-sub${vpnText ? ' is-vpn' : ''}">${vpnText || escapeHTML(tag)}</span></span>
            <svg class="wp-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6"></path></svg>
          </a>`;
        }

        // Pieces of the Where to watch card.
        const statusText = vpnText ? `Needs a VPN set to ${vpnArticle}${escapeHTML(vpnRegionName)}` : 'Included with your subscription';
        if (mode === 'feature-top') {
          return `<span class="wp-logo">${logoHtml}</span><span class="wp-text"><span class="wp-name">${escapeHTML(safeName)}</span><span class="wp-sub${vpnText ? ' is-vpn' : ''}">${statusText}</span></span>`;
        }
        if (mode === 'watch') {
          return `<a href="${escapeHTML(link)}" target="_blank" rel="noopener" ${appAttr} ${openApp} class="wp-watch"><span class="wp-watch-label">Watch on ${escapeHTML(safeName)}</span><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"></path></svg></a>`;
        }
        // 'pick': one of your services as a tile, with its own status under the name; picking it
        // points the Watch button at it.
        const tileStatus = vpnText ? `VPN · ${escapeHTML(vpnRegionName)}` : 'Included';
        return `<button type="button" class="wp-pick-btn" aria-pressed="${extraText === 'picked' ? 'true' : 'false'}" title="${statusText}" aria-label="${escapeHTML(safeName)}: ${statusText}" data-link="${escapeHTML(link)}" data-app="${appLink ? escapeHTML(appLink) : ''}" data-name="${escapeHTML(safeName)}" onclick="selectWatchService(this)"><span class="wp-pick-logo">${logoHtml}</span><span class="wp-pick-name">${escapeHTML(safeName)}</span><span class="wp-pick-status${vpnText ? ' is-vpn' : ''}">${tileStatus}</span></button>`;
      };      let streamingHtml = '';
      const vpnToggleBtnHtml = `<button type="button" onclick="toggleWatchNowVpn()" title="${vpnModeEnabled ? 'Turn off VPN unlocks' : 'Also show where you could watch it by switching your VPN'}" aria-pressed="${vpnModeEnabled ? 'true' : 'false'}" class="wp-vpn watchnow-vpn-toggle${vpnModeEnabled ? ' vpn-active' : ''}">VPN <span class="watchnow-vpn-dot"></span></button>`;

      // Rent / Buy: ALWAYS use local home region if available. Only fallback to VPN if unavailable locally.
      const localRent = filterAndDeduplicateProviders(homeRegionData?.rent || [], true);
      const localBuy = filterAndDeduplicateProviders(homeRegionData?.buy || [], true);
      let rent = localRent;
      let buy = localBuy;
      let isVpnRentBuy = false;
      let vpnRentBuyRegion = null;

      if (rent.length === 0 && buy.length === 0 && vpnModeEnabled && allProvidersMap) {
        const preferredRegion = (effectiveVpnInfo && effectiveVpnInfo.region) || (movieObj.vpnInfo && movieObj.vpnInfo.region);
        if (preferredRegion && preferredRegion !== currentRegion && allProvidersMap[preferredRegion]) {
          const altRent = filterAndDeduplicateProviders(allProvidersMap[preferredRegion]?.rent || [], true);
          const altBuy = filterAndDeduplicateProviders(allProvidersMap[preferredRegion]?.buy || [], true);
          if (altRent.length > 0 || altBuy.length > 0) {
            rent = altRent;
            buy = altBuy;
            isVpnRentBuy = true;
            vpnRentBuyRegion = preferredRegion;
          }
        }
        if (!isVpnRentBuy) {
          for (const code of Object.keys(REGION_META)) {
            if (code === currentRegion || !allProvidersMap[code]) continue;
            const altRent = filterAndDeduplicateProviders(allProvidersMap[code]?.rent || [], true);
            const altBuy = filterAndDeduplicateProviders(allProvidersMap[code]?.buy || [], true);
            if (altRent.length > 0 || altBuy.length > 0) {
              rent = altRent;
              buy = altBuy;
              isVpnRentBuy = true;
              vpnRentBuyRegion = code;
              break;
            }
          }
        }
      }

      if (isVpnRentBuy && vpnRentBuyRegion) {
        rent = rent.map(p => ({ ...p, __isVpn: true, __vpnRegion: vpnRentBuyRegion }));
        buy = buy.map(p => ({ ...p, __isVpn: true, __vpnRegion: vpnRentBuyRegion }));
      }

      movieObj._hasVpnActive = !!(vpnModeEnabled && (isVpnUnlocked || isVpnRentBuy));

      const rbMap = new Map();
      rent.forEach(p => {
        rbMap.set(p.provider_id, { p, type: 'Rent' });
      });
      buy.forEach(p => {
        if (rbMap.has(p.provider_id)) { rbMap.get(p.provider_id).type = 'Rent/Buy'; }
        else { rbMap.set(p.provider_id, { p, type: 'Buy' }); }
      });

      // Unsubscribed streaming always from local home region (e.g. Sweden)
      const otherFlatrate = homeFlatrate.filter(p => !isSubscribedProvider(p));

      // Subscribed streaming: if unlocked via VPN, show ONLY ONE as main (Netflix or HBO first), rest in More popup
      const userFlatrate = isVpnUnlocked ? vpnMatchedProviders : userHomeFlatrate;

      // The card: your best service with its Watch button, and any other services you have as
      // small logo buttons beside it, so the box keeps one shape however many services you have.
      const best = isVpnUnlocked ? vpnMatchedProviders[0] : userHomeFlatrate[0];
      const yoursElse = (isVpnUnlocked ? vpnMatchedProviders : userHomeFlatrate).filter(p => p !== best);
      const cleanFlatrate = isVpnUnlocked ? vpnMatchedProviders : homeFlatrate;
      const namesOf = (list) => [...new Set(list.map(p => (p.provider_name || p.name || '').replace('with Ads', '').trim()))];
      const regionName = REGION_META[currentRegion]?.name || currentRegion;
      const listNames = (names) => names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
      const emptyCard = (title, sub) => `<div class="wp-feature is-empty"><p class="wp-empty-title">${escapeHTML(title)}</p>${sub ? `<p class="wp-empty-sub">${escapeHTML(sub)}</p>` : ''}</div>`;

      if (best) {
        const yours = [best, ...yoursElse].slice(0, 4);
        if (yours.length === 1) {
          streamingHtml = `<div class="wp-feature"><div class="wp-feature-top">${makeProviderLink(best, '', 'feature-top')}</div>${makeProviderLink(best, '', 'watch')}</div>`;
        } else {
          const picks = yours.map((p, i) => makeProviderLink(p, i === 0 ? 'picked' : '', 'pick')).join('');
          streamingHtml = `<div class="wp-feature is-multi"><div class="wp-pick" style="--cols:${yours.length}" role="group" aria-label="Your services with this film">${picks}</div>${makeProviderLink(best, '', 'watch')}</div>`;
        }
      } else if (otherFlatrate.length > 0) {
        const names = namesOf(otherFlatrate);
        streamingHtml = emptyCard('Not on your services', `In ${regionName} it's on ${listNames(names.slice(0, 3))}${names.length > 3 ? ' and more' : ''}.${vpnModeEnabled ? '' : ' Turn on VPN to check other countries.'}`);
      } else if (rbMap.size > 0) {
        streamingHtml = emptyCard('Not streaming', isVpnRentBuy ? `You can rent or buy it in ${REGION_META[vpnRentBuyRegion]?.name || vpnRentBuyRegion} with a VPN.` : `You can rent or buy it in ${regionName}.${vpnModeEnabled ? '' : ' Turn on VPN to check streaming elsewhere.'}`);
      } else {
        streamingHtml = emptyCard(`Not streaming in ${regionName}`, vpnModeEnabled ? 'Not on your services in any country we check either.' : 'Turn on VPN to check other countries.');
      }

      const userFlatrateLinksHtml = '';
      let otherFlatrateLinksHtml = '';
      otherFlatrate.forEach(p => { otherFlatrateLinksHtml += makeProviderLink(p, 'Unsubscribed', 'popup'); });
      let rbLinksHtml = '';
      rbMap.forEach(val => { rbLinksHtml += makeProviderLink(val.p, val.type, 'popup', { type: val.type }); });

      if (!window.moviePopupDataCache) window.moviePopupDataCache = new Map();
      window.moviePopupDataCache.set(movieObj.id, {
        title: movieObj.title,
        userFlatrateLinksHtml,
        otherFlatrateLinksHtml,
        rbLinksHtml,
        rentBuyCount: rbMap.size,
        streamingCount: cleanFlatrate.length,
        extraCount: 0,
        rbRegion: isVpnRentBuy ? (REGION_META[vpnRentBuyRegion]?.name || vpnRentBuyRegion) : '',
        hasVpnLinks: !!(vpnModeEnabled && (isVpnUnlocked || isVpnRentBuy))
      });

      // Rent or buy, and services you don't have: two buttons side by side, each opening a list.
      const stack = (list) => `<span class="wp-stack">${list.slice(0, 3).map(p => makeProviderLink(p, '', 'logo')).join('')}</span>`;
      const chevron = '<svg class="wp-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6"></path></svg>';
      const rbList = [...rbMap.values()].map(v => v.p);
      const moreBtns = [
        rbList.length ? `<button type="button" class="wp-more-btn" onclick="openRentBuyPopup(${movieObj.id})">${stack(rbList)}<span class="wp-text"><span class="wp-name">Rent or buy</span><span class="wp-sub">${rbList.length} ${rbList.length === 1 ? 'service' : 'services'}</span></span>${chevron}</button>` : '',
        otherFlatrate.length ? `<button type="button" class="wp-more-btn" onclick="openExtraStreamingPopup(${movieObj.id})">${stack(otherFlatrate)}<span class="wp-text"><span class="wp-name">Other services</span><span class="wp-sub">${otherFlatrate.length} ${otherFlatrate.length === 1 ? 'service' : 'services'}</span></span>${chevron}</button>` : ''
      ].join('');

      // The VPN switch sits in the section heading; re-renders refresh it there.
      movieObj._wnToggleHtml = vpnToggleBtnHtml;
      const headSlot = typeof document !== 'undefined' ? document.getElementById('wnHeadToggle') : null;
      if (headSlot) headSlot.innerHTML = vpnToggleBtnHtml;

      return `<div class="wp-main">${streamingHtml}</div>${moreBtns ? `<div class="wp-more">${moreBtns}</div>` : ''}`;
    }    function isMovieVpnActive(movieObj, details) {
      if (!vpnModeEnabled || !movieObj) return false;
      if (typeof movieObj._hasVpnActive === 'boolean') return movieObj._hasVpnActive;
      if (movieObj.vpnInfo) return true;
      const allProvidersMap = movieObj.allProviders
        || (details && details['watch/providers'] && details['watch/providers'].results)
        || (typeof movieDetailsCache !== 'undefined' && movieDetailsCache.get(`${movieObj.mediaType === 'tv' ? 'tv' : 'movie'}_${movieObj.id}`)?.['watch/providers']?.results)
        || null;
      if (!allProvidersMap) return false;
      const homeRegionData = (allProvidersMap && allProvidersMap[currentRegion])
        || (details && details['watch/providers'] && details['watch/providers'].results ? details['watch/providers'].results[currentRegion] : null)
        || (!movieObj.vpnInfo ? movieObj.regionData : null)
        || null;
      const selectedNamesSet = new Set(
        currentProviders
          .filter(cp => selectedServiceIds.has(cp.id))
          .map(cp => cleanNormalize(cp.name))
      );
      const isSubscribedProvider = (p) => {
        if (!p) return false;
        if (p.provider_id && selectedServiceIds.has(p.provider_id)) return true;
        if (p.id && selectedServiceIds.has(p.id)) return true;
        const norm = cleanNormalize(p.provider_name || p.name || '');
        return norm ? selectedNamesSet.has(norm) : false;
      };
      const homeFlatrate = filterAndDeduplicateProviders(homeRegionData?.flatrate || []);
      const userHomeFlatrate = homeFlatrate.filter(isSubscribedProvider);
      const localRent = filterAndDeduplicateProviders(homeRegionData?.rent || [], true);
      const localBuy = filterAndDeduplicateProviders(homeRegionData?.buy || [], true);

      if (userHomeFlatrate.length === 0) {
        for (const code of Object.keys(REGION_META)) {
          if (code === currentRegion || !allProvidersMap[code]) continue;
          const altFlat = filterAndDeduplicateProviders(allProvidersMap[code]?.flatrate || []).filter(isSubscribedProvider);
          if (altFlat.length > 0) return true;
          if (localRent.length === 0 && localBuy.length === 0) {
            const altRent = filterAndDeduplicateProviders(allProvidersMap[code]?.rent || [], true);
            const altBuy = filterAndDeduplicateProviders(allProvidersMap[code]?.buy || [], true);
            if (altRent.length > 0 || altBuy.length > 0) return true;
          }
        }
      }
      return false;
    }

    function updateMoviePageVpnNote(movieObj, details) {
      if (!movieObj) return;
      const showNote = isMovieVpnActive(movieObj, details);
      const footnoteEls = document.querySelectorAll('.movie-page-vpn-footnote, #moviePageVpnFootnote');
      footnoteEls.forEach(el => {
        el.classList.toggle('hidden', !showNote);
      });
    }

    function generateFullMovieHTML(movieObj, details, isModal = false, context = 'lookup', isPage = false, collectionData = null) {
      const safeTitle = escapeHTML(movieObj.title || (details && details.title) || (details && details.name) || 'Untitled'); const year = movieObj.releaseDate ? movieObj.releaseDate.split('-')[0] : 'N/A'; const isTvMedia = movieObj.mediaType === 'tv' || (details && details.number_of_episodes !== undefined);
      let runtime = '';
      if (isTvMedia && details) {
        const seasons = details.number_of_seasons;
        const episodes = details.number_of_episodes;
        if (seasons && episodes) {
          runtime = `${seasons} ${seasons === 1 ? 'season' : 'seasons'}, ${episodes} ${episodes === 1 ? 'episode' : 'episodes'}`;
        } else if (episodes) {
          runtime = `${episodes} ${episodes === 1 ? 'Episode' : 'Episodes'}`;
        } else if (seasons) {
          runtime = `${seasons} ${seasons === 1 ? 'Season' : 'Seasons'}`;
        }
      } else if (details && details.runtime) {
        runtime = `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m`;
      } const genres = details && details.genres ? details.genres.map(g => escapeHTML(g.name)).slice(0, 3).join(', ') : ''; const overview = details && details.overview ? escapeHTML(details.overview) : 'No synopsis available.';
      const titleLogo = getBestTitleLogo(details);
      const titleHeaderHtml = titleLogo
        ? `<img src="${titleLogo}" alt="${safeTitle}" loading="eager" decoding="async" class="titleLogoImg max-h-20 sm:max-h-28 max-w-[280px] sm:max-w-[440px] object-contain mb-2 shrink-0" onerror="onTitleLogoError(this)" onload="if(this.naturalWidth===0)onTitleLogoError(this)">`
        : `<h2 class="movie-hero-title text-3xl min-[400px]:text-4xl sm:text-6xl md:text-7xl font-black text-white tracking-tight drop-shadow-[0_8px_20px_rgba(0,0,0,0.95)] leading-tight mb-2">${safeTitle}</h2>`;
      // Bigger, bolder title treatment for the full-bleed page hero, matching the actor name typography style but a bit larger.
      const pageTitleHeaderHtml = titleLogo
        ? `<img src="${titleLogo}" alt="${safeTitle}" loading="eager" decoding="async" class="titleLogoImg pageTitleImg max-h-28 sm:max-h-40 max-w-[360px] sm:max-w-[620px] object-contain mb-3 shrink-0 mx-auto lg:mx-0" onerror="onTitleLogoError(this)" onload="if(this.naturalWidth===0)onTitleLogoError(this)">`
        : `<h1 class="movie-hero-title text-4xl min-[400px]:text-5xl sm:text-7xl md:text-8xl lg:text-[5.5rem] font-black text-white tracking-tight drop-shadow-[0_8px_20px_rgba(0,0,0,0.95)] leading-[0.95] mb-3 text-center lg:text-left">${safeTitle}</h1>`;
      const imdbId = (details && details.external_ids && details.external_ids.imdb_id) ? details.external_ids.imdb_id : (movieObj.imdbId || getStoredImdbId(isTvMedia ? 'tv' : 'movie', movieObj.id) || null);
      const cachedImdbRating = imdbId ? imdbRatingCache.get(imdbId) : null;
      let modalRatingBadgeHtml = '';
      if (cachedImdbRating) {
        modalRatingBadgeHtml = `<div id="modalRatingBadge" class="modal-rating-badge imdb-rating-badge inline-flex items-center gap-1.5 shrink-0" data-imdb-id="${imdbId}" title="IMDb Rating: ${cachedImdbRating}/10">${IMDB_TAG_HTML}<span class="imdb-rating-num font-extrabold text-white text-sm sm:text-base tracking-tight leading-none">${cachedImdbRating}</span></div>`;
      } else if (imdbId) {
        modalRatingBadgeHtml = `<div id="modalRatingBadge" class="modal-rating-badge imdb-rating-badge inline-flex items-center gap-1.5 shrink-0" data-imdb-id="${imdbId}" data-is-tv="${isTvMedia ? '1' : '0'}" title="Loading IMDb rating...">${IMDB_TAG_HTML}<span class="imdb-rating-num font-extrabold text-white text-sm sm:text-base tracking-tight leading-none animate-pulse">...</span></div>`;
        setTimeout(() => { resolveImdbRatingBadges(imdbId, isTvMedia); }, 0);
      } else {
        modalRatingBadgeHtml = `<div id="modalRatingBadge" class="modal-rating-badge imdb-rating-badge is-empty inline-flex items-center gap-1.5 shrink-0" title="${NO_RATING_TITLE}">${IMDB_TAG_HTML}<span class="imdb-rating-num font-extrabold text-white text-sm sm:text-base tracking-tight leading-none">${NO_RATING_TEXT}</span></div>`;

      }

      const requestId = movieObj.id;
      window.currentModalMovieId = requestId;
      let directors = [];
      if (isTvMedia && details) {
        const seenD = new Set();
        directors = (details.created_by || []).map(c => ({
          ...c,
          job: 'Creator',
          _role: 'Creator'
        })).filter(d => {
          if (!d.id || seenD.has(d.id)) return false;
          seenD.add(d.id);
          return true;
        });
      } else {
        directors = details && details.credits && details.credits.crew
          ? details.credits.crew.filter(c => c.job === 'Director').map(d => ({ ...d, _role: 'Director' }))
          : [];
      }
      const allCast = (details && details.aggregate_credits && Array.isArray(details.aggregate_credits.cast) && details.aggregate_credits.cast.length > 0)
        ? details.aggregate_credits.cast.map(c => ({
          ...c,
          character: (c.roles && c.roles[0] && c.roles[0].character) ? c.roles[0].character : (c.character || '')
        }))
        : (details && details.credits && details.credits.cast ? details.credits.cast : []);
      const allCrew = details && details.credits && details.credits.crew ? details.credits.crew : [];
      window.currentMovieFullCredits = {
        movieId: movieObj.id,
        mediaType: movieObj.mediaType || (movieObj.first_air_date ? 'tv' : 'movie'),
        movieTitle: movieObj.title || (details && details.title) || (details && details.name) || 'Untitled',
        backdrop: (details && details.backdrop_path ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}` : movieObj.backdrop) || null,
        titleLogo: titleLogo,
        cast: allCast,
        crew: allCrew,
        directors: directors
      };
      const topCast = allCast.slice(0, 14);
      const crewAndCast = [...directors, ...topCast.map(c => ({ ...c, _role: c.character || '' }))];
      // Everyone on the full cast and crew page, counted the same way it counts them.
      const totalCastCount = new Set([...directors, ...allCast, ...allCrew].map(p => p.id)).size;
      let castCrewHtml = '';
      if (crewAndCast.length > 0) {
        const chips = crewAndCast.map((p, i) => personCardHTML(p, { role: p._role, index: i })).join('')
          + `<button type="button" class="person-card person-card-more cast-chip-card" onclick="if(!window.isCastDragging) openFullCastModal(${isPage ? 'true' : 'false'})"><span class="person-card-photo"><span class="person-card-more-count">${totalCastCount}</span></span><span class="person-card-name">Everyone</span><span class="person-card-role">Full cast and crew</span></button>`;
        const arrow = (id, dir, label) => `<button id="${id}" type="button" onclick="scrollCastTrack(${dir}, event)" aria-label="${label}" class="rail-arrow rail-arrow-${dir < 0 ? 'prev' : 'next'}"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="${dir < 0 ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'}"></path></svg></button>`;
        castCrewHtml = `<section class="page-section"><div class="section-head"><h2 class="section-title">Cast and crew</h2><button type="button" class="link-btn" onclick="openFullCastModal(${isPage ? 'true' : 'false'})">See all ${totalCastCount}</button></div><div class="rail-wrap">${arrow('castPrevBtn', -1, 'Scroll cast left')}${arrow('castNextBtn', 1, 'Scroll cast right')}<div id="castCrewTrack" class="rail rail-people">${chips}</div></div></section>`;
      }      const bestTrailer = getBestTrailer(details);
      const isMobileDevice = isMobile || (typeof window !== 'undefined' && window.innerWidth < 640);
      const heroTrailer = (!isMobileDevice && bestTrailer && bestTrailer.official && /trailer/i.test(bestTrailer.name || '')) ? bestTrailer : null;
      const btnClass = "w-9 h-9 min-[360px]:w-10 min-[360px]:h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 rounded-xl sm:rounded-2xl transition-all text-white shadow-sm shrink-0 cursor-pointer";
      const actionBtnClass = "w-9 h-9 min-[360px]:w-10 min-[360px]:h-10 sm:w-12 sm:h-12 rounded-[22.5%] overflow-hidden shadow-sm shrink-0 active:scale-95 hover:brightness-110 transition-all block cursor-pointer";
      const socialBtnClass = `${actionBtnClass} grayscale hover:grayscale-0`;
      const trailerBtnClass = "btn btn-quiet hero-trailer-btn";
      
      const watchNowHeaderHtml = `<div class="section-head"><h2 class="section-title">Watch now</h2></div>`;

      const hasMovieHistory = isModal ? watchlistModalHistoryStack.length > 0 : quickSearchHistoryStack.length > 0;
      const movieBackBtn = hasMovieHistory ? `<button id="movieBackBtn" type="button" onclick="navGoBack()" aria-label="Go back" class="pointer-events-auto mt-[max(1rem,calc(env(safe-area-inset-top,0px)+0.5rem))] ml-4 w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center liquid-glass active:scale-95 text-white transition-all cursor-pointer shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg></button>` : '';
      const closeBtn = `<div class="sticky top-0 z-[60] w-full h-0 flex ${movieBackBtn ? 'justify-between' : 'justify-end'} pointer-events-none">${movieBackBtn}<button id="closeModalBtn" type="button" onclick="${isModal ? 'closeModal()' : 'closeQuickSearchInline()'}" aria-label="Close" class="pointer-events-auto mt-[max(1rem,calc(env(safe-area-inset-top,0px)+0.5rem))] mr-4 w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center liquid-glass active:scale-95 text-white transition-all cursor-pointer shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>`;
      const extIds = (details && details.external_ids) || {};
      const trailerActionBtn = bestTrailer
        ? `<button data-trailer-key="${escapeHTML(bestTrailer.key)}" data-movie-title="${safeTitle}" onclick="openTrailerModal(this.dataset.trailerKey, this.dataset.movieTitle)" title="Watch Trailer" aria-label="Watch Trailer" class="${actionBtnClass} lg:hidden"><img src="/icons/youtube.png" alt="Watch Trailer" class="w-full h-full object-cover"></button>`
        : `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent(movieObj.title + ' official trailer')}" target="_blank" title="Watch Trailer" aria-label="Watch Trailer" class="${actionBtnClass} lg:hidden"><img src="/icons/youtube.png" alt="Watch Trailer" class="w-full h-full object-cover"></a>`;
      const letterboxdBtn = `<a href="https://letterboxd.com/tmdb/${movieObj.id}" target="_blank" title="Letterboxd" aria-label="Letterboxd" class="${actionBtnClass}"><img src="/icons/letterboxd.png" alt="Letterboxd" class="w-full h-full object-cover"></a>`;
      const imdbBtn = imdbId ? `<a href="https://www.imdb.com/title/${escapeHTML(imdbId)}/" target="_blank" title="IMDb" aria-label="IMDb" class="${actionBtnClass}"><img src="/icons/imdb.png" alt="IMDb" class="w-full h-full object-cover"></a>` : '';
      const tmdbMediaType = movieObj.mediaType === 'tv' ? 'tv' : 'movie';
      const tmdbBtn = `<a href="https://www.themoviedb.org/${tmdbMediaType}/${movieObj.id}" target="_blank" title="TMDB" aria-label="TMDB" class="${actionBtnClass} lg:hidden"><img src="/icons/tmdb.png" alt="TMDB" class="w-full h-full object-cover"></a>`;
      const socialsList = [];
      if (extIds.instagram_id) socialsList.push({ name: 'Instagram', handle: '@' + extIds.instagram_id.replace(/^@/, ''), url: `https://instagram.com/${escapeHTML(extIds.instagram_id)}`, icon: '/icons/instagram.png' });
      if (extIds.twitter_id) socialsList.push({ name: 'X (Twitter)', handle: '@' + extIds.twitter_id.replace(/^@/, ''), url: `https://x.com/${escapeHTML(extIds.twitter_id)}`, icon: '/icons/x.png' });
      if (extIds.tiktok_id) socialsList.push({ name: 'TikTok', handle: '@' + extIds.tiktok_id.replace(/^@/, ''), url: `https://tiktok.com/@${escapeHTML(extIds.tiktok_id.replace(/^@/, ''))}`, icon: '/icons/tiktok.png' });
      if (extIds.facebook_id) socialsList.push({ name: 'Facebook', handle: extIds.facebook_id, url: `https://facebook.com/${escapeHTML(extIds.facebook_id)}`, icon: '/icons/facebook.png' });

      let socialsDrawerHtml = '';
      if (socialsList.length > 0) {
        const socialsPayload = escapeHTML(JSON.stringify({
          title: safeTitle,
          subtitle: year ? `${year}` : '',
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
      const trailerHeaderBtn = bestTrailer
        ? `<button data-trailer-key="${escapeHTML(bestTrailer.key)}" data-movie-title="${safeTitle}" onclick="openTrailerModal(this.dataset.trailerKey, this.dataset.movieTitle)" class="${trailerBtnClass} cursor-pointer"><svg class="hero-trailer-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><span>Trailer</span></button>`
        : `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent(movieObj.title + ' official trailer')}" target="_blank" class="${trailerBtnClass}"><svg class="hero-trailer-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><span>Trailer</span></a>`;
      const pageTrailerBtnHtml = trailerHeaderBtn;
      const shareParam = movieObj.mediaType === 'tv' ? 'tv' : 'movie';
      const shareBtn = `<button onclick="navigator.clipboard.writeText('${window.location.origin}${window.location.pathname}?${shareParam}=${movieObj.id}'); const t=this; const old=t.innerHTML; t.innerHTML='<svg class=\\'w-4 h-4 min-[360px]:w-5 min-[360px]:h-5 text-green-400\\' fill=\\'none\\' stroke=\\'currentColor\\' viewBox=\\'0 0 24 24\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'2\\' d=\\'M5 13l4 4L19 7\\'/></svg>'; setTimeout(()=>t.innerHTML=old, 2000);" title="Copy Link" aria-label="Copy Link" class="${btnClass} cursor-pointer"><svg class="w-4 h-4 min-[360px]:w-5 min-[360px]:h-5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg></button>`;
      const primaryFilmBtns = [trailerActionBtn, letterboxdBtn, imdbBtn, tmdbBtn].filter(Boolean);
      const divider = (primaryFilmBtns.length > 0 && (socialsDrawerHtml || shareBtn))
        ? '<div class="w-px h-5 sm:h-6 bg-white/10 my-auto shrink-0 mx-0.5 sm:mx-1"></div>'
        : '';
      const movieActionBtns = [...primaryFilmBtns, divider, shareBtn, socialsDrawerHtml].filter(Boolean);
      const pageUrl = `${window.location.origin}${window.location.pathname}?${shareParam}=${movieObj.id}`;
      const filmFooterLinks = [
        { label: 'Letterboxd', href: `https://letterboxd.com/tmdb/${movieObj.id}` },
        imdbId ? { label: 'IMDb', href: `https://www.imdb.com/title/${escapeHTML(imdbId)}/` } : null,
        { label: 'TMDB', href: `https://www.themoviedb.org/${tmdbMediaType}/${movieObj.id}` },
        ...socialsList.map(s => ({ label: s.name, href: s.url })),
        { label: 'Copy link', onclick: `copyPageLink(this, '${pageUrl}')` }
      ];
      const movieActionBtnsHtml = `<div class="flex items-center justify-center lg:justify-start gap-1.5 min-[360px]:gap-2 sm:gap-3 flex-nowrap w-full lg:w-auto overflow-x-auto max-w-full no-scrollbar">${movieActionBtns.join('')}</div>`;

      const overviewHtml = createExpandableTextHtml(overview, 'movieOverviewText');

      const recResults = (details && details.recommendations && details.recommendations.results) || [];
      const simResults = (details && details.similar && details.similar.results) || [];
      const collectionId = details && details.belongs_to_collection ? details.belongs_to_collection.id : null;
      // TMDB's recommendation/similar list items don't include belongs_to_collection, so also use a
      // title-prefix heuristic to catch franchise sequels (e.g. "Avatar" vs "Avatar: The Way of Water").
      const franchiseKey = safeTitle.toLowerCase().split(/[:\-–]/)[0].trim();
      const seenRecIds = new Set();
      const combinedRecs = [...recResults, ...simResults].filter(m => {
        if (!m.poster_path || !(m.title || m.name) || seenRecIds.has(m.id)) return false;
        seenRecIds.add(m.id);
        return true;
      });

      // Render Collection / Franchise (Related Movies & Sequels) track if available
      let relatedHtml = '';
      let collectionParts = (collectionData && collectionData.parts) ? [...collectionData.parts] : [];

      if (collectionParts.length === 0) {
        const franchiseItems = TV_FRANCHISE_MAP[movieObj.id] || [];
        const franchiseIdSet = new Set(franchiseItems.map(item => typeof item === 'object' ? item.id : item));
        const mappedTvParts = combinedRecs.filter(m => franchiseIdSet.has(m.id));

        const combinedTvParts = [...mappedTvParts];
        if (combinedTvParts.length >= 1) {
          const seenFIds = new Set();
          collectionParts = [movieObj, ...combinedTvParts].filter(m => {
            if (seenFIds.has(m.id)) return false;
            seenFIds.add(m.id);
            return true;
          });
        }
      }

      if (collectionParts.length > 1) {
        collectionParts.sort((a, b) => {
          const dateA = a.release_date || a.first_air_date || a.releaseDate || '9999-99-99';
          const dateB = b.release_date || b.first_air_date || b.releaseDate || '9999-99-99';
          return dateA.localeCompare(dateB);
        });
        const watchlistIds = new Set(scannedMovies.map(m => m.id));
        const collectionName = (collectionData && collectionData.name) || (details && details.belongs_to_collection && details.belongs_to_collection.name) || 'Related Movies, Series & Franchises';
        const isTvItem = movieObj.mediaType === 'tv';
        const relatedCards = collectionParts.map((m, i) => {
          const mMediaType = m.mediaType || m.media_type || (m.name && !m.title ? 'tv' : (isTvItem ? 'tv' : 'movie'));
          m.mediaType = mMediaType;
          const open = isPage ? `openMoviePageById(${m.id}, '', '${mMediaType}')` : `handleSimilarMovieClick(${m.id}, '', ${isModal ? 'false' : 'true'}, '${mMediaType}')`;
          return posterCardHTML(m, { onclick: open, current: m.id === movieObj.id, index: i });
        }).join('');
        const arrow = (id, dir, fn, label) => `<button id="${id}" type="button" onclick="${fn}(${dir}, event)" aria-label="${label}" class="rail-arrow rail-arrow-${dir < 0 ? 'prev' : 'next'}"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="${dir < 0 ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'}"></path></svg></button>`;
        const sectionTitle = isTvItem && !/Franchise|Series/.test(collectionName) ? 'Related films and series' : collectionName;
        const countLabel = isTvItem ? `${collectionParts.length} titles` : `${collectionParts.length} films`;
        relatedHtml = `<section class="page-section"><div class="section-head"><h2 class="section-title">${escapeHTML(sectionTitle)}</h2><span class="section-count">${countLabel}</span></div><div class="rail-wrap">${arrow('relatedPrevBtn', -1, 'scrollRelatedTrack', 'Scroll left')}${arrow('relatedNextBtn', 1, 'scrollRelatedTrack', 'Scroll right')}<div id="relatedMoviesTrack" class="rail rail-posters">${relatedCards}</div></div></section>`;
      }
      // Filter out any movies that are already present in the Collection track from Similar Movies
      const collectionMovieIds = new Set(collectionParts.map(m => m.id));
      const recs = combinedRecs.filter(m => !collectionMovieIds.has(m.id)).slice(0, 28);
      let similarHtml = '';
      if (recs.length > 0) {
        const recCards = recs.map((m, i) => {
          const mMediaType = m.mediaType || m.media_type || (m.name && !m.title ? 'tv' : (movieObj.mediaType === 'tv' ? 'tv' : 'movie'));
          m.mediaType = mMediaType;
          const open = isPage ? `openMoviePageById(${m.id}, '', '${mMediaType}')` : `handleSimilarMovieClick(${m.id}, '', ${isModal ? 'false' : 'true'}, '${mMediaType}')`;
          return posterCardHTML(m, { onclick: open, index: i });
        }).join('');
        const arrow = (id, dir, label) => `<button id="${id}" type="button" onclick="scrollSimilarTrack(${dir}, event)" aria-label="${label}" class="rail-arrow rail-arrow-${dir < 0 ? 'prev' : 'next'}"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="${dir < 0 ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'}"></path></svg></button>`;
        similarHtml = `<section class="page-section"><div class="section-head"><h2 class="section-title">More like this</h2></div><div class="rail-wrap">${arrow('similarPrevBtn', -1, 'Scroll left')}${arrow('similarNextBtn', 1, 'Scroll right')}<div id="similarMoviesTrack" class="rail rail-posters">${recCards}</div></div></section>`;
      }
      const initialMuteParam = isHeroVideoMuted ? 1 : 0;
      const soundIconsInnerHtml = `<svg class="heroSoundIconMuted w-4 h-4 sm:w-5 sm:h-5 ${isHeroVideoMuted ? '' : 'hidden'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg><svg class="heroSoundIconUnmuted w-4 h-4 sm:w-5 sm:h-5 ${isHeroVideoMuted ? 'hidden' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>`;
      const soundBtnInlineHtml = heroTrailer ? `<button type="button" onclick="toggleHeroVideoSound()" title="${isHeroVideoMuted ? 'Unmute' : 'Mute'}" aria-label="Sound on or off" class="heroSoundToggleBtn btn btn-quiet btn-lg hero-icon-btn">${soundIconsInnerHtml}</button>` : '';
      const soundBtnHtml = heroTrailer ? `<button type="button" onclick="toggleHeroVideoSound()" title="${isHeroVideoMuted ? 'Unmute' : 'Mute'}" aria-label="Toggle sound" class="heroSoundToggleBtn liquid-glass hidden sm:flex absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-30 w-11 h-11 sm:w-12 sm:h-12 rounded-full items-center justify-center active:scale-95 text-white transition-all cursor-pointer pointer-events-auto">${soundIconsInnerHtml}</button>` : '';
      const heroVideoHtml = heroTrailer ? `<div class="absolute inset-0 overflow-hidden pointer-events-none z-10 clip-mask"><iframe id="heroVideoIframe" src="https://www.youtube.com/embed/${heroTrailer.key}?autoplay=1&mute=${initialMuteParam}&controls=0&playsinline=1&enablejsapi=1&disablekb=1&fs=0&modestbranding=1&iv_load_policy=3&rel=0&vq=hd1080&cc_load_policy=0&cc_lang_pref=none&hl=en" title="${safeTitle} preview" allow="autoplay; encrypted-media" class="absolute pointer-events-none opacity-0 transition-opacity duration-700 transform-gpu" onload="onHeroVideoLoad(this)"></iframe></div><div id="heroFadeOverlay" class="absolute inset-0 bg-black opacity-0 transition-opacity duration-500 pointer-events-none z-15"></div>` : '';


      if (isPage) {
        const watchBoxHtml = renderMovieWatchOptionsBox(movieObj, details, true, false);
        const metaSep = '<span class="hero-meta-sep" aria-hidden="true">·</span>';
        const heroMetaHtml = `<div class="hero-meta">${[modalRatingBadgeHtml, year && year !== 'N/A' ? `<span>${year}</span>` : '', runtime ? `<span>${runtime}</span>` : '', genres ? `<span>${genres}</span>` : ''].filter(Boolean).join(metaSep)}</div>`;
        const heroActionsHtml = `${pageTrailerBtnHtml}${soundBtnInlineHtml}`;
        const heroBackdropUrl = movieObj.backdrop ? movieObj.backdrop.replace('/t/p/w1280/', '/t/p/original/') : null;
        const hasHero = !!(heroBackdropUrl || heroTrailer);
        const heroPosterUrl = getTextlessPosterUrl(details, movieObj.poster);
        const heroBannerSectionHtml = hasHero
          ? `<div class="relative w-full hero-mobile-aspect">
              <div id="moviePageHeroArt" class="absolute inset-0 overflow-hidden bg-[#0a0a0b] clip-mask">
                ${heroBackdropUrl ? `<img src="${heroBackdropUrl}" alt="${safeTitle} backdrop" loading="eager" decoding="async" onload="this.style.opacity='1'" style="opacity:0; transition: opacity 0.35s ease-out;" class="hero-landscape-block w-full h-full object-cover object-[center_20%] scale-105 transform-gpu">` : `<div class="hero-landscape-block w-full h-full bg-gray-900"></div>`}
                ${heroPosterUrl ? `<img src="${heroPosterUrl}" alt="${safeTitle} poster" loading="eager" decoding="async" onload="this.style.opacity='1'" style="opacity:0; transition: opacity 0.35s ease-out;" class="hero-portrait-block absolute inset-0 w-full h-full object-cover object-top transform-gpu">` : `<div class="hero-portrait-block w-full h-full bg-gray-900"></div>`}
                ${heroVideoHtml}<div class="film-hero-fade" aria-hidden="true"></div>
              </div>
              <!-- Content overlay: sits directly over the bottom of the poster/backdrop on all screens -->
              <div class="absolute inset-x-0 bottom-0 z-30 pointer-events-none pb-5 sm:pb-10 lg:pb-12">
                <div class="page-width hero-layout">
                  <div class="hero-copy">
                    ${pageTitleHeaderHtml}
                    ${heroMetaHtml}
                    ${createHeroOverviewHtml(overview, safeTitle)}
                  </div>
                  <div class="hero-actions hero-actions-side pointer-events-auto">${heroActionsHtml}</div>
                </div>
              </div>
            </div>`
          : `<div class="relative w-full pt-24 pb-8 sm:pb-12 bg-gradient-to-b from-[#151517] via-[#151517] to-[#0a0a0b] border-b border-white/5">
              <div class="page-width hero-layout">
                <div class="hero-copy">
                  ${pageTitleHeaderHtml}
                  ${heroMetaHtml}
                  ${createHeroOverviewHtml(overview, safeTitle)}
                </div>
                <div class="hero-actions hero-actions-side pointer-events-auto">${heroActionsHtml}</div>
              </div>
            </div>`;

        return `${pageNavHTML('closeMoviePage()', 'goHomeFromPage()', 'moviePageNav')}
          ${heroBannerSectionHtml}
          <div class="page-width film-body">
            <div class="film-top${castCrewHtml ? '' : ' no-cast'}">
              ${castCrewHtml}
              <section class="page-section film-watch" aria-label="Where to watch">
                <div class="section-head"><h2 class="section-title">Where to watch</h2><div id="wnHeadToggle" class="section-head-end">${movieObj._wnToggleHtml || ''}</div></div>
                <div id="desktopWatchOptionsBox" class="watch-panel">${watchBoxHtml}</div>
              </section>
            </div>
            ${relatedHtml ? `<div class="min-w-0">${relatedHtml}</div>` : ''}
            ${similarHtml ? `<div class="min-w-0">${similarHtml}</div>` : ''}
          </div>
          <div class="page-width">${pageFooterHTML(filmFooterLinks, `<p id="moviePageVpnFootnote" class="page-note movie-page-vpn-footnote ${isMovieVpnActive(movieObj, details) ? '' : 'hidden'}">Some streaming services may detect or block VPN connections.</p>`)}</div>`;
      }
      const hasModalHero = !!(movieObj.backdrop || heroTrailer);
      const modalHeaderHeight = hasModalHero ? 'h-[360px] sm:h-[460px]' : 'h-auto pt-16 pb-6';
      const modalMobilePoster = getTextlessPosterUrl(details, movieObj.poster);
      return `${closeBtn}<div class="relative w-full ${modalHeaderHeight} shrink-0 rounded-t-3xl"><div class="absolute inset-0 rounded-t-3xl overflow-hidden bg-[#0a0a0b] clip-mask">${modalMobilePoster ? `<img src="${modalMobilePoster}" alt="${safeTitle} poster" loading="eager" decoding="async" class="hero-portrait-block absolute inset-0 w-full h-full object-cover object-top transform-gpu">` : ""}${movieObj.backdrop ? `<img src="${movieObj.backdrop}" alt="${safeTitle} backdrop" loading="eager" decoding="async" class="hero-landscape-block w-full h-full object-cover object-[center_15%] transform-gpu">` : `<div class="hero-landscape-block w-full h-full bg-gray-900"></div>`}${heroVideoHtml}<div class="absolute inset-x-0 bottom-0 h-[62%] sm:h-[65%] bg-gradient-to-t from-[#0a0a0b] from-0% via-[#0a0a0b] via-15% via-[#0a0a0b]/80 via-40% via-[#0a0a0b]/30 via-70% to-transparent to-100% pointer-events-none z-20"></div></div><div class="absolute inset-0 p-6 sm:p-8 flex items-end justify-between gap-6 z-30 pointer-events-none"><div class="flex flex-col justify-end items-start h-auto max-w-[calc(100%-4rem)] min-w-0 pointer-events-auto">${titleHeaderHtml}</div></div></div><div class="relative p-6 sm:p-8 pt-4 sm:pt-6 flex flex-col gap-7 sm:gap-9 bg-[#0a0a0b] z-0"><div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/5 pb-4"><div class="flex flex-wrap items-center gap-3 text-sm font-bold text-gray-200">${modalRatingBadgeHtml}${modalRatingBadgeHtml ? `<span class="text-gray-500 shrink-0 rating-sep">&bull;</span>` : ''}<span class="text-white font-extrabold">${year}</span>${runtime ? `<span class="text-gray-500">&bull;</span><span>${runtime}</span>` : ''}${genres ? `<span class="text-gray-500">&bull;</span><span class="text-white font-semibold text-sm sm:text-base">${genres}</span>` : ''}</div><div class="flex items-center gap-3">${trailerHeaderBtn ? `<div class="flex-1 sm:flex-none sm:shrink-0">${trailerHeaderBtn}</div>` : ''}${soundBtnInlineHtml}</div></div><div>${overviewHtml}</div><div class="space-y-3"><div class="flex items-center justify-between"><h3 class="text-base sm:text-lg font-extrabold uppercase tracking-widest text-blue-400">Watch now</h3></div><div id="modalWatchOptionsBox" class="watch-options-box wn-box">${renderMovieWatchOptionsBox(movieObj, details, false, true)}</div></div>${castCrewHtml}${relatedHtml}${similarHtml}</div><div class="bg-[#0a0a0b] p-5 sm:px-8 sm:py-5 ${isModal ? 'rounded-b-3xl' : 'rounded-b-2xl sm:rounded-b-3xl'} border-t border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 z-10">${movieActionBtnsHtml}<div class="flex flex-col items-center lg:items-end gap-1.5 w-full lg:w-auto text-center lg:text-right"><div class="flex flex-col sm:flex-row items-center justify-center lg:justify-end gap-1.5 sm:gap-2.5"><a href="https://www.themoviedb.org/" target="_blank" class="hidden lg:inline-block shrink-0 opacity-80 hover:opacity-100 transition-opacity"><img src="/icons/tmdb-logo.svg" alt="TMDB Logo" class="h-3 sm:h-3.5"></a><span class="text-[10px] sm:text-[11px] text-gray-400 font-medium sm:whitespace-nowrap">This product uses the TMDB API but is not endorsed or certified by TMDB.<br>Streaming availability data provided by <a href="https://www.justwatch.com" target="_blank" rel="noopener" class="underline hover:text-white">JustWatch</a>.</span></div><p id="moviePageVpnFootnote" class="movie-page-vpn-footnote text-[10px] sm:text-[11px] text-gray-500 font-medium leading-tight text-center lg:text-right w-full lg:w-auto ${isMovieVpnActive(movieObj, details) ? '' : 'hidden'}">*Some streaming services may detect or restrict VPN connections</p></div></div>`;
    }

    function getShortText(text, limit = 195) {
      if (!text || text.length <= limit) return text;
      const sub = text.slice(0, limit);
      const lastSpace = sub.lastIndexOf(' ');
      return lastSpace > 90 ? sub.slice(0, lastSpace) : sub;
    }

