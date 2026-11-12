    // -------------------------------------------------------------
    // Bespoke Glassmorphism Custom Filter Engine (Home & Actor)
    // -------------------------------------------------------------
    const GENRE_ICON_MAP = {
      'Action': '💥', 'Adventure': '🗺️', 'Animation': '🎨', 'Comedy': '😂', 'Crime': '🕵️',
      'Documentary': '📹', 'Drama': '🎭', 'Family': '👨‍👩‍👧‍👦', 'Fantasy': '🧙', 'History': '📜',
      'Horror': '👻', 'Music': '🎵', 'Mystery': '🔍', 'Romance': '❤️', 'Science Fiction': '🚀',
      'TV Movie': '📺', 'Thriller': '😱', 'War': '⚔️', 'Western': '🤠'
    };

    const DECADE_ICON_MAP = {
      'all': '📅', '2020': '✨', '2010': '📼', '2000': '💿', '1990': '🕹️',
      '1980': '📻', '1970': '🎞️', '1960': '📽️', '1950': '🎙️', 'older': '🕰️',
      '2020s': '✨', '2010s': '📼', '2000s': '💿', '1990s': '🕹️', '1980s': '📻',
      '1970s': '🎞️', '1960s': '📽️', '1950s': '🎙️'
    };

    const SORT_ICON_MAP = {
      'year_desc': '⏳', 'year_asc': '🕰️', 'popularity': '🔥',
      'rating_desc': '⭐', 'az': '🔤', 'za': '🔤'
    };

    // Home Filter State
    let homeFilterSort = 'year_desc';
    let homeFilterProviders = new Set(['all']);
    let homeFilterGenres = new Set(['all']);
    let homeFilterDecades = new Set(['all']);
    let homeFilterRating = 'all';
    let homeFilterRuntime = 'all';
    window.homeFilterRating = 'all';
    window.homeFilterRuntime = 'all';

    function getProviderLogoUrl(name) {
      if (!name) return null;
      const safe = name.replace("with Ads", "").trim();
      const meta = currentProviders.find(cp => cp.name.toLowerCase() === safe.toLowerCase());
      if (meta && meta.logoPath) return meta.logoPath;
      const local = (typeof localIconFor === 'function') ? localIconFor(safe) : null;
      if (local) return local;
      const domain = (typeof domainFor === 'function') ? domainFor(safe) : null;
      return (typeof logoDevIcon === 'function') ? logoDevIcon(domain || `${cleanNormalize(safe)}.com`) : null;
    }

    function closeAllCustomFilterPopovers() {
      document.querySelectorAll('.custom-filter-popover').forEach(p => p.classList.add('hidden'));
      document.querySelectorAll('.custom-filter-trigger').forEach(t => {
        t.classList.remove('is-open');
        t.setAttribute('aria-expanded', 'false');
      });
      document.querySelectorAll('.custom-filter-dropdown-container').forEach(c => {
        c.classList.remove('is-active-container');
      });
    }

    function toggleCustomFilterMenu(btn, popoverId) {
      const popover = document.getElementById(popoverId);
      if (!popover) return;
      const isClosed = popover.classList.contains('hidden');
      closeAllCustomFilterPopovers();
      if (isClosed) {
        popover.classList.remove('hidden');
        btn.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
        const container = btn.closest('.custom-filter-dropdown-container');
        if (container) container.classList.add('is-active-container');
      }
    }

    function onCustomFilterSelect(scope, type, val, e) {
      if (e) e.stopPropagation();

      if (scope === 'home') {
        if (type === 'sort') {
          homeFilterSort = val;
          closeAllCustomFilterPopovers();
        } else if (type === 'rating') {
          homeFilterRating = val;
          window.homeFilterRating = val;
          closeAllCustomFilterPopovers();
          if (val !== 'all') syncWatchlistImdbRatings(scannedMovies);
        } else if (type === 'runtime') {
          homeFilterRuntime = val;
          window.homeFilterRuntime = val;
          closeAllCustomFilterPopovers();
          if (val !== 'all') ensureRuntimesFetched();
        } else if (type === 'provider') {
          if (val === 'all') {
            homeFilterProviders = new Set(['all']);
          } else {
            homeFilterProviders.delete('all');
            if (homeFilterProviders.has(val)) {
              homeFilterProviders.delete(val);
            } else {
              homeFilterProviders.add(val);
            }
            if (homeFilterProviders.size === 0) {
              homeFilterProviders = new Set(['all']);
            }
          }
        } else if (type === 'genre') {
          if (val === 'all') {
            homeFilterGenres = new Set(['all']);
          } else {
            homeFilterGenres.delete('all');
            if (homeFilterGenres.has(val)) {
              homeFilterGenres.delete(val);
            } else {
              homeFilterGenres.add(val);
            }
            if (homeFilterGenres.size === 0) {
              homeFilterGenres = new Set(['all']);
            }
          }
        } else if (type === 'decade') {
          if (val === 'all') {
            homeFilterDecades = new Set(['all']);
          } else {
            homeFilterDecades.delete('all');
            if (homeFilterDecades.has(val)) {
              homeFilterDecades.delete(val);
            } else {
              homeFilterDecades.add(val);
            }
            if (homeFilterDecades.size === 0) {
              homeFilterDecades = new Set(['all']);
            }
          }
        }
        currentPage = 1;
        renderAllCustomFilters('home');
        applyFiltersAndRender();
        syncHomeFilterButtonState();
      } else if (scope === 'actor') {
        if (type === 'sort') {
          actorFilterSort = val;
          closeAllCustomFilterPopovers();
        } else if (type === 'rating') {
          actorFilterRating = val;
          window.actorFilterRating = val;
          closeAllCustomFilterPopovers();
          if (val !== 'all') {
            const actorId = window.currentActorPageId || modalActiveActorId || currentActorId;
            const person = (actorId ? actorDetailsCache.get(actorId) : null) || window.currentActorPersonObj;
            if (person) {
              const { allMovies } = getActorMoviesList(person, false, currentActorRoleHint || modalActiveActorRoleHint);
              ensureActorRatingsFetched(allMovies);
            }
          }
        } else if (type === 'runtime') {
          actorFilterRuntime = val;
          window.actorFilterRuntime = val;
          closeAllCustomFilterPopovers();
          if (val !== 'all') {
            const actorId = window.currentActorPageId || modalActiveActorId || currentActorId;
            const person = (actorId ? actorDetailsCache.get(actorId) : null) || window.currentActorPersonObj;
            if (person) ensureActorRuntimesFetched(person);
          }
        } else if (type === 'provider') {
          if (val === 'all') {
            actorFilterProviders = new Set(['all']);
          } else {
            actorFilterProviders.delete('all');
            if (actorFilterProviders.has(val)) {
              actorFilterProviders.delete(val);
            } else {
              actorFilterProviders.add(val);
            }
            if (actorFilterProviders.size === 0) {
              actorFilterProviders = new Set(['all']);
            }
          }
          if (val !== 'all') {
            const actorId = window.currentActorPageId || modalActiveActorId || currentActorId;
            const person = (actorId ? actorDetailsCache.get(actorId) : null) || window.currentActorPersonObj;
            if (person) ensureActorProvidersFetched(person);
          }
        } else if (type === 'genre') {
          if (val === 'all') {
            actorFilterGenres = new Set(['all']);
          } else {
            actorFilterGenres.delete('all');
            if (actorFilterGenres.has(val)) {
              actorFilterGenres.delete(val);
            } else {
              actorFilterGenres.add(val);
            }
            if (actorFilterGenres.size === 0) {
              actorFilterGenres = new Set(['all']);
            }
          }
        } else if (type === 'decade') {
          if (val === 'all') {
            actorFilterDecades = new Set(['all']);
          } else {
            actorFilterDecades.delete('all');
            if (actorFilterDecades.has(val)) {
              actorFilterDecades.delete(val);
            } else {
              actorFilterDecades.add(val);
            }
            if (actorFilterDecades.size === 0) {
              actorFilterDecades = new Set(['all']);
            }
          }
        }
        actorCurrentPage = 1;
        renderAllCustomFilters('actor');
        refreshActorFilmographyGrid();
        syncActorFilterButtonState();
      }
    }

    function onCustomFilterBulk(scope, type, action, e) {
      if (e) e.stopPropagation();
      if (action === 'clear') {
        if (scope === 'home') {
          if (type === 'provider') homeFilterProviders = new Set(['all']);
          if (type === 'genre') homeFilterGenres = new Set(['all']);
          if (type === 'decade') homeFilterDecades = new Set(['all']);
          renderAllCustomFilters('home');
          applyFiltersAndRender();
          syncHomeFilterButtonState();
        } else {
          if (type === 'provider') actorFilterProviders = new Set(['all']);
          if (type === 'genre') actorFilterGenres = new Set(['all']);
          if (type === 'decade') actorFilterDecades = new Set(['all']);
          renderAllCustomFilters('actor');
          refreshActorFilmographyGrid();
          syncActorFilterButtonState();
        }
      }
    }

    function renderCustomFilterSlotHtml(scope, type) {
      const isHome = scope === 'home';
      const popoverId = `${scope}FilterPopover-${type}`;

      if (type === 'sort') {
        const cur = isHome ? homeFilterSort : actorFilterSort;
        const defaultSort = isHome ? 'year_desc' : 'popularity';
        const options = [
          { value: 'year_desc', label: 'Newest First', icon: '⏳' },
          { value: 'year_asc', label: 'Oldest First', icon: '🕰️' },
          { value: 'popularity', label: 'Popular', icon: '🔥' },
          { value: 'rating_desc', label: 'Highest Rated', icon: '⭐' },
          { value: 'az', label: 'A-Z', icon: '🔤' },
          { value: 'za', label: 'Z-A', icon: '🔤' }
        ];
        const selected = options.find(o => o.value === cur) || options.find(o => o.value === defaultSort) || options[0];
        const isCustom = cur !== defaultSort;

        return `
          <label class="block text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 whitespace-nowrap truncate">Sort By</label>
          <div class="relative">
            <button type="button" onclick="toggleCustomFilterMenu(this, '${popoverId}')" class="custom-filter-trigger ${isCustom ? 'active-custom' : ''}">
              <div class="flex items-center gap-2 truncate min-w-0">
                <span class="text-sm shrink-0">${selected.icon}</span>
                <span class="truncate">${escapeHTML(selected.label)}</span>
              </div>
              <svg class="custom-filter-chevron w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            <div id="${popoverId}" class="custom-filter-popover hidden space-y-1">
              ${options.map(opt => `
                <button type="button" onclick="onCustomFilterSelect('${scope}', 'sort', '${opt.value}', event)" class="custom-filter-item ${cur === opt.value ? 'selected' : ''}">
                  <div class="flex items-center gap-2.5 truncate min-w-0">
                    <span class="text-sm shrink-0">${opt.icon}</span>
                    <span class="truncate">${escapeHTML(opt.label)}</span>
                  </div>
                  <div class="custom-filter-radio">
                    ${cur === opt.value ? '<div class="custom-filter-radio-dot"></div>' : ''}
                  </div>
                </button>
              `).join('')}
            </div>
          </div>
        `;
      }

      if (type === 'provider') {
        const curSet = isHome ? homeFilterProviders : actorFilterProviders;
        const isAll = curSet.has('all') || curSet.size === 0;
        const isCustom = !isAll;

        const provList = [];
        provList.push({ id: 'all', name: isHome ? 'All My Services' : 'All Services', icon: '🍿' });
        if (vpnModeEnabled) {
          provList.push({ id: 'vpn', name: 'VPN Available 🌐', icon: '🌐' });
        }

        const mySubscribed = currentProviders.filter(cp => selectedServiceIds.has(cp.id));
        const otherAvail = currentProviders.filter(cp => !selectedServiceIds.has(cp.id));

        if (isHome) {
          if (mySubscribed.length > 0) {
            mySubscribed.forEach(cp => provList.push({ id: cp.name, name: cp.name, logo: getProviderLogoUrl(cp.name) }));
          } else {
            currentProviders.forEach(cp => provList.push({ id: cp.name, name: cp.name, logo: getProviderLogoUrl(cp.name) }));
          }
        } else {
          mySubscribed.forEach(cp => provList.push({ id: cp.name, name: cp.name, logo: getProviderLogoUrl(cp.name) }));
          otherAvail.forEach(cp => provList.push({ id: cp.name, name: cp.name, logo: getProviderLogoUrl(cp.name) }));
        }

        let previewText = isHome ? 'All My Services' : 'All Services';
        if (!isAll) {
          const arr = Array.from(curSet).map(id => id === 'vpn' ? 'VPN Available' : id);
          if (arr.length === 1) previewText = arr[0];
          else if (arr.length === 2) previewText = arr.join(', ');
          else previewText = `${arr.length} Services`;
        }

        return `
          <label class="block text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 whitespace-nowrap truncate">Streaming Platform</label>
          <div class="relative">
            <button type="button" onclick="toggleCustomFilterMenu(this, '${popoverId}')" class="custom-filter-trigger ${isCustom ? 'active-custom' : ''}">
              <div class="flex items-center gap-2 truncate min-w-0">
                <span class="text-sm shrink-0">🍿</span>
                <span class="truncate">${escapeHTML(previewText)}</span>
              </div>
              <svg class="custom-filter-chevron w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            <div id="${popoverId}" class="custom-filter-popover hidden space-y-1">
              <div class="flex items-center justify-between px-2 py-1.5 border-b border-white/10 mb-1 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                <span>Streaming Services</span>
                <button type="button" onclick="onCustomFilterBulk('${scope}', 'provider', 'clear', event)" class="text-blue-400 hover:text-blue-300 font-bold">Reset</button>
              </div>
              ${provList.map(p => {
          const isSelected = p.id === 'all' ? isAll : curSet.has(p.id);
          const logoHtml = p.logo
            ? `<img src="${p.logo}" alt="${escapeHTML(p.name)}" class="w-5 h-5 rounded-md object-contain shrink-0 bg-black/40 p-0.5 border border-white/10" onerror="this.outerHTML='<span class=\\'text-sm shrink-0\\'>📺</span>'" />`
            : `<span class="text-sm shrink-0">${p.icon || '📺'}</span>`;
          return `
                  <button type="button" onclick="onCustomFilterSelect('${scope}', 'provider', '${escapeHTML(p.id)}', event)" class="custom-filter-item ${isSelected ? 'selected' : ''}">
                    <div class="flex items-center gap-2.5 truncate min-w-0">
                      ${logoHtml}
                      <span class="truncate">${escapeHTML(p.name)}</span>
                    </div>
                    <div class="custom-filter-checkbox">
                      ${isSelected ? '<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>' : ''}
                    </div>
                  </button>
                `;
        }).join('')}
            </div>
          </div>
        `;
      }

      if (type === 'genre') {
        const curSet = isHome ? homeFilterGenres : actorFilterGenres;
        const isAll = curSet.has('all') || curSet.size === 0;
        const isCustom = !isAll;

        let genreNames = [];
        if (isHome) {
          const s = new Set();
          scannedMovies.forEach(m => {
            if (m.genreIds) m.genreIds.forEach(id => { if (GENRE_MAP[id]) s.add(GENRE_MAP[id]); });
          });
          genreNames = Array.from(s).sort();
          if (genreNames.length === 0) genreNames = Object.values(GENRE_MAP).filter((v, i, a) => a.indexOf(v) === i).sort();
        } else {
          genreNames = (window.currentActorAvailableGenres && window.currentActorAvailableGenres.length > 0) ? window.currentActorAvailableGenres : Object.values(GENRE_MAP).filter((v, i, a) => a.indexOf(v) === i).sort();
        }

        let previewText = 'All Genres';
        if (!isAll) {
          const arr = Array.from(curSet);
          if (arr.length === 1) previewText = arr[0];
          else if (arr.length === 2) previewText = arr.join(', ');
          else previewText = `${arr.length} Genres`;
        }

        return `
          <label class="block text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 whitespace-nowrap truncate">Genre</label>
          <div class="relative">
            <button type="button" onclick="toggleCustomFilterMenu(this, '${popoverId}')" class="custom-filter-trigger ${isCustom ? 'active-custom' : ''}">
              <div class="flex items-center gap-2 truncate min-w-0">
                <span class="text-sm shrink-0">🎭</span>
                <span class="truncate">${escapeHTML(previewText)}</span>
              </div>
              <svg class="custom-filter-chevron w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            <div id="${popoverId}" class="custom-filter-popover hidden space-y-1">
              <div class="flex items-center justify-between px-2 py-1.5 border-b border-white/10 mb-1 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                <span>Multi-select Genres</span>
                <button type="button" onclick="onCustomFilterBulk('${scope}', 'genre', 'clear', event)" class="text-blue-400 hover:text-blue-300 font-bold">Reset</button>
              </div>
              <button type="button" onclick="onCustomFilterSelect('${scope}', 'genre', 'all', event)" class="custom-filter-item ${isAll ? 'selected' : ''}">
                <div class="flex items-center gap-2.5 truncate min-w-0">
                  <span class="text-sm shrink-0">🎭</span>
                  <span class="truncate">All Genres</span>
                </div>
                <div class="custom-filter-checkbox">
                  ${isAll ? '<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>' : ''}
                </div>
              </button>
              ${genreNames.map(g => {
          const isSelected = !isAll && curSet.has(g);
          const icon = GENRE_ICON_MAP[g] || '🎬';
          return `
                  <button type="button" onclick="onCustomFilterSelect('${scope}', 'genre', '${escapeHTML(g)}', event)" class="custom-filter-item ${isSelected ? 'selected' : ''}">
                    <div class="flex items-center gap-2.5 truncate min-w-0">
                      <span class="text-sm shrink-0">${icon}</span>
                      <span class="truncate">${escapeHTML(g)}</span>
                    </div>
                    <div class="custom-filter-checkbox">
                      ${isSelected ? '<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>' : ''}
                    </div>
                  </button>
                `;
        }).join('')}
            </div>
          </div>
        `;
      }

      if (type === 'decade') {
        const curSet = isHome ? homeFilterDecades : actorFilterDecades;
        const isAll = curSet.has('all') || curSet.size === 0;
        const isCustom = !isAll;

        const decadeOptions = [
          { value: '2020', label: '2020s', icon: '✨' },
          { value: '2010', label: '2010s', icon: '📼' },
          { value: '2000', label: '2000s', icon: '💿' },
          { value: '1990', label: '1990s', icon: '🕹️' },
          { value: '1980', label: '1980s', icon: '📻' },
          { value: '1970', label: '1970s', icon: '🎞️' },
          { value: '1960', label: '1960s', icon: '📽️' },
          { value: '1950', label: '1950s', icon: '🎙️' },
          { value: 'older', label: 'Older (< 1950)', icon: '🕰️' }
        ];

        let previewText = 'All Decades';
        if (!isAll) {
          const arr = Array.from(curSet).map(d => d === 'older' ? 'Older' : `${d}s`);
          if (arr.length === 1) previewText = arr[0];
          else if (arr.length === 2) previewText = arr.join(', ');
          else previewText = `${arr.length} Decades`;
        }

        return `
          <label class="block text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 whitespace-nowrap truncate">Release Period</label>
          <div class="relative">
            <button type="button" onclick="toggleCustomFilterMenu(this, '${popoverId}')" class="custom-filter-trigger ${isCustom ? 'active-custom' : ''}">
              <div class="flex items-center gap-2 truncate min-w-0">
                <span class="text-sm shrink-0">📅</span>
                <span class="truncate">${escapeHTML(previewText)}</span>
              </div>
              <svg class="custom-filter-chevron w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            <div id="${popoverId}" class="custom-filter-popover hidden space-y-1">
              <div class="flex items-center justify-between px-2 py-1.5 border-b border-white/10 mb-1 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                <span>Multi-select Decades</span>
                <button type="button" onclick="onCustomFilterBulk('${scope}', 'decade', 'clear', event)" class="text-blue-400 hover:text-blue-300 font-bold">Reset</button>
              </div>
              <button type="button" onclick="onCustomFilterSelect('${scope}', 'decade', 'all', event)" class="custom-filter-item ${isAll ? 'selected' : ''}">
                <div class="flex items-center gap-2.5 truncate min-w-0">
                  <span class="text-sm shrink-0">📅</span>
                  <span class="truncate">All Decades</span>
                </div>
                <div class="custom-filter-checkbox">
                  ${isAll ? '<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>' : ''}
                </div>
              </button>
              ${decadeOptions.map(d => {
          const isSelected = !isAll && (curSet.has(d.value) || curSet.has(`${d.value}s`));
          return `
                  <button type="button" onclick="onCustomFilterSelect('${scope}', 'decade', '${d.value}', event)" class="custom-filter-item ${isSelected ? 'selected' : ''}">
                    <div class="flex items-center gap-2.5 truncate min-w-0">
                      <span class="text-sm shrink-0">${d.icon}</span>
                      <span class="truncate">${escapeHTML(d.label)}</span>
                    </div>
                    <div class="custom-filter-checkbox">
                      ${isSelected ? '<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>' : ''}
                    </div>
                  </button>
                `;
        }).join('')}
            </div>
          </div>
        `;
      }

      if (type === 'rating') {
        const cur = isHome ? homeFilterRating : actorFilterRating;
        const isCustom = cur && cur !== 'all';
        const ratingOptions = [
          { value: 'all', label: 'Any Rating', icon: '🌟' },
          { value: '6', label: 'IMDb 6.0+', icon: '⭐' },
          { value: '7', label: 'IMDb 7.0+', icon: '⭐' },
          { value: '8', label: 'IMDb 8.0+', icon: '⭐' },
          { value: '8.5', label: 'IMDb 8.5+', icon: '⭐' },
          { value: '9', label: 'IMDb 9.0+', icon: '🏆' }
        ];
        const selected = ratingOptions.find(r => r.value === cur) || ratingOptions[0];

        return `
          <label class="block text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 whitespace-nowrap truncate">Minimum IMDb Rating</label>
          <div class="relative">
            <button type="button" onclick="toggleCustomFilterMenu(this, '${popoverId}')" class="custom-filter-trigger ${isCustom ? 'active-custom' : ''}">
              <div class="flex items-center gap-2 truncate min-w-0">
                <span class="text-sm shrink-0">${selected.icon}</span>
                <span class="truncate">${escapeHTML(selected.label)}</span>
              </div>
              <svg class="custom-filter-chevron w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            <div id="${popoverId}" class="custom-filter-popover hidden space-y-1">
              ${ratingOptions.map(opt => `
                <button type="button" onclick="onCustomFilterSelect('${scope}', 'rating', '${opt.value}', event)" class="custom-filter-item ${cur === opt.value ? 'selected' : ''}">
                  <div class="flex items-center gap-2.5 truncate min-w-0">
                    <span class="text-sm shrink-0">${opt.icon}</span>
                    <span class="truncate">${escapeHTML(opt.label)}</span>
                  </div>
                  <div class="custom-filter-radio">
                    ${cur === opt.value ? '<div class="custom-filter-radio-dot"></div>' : ''}
                  </div>
                </button>
              `).join('')}
            </div>
          </div>
        `;
      }

      if (type === 'runtime') {
        const cur = isHome ? homeFilterRuntime : actorFilterRuntime;
        const isCustom = cur && cur !== 'all';
        const runtimeOptions = [
          { value: 'all', label: 'Any Length', icon: '⏱️' },
          { value: 'short', label: 'Short (< 90 min)', icon: '⚡' },
          { value: 'medium', label: 'Medium (90 - 120 min)', icon: '⏳' },
          { value: 'long', label: 'Long (> 120 min)', icon: '🎬' }
        ];
        const selected = runtimeOptions.find(r => r.value === cur) || runtimeOptions[0];

        return `
          <label class="block text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 whitespace-nowrap truncate">Film Length</label>
          <div class="relative">
            <button type="button" onclick="toggleCustomFilterMenu(this, '${popoverId}')" class="custom-filter-trigger ${isCustom ? 'active-custom' : ''}">
              <div class="flex items-center gap-2 truncate min-w-0">
                <span class="text-sm shrink-0">${selected.icon}</span>
                <span class="truncate">${escapeHTML(selected.label)}</span>
              </div>
              <svg class="custom-filter-chevron w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            <div id="${popoverId}" class="custom-filter-popover hidden space-y-1">
              ${runtimeOptions.map(opt => `
                <button type="button" onclick="onCustomFilterSelect('${scope}', 'runtime', '${opt.value}', event)" class="custom-filter-item ${cur === opt.value ? 'selected' : ''}">
                  <div class="flex items-center gap-2.5 truncate min-w-0">
                    <span class="text-sm shrink-0">${opt.icon}</span>
                    <span class="truncate">${escapeHTML(opt.label)}</span>
                  </div>
                  <div class="custom-filter-radio">
                    ${cur === opt.value ? '<div class="custom-filter-radio-dot"></div>' : ''}
                  </div>
                </button>
              `).join('')}
            </div>
          </div>
        `;
      }
      return '';
    }

    function renderAllCustomFilters(scope = 'home') {
      const types = ['sort', 'provider', 'genre', 'decade', 'rating', 'runtime'];
      types.forEach(t => {
        const el = document.getElementById(`${scope}FilterSlot-${t}`);
        if (el) {
          el.innerHTML = renderCustomFilterSlotHtml(scope, t);
        }
      });
    }

    // Close custom dropdown popovers on outside click or Escape
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.custom-filter-dropdown-container')) {
        closeAllCustomFilterPopovers();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllCustomFilterPopovers();
      }
    });

    function toggleHomeFilterDropdown(e) {
      if (e) e.stopPropagation();
      try { e?.currentTarget?.blur(); } catch (err) { logIgnored('toggleHomeFilterDropdown', err); }
      try { document.getElementById('homeFilterToggleBtn')?.blur(); } catch (err) { logIgnored('toggleHomeFilterDropdown', err); }
      try { document.activeElement?.blur(); } catch (err) { logIgnored('toggleHomeFilterDropdown', err); }
      const menu = document.getElementById('homeFilterDropdownMenu');
      if (!menu) return;
      const isOpen = !menu.classList.contains('hidden');
      if (isOpen) {
        closeHomeFilterDropdown();
      } else {
        openHomeFilterDropdown();
      }
    }

    function openHomeFilterDropdown() {
      const menu = document.getElementById('homeFilterDropdownMenu');
      const backdrop = document.getElementById('homeFilterBackdrop');
      const btn = document.getElementById('homeFilterToggleBtn');
      if (!menu) return;
      closeActorFilterDropdown();

      renderAllCustomFilters('home');

      if (window.innerWidth < 640) {
        if (backdrop && backdrop.parentElement !== document.body) document.body.appendChild(backdrop);
        if (menu.parentElement !== document.body) document.body.appendChild(menu);
        if (backdrop) backdrop.classList.remove('hidden');
        document.body.classList.add('modal-open');
      } else {
        const card = document.getElementById('resultsControlsCard') || document.getElementById('homeControlsBarRow');
        if (card) {
          card.classList.add('filter-open');
          if (backdrop && backdrop.parentElement !== card) card.appendChild(backdrop);
          if (menu.parentElement !== card) card.appendChild(menu);
        }
      }
      menu.classList.remove('hidden');
      syncHomeFilterButtonState();
      try { btn?.blur(); } catch (err) { logIgnored('openHomeFilterDropdown', err); }
    }

    function closeHomeFilterDropdown() {
      closeAllCustomFilterPopovers();
      const menu = document.getElementById('homeFilterDropdownMenu');
      const backdrop = document.getElementById('homeFilterBackdrop');
      if (menu) menu.classList.add('hidden');
      if (backdrop) backdrop.classList.add('hidden');
      document.body.classList.remove('modal-open');
      const card = document.getElementById('resultsControlsCard') || document.getElementById('homeControlsBarRow');
      if (card) {
        card.classList.remove('filter-open');
        if (backdrop && backdrop.parentElement !== card) card.appendChild(backdrop);
        if (menu && menu.parentElement !== card) card.appendChild(menu);
      }
      try { document.getElementById('homeFilterToggleBtn')?.blur(); } catch (err) { logIgnored('closeHomeFilterDropdown', err); }
      try { document.activeElement?.blur(); } catch (err) { logIgnored('closeHomeFilterDropdown', err); }
      syncHomeFilterButtonState();
    }

    // Aliases
    function toggleHomeFilterSheet(e) { toggleHomeFilterDropdown(e); }
    function openHomeFilterSheet() { openHomeFilterDropdown(); }
    function closeHomeFilterSheet() { closeHomeFilterDropdown(); }

    async function ensureRuntimesFetched() {
      const missing = scannedMovies.filter(m => !m.runtime || m.runtime === 0);
      if (missing.length === 0) return;
      await Promise.all(missing.map(async (m) => {
        try {
          const cached = movieDetailsCache.get(`${m.mediaType || 'movie'}_${m.id}`);
          if (cached && (cached.runtime || cached.episode_run_time)) {
            m.runtime = cached.runtime || (cached.episode_run_time ? cached.episode_run_time[0] : 0) || (cached.last_episode_to_air ? cached.last_episode_to_air.runtime : 0) || 0;
          } else {
            const d = await getFullMovieDetails(m.id, m.mediaType || 'movie');
            if (d) {
              m.runtime = d.runtime || (d.episode_run_time ? d.episode_run_time[0] : 0) || (d.last_episode_to_air ? d.last_episode_to_air.runtime : 0) || 0;
            }
          }
        } catch (e) { logIgnored('ensureRuntimesFetched', e); }
      }));
      if (window.homeFilterRuntime && window.homeFilterRuntime !== 'all') {
        applyFiltersAndRender();
      }
    }

    function setHomeRating(val) {
      homeFilterRating = val;
      window.homeFilterRating = val;
      currentPage = 1;
      renderAllCustomFilters('home');
      applyFiltersAndRender();
      syncHomeFilterButtonState();
      if (val !== 'all') {
        syncWatchlistImdbRatings(scannedMovies);
      }
    }

    function setHomeRuntime(val) {
      homeFilterRuntime = val;
      window.homeFilterRuntime = val;
      currentPage = 1;
      renderAllCustomFilters('home');
      applyFiltersAndRender();
      syncHomeFilterButtonState();
      if (val !== 'all') {
        ensureRuntimesFetched();
      }
    }

    function resetHomeFilters() {
      homeFilterSort = 'year_desc';
      homeFilterProviders = new Set(['all']);
      homeFilterGenres = new Set(['all']);
      homeFilterDecades = new Set(['all']);
      homeFilterRating = 'all';
      homeFilterRuntime = 'all';
      window.homeFilterRating = 'all';
      window.homeFilterRuntime = 'all';
      currentPage = 1;
      renderAllCustomFilters('home');
      applyFiltersAndRender();
      syncHomeFilterButtonState();
    }

    function syncHomeFilterButtonState() {
      const btn = document.getElementById('homeFilterToggleBtn');
      const menu = document.getElementById('homeFilterDropdownMenu');
      const isOpen = menu && !menu.classList.contains('hidden');
      const hasCustom = (homeFilterSort !== 'year_desc') || (!homeFilterProviders.has('all') && homeFilterProviders.size > 0) || (!homeFilterGenres.has('all') && homeFilterGenres.size > 0) || (!homeFilterDecades.has('all') && homeFilterDecades.size > 0) || (window.homeFilterRating && window.homeFilterRating !== 'all') || (window.homeFilterRuntime && window.homeFilterRuntime !== 'all');
      if (btn) {
        btn.classList.toggle('border-blue-500', hasCustom || isOpen);
        btn.classList.toggle('text-blue-400', hasCustom || isOpen);
        btn.classList.toggle('bg-blue-500/10', hasCustom || isOpen);
        btn.classList.toggle('border-white/10', !hasCustom && !isOpen);
        btn.classList.toggle('text-gray-300', !hasCustom && !isOpen);
      }
    }

    if (el.filterSearch) { el.filterSearch.addEventListener('input', (e) => { if (el.clearResultsBtn) el.clearResultsBtn.classList.toggle('hidden', e.target.value.trim().length === 0); currentPage = 1; applyFiltersAndRender(); }); }
    if (el.clearResultsBtn) { el.clearResultsBtn.addEventListener('click', () => { if (el.filterSearch) el.filterSearch.value = ''; if (el.clearResultsBtn) el.clearResultsBtn.classList.add('hidden'); currentPage = 1; applyFiltersAndRender(); if (el.filterSearch) el.filterSearch.focus(); }); }
    function updateSearchPlaceholders() {
      const isMobile = window.innerWidth < 640;
      const ph = isMobile ? 'Search...' : 'Filter by title...';
      if (el.filterSearch) el.filterSearch.placeholder = ph;
      const aSearch = document.getElementById('actorFilmSearch');
      if (aSearch) aSearch.placeholder = ph;
      const qSearch = document.getElementById('quickSearchInput');
      if (qSearch) qSearch.placeholder = isMobile ? 'Search films, shows...' : 'Search films, TV shows, actors, directors...';
    }
    updateSearchPlaceholders();
    window.addEventListener('resize', updateSearchPlaceholders);
    function syncFilterLabel(sel) {
      const labelMap = { resultsSort: 'sortLabel', resultsGenre: 'genreLabel', resultsDecade: 'decadeLabel', resultsRuntime: 'runtimeLabel' };
      const labelId = labelMap[sel.id];
      if (labelId) {
        const label = document.getElementById(labelId);
        if (label) label.textContent = sel.options[sel.selectedIndex]?.text || sel.value;
      }
    }
    [el.filterSort, el.filterGenre, el.filterDecade, el.filterRuntime, el.regionSelect].forEach(sel => {
      if (sel) {
        sel.addEventListener('change', (e) => {
          if (e.target.id === 'resultsRuntime') {
            window.homeFilterRuntime = e.target.value;
          }
          currentPage = 1;
          applyFiltersAndRender();
          syncFilterLabel(e.target);
          syncHomeFilterButtonState();
          try { e.target.blur(); } catch (err) { console.warn('[Select Element Blur]', err); }
        });
      }
    });
    [el.statsBtn, el.rouletteBtn, el.vpnToggleBtnInline].forEach(btn => {
      if (btn) {
        btn.addEventListener('click', (e) => {
          try { e.currentTarget.blur(); } catch (err) { console.warn('[Button Element Blur]', err); }
        });
      }
    });

    function setHomeTab(tabName) {
      if (!tabName) return;
      activeTab = tabName;
      currentPage = 1;
      const tabBtns = document.querySelectorAll('#categoriesBar .tab-btn');
      tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
      renderActiveGrid();
    }
    window.setHomeTab = setHomeTab;

    if (el.tabBtns) {
      el.tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const tab = e.currentTarget.dataset.tab;
          if (tab) setHomeTab(tab);
        });
      });
    }
    toggleClearSyncBtn();
    const urlParams = new URLSearchParams(window.location.search);
    const sharedMovieId = urlParams.get('movie');
    const sharedTvId = urlParams.get('tv');
    const sharedActorId = urlParams.get('actor') || urlParams.get('person');
    if (sharedMovieId && el.quickSearchInput) { tmdbFetch(`https://api.themoviedb.org/3/movie/${sharedMovieId}?api_key=${TMDB_API_KEY}`).then(r => r.json()).then(movie => { if (movie.id) { movie.__mediaType = 'movie'; el.quickSearchInput.value = movie.title; if (el.clearSearchBtn) el.clearSearchBtn.classList.remove('hidden'); renderSingleMovieResult(movie); window.history.replaceState({}, document.title, window.location.pathname); } }).catch((e) => { console.warn('[Shared Movie URL Fetch]', e); }); }
    else if (sharedTvId && el.quickSearchInput) { tmdbFetch(`https://api.themoviedb.org/3/tv/${sharedTvId}?api_key=${TMDB_API_KEY}`).then(r => r.json()).then(show => { if (show.id) { show.__mediaType = 'tv'; el.quickSearchInput.value = show.name; if (el.clearSearchBtn) el.clearSearchBtn.classList.remove('hidden'); renderSingleMovieResult(show); window.history.replaceState({}, document.title, window.location.pathname); } }).catch((e) => { console.warn('[Shared TV URL Fetch]', e); }); }
    else if (sharedActorId) { openActorPage(Number(sharedActorId)); window.history.replaceState({}, document.title, window.location.pathname); }
    const rawRoute = parseRouteInfo();
    if (rawRoute) {
      resolveRouteToId(rawRoute).then(initialRoute => {
        if (!initialRoute || !initialRoute.id) return;
        if (initialRoute.type === 'film') {
          const existing = scannedMovies.find(m => m.id === initialRoute.id && (m.mediaType || 'movie') === (initialRoute.mediaType || 'movie'));
          if (existing) openMoviePage(existing.slug ? existing : { ...existing, slug: initialRoute.slug }, false);
          else openMoviePageById(initialRoute.id, '', initialRoute.mediaType || 'movie', false, initialRoute.slug);
        } else if (initialRoute.type === 'actor') {
          openActorPage(initialRoute.id, '', initialRoute.role || '', false);
        } else if (initialRoute.type === 'cast') {
          const existing = scannedMovies.find(m => m.id === initialRoute.id && (m.mediaType || 'movie') === (initialRoute.mediaType || 'movie'));
          const p = existing
            ? openMoviePage(existing.slug ? existing : { ...existing, slug: initialRoute.slug }, false)
            : openMoviePageById(initialRoute.id, '', initialRoute.mediaType || 'movie', false, initialRoute.slug);
          Promise.resolve(p).then(() => {
            openFullCastModal(true, false);
          });
        }
      });
    }
    const DB_NAME = 'UnwatchdDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'scans';

    function openDB() {
      return new Promise((resolve) => {
        if (!window.indexedDB) return resolve(null);
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
    }

