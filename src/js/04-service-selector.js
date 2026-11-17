    // ----- INLINE SERVICE SELECTOR LOGIC -----

    function createTileImgHTML(provider) {
      const initials = escapeHTML(provider.name.slice(0, 2).toUpperCase());
      const logoDev = provider.logoDevPath || '';
      const tmdb = provider.tmdbLogoPath || '';
      if (!provider.logoPath) {
        return `<div class="w-full h-full flex items-center justify-center bg-gray-800 text-[9px] font-bold text-gray-400 rounded-[22.5%]">${initials}</div>`;
      }
      return `<img src="${provider.logoPath}" alt="${escapeHTML(provider.name)}" loading="lazy" class="bg-gray-800" data-logodev="${escapeHTML(logoDev)}" data-tmdb="${escapeHTML(tmdb)}" onerror="const ld=this.dataset.logodev; const tm=this.dataset.tmdb; if(ld && this.src!==ld){this.src=ld;} else if(tm && this.src!==tm){this.src=tm;} else {this.onerror=null;this.parentElement.innerHTML='<div class=\\'w-full h-full flex items-center justify-center bg-gray-800 text-[9px] font-bold text-gray-400 rounded-[22.5%]\\'>${initials}</div>';}">`;
    }

    // A small stack of overlapping service logos, used on the landing's "Streaming on" pill
    // and in the results' context line. Shows up to `max` logos, then "+N".
    function serviceStackHTML(providers, max = 4) {
      if (!providers.length) return '';
      const shown = providers.slice(0, max);
      const more = providers.length - shown.length;
      return `<span class="svc-stack">${shown.map(p => `<span class="svc-stack-logo">${createTileImgHTML(p)}</span>`).join('')}</span>${more > 0 ? `<span class="svc-stack-more">+${more}</span>` : ''}`;
    }

    // One option in the picker: the logo, its name underneath, and a check when it's on.
    function createBrowserTile(provider) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'svc-option';
      const setState = () => {
        const on = pendingSelectedIds.has(provider.id);
        btn.classList.toggle('selected', on);
        btn.setAttribute('aria-pressed', String(on));
      };
      btn.innerHTML = `<span class="svc-option-logo">${createTileImgHTML(provider)}<span class="svc-option-check" aria-hidden="true"><svg fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"></path></svg></span></span><span class="svc-option-name">${escapeHTML(provider.name)}</span>`;
      setState();
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (pendingSelectedIds.has(provider.id)) pendingSelectedIds.delete(provider.id);
        else pendingSelectedIds.add(provider.id);
        setState();
        updateBrowserSaveBtn();
      });
      return btn;
    }

    function cleanSelectedServicesForRegion() {
      if (currentProviders && currentProviders.length > 0) {
        const availableNorms = new Set(currentProviders.map(p => cleanNormalize(p.name)));
        const availableIds = new Set(currentProviders.map(p => Number(p.id)));

        const normToNewId = new Map();
        currentProviders.forEach(p => {
          const norm = cleanNormalize(p.name);
          if (!normToNewId.has(norm)) {
            normToNewId.set(norm, Number(p.id));
          }
        });

        const newSelectedIds = new Set();

        selectedServiceIds.forEach(id => {
          const numId = Number(id);
          let oldProvider = (cachedSelectedProviders || []).find(p => Number(p.id) === numId) || (currentProviders || []).find(p => Number(p.id) === numId);
          let norm = oldProvider ? cleanNormalize(oldProvider.name) : null;

          if (!norm) {
            if (numId === 9 || numId === 119 || numId === 10 || numId === 619) norm = 'primevideo';
            else if (numId === 1899 || numId === 384) norm = 'max';
            else if (numId === 350 || numId === 2) norm = 'appletv';
            else if (numId === 8) norm = 'netflix';
            else if (numId === 337) norm = 'disneyplus';
          }

          if (norm && availableNorms.has(norm)) {
            const newId = normToNewId.get(norm) || numId;
            newSelectedIds.add(Number(newId));
          } else if (availableIds.has(numId)) {
            newSelectedIds.add(numId);
          }
        });

        selectedServiceIds = newSelectedIds;
        try { localStorage.setItem('ps_services', JSON.stringify([...selectedServiceIds])); } catch (e) { console.warn('[Service IDs Storage Save]', e); }
      }
    }

    function saveSelectedProviderData() {
      const providerData = currentProviders.filter(p => selectedServiceIds.has(p.id));
      if (providerData.length > 0) {
        cachedSelectedProviders = providerData;
        try { localStorage.setItem('ps_selected_providers', JSON.stringify(providerData)); } catch (e) { console.warn('[Selected Providers Storage Save]', e); }
      }
    }

    const STATIC_CANONICAL_PROVIDERS = [
      { id: 8, name: 'Netflix', priority: 0 },
      { id: 337, name: 'Disney Plus', priority: 1 },
      { id: 119, name: 'Prime Video', priority: 2 },
      { id: 9, name: 'Amazon Prime Video', priority: 2 },
      { id: 1899, name: 'Max', priority: 3 },
      { id: 384, name: 'HBO Max', priority: 3 },
      { id: 350, name: 'Apple TV Plus', priority: 4 },
      { id: 2, name: 'Apple TV', priority: 4 },
      { id: 76, name: 'Viaplay', priority: 10 },
      { id: 385, name: 'SVT Play', priority: 11 },
      { id: 436, name: 'TV4 Play', priority: 12 },
      { id: 1773, name: 'SkyShowtime', priority: 13 },
      { id: 497, name: 'Tele2 Play', priority: 14 }
    ].map(p => {
      const cleanName = getCanonicalDisplayName(p.name);
      return {
        ...p,
        name: cleanName,
        logoPath: localIconFor(cleanName) || logoDevIcon(cleanNormalize(cleanName) + '.com')
      };
    });

    // The selected services, in priority order, from whatever provider data is loaded so far
    // (this region's list, the cached selection, or the built-in canonical list).
    function getSelectedProviderList() {
      if (selectedServiceIds.size === 0) return [];
      const source = currentProviders.length > 0
        ? currentProviders
        : (cachedSelectedProviders.length > 0 ? cachedSelectedProviders : STATIC_CANONICAL_PROVIDERS);
      let selected = source.filter(p => selectedServiceIds.has(p.id)).sort((a, b) => (a.priority || 100) - (b.priority || 100));
      if (selected.length === 0) selected = STATIC_CANONICAL_PROVIDERS.filter(p => selectedServiceIds.has(p.id));
      return selected;
    }

    function describeServices(list) {
      if (list.length === 0) return 'No services chosen';
      const names = list.map(p => p.name);
      return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    }

    // The "Streaming on" pill: a logo stack (or a name when there's just one).
    function renderSelectedView() {
      const summary = document.getElementById('serviceSummary');
      const pill = document.getElementById('servicePill');
      if (!summary) return;
      const selected = getSelectedProviderList();
      if (selected.length === 0) {
        summary.innerHTML = '<span class="svc-summary-empty">Choose services</span>';
      } else if (selected.length === 1) {
        summary.innerHTML = `${serviceStackHTML(selected)}<span class="svc-summary-name">${escapeHTML(selected[0].name)}</span>`;
      } else {
        summary.innerHTML = serviceStackHTML(selected);
      }
      if (pill) pill.setAttribute('aria-label', `Streaming services: ${describeServices(selected)}. Change`);
      toggleClearSyncBtn();
    }

    function renderBrowserGrid() {
      const grid = document.getElementById('serviceAllGrid');
      if (!grid) return;
      grid.innerHTML = '';

      let list = [...currentProviders].sort((a, b) => {
        const aSel = pendingSelectedIds.has(a.id) ? 0 : 1;
        const bSel = pendingSelectedIds.has(b.id) ? 0 : 1;
        if (aSel !== bSel) return aSel - bSel;
        return (a.priority || 100) - (b.priority || 100);
      });

      list.forEach(provider => {
        grid.appendChild(createBrowserTile(provider));
      });
    }

    // The footer counts what's picked so far; "Done" saves, and a scan needs at least one.
    function updateBrowserSaveBtn() {
      const n = pendingSelectedIds.size;
      const count = document.getElementById('serviceBrowserCount');
      if (count) count.textContent = n === 0 ? 'None picked yet' : `${n} picked`;
      const saveBtn = document.getElementById('serviceBrowserSave');
      if (saveBtn) saveBtn.disabled = n === 0;
    }

    // Desktop: a popover under the bar, growing out of the "Streaming on" pill.
    // Phones: a bottom sheet (16-motion.js adds the slide and the drag-to-close).
    function placeServiceBrowser() {
      const browser = document.getElementById('serviceBrowser');
      const pill = document.getElementById('servicePill');
      const bar = document.querySelector('.ask-bar');
      if (browser) { browser.style.top = ''; browser.style.left = ''; browser.style.maxHeight = ''; browser.style.transformOrigin = ''; }
      if (!browser || !pill || !bar || window.matchMedia('(max-width: 719px)').matches) { updateServiceGridFade(); return; }
      const ask = bar.parentElement.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      const p = pill.getBoundingClientRect();
      const width = browser.offsetWidth;
      // Centred under the pill, kept inside the bar's span and the window.
      let left = p.left + p.width / 2 - width / 2;
      left = Math.min(left, b.right - width, window.innerWidth - 16 - width);
      left = Math.max(left, b.left, 16);
      // Below the bar when it fits, above when there's more room there; else below, scrolling inside.
      const gap = 10, margin = 16;
      const below = window.innerHeight - b.bottom - gap - margin;
      const above = b.top - gap - margin - 72; // keep clear of the top bar
      const height = browser.offsetHeight;
      const up = height > below && above > below;
      const room = up ? above : below;
      if (height > room) browser.style.maxHeight = `${Math.max(260, Math.floor(room))}px`;
      const h = Math.min(height, Math.max(260, room));
      browser.style.left = `${Math.round(left - ask.left)}px`;
      browser.style.top = `${Math.round((up ? b.top - gap - h : b.bottom + gap) - ask.top)}px`;
      browser.style.transformOrigin = `${Math.round(p.left + p.width / 2 - left)}px ${up ? '100%' : '0'}`;
      updateServiceGridFade();
    }

    function updateServiceGridFade() {
      const grid = document.getElementById('serviceAllGrid');
      if (grid) grid.classList.toggle('more-below', grid.scrollTop + grid.clientHeight < grid.scrollHeight - 4);
    }
    document.getElementById('serviceAllGrid')?.addEventListener('scroll', updateServiceGridFade, { passive: true });

    function openBrowser() {
      if (isScanning) return;
      pendingSelectedIds = new Set(selectedServiceIds);
      const browser = document.getElementById('serviceBrowser');
      const backdrop = document.getElementById('serviceBackdrop');
      const region = document.getElementById('serviceBrowserRegion');
      if (region) region.textContent = REGION_META[currentRegion]?.name || currentRegion;
      renderBrowserGrid();
      updateBrowserSaveBtn();
      if (backdrop) backdrop.classList.remove('hidden');
      if (browser) browser.classList.remove('hidden');
      placeServiceBrowser();
      document.getElementById('servicePill')?.setAttribute('aria-expanded', 'true');
      document.body.classList.add('svc-picker-open');
      (browser?.querySelector('.svc-option') || browser)?.focus({ preventScroll: true });
    }

    function closeBrowser() {
      const browser = document.getElementById('serviceBrowser');
      const backdrop = document.getElementById('serviceBackdrop');
      const wasOpen = browser && !browser.classList.contains('hidden');
      if (browser) browser.classList.add('hidden');
      if (backdrop) backdrop.classList.add('hidden');
      document.body.classList.remove('svc-picker-open');
      const pill = document.getElementById('servicePill');
      if (pill) { pill.setAttribute('aria-expanded', 'false'); if (wasOpen && document.activeElement && browser.contains(document.activeElement)) pill.focus({ preventScroll: true }); }
      renderSelectedView();
    }

    function saveBrowser() {
      selectedServiceIds = new Set(pendingSelectedIds);
      localStorage.setItem('ps_services', JSON.stringify([...selectedServiceIds]));
      saveSelectedProviderData();
      closeBrowser();
      if (selectedServiceIds.size > 0 && el.formError && /streaming service/.test(el.formError.textContent)) el.formError.classList.add('hidden');
      if (scannedMovies.length > 0) applyFiltersAndRender();
    }

    // Wired through arrow functions so 16-motion.js can wrap open/close with its animations.
    document.getElementById('servicePill')?.addEventListener('click', () => {
      const browser = document.getElementById('serviceBrowser');
      if (browser && !browser.classList.contains('hidden')) closeBrowser(); else openBrowser();
    });
    document.getElementById('serviceBackdrop')?.addEventListener('click', () => closeBrowser());
    document.getElementById('serviceBrowserCancel')?.addEventListener('click', () => closeBrowser());
    document.getElementById('serviceBrowserSave')?.addEventListener('click', () => saveBrowser());
    document.addEventListener('keydown', (e) => {
      const browser = document.getElementById('serviceBrowser');
      if (e.key === 'Escape' && browser && !browser.classList.contains('hidden')) { e.stopPropagation(); closeBrowser(); }
    });
    window.addEventListener('resize', () => {
      const browser = document.getElementById('serviceBrowser');
      if (browser && !browser.classList.contains('hidden')) placeServiceBrowser();
    });

    // ----- END INLINE SERVICE SELECTOR LOGIC -----

    async function loadAndRenderProviders() {
      renderSelectedView();
      try {
        currentProviders = await fetchProvidersForRegion(currentRegion);
      } catch (e) {
        currentProviders = [];
      }
      if (currentProviders.length === 0) {
        try {
          localStorage.removeItem(TMDB_PROVIDER_CACHE_KEY(currentRegion));
          const url = `https://api.themoviedb.org/3/watch/providers/movie?api_key=${TMDB_API_KEY}&watch_region=${currentRegion}`;
          const res = await tmdbFetch(url);
          const data = await res.json();
          const rawList = data.results || [];
          const fallbackProviders = rawList.map(p => {
            const cleanName = p.provider_name.replace(/^Amazon\s+/i, '');
            const normCleanName = cleanNormalize(cleanName);

            if (!NORMALIZED_WHITELIST.includes(normCleanName)) return null;

            const domain = KNOWN_DOMAINS[normCleanName] || `${normCleanName}.com`;
            const local = LOCAL_ICON_OVERRIDES[normCleanName] || null;
            const logoPath = local || logoDevIcon(domain);

            return { id: p.provider_id, name: cleanName, logoPath, priority: 100 };
          }).filter(Boolean);
          if (fallbackProviders.length > 0) {
            currentProviders = fallbackProviders;
          }
        } catch (e) { console.warn('[Fallback Providers Fetch]', e); }
      }
      cleanSelectedServicesForRegion();
      saveSelectedProviderData();
      renderSelectedView();
    }
    loadAndRenderProviders();

