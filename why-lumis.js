/* =============================================================
   Why Lumis — Card 1 map spotlight
   Fetches images/why-lumis/world-map.svg (one inline SVG, every
   country its own <path id="country-XX">) and injects it into
   #whyLumisMap, then builds the dots and tooltip on top of it from
   LOCATIONS. Every 10s activeIndex advances and wraps: the outgoing
   country's amber overlay fades out, a fresh one fades in for the new
   country (cloning + animating opacity, not the base path's own fill,
   since not every browser tweens `fill` smoothly), the pulsing ring
   moves to the new dot, and the tooltip fades/drops out then — 150ms
   into the cycle, so the swap lands while it's nearly invisible —
   updates and fades/rises/scales back in.
   ============================================================= */
(function () {
  var mapEl = document.getElementById('whyLumisMap');
  if (!mapEl) return;

  var LOCATIONS = [
    { countryId: 'GL', label: 'Greenland',     count: '2,842 assessments',  x: 35.3, y: 19.0, anchor: 'right' },
    { countryId: 'NG', label: 'Nigeria',       count: '5,190 assessments',  x: 49.4, y: 65.7, anchor: 'right' },
    { countryId: 'BR', label: 'Brazil',        count: '7,614 assessments',  x: 31.9, y: 75.9, anchor: 'right' },
    { countryId: 'IN', label: 'India',         count: '9,328 assessments',  x: 70.0, y: 60.1, anchor: 'left'  },
    { countryId: 'ZA', label: 'South Africa',  count: '4,057 assessments',  x: 54.6, y: 85.5, anchor: 'left'  },
    { countryId: 'FR', label: 'France',        count: '3,215 assessments',  x: 47.7, y: 47.5, anchor: 'right' },
    { countryId: 'CN', label: 'China',         count: '11,472 assessments', x: 76.0, y: 52.3, anchor: 'left'  },
    { countryId: 'AU', label: 'Australia',     count: '1,986 assessments',  x: 84.8, y: 85.4, anchor: 'left'  },
    { countryId: 'MX', label: 'Mexico',        count: '6,340 assessments',  x: 18.5, y: 59.2, anchor: 'right' },
    { countryId: 'EG', label: 'Egypt',         count: '2,758 assessments',  x: 55.6, y: 57.8, anchor: 'left'  },
    { countryId: 'AR', label: 'Argentina',     count: '4,491 assessments',  x: 29.4, y: 88.1, anchor: 'right' },
    { countryId: 'TH', label: 'Thailand',      count: '3,902 assessments',  x: 75.3, y: 64.0, anchor: 'left'  }
  ];

  var CYCLE_MS = 10000;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var activeIndex = 0;
  var timer = null;
  var svgRoot = null;
  var dotEls = [];
  var tooltipEl = null;
  var tooltipTitleEl = null;
  var tooltipSubEl = null;
  var currentOverlay = null;

  fetch('images/why-lumis/world-map.svg')
    .then(function (res) { return res.text(); })
    .then(function (svgText) {
      mapEl.insertAdjacentHTML('afterbegin', svgText);
      svgRoot = mapEl.querySelector('.why-lumis__map-svg');
      buildDots();
      buildTooltip();
      showActive(activeIndex, true);
      if ('IntersectionObserver' in window) observeVisibility();
      else if (!reducedMotion) startTimer();
    })
    .catch(function () {
      // Nothing else to fall back to here — the <noscript> image only
      // reaches visitors with JS off, which this catch doesn't cover.
    });

  function buildDots() {
    var wrap = document.createElement('div');
    wrap.className = 'why-lumis__map-dots';
    LOCATIONS.forEach(function (loc, i) {
      var dot = makeDotEl(loc.x, loc.y);
      wrap.appendChild(dot);
      dotEls[i] = dot;
    });
    mapEl.appendChild(wrap);
  }

  function makeDotEl(x, y) {
    var dot = document.createElement('span');
    dot.className = 'why-lumis__map-dot';
    dot.style.left = x + '%';
    dot.style.top = y + '%';
    dot.innerHTML =
      '<span class="why-lumis__map-dot-ring" aria-hidden="true"></span>' +
      '<span class="why-lumis__map-dot-core" aria-hidden="true"></span>';
    return dot;
  }

  function buildTooltip() {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'why-lumis__map-tooltip';
    tooltipTitleEl = document.createElement('p');
    tooltipTitleEl.className = 'why-lumis__map-tooltip-title';
    tooltipSubEl = document.createElement('p');
    tooltipSubEl.className = 'why-lumis__map-tooltip-sub';
    tooltipEl.appendChild(tooltipTitleEl);
    tooltipEl.appendChild(tooltipSubEl);
    mapEl.appendChild(tooltipEl);
  }

  function positionTooltip(loc) {
    tooltipEl.classList.remove('why-lumis__map-tooltip--anchor-left', 'why-lumis__map-tooltip--anchor-right');
    if (loc.anchor === 'left') {
      tooltipEl.classList.add('why-lumis__map-tooltip--anchor-left');
      tooltipEl.style.left = 'auto';
      tooltipEl.style.right = (100 - loc.x) + '%';
    } else {
      tooltipEl.classList.add('why-lumis__map-tooltip--anchor-right');
      tooltipEl.style.right = 'auto';
      tooltipEl.style.left = loc.x + '%';
    }
    tooltipEl.style.top = loc.y + '%';
  }

  // Clones the country's base (always-grey) path, stacks it on top in
  // amber and fades its opacity in — animating a clone's opacity is
  // reliable everywhere, unlike tweening the base path's own fill.
  function spotlightCountry(countryId, immediate) {
    if (!svgRoot) return;
    var base = svgRoot.querySelector('#country-' + countryId);
    if (!base) return;
    var overlay = base.cloneNode(false);
    overlay.removeAttribute('id');
    overlay.classList.add('why-lumis__country-overlay');
    // Set fill/opacity/transition inline rather than leaning on the
    // stylesheet rule — a cloned SVG path picking up a *new* class's
    // rules is flaky in some engines, inline styles aren't.
    overlay.style.fill = 'var(--warning-500)';
    overlay.style.pointerEvents = 'none';
    overlay.style.opacity = '0';
    svgRoot.appendChild(overlay);
    if (immediate) {
      overlay.style.transition = 'none';
      overlay.style.opacity = '1';
    } else {
      overlay.style.transition = 'opacity 500ms cubic-bezier(0, 0, 0.2, 1)';
      // Wait a frame before setting the end state, so the transition
      // actually runs. Forcing it with getBoundingClientRect() would
      // work too, but that's a synchronous layout of the *whole*
      // 256-path SVG on every single step — this avoids that cost.
      requestAnimationFrame(function () {
        overlay.style.opacity = '1';
      });
    }
    currentOverlay = overlay;
  }

  function fadeOutOverlay(overlay) {
    if (!overlay) return;
    overlay.style.transition = 'opacity 400ms ease';
    overlay.style.opacity = '0';
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 400);
  }

  function showActive(index, immediate) {
    var loc = LOCATIONS[index];
    dotEls.forEach(function (dot, i) { dot.classList.toggle('is-active', i === index); });
    tooltipTitleEl.textContent = loc.label;
    tooltipSubEl.textContent = loc.count;
    positionTooltip(loc);
    spotlightCountry(loc.countryId, immediate);
  }

  function advance() {
    tooltipEl.classList.add('is-leaving');
    fadeOutOverlay(currentOverlay);

    setTimeout(function () {
      activeIndex = (activeIndex + 1) % LOCATIONS.length;
      showActive(activeIndex, false);

      // Reset the tooltip to its pre-enter state, then release it on
      // the next frame so the default transition animates it back in.
      tooltipEl.classList.remove('is-leaving');
      tooltipEl.classList.add('is-entering');
      void tooltipEl.offsetWidth; // force reflow
      tooltipEl.classList.remove('is-entering');
    }, 150);
  }

  function startTimer() {
    if (timer || reducedMotion) return;
    timer = setInterval(advance, CYCLE_MS);
  }

  function stopTimer() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function observeVisibility() {
    if (reducedMotion) return; // frozen on the first location — never starts
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) startTimer();
        else stopTimer();
      });
    }, { threshold: 0.2 });
    io.observe(mapEl);
  }
})();

/* =============================================================
   Why Lumis — Card 2 folder carousel
   Builds the track from ITEMS, duplicated twice, and centres
   activeIndex (starting on ITEMS[1] — the middle item, matching the
   original static layout's featured card) by measuring the container
   and item widths at runtime rather than assuming a fixed px value,
   so it centers correctly whatever width the fluid layout renders at.

   Step-and-dwell: every STEP_MS, activeIndex advances one item and
   the track slides to it (the CSS transition on .why-lumis__carousel-track
   provides the ~700ms ease-in-out); the newly-centred card's
   .is-active class drives its own reveal (see why-lumis.css). Once
   activeIndex would need a right neighbour past the end of the
   duplicated track, it's snapped back by ITEMS.length right after the
   slide finishes, transition disabled for that one frame — the
   content at the reset position is identical, so the jump isn't
   visible. Starting and snapping to index 1 (not 0) rather than the
   very edges keeps a real neighbour on both sides at every position
   this ever lands on, so there's no gap during the reset either.
   ============================================================= */
(function () {
  var carouselEl = document.getElementById('whyLumisCarousel');
  if (!carouselEl) return;

  var ITEMS = [
    { photo: 'images/why-lumis/tone-2.png', mst: 'MST VII', condition: 'Hyperpigmentation',
      alt: 'Close-up portrait used to represent MST VII skin tone.', age: 'Age 32' },
    { photo: 'images/why-lumis/tone-1.png', mst: 'MST V', condition: 'Rosacea',
      alt: 'Close-up portrait of a smiling woman with rosacea, age 47, used to represent MST V skin tone.', age: 'Age 47' },
    { photo: 'images/why-lumis/tone-3.png', mst: 'MST V', condition: 'Eczema',
      alt: 'Close-up portrait used to represent MST V skin tone.', age: 'Age 29' }
  ];

  var START_INDEX = 1;
  var STEP_MS = 3500;    // 700ms slide + 2.8s dwell
  var SLIDE_MS = 700;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var activeIndex = START_INDEX;
  var timer = null;
  var trackEl = null;
  var trackCards = [];

  buildTrack();
  updateTrackPosition(activeIndex, true);
  setActiveCard(activeIndex);
  if ('IntersectionObserver' in window) observeVisibility();
  else if (!reducedMotion) startTimer();

  window.addEventListener('resize', function () {
    updateTrackPosition(activeIndex, true);
  });

  function buildTrack() {
    trackEl = document.createElement('div');
    trackEl.className = 'why-lumis__carousel-track';
    ITEMS.concat(ITEMS).forEach(function (item) {
      var wrap = document.createElement('div');
      wrap.className = 'why-lumis__carousel-item';
      var card = document.createElement('div');
      card.className = 'why-lumis__carousel-card';
      card.innerHTML =
        '<div class="why-lumis__carousel-frame">' +
          '<img class="why-lumis__carousel-photo" src="' + item.photo + '" alt="' + item.alt + '">' +
          '<span class="why-lumis__carousel-mst">' + item.mst + '</span>' +
          '<div class="why-lumis__carousel-caption">' +
            '<p>' + item.condition + '</p>' +
            '<p>' + item.age + '</p>' +
          '</div>' +
        '</div>' +
        '<img class="why-lumis__carousel-cover" src="icons/why-lumis/photo-shelf.svg" alt="" aria-hidden="true">';
      wrap.appendChild(card);
      trackEl.appendChild(wrap);
      trackCards.push(card);
    });
    carouselEl.appendChild(trackEl);
  }

  function updateTrackPosition(index, instant) {
    var containerWidth = carouselEl.clientWidth;
    var itemRect = trackCards[0].parentNode.getBoundingClientRect();
    var gapPx = parseFloat(getComputedStyle(trackEl).columnGap) || 0;
    var step = itemRect.width + gapPx;
    var offset = containerWidth / 2 - itemRect.width / 2 - index * step;
    if (instant) trackEl.style.transition = 'none';
    trackEl.style.transform = 'translateX(' + offset + 'px)';
    if (instant) {
      void trackEl.offsetWidth; // force reflow so the instant jump actually applies before re-enabling transitions
      trackEl.style.transition = '';
    }
  }

  function setActiveCard(index) {
    trackCards.forEach(function (card, i) { card.classList.toggle('is-active', i === index); });
  }

  function step() {
    activeIndex += 1;
    updateTrackPosition(activeIndex, false);
    setActiveCard(activeIndex);

    if (activeIndex >= ITEMS.length + START_INDEX) {
      setTimeout(function () {
        activeIndex -= ITEMS.length;
        // Both the position jump AND the .is-active handoff between
        // these two (content-identical) cards need to be instant here.
        // Position alone isn't enough — left animated, the outgoing
        // card plays its full closing transition and the incoming one
        // replays its full entrance, which is very visible even though
        // the track itself doesn't appear to move.
        carouselEl.classList.add('why-lumis__carousel--snapping');
        updateTrackPosition(activeIndex, true);
        setActiveCard(activeIndex);
        void carouselEl.offsetWidth; // force reflow so the instant state actually applies
        carouselEl.classList.remove('why-lumis__carousel--snapping');
      }, SLIDE_MS);
    }
  }

  function startTimer() {
    if (timer || reducedMotion) return;
    timer = setInterval(step, STEP_MS);
  }

  function stopTimer() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function observeVisibility() {
    if (reducedMotion) return; // frozen on the first item — never starts
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) startTimer();
        else stopTimer();
      });
    }, { threshold: 0.2 });
    io.observe(carouselEl);
  }
})();
