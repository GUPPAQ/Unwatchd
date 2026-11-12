    // ---- Generic popup (Insights, full description text, etc.) ----
    let statsBarOriginalParent = null;
    function closeGenericPopup() {
      const overlay = document.getElementById('genericPopupOverlay');
      const content = document.getElementById('genericPopupContent');
      if (!overlay) return;

      // Animate out
      if (content) {
        content.classList.remove('popup-animate-in');
        content.classList.add('popup-animate-out');
      }
      overlay.classList.remove('popup-overlay-in');
      overlay.classList.add('popup-overlay-out');

      setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex', 'popup-overlay-out');
        if (content) content.classList.remove('popup-animate-out');

        const bar = document.getElementById('statsBar');
        if (bar && statsBarOriginalParent) {
          statsBarOriginalParent.appendChild(bar);
          statsBarOriginalParent = null;
          bar.classList.add('hidden');
          bar.classList.remove('grid', 'grid-cols-2', 'sm:grid-cols-4', 'gap-2.5', 'sm:gap-3');
          if (el.statsBtn) el.statsBtn.classList.remove('vpn-active');
        }
      }, 220);
    }
    function handleSpotifyMarqueeEnter(cardEl) {
      if (!cardEl) return;
      cardEl.querySelectorAll('.spotify-marquee-container').forEach(container => {
        const textEl = container.querySelector('.spotify-marquee-text');
        if (!textEl) return;

        // Temporarily unconstrain to measure real text width
        const savedMaxW = textEl.style.maxWidth;
        const savedOF = textEl.style.overflow;
        textEl.style.maxWidth = 'none';
        textEl.style.overflow = 'visible';
        const textWidth = textEl.scrollWidth;
        const containerWidth = container.clientWidth;
        const overflow = textWidth - containerWidth;

        if (overflow <= 2) {
          textEl.style.maxWidth = savedMaxW;
          textEl.style.overflow = savedOF;
          return;
        }

        // Align left so first letter stays visible, text extends rightward
        container.style.justifyContent = 'flex-start';
        textEl.style.textOverflow = 'clip';
        textEl.style.transform = 'translateX(0px)';

        const scrollDist = overflow + 4;
        const duration = Math.max(1.2, Math.min(3.2, scrollDist / 35));

        if (textEl._marqueeTimer) clearTimeout(textEl._marqueeTimer);

        function scrollForward() {
          textEl.style.transition = `transform ${duration}s cubic-bezier(0.25, 0.1, 0.25, 1)`;
          textEl.style.transform = `translateX(-${scrollDist}px)`;
          textEl._marqueeTimer = setTimeout(() => {
            if (!cardEl.matches(':hover')) return;
            scrollBack();
          }, (duration * 1000) + 700);
        }

        function scrollBack() {
          textEl.style.transition = `transform ${duration}s cubic-bezier(0.25, 0.1, 0.25, 1)`;
          textEl.style.transform = 'translateX(0px)';
          textEl._marqueeTimer = setTimeout(() => {
            if (!cardEl.matches(':hover')) return;
            scrollForward();
          }, (duration * 1000) + 700);
        }

        // Brief pause before starting
        textEl._marqueeTimer = setTimeout(() => {
          if (cardEl.matches(':hover')) scrollForward();
        }, 500);
      });
    }

    function handleSpotifyMarqueeLeave(cardEl) {
      if (!cardEl) return;
      cardEl.querySelectorAll('.spotify-marquee-container').forEach(container => {
        const textEl = container.querySelector('.spotify-marquee-text');
        if (!textEl) return;
        if (textEl._marqueeTimer) clearTimeout(textEl._marqueeTimer);
        textEl.style.transition = 'transform 0.3s ease-out';
        textEl.style.transform = 'translateX(0px)';
        setTimeout(() => {
          container.style.justifyContent = '';
          textEl.style.maxWidth = '';
          textEl.style.overflow = '';
          textEl.style.textOverflow = '';
          textEl.style.transition = '';
          textEl.style.transform = '';
        }, 320);
      });
    }

    function _openGenericPopupAnimated() {
      const overlay = document.getElementById('genericPopupOverlay');
      const content = document.getElementById('genericPopupContent');
      if (!overlay || !content) return;

      overlay.classList.remove('hidden', 'popup-overlay-out');
      overlay.classList.add('flex');

      requestAnimationFrame(() => {
        overlay.classList.add('popup-overlay-in');
        content.classList.remove('popup-animate-out');
        content.classList.add('popup-animate-in');
      });
    }

    function _modalHeaderHTML(title, category = '') {
      return `
        <div class="modal-header-container">
          <div class="flex flex-col min-w-0 pr-2 text-left">
            ${category ? `<span class="modal-header-category">${escapeHTML(category)}</span>` : ''}
            <h3 class="modal-header-title">${escapeHTML(title)}</h3>
          </div>
          <button type="button" onclick="closeGenericPopup()" aria-label="Close"
            class="shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-full liquid-glass active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      `;
    }

    function _premiumHeaderHTML(title, category = '') {
      return _modalHeaderHTML(title, category);
    }

    function openCustomPopup(title, html, category = '') {
      const body = document.getElementById('genericPopupBody');
      if (!body) return;
      body.innerHTML = `${_modalHeaderHTML(title, category)}${html}`;
      _openGenericPopupAnimated();
    }

    window.openExtraStreamingPopup = function (movieId) {
      const data = window.moviePopupDataCache ? window.moviePopupDataCache.get(movieId) : null;
      if (!data) return;
      const hasUser = !!data.userFlatrateLinksHtml;
      const hasOther = !!data.otherFlatrateLinksHtml;
      const hasAny = hasUser || hasOther || (data.streamingCount > 0);

      let html = '';
      if (!hasAny) {
        const fallbackMsg = (data && data.rentBuyCount > 0) ? 'Only available to rent or buy' : 'Not available to stream';
        html = `<div class="w-full bg-white/5 border border-white/10 px-6 py-10 rounded-2xl flex flex-col items-center justify-center text-center gap-2">
          <span class="text-3xl opacity-60 mb-1">📺</span>
          <span class="font-bold uppercase tracking-widest text-sm text-gray-400">${fallbackMsg}</span>
          <span class="text-xs text-gray-500 font-medium normal-case tracking-normal">No streaming options found in this region.</span>
        </div>`;
      } else {
        html = `<div class="space-y-6">
          ${hasUser ? `
            <div>
              <h4 class="text-xs font-black uppercase tracking-widest text-blue-400 mb-3 flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>
                Your Subscriptions
              </h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">${data.userFlatrateLinksHtml}</div>
            </div>
          ` : ''}
          ${hasOther ? `
            <div>
              <h4 class="text-xs font-black uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-gray-500"></span>
                Unsubscribed
              </h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">${data.otherFlatrateLinksHtml}</div>
            </div>
          ` : ''}
          ${(data.hasVpnLinks || data.userFlatrateLinksHtml?.includes('via VPN*')) ? `<p class="text-[10px] sm:text-[11px] text-gray-500 font-medium leading-tight text-center pt-2">*Some streaming services may detect or restrict VPN connections</p>` : ''}
        </div>`;
      }
      openCustomPopup(data.title, html, 'Streaming Options');
    };

    window.openRentBuyPopup = function (movieId) {
      const data = window.moviePopupDataCache ? window.moviePopupDataCache.get(movieId) : null;
      if (!data) return;
      const html = data.rentBuyCount > 0
        ? `<div class="space-y-4"><div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">${data.rbLinksHtml}</div>${(data.hasVpnLinks || data.rbLinksHtml?.includes('via VPN*')) ? `<p class="text-[10px] sm:text-[11px] text-gray-500 font-medium leading-tight text-center pt-2">*Some streaming services may detect or restrict VPN connections</p>` : ''}</div>`
        : `<div class="w-full bg-white/5 border border-white/10 px-6 py-10 rounded-2xl flex flex-col items-center justify-center text-center gap-2">
          <span class="text-3xl opacity-60 mb-1">🛒</span>
          <span class="font-bold uppercase tracking-widest text-sm text-gray-400">Not available to rent or buy</span>
          <span class="text-xs text-gray-500 font-medium normal-case tracking-normal">No digital purchase or rental options found in this region.</span>
        </div>`;
      openCustomPopup(data.title, html, 'Rent & Buy Options');
    };

    function openTextPopup(title, text) {
      const body = document.getElementById('genericPopupBody');
      if (!body) return;
      openCustomPopup(title, `<div class="premium-text-body">${text}</div>`, 'Overview');
      const textEl = body.querySelector('.premium-text-body');
      if (textEl) textEl.scrollTop = 0;
      body.scrollTop = 0;
    }

    function openInsightsPopup() {
      const bar = document.getElementById('statsBar');
      const body = document.getElementById('genericPopupBody');
      if (!bar || !body) return;
      statsBarOriginalParent = bar.parentElement;

      // Read current stat values
      const total = document.getElementById('stat-total')?.textContent || '0';
      const genre = document.getElementById('stat-genre')?.textContent || '-';
      const decade = document.getElementById('stat-decade')?.textContent || '-';
      const avg = document.getElementById('stat-avg')?.textContent || '-';

      const statsHtml = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div class="insight-stat-card">
            <span class="stat-icon">🎬</span>
            <div class="flex flex-col gap-0.5">
              <span class="stat-label">Total Films</span>
              <span class="stat-value">${escapeHTML(total)}</span>
            </div>
          </div>
          <div class="insight-stat-card">
            <span class="stat-icon">🍿</span>
            <div class="flex flex-col gap-0.5">
              <span class="stat-label">Top Genre</span>
              <span class="stat-value">${escapeHTML(genre)}</span>
            </div>
          </div>
          <div class="insight-stat-card">
            <span class="stat-icon">🕰</span>
            <div class="flex flex-col gap-0.5">
              <span class="stat-label">Top Decade</span>
              <span class="stat-value">${escapeHTML(decade)}</span>
            </div>
          </div>
          <div class="insight-stat-card">
            <span class="stat-icon">⭐</span>
            <div class="flex flex-col gap-0.5">
              <span class="stat-label">Avg Rating</span>
              <span class="stat-value">${escapeHTML(avg)}</span>
            </div>
          </div>
        </div>`;

      if (el.statsBtn) el.statsBtn.classList.add('vpn-active');
      openCustomPopup('Watchlist Insights', statsHtml, 'Analytics');
    }
    // 2-line-clamped hero description with a "More" link that opens the full text in the popup
    // above, instead of expanding inline (used on the full-page movie/actor hero).
    let heroOverviewCounter = 0;
    const heroOverviewTextStore = {};
    function createHeroOverviewHtml(escapedText, popupTitle) {
      if (!escapedText) return '';
      const id = 'heroOverview_' + (++heroOverviewCounter);
      heroOverviewTextStore[id] = { text: escapedText, popupTitle };
      setTimeout(() => clampHeroOverview(id), 0);
      return `<p id="${id}" class="w-full max-w-full lg:max-w-2xl text-gray-200 text-base sm:text-lg leading-snug font-medium line-clamp-2">${escapedText}</p>`;
    }
    // Measures the actual rendered paragraph and binary-searches for the longest prefix that still
    // fits on 2 lines once "… More" is appended — guarantees "More" lands as the real last word on
    // line 2, rather than approximating with CSS line-clamp + float (which can end up on its own row).
    function clampHeroOverview(id) {
      const p = document.getElementById(id);
      const data = heroOverviewTextStore[id];
      if (!p || !data) return;
      p.classList.remove('line-clamp-2');
      const lineHeight = parseFloat(getComputedStyle(p).lineHeight) || 24;
      const maxHeight = lineHeight * 2 + 2;
      const moreSpan = `<span class="text-blue-400 font-extrabold">more</span>`;
      p.innerHTML = data.text;
      if (p.scrollHeight <= maxHeight) return;
      let lo = 0, hi = data.text.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        // Measure with the exact same inline markup we'll actually render (a <span>, not a <button> —
        // a real button has its own padding/border that a plain-text measurement wouldn't account for,
        // which was throwing the wrapping off for some titles).
        p.innerHTML = data.text.slice(0, mid).trim() + '… ' + moreSpan;
        if (p.scrollHeight <= maxHeight) lo = mid; else hi = mid - 1;
      }
      const truncated = data.text.slice(0, lo).trim();
      p.innerHTML = `${truncated}… <span role="button" tabindex="0" onclick="openTextPopup('${escapeHTML(data.popupTitle).replace(/'/g, "\\'")}', heroOverviewTextStore['${id}'].text)" onkeydown="if(event.key==='Enter')this.click()" class="text-blue-400 font-extrabold cursor-pointer hover:text-blue-300 transition-colors">more</span>`;
    }

    function createExpandableTextHtml(text, id = '') {
      if (!text) return '';
      const safe = escapeHTML(text);
      const isLong = text.length > 195;
      if (!isLong) {
        return `<p ${id ? `id="${id}"` : ''} class="text-gray-300 text-base leading-relaxed font-medium w-full pr-2 sm:pr-4">${safe}</p>`;
      }
      const shortText = escapeHTML(getShortText(text, 195));
      return `<p ${id ? `id="${id}"` : ''} class="text-gray-300 text-base leading-relaxed font-medium w-full pr-2 sm:pr-4" data-full="${safe}" data-short="${shortText}">${shortText}... <button type="button" onclick="toggleExpandableText(this)" class="inline text-blue-400 text-xs font-extrabold uppercase tracking-wider hover:text-blue-300 transition-colors ml-0.5 cursor-pointer">more</button></p>`;
    }

    function toggleExpandableText(btn) {
      const p = btn.closest('p');
      if (!p) return;
      const isExp = p.classList.contains('expanded');
      const full = p.dataset.full;
      const short = p.dataset.short;
      if (isExp) {
        p.classList.remove('expanded');
        p.innerHTML = `${short}... <button type="button" onclick="toggleExpandableText(this)" class="inline text-blue-400 text-xs font-extrabold uppercase tracking-wider hover:text-blue-300 transition-colors ml-0.5 cursor-pointer">more</button>`;
      } else {
        p.classList.add('expanded');
        p.innerHTML = `${full} <button type="button" onclick="toggleExpandableText(this)" class="inline text-blue-400 text-xs font-extrabold uppercase tracking-wider hover:text-blue-300 transition-colors ml-1 cursor-pointer">less</button>`;
      }
    }

    let isHeroVideoMuted = true;

    // Manually computes exact "object-fit: cover" sizing for the hero video iframe (iframes don't
    // support object-fit natively). This guarantees zero YouTube letterbox bars with the minimum
    // necessary zoom, for any hero aspect ratio — no more guessed overscan percentages.
    function fitHeroVideoCover(iframeEl) {
      if (!iframeEl) return;
      const container = iframeEl.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const videoAspect = 16 / 9;
      const containerAspect = rect.width / rect.height;
      // Safety factor to zoom in the hero background trailer video cleanly without over-cropping
      const SAFETY = 1.38;
      let w, h;
      if (containerAspect > videoAspect) { w = rect.width * SAFETY; h = w / videoAspect; }
      else { h = rect.height * SAFETY; w = h * videoAspect; }
      iframeEl.style.width = w + 'px';
      iframeEl.style.height = h + 'px';
      iframeEl.style.left = ((rect.width - w) / 2) + 'px';
      iframeEl.style.top = ((rect.height - h) / 2) + 'px';
    }
    // Mobile Safari fires 'resize' whenever its address-bar chrome
    // slides in/out during ordinary scrolling (it changes innerHeight,
    // never innerWidth). Reacting to that here was doing layout work
    // constantly while the user scrolled, right in the same window
    // where Safari itself is still reconciling touch coordinates with
    // the animating chrome - a likely contributor to taps not
    // registering. Only actual width changes (rotation, real resize)
    // should trigger a re-fit.
    let __heroResizeLastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      if (window.innerWidth === __heroResizeLastWidth) return;
      __heroResizeLastWidth = window.innerWidth;
      const f = document.getElementById('heroVideoIframe');
      if (!f) return;
      const fs = document.getElementById('heroVideoFullscreen');
      if (fs && !fs.classList.contains('hidden')) fitHeroVideoContain(f);
      else fitHeroVideoCover(f);
    });
    // Mobile browsers often finish settling their address-bar chrome (which changes the real
    // viewport height) a moment after load — re-fit once more to catch that.
    window.addEventListener('orientationchange', () => {
      const f = document.getElementById('heroVideoIframe');
      if (f) setTimeout(() => fitHeroVideoCover(f), 400);
    });

    // Uncropped "contain" fit for fullscreen viewing — unlike the cover-fit used for the
    // autoplay background, here we want the whole frame visible, letterboxed if needed.
    function fitHeroVideoContain(iframeEl) {
      if (!iframeEl) return;
      const container = iframeEl.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const videoAspect = 16 / 9;
      const containerAspect = rect.width / rect.height;
      let w, h;
      if (containerAspect > videoAspect) { h = rect.height; w = h * videoAspect; }
      else { w = rect.width; h = w / videoAspect; }
      iframeEl.style.width = w + 'px';
      iframeEl.style.height = h + 'px';
      iframeEl.style.left = ((rect.width - w) / 2) + 'px';
      iframeEl.style.top = ((rect.height - h) / 2) + 'px';
    }

    // ---- Watch Trailer -> expand the already-playing hero video to fullscreen ----
    let heroFullscreenOriginalParent = null;
    let heroFullscreenOriginalSrc = null;
    function expandHeroVideoFullscreen() {
      const oldIframe = document.getElementById('heroVideoIframe');
      if (!oldIframe) return;
      const keyMatch = oldIframe.src.match(/embed\/([^?]+)/);
      const videoKey = keyMatch ? keyMatch[1] : null;
      if (!videoKey) return;
      heroFullscreenOriginalParent = oldIframe.parentElement;
      heroFullscreenOriginalSrc = oldIframe.src;

      let fsContainer = document.getElementById('heroVideoFullscreen');
      if (!fsContainer) {
        fsContainer = document.createElement('div');
        fsContainer.id = 'heroVideoFullscreen';
        fsContainer.className = 'fixed inset-0 z-[400] bg-black hidden';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.className = 'absolute top-4 right-4 z-10 w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center liquid-glass active:scale-95 transition-all text-white cursor-pointer shrink-0';
        closeBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
        closeBtn.onclick = collapseHeroVideoFullscreen;
        fsContainer.appendChild(closeBtn);
        document.body.appendChild(fsContainer);
      }

      // Build a brand-new iframe with real controls rather than mutating .src on the existing one —
      // that relied on the browser cleanly re-navigating the same iframe, which wasn't reliably
      // showing YouTube's control bar. A fresh element with the right params from the start is safer.
      oldIframe.remove();
      const newIframe = document.createElement('iframe');
      newIframe.id = 'heroVideoFullscreenIframe';
      newIframe.src = `https://www.youtube.com/embed/${videoKey}?autoplay=1&controls=1&playsinline=1&enablejsapi=1&fs=1&modestbranding=1&rel=0&cc_load_policy=0&cc_lang_pref=none&hl=en`;
      newIframe.title = 'Trailer';
      newIframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
      newIframe.setAttribute('allowfullscreen', '');
      newIframe.setAttribute('frameborder', '0');
      newIframe.style.cssText = 'border:0; position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:auto; touch-action:auto;';
      fsContainer.appendChild(newIframe);
      fsContainer.classList.remove('hidden');
    }
    function collapseHeroVideoFullscreen() {
      const fsContainer = document.getElementById('heroVideoFullscreen');
      const fsIframe = document.getElementById('heroVideoFullscreenIframe');
      if (fsIframe) fsIframe.remove();
      if (fsContainer) fsContainer.classList.add('hidden');
      // Rebuild the background hero video fresh (muted, no controls, autoplaying) in its original spot,
      // rather than trying to reuse/rewind the fullscreen iframe we just tore down.
      if (heroFullscreenOriginalParent && heroFullscreenOriginalSrc) {
        const bgIframe = document.createElement('iframe');
        bgIframe.id = 'heroVideoIframe';
        bgIframe.src = heroFullscreenOriginalSrc;
        bgIframe.title = 'preview';
        bgIframe.setAttribute('allow', 'autoplay; encrypted-media');
        bgIframe.className = 'absolute pointer-events-none opacity-0 transition-opacity duration-700 transform-gpu';
        bgIframe.style.border = '0';
        bgIframe.onload = () => onHeroVideoLoad(bgIframe);
        heroFullscreenOriginalParent.appendChild(bgIframe);
      }
    }

    // Hard safety net for title logos: if an image hasn't confirmed it actually rendered pixels
    // within ~1.8s (covers slow loads, silent failures, or a TMDB entry that "loads" but is blank),
    // force the plain-text fallback rather than leaving a broken/invisible title.
    function verifyTitleLogos() {
      document.querySelectorAll('img.titleLogoImg').forEach(img => {
        setTimeout(() => {
          if (!img.isConnected || img.style.display === 'none') return;
          if (!img.complete || img.naturalWidth === 0) {
            if (window.onTitleLogoError) window.onTitleLogoError(img);
          }
        }, 3000);
      });
    }

    let heroRevealTimeout = null;
    let heroVideoFailed = false;

    window.onHeroVideoLoad = function (iframeEl) {
      if (!iframeEl) return;
      heroVideoFailed = false;
      fitHeroVideoCover(iframeEl);
      setTimeout(() => fitHeroVideoCover(iframeEl), 600);
      try {
        iframeEl.contentWindow.postMessage('{"event":"listening","id":"heroVideoIframe"}', '*');
        iframeEl.contentWindow.postMessage('{"event":"command","func":"unloadModule","args":["captions"]}', '*');
        iframeEl.contentWindow.postMessage('{"event":"command","func":"unloadModule","args":["cc"]}', '*');
        iframeEl.contentWindow.postMessage('{"event":"command","func":"setOption","args":["captions","track",{}]}', '*');
      } catch (err) { console.warn('[Hero Video Listen Handshake]', err); }
      if (heroRevealTimeout) clearTimeout(heroRevealTimeout);
      // Wait the full 6.6s delay before revealing the video (as long as no error occurred)
      heroRevealTimeout = setTimeout(() => {
        if (!heroVideoFailed) {
          revealHeroVideo(iframeEl);
        }
      }, 6600);
    };

    function revealHeroVideo(iframeEl) {
      if (!iframeEl || heroVideoFailed || !document.getElementById('heroVideoIframe')) return;
      fitHeroVideoCover(iframeEl);
      const overlay = document.getElementById('heroFadeOverlay');
      // Fade to black first...
      if (overlay) overlay.style.opacity = '1';
      setTimeout(() => {
        if (heroVideoFailed || !document.getElementById('heroVideoIframe')) return;
        iframeEl.style.display = '';
        iframeEl.style.opacity = '1';
        try {
          // Ask YouTube for the best quality it's willing to give this connection and unload captions.
          iframeEl.contentWindow.postMessage('{"event":"command","func":"setPlaybackQuality","args":["hd1080"]}', '*');
          iframeEl.contentWindow.postMessage('{"event":"command","func":"unloadModule","args":["captions"]}', '*');
          iframeEl.contentWindow.postMessage('{"event":"command","func":"unloadModule","args":["cc"]}', '*');
          iframeEl.contentWindow.postMessage('{"event":"command","func":"setOption","args":["captions","track",{}]}', '*');
        } catch (err) { console.warn('[Hero Video Quality PostMessage]', err); }
        if (!isHeroVideoMuted) {
          try {
            iframeEl.contentWindow.postMessage('{"event":"command","func":"unMute","args":""}', '*');
            iframeEl.contentWindow.postMessage('{"event":"command","func":"setVolume","args":[100]}', '*');
          } catch (err) { console.warn('[Hero Video Unmute PostMessage]', err); }
        }
        // ...hold on black a little longer...
        setTimeout(() => {
          if (overlay) overlay.style.opacity = '0';
        }, 380);
      }, 450);
    }

    // Window message listener for YouTube player events
    window.addEventListener('message', (e) => {
      if (!/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(e.origin)) return;
      let data;
      try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (err) { return; }
      if (!data) return;

      // Detect YouTube error events (code 101, 150 = embed blocked/geoblocked, 100 = deleted/not found, 2, 5)
      const isError = data.event === 'onError' || (data.event === 'infoDelivery' && data.info && (data.info.errorCode !== undefined || data.info.error !== undefined));
      if (isError) {
        heroVideoFailed = true;
        if (heroRevealTimeout) { clearTimeout(heroRevealTimeout); heroRevealTimeout = null; }
        const iframeEl = document.getElementById('heroVideoIframe');
        if (iframeEl) {
          iframeEl.style.opacity = '0';
          iframeEl.style.display = 'none';
        }
        document.querySelectorAll('.heroSoundToggleBtn').forEach(b => b.classList.add('hidden'));
        return;
      }

      // Track trailer player state (1 = playing, 2 = paused, 0 = ended)
      if (data.event === 'onStateChange' || (data.event === 'infoDelivery' && data.info && data.info.playerState !== undefined)) {
        const state = data.event === 'onStateChange' ? data.info : data.info.playerState;
        if (state === 1) {
          isTrailerPaused = false;
        } else if (state === 2 || state === 0) {
          isTrailerPaused = true;
        }
      }

      if (data.event !== 'onStateChange' && !(data.event === 'infoDelivery' && data.info)) return;
      const state = data.event === 'onStateChange' ? data.info : (data.info && data.info.playerState);
      if (state === 0) {
        const fsContainer = document.getElementById('heroVideoFullscreen');
        if (fsContainer && !fsContainer.classList.contains('hidden')) return;
        const iframeEl = document.getElementById('heroVideoIframe');
        const overlay = document.getElementById('heroFadeOverlay');
        if (!iframeEl) return;
        if (overlay) overlay.style.opacity = '1';
        setTimeout(() => {
          iframeEl.style.opacity = '0';
          setTimeout(() => { if (overlay) overlay.style.opacity = '0'; }, 380);
        }, 450);
      }
    });

    // Video intentionally keeps playing when the browser tab loses focus — it only stops when
    // navigating away to a different page/movie inside the site (see stopHeroVideo() calls in
    // closeMoviePage / closeModal).
    function toggleHeroVideoSound() {
      const iframe = document.getElementById('heroVideoIframe');
      const btns = document.querySelectorAll('.heroSoundToggleBtn');
      const iconsMuted = document.querySelectorAll('.heroSoundIconMuted');
      const iconsUnmuted = document.querySelectorAll('.heroSoundIconUnmuted');
      if (!iframe) return;

      if (isHeroVideoMuted) {
        iframe.contentWindow.postMessage('{"event":"command","func":"unMute","args":""}', '*');
        iframe.contentWindow.postMessage('{"event":"command","func":"setVolume","args":[100]}', '*');
        isHeroVideoMuted = false;
        localStorage.setItem('ps_hero_sound_muted', 'false');
        iconsMuted.forEach(el => el.classList.add('hidden'));
        iconsUnmuted.forEach(el => el.classList.remove('hidden'));
        btns.forEach(b => b.title = 'Mute');
      } else {
        iframe.contentWindow.postMessage('{"event":"command","func":"mute","args":""}', '*');
        isHeroVideoMuted = true;
        localStorage.setItem('ps_hero_sound_muted', 'true');
        iconsMuted.forEach(el => el.classList.remove('hidden'));
        iconsUnmuted.forEach(el => el.classList.add('hidden'));
        btns.forEach(b => b.title = 'Unmute');
      }
    }

    function stopHeroVideo() {
      heroVideoFailed = false;
      if (heroRevealTimeout) { clearTimeout(heroRevealTimeout); heroRevealTimeout = null; }
      try {
        const iframe = document.getElementById('heroVideoIframe');
        if (iframe) {
          try {
            if (iframe.contentWindow && typeof iframe.contentWindow.postMessage === 'function') {
              iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
              iframe.contentWindow.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
            }
          } catch (e) { logIgnored('stopHeroVideo', e); }
          try {
            iframe.src = 'about:blank';
            if (typeof iframe.remove === 'function') iframe.remove();
            else if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          } catch (e) { logIgnored('stopHeroVideo', e); }
        }
      } catch (e) { logIgnored('stopHeroVideo', e); }
    }


    const quickSearchHistoryStack = [];
    const watchlistModalHistoryStack = [];

    function pushToHistoryStack(stack, entry) {
      if (!entry || !entry.data) return;
      if (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.type === entry.type) {
          if (entry.type === 'movie' && top.data.id === entry.data.id) return;
          if (entry.type === 'actor' && top.data.id === entry.data.id) return;
        }
      }
      stack.push(entry);
    }

    window.closeQuickSearchInline = function () {
      stopHeroVideo();
      if (el.quickSearchResult) {
        el.quickSearchResult.classList.add('hidden');
        el.quickSearchResult.innerHTML = '';
      }
      quickSearchHistoryStack.length = 0;
      window.currentActiveMovieObj = null;
      currentActorId = null;
    };

    function isInlineSearchActive() {
      return el.quickSearchResult && !el.quickSearchResult.classList.contains('hidden') && el.quickSearchResult.children.length > 0;
    }

    function isQuickSearchContext() {
      if (!isInlineSearchActive()) return false;
      if (window.event && window.event.target) {
        const target = window.event.target;
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection && resultsSection.contains(target)) return false;
        const activeGridContainer = document.getElementById('activeGridContainer');
        if (activeGridContainer && activeGridContainer.contains(target)) return false;
        const modalContent = document.getElementById('modalContent');
        const movieModal = document.getElementById('movieModal');
        if (modalContent && modalContent.contains(target) && movieModal && !movieModal.classList.contains('hidden')) return false;
        if (el.quickSearchResult && el.quickSearchResult.contains(target)) return true;
      }
      return false;
    }

    function scrollToQuickSearchResult() {
      if (!el.quickSearchResult) return;
      requestAnimationFrame(() => {
        const rect = el.quickSearchResult.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const targetY = rect.top + scrollTop - 32;
        window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
      });
    }

