    // The old roulette modal is gone: "Another pick" on Tonight's pick (15-results-hero.js) does its job.
    const savedUsername = localStorage.getItem('ps_username'); if (savedUsername && el.usernameInput) el.usernameInput.value = savedUsername;
    const savedFriend = localStorage.getItem('ps_friend_username'); if (savedFriend && el.friendInput) { el.friendInput.value = savedFriend; if (el.friendInputWrapper) el.friendInputWrapper.classList.remove('hidden'); if (el.toggleFriendBtn) el.toggleFriendBtn.classList.add('hidden'); if (el.removeFriendBtn) el.removeFriendBtn.classList.remove('hidden'); }
    if (el.toggleFriendBtn) { el.toggleFriendBtn.addEventListener('click', () => { if (el.friendInputWrapper) el.friendInputWrapper.classList.remove('hidden'); if (el.removeFriendBtn) el.removeFriendBtn.classList.remove('hidden'); if (el.toggleFriendBtn) el.toggleFriendBtn.classList.add('hidden'); if (el.friendInput) el.friendInput.focus(); }); }
    if (el.removeFriendBtn) { el.removeFriendBtn.addEventListener('click', () => { if (el.friendInput) el.friendInput.value = ''; localStorage.removeItem('ps_friend_username'); if (el.friendInputWrapper) el.friendInputWrapper.classList.add('hidden'); if (el.toggleFriendBtn) el.toggleFriendBtn.classList.remove('hidden'); if (el.formError) { el.formError.classList.add('hidden'); el.formError.textContent = ''; } if (isFriendMatchActive) { if (el.resultsSection) el.resultsSection.classList.add('hidden'); scannedMovies = []; clearScanStorage(); isFriendMatchActive = false; if (el.activeGridContainer) el.activeGridContainer.innerHTML = ''; if (el.paginationControls) el.paginationControls.classList.add('hidden'); } }); }
    if (el.friendInput) { el.friendInput.addEventListener('input', (e) => { localStorage.setItem('ps_friend_username', e.target.value); }); }
    let trailerPlayer = null;
    let isTrailerPaused = false;

    // YouTube's player script is loaded the first time a trailer is opened, not on page
    // load, so visitors who never watch a trailer never contact YouTube.
    function ensureYouTubeApi(callback, onFail) {
      if (window.YT && window.YT.Player) {
        callback();
        return;
      }
      if (!document.getElementById('youtubeIframeApi')) {
        const script = document.createElement('script');
        script.id = 'youtubeIframeApi';
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        document.head.appendChild(script);
      }
      const check = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(check);
          clearTimeout(giveUp);
          callback();
        }
      }, 50);
      const giveUp = setTimeout(() => {
        clearInterval(check);
        if (typeof onFail === 'function') onFail();
      }, 10000);
    }

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openQuickSearch(); }
      const trailerModal = document.getElementById('trailerModal');
      const trailerModalOpen = trailerModal && !trailerModal.classList.contains('hidden');
      if (trailerModalOpen) {
        if (e.key === 'Escape') { closeTrailerModal(); return; }
        const activeEl = document.activeElement;
        const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
        if (isInputFocused) return;

        if (e.code === 'Space' || e.key === ' ' || e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          e.stopPropagation();
          if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
          }
          if (trailerPlayer && typeof trailerPlayer.getPlayerState === 'function') {
            try {
              const state = trailerPlayer.getPlayerState();
              if (state === 1 || (window.YT && state === YT.PlayerState.PLAYING)) {
                trailerPlayer.pauseVideo();
              } else {
                trailerPlayer.playVideo();
              }
            } catch (err) { console.warn('[YT Play/Pause]', err); }
          }
          return;
        }

        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (trailerPlayer && typeof trailerPlayer.getCurrentTime === 'function') {
            try {
              const cur = trailerPlayer.getCurrentTime() || 0;
              trailerPlayer.seekTo(Math.max(0, cur - 5), true);
            } catch (err) { logIgnored('ensureYouTubeApi', err); }
          }
          return;
        }

        if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (trailerPlayer && typeof trailerPlayer.getCurrentTime === 'function') {
            try {
              const cur = trailerPlayer.getCurrentTime() || 0;
              trailerPlayer.seekTo(cur + 5, true);
            } catch (err) { logIgnored('ensureYouTubeApi', err); }
          }
          return;
        }

        if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          if (trailerPlayer && typeof trailerPlayer.isMuted === 'function') {
            try {
              if (trailerPlayer.isMuted()) trailerPlayer.unMute(); else trailerPlayer.mute();
            } catch (err) { logIgnored('ensureYouTubeApi', err); }
          }
          return;
        }

        if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          const iframe = document.querySelector('#trailerIframeWrapper iframe');
          if (iframe) {
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => { });
            } else if (iframe.requestFullscreen) {
              iframe.requestFullscreen().catch(() => { });
            } else if (iframe.webkitRequestFullscreen) {
              iframe.webkitRequestFullscreen();
            }
          }
          return;
        }

        return;
      }
      const allCastModal = document.getElementById('allCastModal');
      const allCastModalOpen = allCastModal && !allCastModal.classList.contains('hidden');
      const actorModal = document.getElementById('actorModal'); const actorModalOpen = actorModal && !actorModal.classList.contains('hidden'); const modal = document.getElementById('movieModal'); const isModalOpen = !!modal && !modal.classList.contains('hidden');
      if (e.key === 'Escape') {
        if (allCastModalOpen) { closeAllCastModal(); return; }
        if (actorModalOpen) { closeActorModal(); return; }
        if (el.searchDropdown) el.searchDropdown.classList.add('hidden');
        if (isModalOpen) document.getElementById('closeModalBtn')?.click();
      } if (isModalOpen && !actorModalOpen) {
        const activeEl = document.activeElement;
        const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
        if (!isInputFocused) {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const prevBtn = document.getElementById('modalPrevBtn');
            if (prevBtn && !prevBtn.classList.contains('hidden')) prevBtn.click();
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            const nextBtn = document.getElementById('modalNextBtn');
            if (nextBtn && !nextBtn.classList.contains('hidden')) nextBtn.click();
          }
        }
      }
    });
    let searchTimeout; if (el.quickSearchInput) { el.quickSearchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchTimeout); if (el.searchDropdown) el.searchDropdown.classList.add('hidden'); if (el.quickSearchBtn) el.quickSearchBtn.click(); } }); }
    if (el.usernameInput) { el.usernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!isScanning) el.startButton.click(); } }); }
    if (el.friendInput) { el.friendInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!isScanning) el.startButton.click(); } }); }
    function clearQuickSearchInput() {
      const input = el.quickSearchInput || document.getElementById('quickSearchInput');
      const clearBtn = el.clearSearchBtn || document.getElementById('clearSearchBtn');
      const dropdown = el.searchDropdown || document.getElementById('searchDropdown');
      const result = el.quickSearchResult || document.getElementById('quickSearchResult');
      if (input) input.value = '';
      if (clearBtn) clearBtn.classList.add('hidden');
      if (dropdown) dropdown.classList.add('hidden');
      if (result) {
        result.classList.add('hidden');
        result.innerHTML = '';
      }
    }
    if (el.clearSearchBtn) { el.clearSearchBtn.addEventListener('click', () => { clearQuickSearchInput(); if (el.quickSearchInput) el.quickSearchInput.focus(); }); }
    if (el.usernameInput) { el.usernameInput.addEventListener('input', (e) => { localStorage.setItem('ps_username', e.target.value); toggleClearSyncBtn(); }); }
    if (el.clearSyncBtn) { el.clearSyncBtn.addEventListener('click', () => { if (isScanning) return; if (el.usernameInput) el.usernameInput.value = ''; localStorage.setItem('ps_username', ''); clearScanStorage(); isFriendMatchActive = false; if (el.clearSyncBtn) el.clearSyncBtn.classList.add('hidden'); if (el.formError) el.formError.classList.add('hidden'); document.getElementById('scanNotice')?.classList.add('hidden'); if (el.progressSection) el.progressSection.classList.add('hidden'); if (el.resultsSection) el.resultsSection.classList.add('hidden'); if (el.usernameInput) el.usernameInput.focus(); scannedMovies = []; }); }

    let pendingSelectedIds = new Set();

