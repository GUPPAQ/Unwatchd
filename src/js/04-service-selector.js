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

    // Fix: Rolled back to the original layout structure to prevent blurry CSS rendering and restore .png images
    function createSelectedTile(provider) {
      const btn = document.createElement('button');
      btn.title = provider.name + ' - click to remove';
      btn.className = 'service-btn service-tile selected shadow-md outline-none group';
      const img = createTileImgHTML(provider);
      const hoverOverlay = `<div class="hover-action-overlay"><svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg></div>`;
      btn.innerHTML = `<div class="logo-wrapper">${img}${hoverOverlay}</div>`;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isScanning) return;
        selectedServiceIds.delete(provider.id);
        localStorage.setItem('ps_services', JSON.stringify([...selectedServiceIds]));
        saveSelectedProviderData();
        toggleClearSyncBtn();
        btn.remove();
        if (selectedServiceIds.size === 0) renderSelectedView();
        if (scannedMovies.length > 0) applyFiltersAndRender();
      });
      return btn;
    }

    // Fix: Rolled back to original flat structure to guarantee clean resolution scaling
    function createBrowserTile(provider) {
      const isSelected = pendingSelectedIds.has(provider.id);
      const btn = document.createElement('button');
      btn.title = provider.name;
      btn.className = 'service-btn service-tile shadow-md outline-none group' + (isSelected ? ' selected' : ' service-unselected-fade');
      const img = createTileImgHTML(provider);
      const iconSvg = isSelected
        ? `<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>`
        : `<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path>`;
      const hoverOverlay = `<div class="hover-action-overlay"><svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">${iconSvg}</svg></div>`;
      btn.innerHTML = `<div class="logo-wrapper">${img}${hoverOverlay}</div>`;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nowSelected = !pendingSelectedIds.has(provider.id);
        if (nowSelected) {
          pendingSelectedIds.add(provider.id);
          btn.classList.add('selected');
        } else {
          pendingSelectedIds.delete(provider.id);
          btn.classList.remove('selected');
        }
        const svgPath = btn.querySelector('.hover-action-overlay svg path');
        if (svgPath) {
          svgPath.setAttribute('d', nowSelected ? 'M6 18L18 6M6 6l12 12' : 'M12 4v16m8-8H4');
        }
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

    function renderSelectedView() {
      const emptyState = document.getElementById('serviceEmptyState');
      const selectedContainer = document.getElementById('serviceSelectedContainer');
      const selectedGrid = document.getElementById('serviceSelectedGrid');
      const browser = document.getElementById('serviceBrowser');

      if (!selectedGrid || !emptyState || !selectedContainer) return;

      if (browser && !browser.classList.contains('hidden')) {
        emptyState.classList.add('hidden');
        selectedContainer.classList.add('hidden');
        return;
      }

      const hasSelected = selectedServiceIds.size > 0;

      if (hasSelected) {
        // Use currentProviders if loaded, otherwise fall back to cached or static canonical provider data
        const sourceProviders = currentProviders.length > 0
          ? currentProviders
          : (cachedSelectedProviders.length > 0 ? cachedSelectedProviders : STATIC_CANONICAL_PROVIDERS);

        let selected = sourceProviders.filter(p => selectedServiceIds.has(p.id)).sort((a, b) => (a.priority || 100) - (b.priority || 100));

        if (selected.length === 0) {
          selected = STATIC_CANONICAL_PROVIDERS.filter(p => selectedServiceIds.has(p.id));
        }

        if (selected.length === 0) {
          emptyState.classList.remove('hidden');
          selectedContainer.classList.add('hidden');
        } else {
          emptyState.classList.add('hidden');
          selectedContainer.classList.remove('hidden');
          selectedGrid.innerHTML = '';

          selected.forEach(provider => {
            selectedGrid.appendChild(createSelectedTile(provider));
          });

          // Append Add button at the end
          const addBtn = document.createElement('button');
          addBtn.className = 'service-btn service-tile outline-none group border-2 border-dashed border-white/20 hover:border-blue-500/50 rounded-[22.5%] transition-all flex items-center justify-center bg-white/5 hover:bg-blue-500/10';
          addBtn.title = 'Add more services';
          addBtn.innerHTML = `<svg class="w-8 h-8 text-gray-400 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg>`;
          addBtn.addEventListener('click', () => { if (!isScanning) openBrowser(); });
          selectedGrid.appendChild(addBtn);
        }

      } else {
        emptyState.classList.remove('hidden');
        selectedContainer.classList.add('hidden');
      }
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

    function updateBrowserSaveBtn() {
      const saveBtn = document.getElementById('serviceBrowserSave');
      if (saveBtn) {
        saveBtn.textContent = 'Save';
      }
    }

    function openBrowser() {
      pendingSelectedIds = new Set(selectedServiceIds);
      const emptyState = document.getElementById('serviceEmptyState');
      const selectedContainer = document.getElementById('serviceSelectedContainer');
      const browser = document.getElementById('serviceBrowser');

      if (emptyState) emptyState.classList.add('hidden');
      if (selectedContainer) selectedContainer.classList.add('hidden');

      if (browser) {
        browser.classList.remove('hidden');
      }

      renderBrowserGrid();
      updateBrowserSaveBtn();
    }

    function closeBrowser() {
      const browser = document.getElementById('serviceBrowser');
      if (browser) browser.classList.add('hidden');
      renderSelectedView();
    }

    function saveBrowser() {
      selectedServiceIds = new Set(pendingSelectedIds);
      localStorage.setItem('ps_services', JSON.stringify([...selectedServiceIds]));
      saveSelectedProviderData();
      closeBrowser();
      if (scannedMovies.length > 0) applyFiltersAndRender();
    }

    document.getElementById('serviceEmptyBtn')?.addEventListener('click', openBrowser);
    document.getElementById('serviceBrowserCancel')?.addEventListener('click', closeBrowser);
    document.getElementById('serviceBrowserSave')?.addEventListener('click', saveBrowser);

    const sbs = document.getElementById('serviceBrowserSearch');
    const sbc = document.getElementById('serviceBrowserClear');
    if (sbs && sbc) {
      sbs.addEventListener('input', () => {
        sbc.classList.toggle('hidden', sbs.value.trim().length === 0);
        renderBrowserGrid();
      });
      sbc.addEventListener('click', () => {
        sbs.value = '';
        sbc.classList.add('hidden');
        renderBrowserGrid();
        sbs.focus();
      });
    }

    // ----- END INLINE SERVICE SELECTOR LOGIC -----

    async function loadAndRenderProviders() {
      renderSelectedView();
      if (el.serviceSelectedGrid && currentProviders.length === 0 && selectedServiceIds.size === 0) {
        el.serviceSelectedGrid.innerHTML = `<div class="col-span-full py-6 flex flex-col items-center justify-center gap-2.5 text-center"><div class="w-7 h-7 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div><span class="text-blue-400 text-xs font-bold uppercase tracking-widest animate-pulse">Loading services...</span></div>`;
      }
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

