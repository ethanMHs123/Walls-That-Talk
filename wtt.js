// Walls That Talk — Lottie motion
// 1. Timeline: "Line moving" is scrubbed by scroll, so the line draws stop by stop.
// 2. Tickets: "train" rolls across, the page changes while the screen is covered,
//    then the train finishes rolling out on the next page.

(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  function storage(fn) {
    try { return fn(window.sessionStorage); } catch (e) { return null; }
  }

  // ---------- Timeline ----------

  // Frames where the first stop appears and the line reaches the last one
  const LINE_START = 40;
  const LINE_END = 255;
  // First and last stop, in the animation's 1920×1080 coordinates
  const FIRST_STOP_Y = 35.5;
  const LAST_STOP_Y = 1011;

  const slot = document.querySelector('.wtt-timeline-anim');
  if (slot && window.lottie) {
    const line = lottie.loadAnimation({
      container: slot,
      renderer: 'svg',
      loop: false,
      autoplay: false,
      path: 'lottie/timeline.json',
    });

    let queued = false;
    function scrub() {
      queued = false;
      const box = slot.getBoundingClientRect();
      if (!box.height) return; // hidden on phones
      const scale = box.height / 1080;
      const first = box.top + FIRST_STOP_Y * scale;
      const last = box.top + LAST_STOP_Y * scale;
      // A stop lights up as it crosses 75% of the way down the screen
      const reading = window.innerHeight * 0.75;
      const progress = Math.min(1, Math.max(0, (reading - first) / (last - first)));
      line.goToAndStop(LINE_START + progress * (LINE_END - LINE_START), true);
    }
    function requestScrub() {
      if (!queued) { queued = true; requestAnimationFrame(scrub); }
    }

    // Keep text off the line: each timeline entry gets an invisible float whose
    // shape follows the drawn line, so its text wraps around the curve and dots.
    const GAP = 14; // px between the line's edge and the text
    function linePoints() {
      line.goToAndStop(LINE_END, true); // every stop and the whole line rendered
      const pts = [];
      slot.querySelectorAll('svg path').forEach((p) => {
        const m = p.getScreenCTM();
        let len = 0;
        try { len = p.getTotalLength(); } catch (e) { return; }
        const box = p.getBoundingClientRect();
        if (!m || !len || (!box.width && !box.height)) return;
        const width = parseFloat(getComputedStyle(p).strokeWidth) || 0;
        const half = (width * Math.hypot(m.a, m.b)) / 2;
        for (let i = 0; i <= len; i += 3) {
          const q = new DOMPoint(p.getPointAtLength(i).x, p.getPointAtLength(i).y).matrixTransform(m);
          pts.push([q.x + window.scrollX, q.y + window.scrollY, half]);
        }
      });
      return pts;
    }
    function wrapEntries() {
      document.querySelectorAll('.wtt-avoid').forEach((f) => f.remove());
      if (!slot.getBoundingClientRect().height) return; // phones: no line drawn
      const pts = linePoints();
      document.querySelectorAll('.wtt-event').forEach((entry) => {
        let float = null;
        // Wrapping changes the entry's height, so settle it over a few passes
        for (let pass = 0; pass < 4; pass++) {
          const r = entry.getBoundingClientRect();
          const top = r.top + window.scrollY;
          const left = r.left + window.scrollX;
          const near = pts.filter(([, y, h]) => y + h + GAP >= top && y - h - GAP <= top + r.height * 1.5);
          if (!near.length) break;
          const xs = near.map(([x]) => x).sort((a, b) => a - b);
          const fromLeft = xs[xs.length >> 1] < left + r.width / 2; // line on the entry's left side?
          const step = 6;
          const shape = [];
          let reach = 0;
          const span = r.height * 1.5; // room for the entry to grow as it wraps
          for (let y = 0; y <= span; y += step) {
            let edge = 0;
            near.forEach(([x, py, h]) => {
              if (Math.abs(py - (top + y)) > h + GAP) return;
              edge = Math.max(edge, fromLeft ? x + h + GAP - left : left + r.width - (x - h - GAP));
            });
            edge = Math.min(Math.max(edge, 0), r.width);
            reach = Math.max(reach, edge);
            shape.push([edge, y]);
          }
          if (!reach) break;
          if (!float) {
            float = document.createElement('span');
            float.className = 'wtt-avoid';
            float.setAttribute('aria-hidden', 'true');
            entry.insertBefore(float, entry.querySelector('h3'));
          }
          const h = shape[shape.length - 1][1];
          const poly = fromLeft
            ? ['0 0', ...shape.map(([e, y]) => `${e}px ${y}px`), `0 ${h}px`]
            : [`${reach}px 0`, ...shape.map(([e, y]) => `${reach - e}px ${y}px`), `${reach}px ${h}px`];
          Object.assign(float.style, {
            float: fromLeft ? 'left' : 'right',
            width: `${reach}px`,
            height: `${h}px`,
            shapeOutside: `polygon(${poly.join(',')})`,
          });
        }
      });
    }

    line.addEventListener('DOMLoaded', () => {
      let resizeTimer;
      const rewrap = () => {
        wrapEntries();
        if (reduceMotion) line.goToAndStop(LINE_END, true);
        else scrub();
      };
      rewrap();
      if (document.fonts) document.fonts.ready.then(rewrap);
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(rewrap, 150);
      });
      if (reduceMotion) return;
      window.addEventListener('scroll', requestScrub, { passive: true });
      window.addEventListener('resize', requestScrub);
    });
  }

  // ---------- Ticket transition ----------

  // The train fully covers the screen between these frames
  const COVERED_AT = 30;
  const REVEAL_FROM = 98;
  const GONE_AT = 130;

  function makeTrain() {
    const layer = document.createElement('div');
    layer.className = 'wtt-train';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    const anim = lottie.loadAnimation({
      container: layer,
      renderer: 'svg',
      loop: false,
      autoplay: false,
      path: 'lottie/train.json',
      rendererSettings: { preserveAspectRatio: 'xMidYMid slice' },
    });
    return { layer, anim };
  }

  const arriving = root.classList.contains('wtt-arriving');
  storage((s) => s.removeItem('wtt-arrive'));

  if (!window.lottie || reduceMotion) {
    root.classList.remove('wtt-arriving');
    return;
  }

  // Arriving from a ticket click: start covered, then roll the train out
  if (arriving) {
    const { layer, anim } = makeTrain();
    const reveal = () => root.classList.remove('wtt-arriving');
    const fallback = setTimeout(() => { reveal(); layer.remove(); }, 3000);
    anim.addEventListener('DOMLoaded', () => {
      anim.goToAndStop(REVEAL_FROM, true);
      reveal();
      anim.playSegments([REVEAL_FROM, GONE_AT], true);
    });
    anim.addEventListener('complete', () => { clearTimeout(fallback); layer.remove(); });
  }

  // Leaving: roll the train in, change page once it covers the screen
  let train = null;
  document.querySelectorAll('.wtt-tickets a').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      if (link.getAttribute('aria-current') === 'page') { event.preventDefault(); return; }
      event.preventDefault();
      if (train) return;

      const href = link.href;
      const go = () => {
        storage((s) => s.setItem('wtt-arrive', '1'));
        window.location.href = href;
      };
      train = makeTrain();
      const fallback = setTimeout(go, 2500);
      train.anim.addEventListener('DOMLoaded', () => train.anim.playSegments([0, COVERED_AT], true));
      train.anim.addEventListener('complete', () => { clearTimeout(fallback); go(); });
    });
  });

  // Coming back with the browser's back button shouldn't leave the train parked
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && train) { train.layer.remove(); train = null; }
  });
})();
