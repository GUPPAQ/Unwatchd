    // =========================================================================
    // MOTION: springs, the draggable filter sheet, popover origins, press feedback
    // Principles (Apple, "Designing Fluid Interfaces"): respond on press, track the
    // finger 1:1, animate from the on-screen value so anything can be interrupted,
    // hand the release velocity to the spring, and leave the way you came in.
    // =========================================================================
    var prefersReducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

    // Damped spring on one number, driven by requestAnimationFrame.
    // `response` (s) is how fast it gets there, `dampingRatio` 1 means no overshoot.
    // Returns { stop() }; `velocity` is in units per second.
    // Next display frame, or a timer if frames stall (background tab, throttled window), so a
    // spring always finishes instead of leaving the sheet stranded mid-way.
    function nextFrame(cb) {
      let fired = false;
      const run = (t) => { if (fired) return; fired = true; cb(t); };
      requestAnimationFrame(run);
      setTimeout(() => run(performance.now()), 50);
      return () => { fired = true; };
    }

    function springTo(from, to, { response = 0.35, dampingRatio = 1, velocity = 0 } = {}, onUpdate, onDone) {
      const stiffness = Math.pow((2 * Math.PI) / response, 2);
      const damping = (4 * Math.PI * dampingRatio) / response;
      let x = from, v = velocity, last = performance.now(), cancel = null, stopped = false;
      const step = (now) => {
        if (stopped) return;
        let dt = Math.min((now - last) / 1000, 1 / 30); last = now;
        // a few sub-steps keep stiff springs stable at 60 Hz
        for (let i = 0; i < 4; i++) {
          const h = dt / 4;
          const a = -stiffness * (x - to) - damping * v;
          v += a * h; x += v * h;
        }
        if (Math.abs(x - to) < 0.5 && Math.abs(v) < 5) { onUpdate(to); if (onDone) onDone(); return; }
        onUpdate(x);
        cancel = nextFrame(step);
      };
      cancel = nextFrame(step);
      return { stop() { stopped = true; if (cancel) cancel(); } };
    }

    // Where a flick would come to rest (Apple's projection, scroll-like deceleration).
    function projectMomentum(velocity, decelerationRate = 0.998) {
      return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
    }

    // Resistance past an edge: the further you pull, the less it follows.
    function rubberband(overshoot, dimension, constant = 0.55) {
      return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
    }

    // ── The filter bottom sheet (phones) ────────────────────────────────────
    // It slides up on open, slides back down on close (same path), and can be
    // dragged down by its top area, grabbed mid-animation, and flicked closed.
    var sheetState = { y: 0, anim: null, closing: false };
    const isSheetMode = () => {
      const menu = document.getElementById('homeFilterDropdownMenu');
      return !!(menu && menu.parentElement === document.body && !menu.classList.contains('hidden'));
    };
    function setSheetY(y) {
      const menu = document.getElementById('homeFilterDropdownMenu');
      const backdrop = document.getElementById('homeFilterBackdrop');
      sheetState.y = y;
      if (menu) menu.style.transform = `translate3d(0, ${y}px, 0)`;
      if (backdrop && menu) backdrop.style.opacity = String(Math.max(0, Math.min(1, 1 - y / menu.offsetHeight)));
    }
    function clearSheetStyles() {
      const menu = document.getElementById('homeFilterDropdownMenu');
      const backdrop = document.getElementById('homeFilterBackdrop');
      if (menu) menu.style.transform = '';
      if (backdrop) backdrop.style.opacity = '';
      sheetState.y = 0;
    }
    function animateSheet(target, velocity, onDone) {
      if (sheetState.anim) sheetState.anim.stop();
      // Settling back after a drag is a momentum moment, so a touch of bounce; closing never overshoots.
      const opts = target === 0 ? { response: 0.3, dampingRatio: 0.85, velocity } : { response: 0.3, dampingRatio: 1, velocity };
      sheetState.anim = springTo(sheetState.y, target, opts, setSheetY, () => { sheetState.anim = null; if (onDone) onDone(); });
    }

    // Wrap the existing open/close so every way in and out (button, backdrop, "Show films") animates.
    const openHomeFilterDropdownInstant = openHomeFilterDropdown;
    const closeHomeFilterDropdownInstant = closeHomeFilterDropdown;
    openHomeFilterDropdown = function () {
      const wasMoving = !!sheetState.anim; // reopened while closing: reverse from where it is
      sheetState.closing = false;
      if (sheetState.anim) { sheetState.anim.stop(); sheetState.anim = null; }
      if (!wasMoving) openHomeFilterDropdownInstant();
      if (!isSheetMode() || prefersReducedMotion.matches) { clearSheetStyles(); return; }
      const menu = document.getElementById('homeFilterDropdownMenu');
      setSheetY(wasMoving ? sheetState.y : menu.offsetHeight);
      animateSheet(0, 0);
    };
    closeHomeFilterDropdown = function () {
      if (!isSheetMode() || prefersReducedMotion.matches) { clearSheetStyles(); closeHomeFilterDropdownInstant(); return; }
      if (sheetState.closing) return;
      sheetState.closing = true;
      const menu = document.getElementById('homeFilterDropdownMenu');
      animateSheet(menu.offsetHeight, sheetState.lastVelocity || 0, () => {
        sheetState.closing = false; sheetState.lastVelocity = 0;
        clearSheetStyles(); closeHomeFilterDropdownInstant();
      });
    };

    (() => {
      const menu = document.getElementById('homeFilterDropdownMenu');
      if (!menu) return;
      let drag = null;
      // Drag from the handle and the title row; the options below keep scrolling normally.
      const isGrabZone = (target) => !!target.closest('.sheet-handle, .filter-panel-head') && !target.closest('button');
      menu.addEventListener('pointerdown', (e) => {
        if (!isSheetMode() || !isGrabZone(e.target) || e.button > 0) return;
        if (sheetState.anim) { sheetState.anim.stop(); sheetState.anim = null; } // grab it mid-flight
        sheetState.closing = false;
        drag = { id: e.pointerId, startY: e.clientY, baseY: sheetState.y, active: false, history: [{ y: e.clientY, t: e.timeStamp }] };
        try { menu.setPointerCapture(e.pointerId); } catch (err) { logIgnored('sheet pointer capture', err); }
      });
      menu.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dy = e.clientY - drag.startY;
        if (!drag.active && Math.abs(dy) < 8) return; // a little hysteresis before committing
        drag.active = true;
        drag.history.push({ y: e.clientY, t: e.timeStamp });
        if (drag.history.length > 6) drag.history.shift();
        const raw = drag.baseY + dy;
        setSheetY(raw < 0 ? rubberband(raw, menu.offsetHeight) : raw);
      });
      const end = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag; drag = null;
        if (!d.active) return;
        const first = d.history[0], lastPt = d.history[d.history.length - 1];
        const dt = Math.max(1, lastPt.t - first.t);
        const velocity = ((lastPt.y - first.y) / dt) * 1000; // px/s, positive = downwards
        const projected = sheetState.y + projectMomentum(velocity);
        const shouldClose = projected > menu.offsetHeight * 0.5;
        if (prefersReducedMotion.matches) {
          // No spring: settle at once (closing is already instant in this mode).
          if (shouldClose) closeHomeFilterDropdown(); else clearSheetStyles();
        } else if (shouldClose) {
          sheetState.lastVelocity = velocity;
          closeHomeFilterDropdown();
        } else {
          animateSheet(0, velocity);
        }
      };
      menu.addEventListener('pointerup', end);
      menu.addEventListener('pointercancel', end);
    })();

    // ── Popovers grow out of the button that opened them ────────────────────
    const toggleCustomFilterMenuInstant = toggleCustomFilterMenu;
    toggleCustomFilterMenu = function (btn, popoverId) {
      toggleCustomFilterMenuInstant(btn, popoverId);
      const pop = document.getElementById(popoverId);
      if (!pop || pop.classList.contains('hidden') || !btn) return;
      const b = btn.getBoundingClientRect(), p = pop.getBoundingClientRect();
      pop.style.transformOrigin = `${Math.round(b.left + b.width / 2 - p.left)}px ${b.top < p.top ? 0 : p.height}px`;
      pop.classList.remove('pop-in'); void pop.offsetWidth; pop.classList.add('pop-in');
    };

    // iOS Safari only applies :active (our press feedback) when a touch listener exists.
    document.addEventListener('touchstart', () => {}, { passive: true });
