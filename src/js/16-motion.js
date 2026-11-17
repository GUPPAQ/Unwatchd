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

    // ── Bottom sheets (phones): the filter panel ────────────────────────────
    // A sheet slides up on open, slides back down on close (same path), and can be
    // dragged down by its top area, grabbed mid-animation, and flicked closed.
    // `isActive()` says whether the panel is currently showing as a sheet; `grabZone`
    // is where a drag may start (the content below keeps scrolling normally).
    function createSheet({ menuId, backdropId, isActive, grabZone }) {
      const s = { y: 0, anim: null, closing: false, lastVelocity: 0, close: null };
      const menu = () => document.getElementById(menuId);
      const backdrop = () => document.getElementById(backdropId);
      s.height = () => (menu() ? menu().offsetHeight : 0);
      s.setY = (y) => {
        const m = menu(), b = backdrop();
        s.y = y;
        if (m) m.style.transform = `translate3d(0, ${y}px, 0)`;
        if (b && m) b.style.opacity = String(Math.max(0, Math.min(1, 1 - y / m.offsetHeight)));
      };
      s.clear = () => {
        const m = menu(), b = backdrop();
        if (m) m.style.transform = '';
        if (b) b.style.opacity = '';
        s.y = 0;
      };
      s.animate = (target, velocity, onDone) => {
        if (s.anim) s.anim.stop();
        // Settling back after a drag is a momentum moment, so a touch of bounce; closing never overshoots.
        const opts = target === 0 ? { response: 0.3, dampingRatio: 0.85, velocity } : { response: 0.3, dampingRatio: 1, velocity };
        s.anim = springTo(s.y, target, opts, s.setY, () => { s.anim = null; if (onDone) onDone(); });
      };
      // Wrap instant open/close functions so every way in and out animates.
      // `reopenRuns`: call the open function again when reopened mid-close (it re-renders safely).
      s.wrap = (openInstant, closeInstant, reopenRuns) => {
        const open = function (...args) {
          const wasMoving = !!s.anim; // reopened while closing: reverse from where it is
          s.closing = false;
          if (s.anim) { s.anim.stop(); s.anim = null; }
          if (!wasMoving || reopenRuns) openInstant.apply(this, args);
          if (!isActive() || prefersReducedMotion.matches) { s.clear(); return; }
          s.setY(wasMoving ? s.y : s.height());
          s.animate(0, 0);
        };
        const close = function (...args) {
          if (!isActive() || prefersReducedMotion.matches) { s.clear(); closeInstant.apply(this, args); return; }
          if (s.closing) return;
          s.closing = true;
          s.animate(s.height(), s.lastVelocity || 0, () => {
            s.closing = false; s.lastVelocity = 0;
            s.clear(); closeInstant.apply(this, args);
          });
        };
        s.close = close;
        return { open, close };
      };
      (() => {
        const m = menu();
        if (!m) return;
        let drag = null;
        const isGrabZone = (target) => !!target.closest(grabZone) && !target.closest('button');
        m.addEventListener('pointerdown', (e) => {
          if (!isActive() || !isGrabZone(e.target) || e.button > 0) return;
          if (s.anim) { s.anim.stop(); s.anim = null; } // grab it mid-flight
          s.closing = false;
          drag = { id: e.pointerId, startY: e.clientY, baseY: s.y, active: false, history: [{ y: e.clientY, t: e.timeStamp }] };
          try { m.setPointerCapture(e.pointerId); } catch (err) { logIgnored('sheet pointer capture', err); }
        });
        m.addEventListener('pointermove', (e) => {
          if (!drag || e.pointerId !== drag.id) return;
          const dy = e.clientY - drag.startY;
          if (!drag.active && Math.abs(dy) < 8) return; // a little hysteresis before committing
          drag.active = true;
          drag.history.push({ y: e.clientY, t: e.timeStamp });
          if (drag.history.length > 6) drag.history.shift();
          const raw = drag.baseY + dy;
          s.setY(raw < 0 ? rubberband(raw, m.offsetHeight) : raw);
        });
        const end = (e) => {
          if (!drag || e.pointerId !== drag.id) return;
          const d = drag; drag = null;
          if (!d.active) return;
          const first = d.history[0], lastPt = d.history[d.history.length - 1];
          const dt = Math.max(1, lastPt.t - first.t);
          const velocity = ((lastPt.y - first.y) / dt) * 1000; // px/s, positive = downwards
          const projected = s.y + projectMomentum(velocity);
          const shouldClose = projected > m.offsetHeight * 0.5;
          if (prefersReducedMotion.matches) {
            // No spring: settle at once (closing is already instant in this mode).
            if (shouldClose && s.close) s.close(); else s.clear();
          } else if (shouldClose && s.close) {
            s.lastVelocity = velocity;
            s.close();
          } else {
            s.animate(0, velocity);
          }
        };
        m.addEventListener('pointerup', end);
        m.addEventListener('pointercancel', end);
      })();
      return s;
    }

    // The filter panel is a sheet when it has been moved to <body> (phones).
    var sheetState = createSheet({
      menuId: 'homeFilterDropdownMenu',
      backdropId: 'homeFilterBackdrop',
      grabZone: '.sheet-handle, .filter-panel-head',
      isActive: () => {
        const menu = document.getElementById('homeFilterDropdownMenu');
        return !!(menu && menu.parentElement === document.body && !menu.classList.contains('hidden'));
      }
    });
    ({ open: openHomeFilterDropdown, close: closeHomeFilterDropdown } = sheetState.wrap(openHomeFilterDropdown, closeHomeFilterDropdown, false));

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
