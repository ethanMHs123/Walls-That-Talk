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

    line.addEventListener('DOMLoaded', () => {
      if (reduceMotion) {
        line.goToAndStop(LINE_END, true);
        return;
      }
      scrub();
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
