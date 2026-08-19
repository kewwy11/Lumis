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

/* =============================================================
   Why Lumis — Card 3 dermatologist chat loop
   Plays SCRIPT as a chat thread, one self-perpetuating setTimeout
   chain (playMessage → schedule → playMessage), rather than nested
   callbacks or a fixed-tick interval — each message's own dwell time
   depends on its text length, so a single interval can't drive it.

   Each bubble is one DOM node for its whole life (never replaced):
   it's created as a small typing pill (looping dots, sized via inline
   style so it can transition), dwells, then grows in place to the
   measured size of its full text — width/height/border-radius and the
   text's own opacity/position are all animated via inline styles set
   here, the same convention the map card above uses for its
   JS-triggered transitions.

   Bottom-anchored stack: new bubbles append at the bottom; already-
   mounted ones are FLIPped (capture old position, let layout do its
   thing, invert, then release into a transition) up to their new spot
   so the reflow reads as one smooth push rather than a snap. Past 3
   visible, the oldest gets an extra translateY(-24px)+fade on top of
   that same shift and is unmounted once it's done.
   ============================================================= */
(function () {
  var chatEl = document.getElementById('whyLumisChat');
  if (!chatEl) return;

  var SCRIPT = [
    { speaker: 'patient', text: '“Hi Dr. Theresa, I’ve had these patches for months and they are beginning to itch.”' },
    { speaker: 'derm', text: '“I can see the irritation around your cheeks. Let’s talk through what’s been happening.”' },
    { speaker: 'patient', text: '“It has been there but just this Monday, it starts to really itch and is turning red.”' },
    { speaker: 'derm', text: '“Try not to scratch it — I’ll put together a treatment plan for you shortly.”' }
  ];

  var MAX_VISIBLE = 3;
  var ENTER_MS = 380;              // pill entrance: translateY(20px→0) scale(.94→1) opacity 0→1
  var DOTS_FADE_MS = 120;          // typing dots fading out as the bubble starts growing
  var GROW_MS = 320;               // pill → full-size box (width/height/border-radius)
  var TEXT_FADE_DELAY_MS = 120;    // text fade-in starts partway into the grow…
  var TEXT_FADE_MS = 200;          // …and finishes exactly as the grow does (120 + 200 = 320)
  var HOLD_MS = 900;               // settled pause before the next message starts
  var SHIFT_MS = 400;              // stack push-up + outgoing bubble's exit, same bouncy easing
  var OUTGOING_TRANSLATE = -24;    // px, extra lift the aged-out bubble gets on top of the shift
  var LOOP_HOLD_MS = 1500;         // pause after the last message before the whole thread resets
  var LOOP_FADE_MS = 200;          // reset: each remaining bubble's own fade-out
  var LOOP_STAGGER_MS = 60;        // reset: stagger between each bubble's fade, bottom-to-top
  var BOUNCE_EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // One-time snapshot of the root font-size for sizing the pill in px —
  // it's a small transient state each message passes through for a few
  // hundred ms, so it doesn't need to track later responsive resizes.
  var rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  var PILL_WIDTH = 4.875 * rootFontSize;   // 78px
  var PILL_HEIGHT = 2.5 * rootFontSize;    // 40px

  var listEl = document.createElement('div');
  listEl.className = 'why-lumis__chat-list';
  chatEl.appendChild(listEl);

  var bubbles = [];   // mounted bubbles, oldest (topmost) first
  var running = false;
  var timer = null;

  if (reducedMotion) {
    renderStatic();
  } else if ('IntersectionObserver' in window) {
    observeVisibility();
  } else {
    start();
  }

  function clamp(min, val, max) {
    return Math.max(min, Math.min(max, val));
  }

  function renderStatic() {
    SCRIPT.slice(0, 2).forEach(function (msg) {
      var b = createBubble(msg);
      listEl.appendChild(b.el);
      b.dotsEl.style.display = 'none';
      b.textEl.style.opacity = '1';
      b.textEl.style.transform = 'none';
    });
  }

  function createBubble(msg) {
    var out = msg.speaker === 'patient';
    var el = document.createElement('div');
    el.className = 'why-lumis__chat-bubble why-lumis__chat-bubble--' + (out ? 'out' : 'in');

    var dots = document.createElement('span');
    dots.className = 'why-lumis__chat-dots';
    dots.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 3; i++) {
      dots.appendChild(document.createElement('span')).className = 'why-lumis__chat-dot';
    }

    var text = document.createElement('p');
    text.className = 'why-lumis__chat-text';
    text.textContent = msg.text;

    el.appendChild(dots);
    el.appendChild(text);
    return { el: el, dotsEl: dots, textEl: text, msg: msg };
  }

  // Renders a message's full-size bubble off-screen to read its natural
  // (wrapped, max-width-constrained) box size before animating the live
  // bubble to it.
  function measure(msg) {
    var clone = createBubble(msg);
    clone.el.classList.add('why-lumis__chat-measure');
    clone.el.removeChild(clone.dotsEl);
    clone.textEl.style.opacity = '1';
    document.body.appendChild(clone.el);
    var rect = clone.el.getBoundingClientRect();
    document.body.removeChild(clone.el);
    return { width: rect.width, height: rect.height };
  }

  function addMessage(msg) {
    var b = createBubble(msg);
    var existing = bubbles.slice();
    var firstTops = existing.map(function (bb) { return bb.el.getBoundingClientRect().top; });

    b.el.style.width = PILL_WIDTH + 'px';
    b.el.style.height = PILL_HEIGHT + 'px';
    b.el.style.borderRadius = '0.75rem';   // 12px, the pill's tighter radius — grown back to 15px in growBubble()
    listEl.appendChild(b.el);
    bubbles.push(b);

    var overflow = bubbles.length > MAX_VISIBLE ? bubbles.shift() : null;

    // Start state for this tick's animated elements, applied with
    // transitions off so the browser doesn't tween the *jump* itself.
    b.el.style.transition = 'none';
    b.el.style.opacity = '0';
    b.el.style.transform = 'translateY(1.25rem) scale(0.94)';   // 20px

    existing.forEach(function (bb, i) {
      if (bb === overflow) return;
      var delta = firstTops[i] - bb.el.getBoundingClientRect().top;
      bb.el.style.transition = 'none';
      bb.el.style.transform = delta ? 'translateY(' + delta + 'px)' : '';
    });

    if (overflow) overflow.el.style.transition = 'none';

    void listEl.offsetHeight; // force reflow so the instant start state above actually applies

    requestAnimationFrame(function () {
      b.el.style.transition = 'opacity ' + ENTER_MS + 'ms ' + BOUNCE_EASE + ', transform ' + ENTER_MS + 'ms ' + BOUNCE_EASE;
      b.el.style.opacity = '1';
      b.el.style.transform = 'translateY(0) scale(1)';

      existing.forEach(function (bb) {
        if (bb === overflow) return;
        bb.el.style.transition = 'transform ' + SHIFT_MS + 'ms ' + BOUNCE_EASE;
        bb.el.style.transform = 'translateY(0)';
      });

      if (overflow) {
        overflow.el.style.transition = 'transform ' + SHIFT_MS + 'ms ' + BOUNCE_EASE + ', opacity ' + SHIFT_MS + 'ms ease';
        overflow.el.style.transform = 'translateY(' + OUTGOING_TRANSLATE + 'px)';
        overflow.el.style.opacity = '0';
        setTimeout(function () {
          if (overflow.el.parentNode) overflow.el.parentNode.removeChild(overflow.el);
        }, SHIFT_MS);
      }
    });

    return b;
  }

  function growBubble(b, cb) {
    var target = measure(b.msg);

    // Text gets its final wrapped width immediately (invisibly, still
    // opacity 0) so it doesn't re-wrap live while the box grows around
    // it — only the outer bubble's box animates.
    b.textEl.style.width = target.width + 'px';

    b.dotsEl.style.transition = 'opacity ' + DOTS_FADE_MS + 'ms ease';
    b.dotsEl.style.opacity = '0';

    b.el.style.transition =
      'width ' + GROW_MS + 'ms ' + BOUNCE_EASE + ', ' +
      'height ' + GROW_MS + 'ms ' + BOUNCE_EASE + ', ' +
      'border-radius ' + GROW_MS + 'ms ease';
    requestAnimationFrame(function () {
      b.el.style.width = target.width + 'px';
      b.el.style.height = target.height + 'px';
      b.el.style.borderRadius = '0.9375rem';   // 15px
    });

    setTimeout(function () {
      b.textEl.style.transition = 'opacity ' + TEXT_FADE_MS + 'ms ease, transform ' + TEXT_FADE_MS + 'ms ease';
      b.textEl.style.opacity = '1';
      b.textEl.style.transform = 'translateY(0)';
    }, TEXT_FADE_DELAY_MS);

    setTimeout(function () {
      b.dotsEl.style.display = 'none';
      // Settled: hand sizing back to the box's own natural (content +
      // max-width) size instead of the measured snapshot, so it's not
      // stuck at whatever width the viewport happened to be mid-grow.
      b.el.style.width = '';
      b.el.style.height = '';
      b.el.style.borderRadius = '';
      cb();
    }, GROW_MS);
  }

  function playMessage(index) {
    if (!running) return;
    var msg = SCRIPT[index];
    var b = addMessage(msg);

    schedule(ENTER_MS, function () {
      var dwell = clamp(900, msg.text.length * 22, 2200);
      schedule(dwell, function () {
        growBubble(b, function () {
          if (!running) return;
          var isLast = index === SCRIPT.length - 1;
          if (isLast) {
            schedule(LOOP_HOLD_MS, loopReset);
          } else {
            schedule(HOLD_MS, function () { playMessage(index + 1); });
          }
        });
      });
    });
  }

  function loopReset() {
    if (!running) return;
    var current = bubbles.slice();
    var n = current.length;
    current.forEach(function (b, i) {
      var delay = (n - 1 - i) * LOOP_STAGGER_MS;   // bottom (last) bubble fades first
      setTimeout(function () {
        b.el.style.transition = 'opacity ' + LOOP_FADE_MS + 'ms ease';
        b.el.style.opacity = '0';
      }, delay);
    });
    schedule(LOOP_FADE_MS + (n - 1) * LOOP_STAGGER_MS, function () {
      resetAll();
      playMessage(0);
    });
  }

  function schedule(ms, fn) {
    timer = setTimeout(function () {
      timer = null;
      fn();
    }, ms);
  }

  function resetAll() {
    if (timer) { clearTimeout(timer); timer = null; }
    listEl.innerHTML = '';
    bubbles = [];
  }

  function start() {
    if (running) return;
    running = true;
    resetAll();
    playMessage(0);
  }

  function stop() {
    running = false;
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function observeVisibility() {
    if (reducedMotion) return; // frozen on the first two messages — never starts
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) start();
        else stop();
      });
    }, { threshold: 0.2 });
    io.observe(chatEl);
  }
})();
