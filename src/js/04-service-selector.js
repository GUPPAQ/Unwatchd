    // ----- INLINE SERVICE SELECTOR LOGIC -----

    function createTileImgHTML(provider) {
      const initials = escapeHTML(provider.name.slice(0, 2).toUpperCase());
      const tmdb = provider.tmdbLogoPath || '';
      if (!provider.logoPath) {
        return `<div class="w-full h-full flex items-center justify-center bg-gray-800 text-[9px] font-bold text-gray-400 rounded-[22.5%]">${initials}</div>`;
      }
      return `<img src="${provider.logoPath}" alt="${escapeHTML(provider.name)}" loading="lazy" class="bg-gray-800" data-tmdb="${escapeHTML(tmdb)}" onerror="const tm=this.dataset.tmdb; if(tm && this.src!==tm){this.src=tm;} else {this.onerror=null;this.parentElement.innerHTML='<div class=\\'w-full h-full flex items-center justify-center bg-gray-800 text-[9px] font-bold text-gray-400 rounded-[22.5%]\\'>${initials}</div>';}">`;
    }

    // A small stack of overlapping service logos, used on the landing's "Streaming on" pill
    // and in the results' context line. Shows up to `max` logos, then "+N".
    function serviceStackHTML(providers, max = 4) {
      if (!providers.length) return '';
      const shown = providers.slice(0, max);
      const more = providers.length - shown.length;
      return `<span class="svc-stack">${shown.map(p => `<span class="svc-stack-logo">${createTileImgHTML(p)}</span>`).join('')}</span>${more > 0 ? `<span class="svc-stack-more">+${more}</span>` : ''}`;
    }

    // One service in the panel: a chip with its logo and name (the same shape as the service
    // chips over the results). Tapping it applies at once; the bar's logo stack follows.
    var servicesChangedWhileOpen = false;
    function createBrowserTile(provider) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'svc-option';
      const setState = () => {
        const on = selectedServiceIds.has(provider.id);
        btn.classList.toggle('selected', on);
        btn.setAttribute('aria-pressed', String(on));
      };
      btn.innerHTML = `<span class="svc-option-logo">${createTileImgHTML(provider)}</span><span class="svc-option-name">${escapeHTML(provider.name)}</span><svg class="svc-option-check" fill="none" stroke="currentColor" stroke-width="2.6" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"></path></svg>`;
      setState();
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectedServiceIds.has(provider.id)) selectedServiceIds.delete(provider.id);
        else selectedServiceIds.add(provider.id);
        try { localStorage.setItem('ps_services', JSON.stringify([...selectedServiceIds])); } catch (err) { logIgnored('save services', err); }
        saveSelectedProviderData();
        servicesChangedWhileOpen = true;
        setState();
        renderSelectedView();
        updateBrowserSaveBtn();
        if (selectedServiceIds.size > 0 && el.formError && /streaming service/.test(el.formError.textContent)) el.formError.classList.add('hidden');
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
        logoPath: providerIconFor(cleanName, null)
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

      // A stable order (by how common the service is), so nothing jumps while you pick.
      [...currentProviders]
        .sort((a, b) => (a.priority || 100) - (b.priority || 100))
        .forEach(provider => grid.appendChild(createBrowserTile(provider)));
    }

    function updateBrowserSaveBtn() {
      const n = selectedServiceIds.size;
      const count = document.getElementById('serviceBrowserCount');
      if (count) count.textContent = n === 0 ? 'None picked yet' : `${n} picked`;
    }

    // The panel unfolds out of the bar (desktop: hanging under it at full width; phones: inside
    // the card, under the "Streaming on" row). The open/closed height is a CSS transition, so a
    // quick second tap reverses it from wherever it is.
    function isServiceBrowserOpen() {
      const browser = document.getElementById('serviceBrowser');
      return !!(browser && !browser.classList.contains('hidden'));
    }

    function openBrowser(focusFirst) {
      if (isScanning) return;
      const browser = document.getElementById('serviceBrowser');
      const region = document.getElementById('serviceBrowserRegion');
      if (region) region.textContent = REGION_META[currentRegion]?.name || currentRegion;
      servicesChangedWhileOpen = false;
      renderBrowserGrid();
      updateBrowserSaveBtn();
      if (browser) { browser.classList.remove('hidden'); browser.removeAttribute('inert'); }
      document.querySelector('.ask-bar')?.classList.add('is-open');
      document.getElementById('servicePill')?.setAttribute('aria-expanded', 'true');
      if (focusFirst) browser?.querySelector('.svc-option')?.focus({ preventScroll: true });
    }

    function closeBrowser() {
      const browser = document.getElementById('serviceBrowser');
      if (!isServiceBrowserOpen()) return;
      const hadFocus = document.activeElement && browser.contains(document.activeElement);
      browser.classList.add('hidden');
      browser.setAttribute('inert', '');
      document.querySelector('.ask-bar')?.classList.remove('is-open');
      const pill = document.getElementById('servicePill');
      if (pill) { pill.setAttribute('aria-expanded', 'false'); if (hadFocus) pill.focus({ preventScroll: true }); }
      renderSelectedView();
      // Picks apply as you tap; the results (if any) catch up once, when the panel closes.
      if (servicesChangedWhileOpen && scannedMovies.length > 0) applyFiltersAndRender();
      servicesChangedWhileOpen = false;
    }

    // Kept for callers from before picks applied instantly (starting a scan, changing region).
    function saveBrowser() { closeBrowser(); }

    document.getElementById('serviceBrowser')?.setAttribute('inert', '');
    document.getElementById('servicePill')?.addEventListener('click', (e) => {
      if (isServiceBrowserOpen()) closeBrowser(); else openBrowser(e.detail === 0); // keyboard: focus the first service
    });
    document.getElementById('serviceBrowserSave')?.addEventListener('click', () => closeBrowser());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isServiceBrowserOpen()) closeBrowser();
    });
    // A tap anywhere outside the bar folds it away again.
    document.addEventListener('pointerdown', (e) => {
      if (!isServiceBrowserOpen()) return;
      const bar = document.querySelector('.ask-bar');
      if (bar && !bar.contains(e.target)) closeBrowser();
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

            const logoPath = providerIconFor(cleanName, p.logo_path);

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

