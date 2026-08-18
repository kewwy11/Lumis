/* =============================================================
   About — scroll-driven activation
   Cumulative reveal: as the section scrolls through the viewport, each
   paragraph (and the final statement) crosses a fixed progress
   threshold and gains `.is-active`, which about.css turns into a
   colour fade + highlight-phrase reveal. Reversible going up (scrolling
   back above a threshold drops that stage immediately), but — unlike a
   plain threshold toggle — advancing is paced one stage at a time (see
   STAGE_GAP below), so a fast scroll that crosses several thresholds at
   once still reveals them in sequence rather than all snapping on
   together.
   ============================================================= */
(function () {
  var section = document.getElementById('about');
  if (!section) return;

  var frame = section.querySelector('.about__frame');
  var stages = Array.prototype.slice.call(section.querySelectorAll('.about__lead'));
  var thresholds = [0.2, 0.4, 0.6, 0.8];
  var photos = Array.prototype.slice.call(section.querySelectorAll('.about__photo'));
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Photo entrance wobble (one-shot, per photo) ----------
  // Fires the moment *that* photo enters the viewport — not a shared
  // section-wide scroll threshold, since the two photos sit at very
  // different depths inside the frame.
  if (!reducedMotion && 'IntersectionObserver' in window) {
    var entranceIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        entranceIO.unobserve(entry.target);
      });
    }, { threshold: 0.2 });
    photos.forEach(function (p) { entranceIO.observe(p); });
  } else {
    photos.forEach(function (p) { p.classList.add('is-in'); });
  }

  // ---------- Photo idle wiggle ----------
  // Every 5s, only while some part of the section is on screen — the
  // interval is created when the section starts intersecting and torn
  // down the moment it isn't, so nothing keeps ticking after the user
  // scrolls away.
  if (!reducedMotion && 'IntersectionObserver' in window) {
    var wiggleTimer = null;
    var wiggle = function () {
      photos.forEach(function (p) {
        p.classList.remove('is-wiggling');
        void p.offsetWidth; // force reflow so re-adding the class restarts the animation even if it's already present
        p.classList.add('is-wiggling');
      });
    };
    var wiggleIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          if (!wiggleTimer) wiggleTimer = setInterval(wiggle, 5000);
        } else if (wiggleTimer) {
          clearInterval(wiggleTimer);
          wiggleTimer = null;
        }
      });
    }, { threshold: 0.1 });
    wiggleIO.observe(section);
  }

  if (reducedMotion) {
    frame.style.setProperty('--about-progress', 1);
    stages.forEach(function (s) { s.classList.add('is-active'); });
    return;
  }

  // ---------- Paragraph reveal ----------
  // `targetCount` is however many stages the current scroll position
  // qualifies for; `revealed` only ever advances one at a time, paced by
  // STAGE_GAP, so a reader who scrolls straight past every threshold
  // still watches paragraph 1 darken-then-highlight, then paragraph 2,
  // then 3, then the final line — never several at once. Retreating
  // (scroll up) drops `revealed` to the new, lower target immediately —
  // no stagger needed on the way back down.
  var STAGE_GAP = 2600; // one paragraph's full sequence: colour fade (450ms) + pre-highlight pause (2000ms, see .hl's transition-delay in about.css) + highlight grow (550ms), plus a small buffer
  var revealed = 0;
  var targetCount = 0;
  var advanceTimer = null;

  function setActiveCount(n) {
    for (var i = 0; i < stages.length; i++) {
      stages[i].classList.toggle('is-active', i < n);
    }
  }

  function tryAdvance() {
    if (advanceTimer || revealed >= targetCount) return;
    revealed += 1;
    setActiveCount(revealed);
    advanceTimer = setTimeout(function () {
      advanceTimer = null;
      tryAdvance(); // keep advancing if the target has moved further ahead since
    }, STAGE_GAP);
  }

  function apply(progress) {
    frame.style.setProperty('--about-progress', progress);
    var count = 0;
    for (var i = 0; i < thresholds.length; i++) {
      if (progress >= thresholds[i]) count++;
    }
    targetCount = count;
    if (targetCount < revealed) {
      revealed = targetCount;
      setActiveCount(revealed);
      if (advanceTimer) {
        clearTimeout(advanceTimer);
        advanceTimer = null;
      }
    } else {
      tryAdvance();
    }
  }

  var ticking = false;

  function update() {
    ticking = false;
    var rect = section.getBoundingClientRect();
    var vh = window.innerHeight;
    // 0 when the section's top reaches the viewport's bottom (just entering),
    // 1 when the section's *bottom* reaches the viewport's bottom. Deliberately
    // not "bottom reaches the top" (which would need a full extra viewport of
    // scroll past that point) — About is the last section on the page, so
    // there's no document left below it to supply that scroll distance, and
    // progress would never reach 1.
    var progress = (vh - rect.top) / rect.height;
    apply(Math.min(1, Math.max(0, progress)));
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();
