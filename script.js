/* =============================================================
   Portrait interactions
   1. Automatic skin scan — every 10–15s, sweep a thin glowing line
      across a random portrait (never the same one twice in a row),
      then hold 2–3 annotation markers on screen briefly before
      fading them away. Only one portrait ever animates at a time,
      and the whole cycle pauses while any portrait is hovered.
   2. Hover — lifting a portrait stops every other portrait's
      animation outright, re-runs its own scan, then slides its
      info card out once the markers are showing. Reversed on
      mouseleave, which also resumes the automatic cycle.
   ============================================================= */

(function () {
  const items = Array.from(document.querySelectorAll(".gallery__item"));
  if (items.length < 2) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const SCAN_INTERVAL_MIN = 10000;
  const SCAN_INTERVAL_MAX = 15000;
  const MARKER_HOLD = 2000;

  let hoveredItem = null;
  let autoScanTimer = null;
  let lastAutoIndex = -1;
  let interactionsDisabled = false; // true while the second hero state is opening/active

  /* ---------- Shared scan sweep ---------- */
  // Re-entrant: calling this again on the same portrait cancels
  // whatever sweep/markers it was mid-way through and starts fresh.
  function sweep(portrait, onDone) {
    const line = portrait.querySelector(".scan-line");

    if (line._onSweepEnd) {
      line.removeEventListener("animationend", line._onSweepEnd);
      line._onSweepEnd = null;
    }

    const isHorizontal = Math.random() < 0.5;
    line.classList.remove("is-horizontal", "is-vertical", "is-scanning");
    line.classList.add(isHorizontal ? "is-horizontal" : "is-vertical");

    // Force a reflow so the browser registers the class swap above
    // before the animation class is added on the next frame.
    void line.offsetWidth;

    requestAnimationFrame(() => {
      line.classList.add("is-scanning");
    });

    const handler = () => {
      line.removeEventListener("animationend", handler);
      line._onSweepEnd = null;
      line.classList.remove("is-scanning");
      if (onDone) onDone();
    };
    line._onSweepEnd = handler;
    line.addEventListener("animationend", handler);
  }

  function showMarkers(portrait) {
    portrait.querySelectorAll(".scan-marker").forEach((marker) => marker.classList.add("is-visible"));
  }

  function hideMarkers(portrait) {
    portrait.querySelectorAll(".scan-marker").forEach((marker) => marker.classList.remove("is-visible"));
  }

  function clearPendingHide(portrait) {
    if (portrait._hideTimer) {
      clearTimeout(portrait._hideTimer);
      portrait._hideTimer = null;
    }
  }

  // Fully halts whatever a portrait is doing: an in-progress sweep,
  // any pending marker auto-hide, and the markers themselves.
  function stopScan(item) {
    const portrait = item.querySelector(".portrait");
    const line = portrait.querySelector(".scan-line");

    if (line._onSweepEnd) {
      line.removeEventListener("animationend", line._onSweepEnd);
      line._onSweepEnd = null;
    }
    line.classList.remove("is-scanning");

    clearPendingHide(portrait);
    hideMarkers(portrait);
  }

  function stopAllExcept(exceptItem) {
    items.forEach((item) => {
      if (item !== exceptItem) stopScan(item);
    });
  }

  /* ---------- Automatic scan loop ---------- */
  function randomInterval() {
    return SCAN_INTERVAL_MIN + Math.random() * (SCAN_INTERVAL_MAX - SCAN_INTERVAL_MIN);
  }

  function pickAutoIndex() {
    let index;
    do {
      index = Math.floor(Math.random() * items.length);
    } while (index === lastAutoIndex);
    lastAutoIndex = index;
    return index;
  }

  function runAutoScan() {
    if (hoveredItem || interactionsDisabled) return; // paused for the duration of any hover

    const portrait = items[pickAutoIndex()].querySelector(".portrait");
    clearPendingHide(portrait);

    sweep(portrait, () => {
      showMarkers(portrait);
      portrait._hideTimer = setTimeout(() => {
        portrait._hideTimer = null;
        hideMarkers(portrait);
      }, MARKER_HOLD);
    });
  }

  function scheduleNextAutoScan() {
    autoScanTimer = setTimeout(() => {
      autoScanTimer = null;
      runAutoScan();
      scheduleNextAutoScan();
    }, randomInterval());
  }

  function pauseAutoScan() {
    if (autoScanTimer) {
      clearTimeout(autoScanTimer);
      autoScanTimer = null;
    }
  }

  if (!prefersReducedMotion) {
    scheduleNextAutoScan();
  }

  /* ---------- Hover: freeze everything else, re-scan, reveal, slide the card out ---------- */
  items.forEach((item) => {
    const portrait = item.querySelector(".portrait");

    item.addEventListener("mouseenter", () => {
      if (interactionsDisabled) return;
      hoveredItem = item;
      pauseAutoScan();
      stopAllExcept(item);
      item.classList.remove("is-card-visible");

      if (prefersReducedMotion) {
        showMarkers(portrait);
        item.classList.add("is-card-visible");
        return;
      }

      sweep(portrait, () => {
        if (hoveredItem !== item) return; // pointer already left
        showMarkers(portrait);
        item.classList.add("is-card-visible");
      });
    });

    item.addEventListener("mouseleave", () => {
      if (hoveredItem === item) hoveredItem = null;
      item.classList.remove("is-card-visible");
      clearPendingHide(portrait);
      hideMarkers(portrait);

      if (!hoveredItem && !prefersReducedMotion && !interactionsDisabled) {
        pauseAutoScan(); // guard against a stray double-schedule
        scheduleNextAutoScan();
      }
    });
  });

  // Coordinated with the second hero state (script.js, "Second hero state"):
  // while it's opening or open, every automatic/hover animation here freezes.
  document.addEventListener("lumis:analysis-opening", () => {
    interactionsDisabled = true;
    hoveredItem = null;
    pauseAutoScan();
    stopAllExcept(null);
  });

  document.addEventListener("lumis:analysis-closed", () => {
    interactionsDisabled = false;
    if (!prefersReducedMotion) scheduleNextAutoScan();
  });
})();

/* =============================================================
   Rotating pill
   Every 15s, the chip's word changes: its characters exit upward
   left-to-right, the next word's characters rise in behind them in
   the same left-to-right sequence, and only once that's settled
   does the pill's background/accent colour ease over to match.
   ============================================================= */

(function () {
  const chip = document.querySelector(".chip");
  if (!chip) return;

  const wordEl = chip.querySelector(".chip__word");
  if (!wordEl) return;

  // Figma "Frame 1011" (node 2030:6241) — word/theme pairs, in variant order.
  const WORDS = [
    { text: "Warmth", theme: "warmth" },
    { text: "Confidence", theme: "confidence" },
    { text: "Illuminate", theme: "illuminate" },
    { text: "Refined", theme: "refined" },
    { text: "Healing", theme: "healing" },
    { text: "Reviewed", theme: "reviewed" },
  ];

  const ROTATE_INTERVAL = 15000;
  const CHAR_STAGGER = 35;   // ms between each character's own start
  const CHAR_DURATION = 380; // ms — must match the .chip__char transition duration in CSS

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let index = 0;
  let rotateTimer = null;

  function buildChars(text) {
    wordEl.innerHTML = "";
    return [...text].map((ch) => {
      const span = document.createElement("span");
      span.className = "chip__char";
      span.textContent = ch === " " ? " " : ch;
      wordEl.appendChild(span);
      return span;
    });
  }

  // First word renders instantly — no animation on page load.
  buildChars(WORDS[0].text);
  chip.dataset.theme = WORDS[0].theme;

  if (prefersReducedMotion) {
    function rotateInstant() {
      index = (index + 1) % WORDS.length;
      const next = WORDS[index];
      buildChars(next.text);
      chip.dataset.theme = next.theme;
    }
    rotateTimer = setInterval(rotateInstant, ROTATE_INTERVAL);

    // Coordinated with the second hero state: pause/resume word rotation
    // while it's opening or open.
    document.addEventListener("lumis:analysis-opening", () => {
      clearInterval(rotateTimer);
      rotateTimer = null;
    });
    document.addEventListener("lumis:analysis-closed", () => {
      if (!rotateTimer) rotateTimer = setInterval(rotateInstant, ROTATE_INTERVAL);
    });
    return;
  }

  function rotate() {
    index = (index + 1) % WORDS.length;
    const next = WORDS[index];

    const outChars = [...wordEl.children];
    outChars.forEach((span, i) => {
      span.style.transitionDelay = `${i * CHAR_STAGGER}ms`;
      span.style.transform = "translateY(-100%)";
    });
    const exitTotal = (outChars.length - 1) * CHAR_STAGGER + CHAR_DURATION;

    setTimeout(() => {
      const inChars = buildChars(next.text);

      // Drop each new character below the line with no transition...
      inChars.forEach((span) => {
        span.classList.add("chip__char--jump");
        span.style.transform = "translateY(100%)";
      });
      void wordEl.offsetWidth; // ...then force a reflow before animating it in.

      inChars.forEach((span, i) => {
        span.classList.remove("chip__char--jump");
        span.style.transitionDelay = `${i * CHAR_STAGGER}ms`;
        span.style.transform = "translateY(0)";
      });

      const enterTotal = (inChars.length - 1) * CHAR_STAGGER + CHAR_DURATION;
      setTimeout(() => {
        chip.dataset.theme = next.theme;
      }, enterTotal);
    }, exitTotal);
  }

  rotateTimer = setInterval(rotate, ROTATE_INTERVAL);

  // Coordinated with the second hero state: pause/resume word rotation
  // while it's opening or open. An in-flight rotate() is left to finish
  // its own exit/enter animation rather than being cut off mid-way.
  document.addEventListener("lumis:analysis-opening", () => {
    clearInterval(rotateTimer);
    rotateTimer = null;
  });
  document.addEventListener("lumis:analysis-closed", () => {
    if (!rotateTimer) rotateTimer = setInterval(rotate, ROTATE_INTERVAL);
  });
})();

/* =============================================================
   Second hero state
   Clicking any portrait expands it into a full-screen analysis view
   (Figma "hero2", node 2144:11662), populated from the data below.
   Closes on the X button, the scrim, or Escape.
   ============================================================= */

(function () {
  const hero2 = document.getElementById("hero2");
  if (!hero2) return;

  const bg = document.getElementById("hero2Bg");
  const nameEl = document.getElementById("hero2Name");
  const skinTypeEl = document.getElementById("hero2SkinType");
  const statNameEl = document.getElementById("hero2StatName");
  const statValueEl = document.getElementById("hero2StatValue");
  const ageEl = document.getElementById("hero2Age");
  const dominantEl = document.getElementById("hero2Dominant");
  const confidenceEl = document.getElementById("hero2Confidence");
  const otherEl = document.getElementById("hero2Other");
  const markerEls = [0, 1, 2].map((i) => ({
    root: document.getElementById(`hero2Marker${i}`),
    label: document.getElementById(`hero2MarkerLabel${i}`),
  }));
  const severityBarEls = Array.from(document.querySelectorAll("#hero2Severity .hero2__severity-bar"));

  // Each portrait's already-established condition (from its hover card)
  // is the featured marker/stat; the other two extend that same finding
  // across nearby facial areas. Marker positions (mx/my) are percentages
  // of the 1512x982-proportioned .hero2__stage (see FRAME_W/FRAME_H and
  // the wide-screen media query) — both axes in %, so a marker tracks the
  // photo underneath at any screen size instead of drifting. Top-left's
  // are taken directly off Figma (node 2323:1495); the rest are the same
  // px-within-1512x982 positions the frame previously used, converted to
  // % (px / 982 for my; mx was already %). skinType uses Figma's own
  // fixed option vocabulary (node 2144:11662's skin-type dropdown,
  // "Frame 1010/Variant2").
  const PORTRAITS = {
    "top-left": {
      image: "images/woman_topleft.png",
      name: "Deborah Clark",
      age: "29 years old",
      skinType: "Olive skin",
      confidence: "98%",
      otherConditions: "HPI, dryness.....",
      objectPosition: "50% 42.26%",
      markers: [
        { label: "Acne Vulgaris", severity: "87% Severe", mx: "49.74%", my: "66.4%" },
        { label: "Hyper-pigmentation", mx: "26.46%", my: "43.9%" },
        { label: "Red Rashes", mx: "80.16%", my: "53.67%" },
      ],
    },
    "top-right": {
      image: "images/man_topright.png",
      name: "Marcuss Webb",
      age: "22 years old",
      skinType: "Milky white skin",
      confidence: "90%",
      otherConditions: "Infected acne, acne vulgaris",
      objectPosition: "50% 26%",
      markers: [
        { label: "Redness", severity: "88% Moderate", mx: "49.3%", my: "45.62%" },
        { label: "Infected Acne", mx: "37.2%", my: "64.66%" },
        { label: "Acne vulgaris", mx: "65.8%", my: "56.82%" },
      ],
    },
    "left": {
      image: "images/woman_middleleft.png",
      name: "Aisha Bello",
      age: "26 years old",
      skinType: "Deep brown skin",
      confidence: "95%",
      otherConditions: "Freckles, skin patches",
      objectPosition: "50% 30%",
      markers: [
        { label: "Hyper-pigmentation", severity: "90% Severe", mx: "81.9%", my: "56.21%" },
        { label: "Freckles", mx: "38.7%", my: "40.53%" },
        { label: "Skin Patches", mx: "47%", my: "67.92%" },
      ],
    },
    "right": {
      image: "images/woman_middleright.png",
      name: "Naledi Okafor",
      age: "24 years old",
      skinType: "Black skin",
      confidence: "97%",
      otherConditions: "Uneven skin, dry patches",
      objectPosition: "50% 22%",
      markers: [
        { label: "Flaky skin", severity: "98% Severe", mx: "59.1%", my: "40.02%" },
        { label: "Uneven skin", mx: "32.8%", my: "46.23%" },
        { label: "Dry Patches", mx: "52.6%", my: "72.81%" },
      ],
    },
    "bottom-left": {
      image: "images/woman_bottomleft.png",
      name: "Simone Tanya",
      age: "31 years old",
      skinType: "Brown Skin",
      confidence: "96%",
      otherConditions: "Acne, skin rashes",
      objectPosition: "50% 20%",
      markers: [
        { label: "Vitiligo", severity: "95% Severe", mx: "61.7%", my: "71.28%" },
        { label: "Acne", mx: "51.1%", my: "30.55%" },
        { label: "Skin Rashes", mx: "32.1%", my: "85.03%" },
      ],
    },
    "bottom-right": {
      image: "images/woman_bottomright.png",
      name: "Mei Tanaka",
      age: "27 years old",
      skinType: "Bronze skin",
      confidence: "93%",
      otherConditions: "Mild acne, uneven tone",
      objectPosition: "50% 60%",
      statLabel: "Pigmentation :",
      markers: [
        { label: "Pigmentation", severity: "87% Moderate", mx: "62%", my: "82.48%" },
        { label: "Mild Acne", mx: "44.6%", my: "27.7%" },
        { label: "Uneven tone", mx: "37.2%", my: "64.46%" },
      ],
    },
  };

  // Logical size of the Figma frame that mx/my/objectPosition are all
  // authored against (node 2144:11662). .hero2__stage keeps this exact
  // aspect ratio at every screen size, so these numbers never need to
  // change per-viewport — only the stage's on-screen scale does.
  const FRAME_W = 1512;
  const FRAME_H = 982;

  // Replaces object-fit:cover: computes the same "scale to cover, then
  // pan to objectPosition" crop by hand against the fixed FRAME_W/H, and
  // writes it as %-of-stage custom properties. Doing it this way (rather
  // than object-fit on an image sized relative to the viewport) is what
  // keeps the crop locked to the photo instead of drifting as the
  // viewport's aspect ratio changes.
  function applyBgGeometry(data) {
    const iw = bg.naturalWidth;
    const ih = bg.naturalHeight;
    if (!iw || !ih) return;

    const scale = Math.max(FRAME_W / iw, FRAME_H / ih);
    const scaledW = iw * scale;
    const scaledH = ih * scale;

    const [posXRaw, posYRaw] = (data.objectPosition || "50% 50%").split(" ");
    const posX = parseFloat(posXRaw) / 100;
    const posY = parseFloat(posYRaw) / 100;

    const left = -(scaledW - FRAME_W) * posX;
    const top = -(scaledH - FRAME_H) * posY;

    bg.style.setProperty("--bg-width", `${(scaledW / FRAME_W) * 100}%`);
    bg.style.setProperty("--bg-height", `${(scaledH / FRAME_H) * 100}%`);
    bg.style.setProperty("--bg-left", `${(left / FRAME_W) * 100}%`);
    bg.style.setProperty("--bg-top", `${(top / FRAME_H) * 100}%`);
  }

  const POSITION_CLASSES = Object.keys(PORTRAITS);

  function positionKeyFor(item) {
    return POSITION_CLASSES.find((key) => item.classList.contains(`gallery__item--${key}`));
  }

  function populate(data) {
    bg.style.objectPosition = data.objectPosition || "50% 50%"; // mobile fallback (object-fit:cover there)
    bg.onload = () => applyBgGeometry(data);
    bg.src = data.image;
    if (bg.complete) applyBgGeometry(data); // already-cached image: onload won't fire again
    nameEl.textContent = data.name;
    skinTypeEl.textContent = data.skinType;
    ageEl.textContent = data.age;
    confidenceEl.textContent = data.confidence;
    otherEl.textContent = data.otherConditions;

    const [primary, ...rest] = data.markers;
    statNameEl.textContent = data.statLabel || `${primary.label}:`;
    statValueEl.textContent = ` ${primary.severity}`;
    dominantEl.textContent = primary.label;

    [primary, ...rest].forEach((marker, i) => {
      const { root, label } = markerEls[i];
      root.style.setProperty("--mx", marker.mx);
      root.style.setProperty("--my", marker.my);
      label.textContent = marker.label;
    });
  }

  /* ---------- Dropdowns ---------- */
  const namePill = document.getElementById("hero2NamePill");
  const namePanel = document.getElementById("hero2NamePanel");
  const skinPill = document.getElementById("hero2SkinTypePill");
  const skinPanel = document.getElementById("hero2SkinPanel");
  const dropdowns = [
    { pill: namePill, panel: namePanel },
    { pill: skinPill, panel: skinPanel },
  ];

  function closeDropdowns() {
    dropdowns.forEach(({ pill, panel }) => {
      panel.hidden = true;
      pill.setAttribute("aria-expanded", "false");
    });
  }

  function anyDropdownOpen() {
    return dropdowns.some(({ panel }) => !panel.hidden);
  }

  dropdowns.forEach(({ pill, panel }) => {
    pill.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = !panel.hidden;
      closeDropdowns();
      if (!isOpen) {
        panel.hidden = false;
        pill.setAttribute("aria-expanded", "true");
      }
    });
  });

  skinPanel.querySelectorAll("button[data-value]").forEach((option) => {
    option.addEventListener("click", () => {
      skinTypeEl.textContent = option.dataset.value;
      closeDropdowns();
    });
  });

  hero2.addEventListener("click", (event) => {
    if (!event.target.closest(".hero2__dropdown")) closeDropdowns();
  });

  const heroFrame = document.querySelector(".hero2__frame");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const allGalleryItems = Array.from(document.querySelectorAll(".gallery__item"));
  const heroContent = document.querySelector(".hero");

  // ---------- State machine ----------
  // IDLE -> OPENING_ANALYSIS -> ANALYSIS_ACTIVE -> (close) -> IDLE.
  // While OPENING_ANALYSIS: no other portrait can be clicked (open() below
  // guards on this), and the automatic scan cycle, portrait hover, and the
  // pill's word rotation all freeze — see the "lumis:analysis-opening" /
  // "lumis:analysis-closed" listeners in the other two IIFEs above.
  let appState = "IDLE";

  const EXPAND_DURATION = 650;  // ms — the shared-element expansion itself

  // ---------- Shared-element entrance ----------
  // A clone of the clicked portrait grows from its grid position/size into
  // the full-screen photo in one continuous move — no press bounce
  // beforehand, no staggered delays. The five siblings and the central
  // hero copy start clearing out of the way at the exact same moment the
  // clone starts growing, and the page darkens beneath them, so everything
  // reads as a single unified motion rather than a sequence of separate
  // animations. The clone animates via `transform` alone (translate+scale)
  // rather than left/top/width/height, so it stays on the compositor and
  // never fights the browser's layout pass for a frame — that layout
  // contention was the source of the visible pause/catch-up. Only once
  // that clone lands does the real hero2 (already populated, sitting right
  // underneath) get revealed, and only then does its chrome fade in — so
  // the transition reads as "this photo unwrapped to fill the screen,"
  // never as "a new screen appeared over it."

  function flyToFullScreen(cardImg, data, onDone) {
    const startRect = cardImg.getBoundingClientRect();
    const startRadius = getComputedStyle(cardImg).borderRadius;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let targetLeft, targetTop, targetWidth, targetHeight;
    if (vw >= 940) {
      // Matches .hero2__bg's wide-screen geometry exactly: the ghost has
      // to land exactly where applyBgGeometry() will place the real
      // image, or the hand-off at the end of the animation visibly jumps.
      const stageScale = Math.max(vw / FRAME_W, vh / FRAME_H);
      const stageWidth = FRAME_W * stageScale;
      const stageHeight = FRAME_H * stageScale;
      const stageLeft = (vw - stageWidth) / 2;
      const stageTop = (vh - stageHeight) / 2;

      const iw = cardImg.naturalWidth || FRAME_W;
      const ih = cardImg.naturalHeight || FRAME_H;
      const imgScale = Math.max(FRAME_W / iw, FRAME_H / ih);
      const scaledW = iw * imgScale;
      const scaledH = ih * imgScale;
      const [posXRaw, posYRaw] = (data.objectPosition || "50% 50%").split(" ");
      const posX = parseFloat(posXRaw) / 100;
      const posY = parseFloat(posYRaw) / 100;
      const bgLeftLogical = -(scaledW - FRAME_W) * posX;
      const bgTopLogical = -(scaledH - FRAME_H) * posY;

      targetWidth = scaledW * stageScale;
      targetHeight = scaledH * stageScale;
      targetLeft = stageLeft + bgLeftLogical * stageScale;
      targetTop = stageTop + bgTopLogical * stageScale;
    } else {
      // Matches .hero2__bg's mobile sizing exactly (132% of viewport, centred).
      targetLeft = -0.16 * vw;
      targetTop = -0.16 * vh;
      targetWidth = 1.32 * vw;
      targetHeight = 1.32 * vh;
    }
    const scaleX = targetWidth / startRect.width;
    const scaleY = targetHeight / startRect.height;

    const ghost = document.createElement("img");
    ghost.src = cardImg.currentSrc || cardImg.src;
    ghost.alt = "";
    ghost.className = "hero2-ghost";
    ghost.style.left = "0";
    ghost.style.top = "0";
    ghost.style.width = `${startRect.width}px`;
    ghost.style.height = `${startRect.height}px`;
    ghost.style.borderRadius = startRadius;
    ghost.style.objectPosition = "50% 50%";
    ghost.style.transformOrigin = "0 0";
    ghost.style.transition = "none";
    ghost.style.transform = `translate3d(${startRect.left}px, ${startRect.top}px, 0) scale(1, 1)`;
    document.body.appendChild(ghost);

    void ghost.offsetWidth; // force layout so the transition below animates from this starting transform

    requestAnimationFrame(() => {
      const d = EXPAND_DURATION / 1000;
      // Fast, confident start that glides smoothly to a stop — no dead
      // zone at the top, no overshoot/bounce at the bottom. The premium
      // "unwrap" curve most high-end sites use for full-bleed reveals.
      const ease = "cubic-bezier(0.16, 1, 0.3, 1)";
      ghost.style.transition = `transform ${d}s ${ease}, border-radius ${d}s ${ease}, object-position ${d}s ${ease}`;
      ghost.style.transform = `translate3d(${targetLeft}px, ${targetTop}px, 0) scale(${scaleX}, ${scaleY})`;
      ghost.style.borderRadius = "0px";
      ghost.style.objectPosition = data.objectPosition || "50% 50%";
    });

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      ghost.remove();
      onDone();
    };
    ghost.addEventListener("transitionend", (event) => {
      if (event.propertyName === "transform") finish();
    });
    setTimeout(finish, EXPAND_DURATION + 150); // safety net if transitionend never fires
  }

  function open(item) {
    if (appState !== "IDLE") return; // one analysis transition at a time; blocks other portraits too

    const key = positionKeyFor(item);
    const data = PORTRAITS[key];
    if (!data) return;

    const activeIndex = POSITION_CLASSES.indexOf(key);
    const cardImg = item.querySelector(".card");
    const portraitEl = item.querySelector(".portrait");

    appState = "OPENING_ANALYSIS";
    document.dispatchEvent(new CustomEvent("lumis:analysis-opening"));

    function reveal() {
      populate(data);

      // The side nav bars track the open portrait's position, exactly like
      // the six per-portrait Figma frames (node 2323:1496): one bar lit
      // per portrait, in the same reading order used everywhere else.
      severityBarEls.forEach((bar, i) => {
        bar.classList.toggle("hero2__severity-bar--active", i === activeIndex);
      });

      closeDropdowns();

      if (prefersReducedMotion) {
        hero2.hidden = false;
      } else {
        heroFrame.style.transition = "none";
        heroFrame.style.opacity = "0";
        hero2.hidden = false;
        void heroFrame.offsetWidth;
        heroFrame.style.transition = "";
        heroFrame.style.opacity = "1";
      }

      document.body.style.overflow = "hidden";
      closeButton.focus();
      appState = "ANALYSIS_ACTIVE";
    }

    if (prefersReducedMotion || !cardImg || !portraitEl) {
      reveal();
      return;
    }

    // The other five portraits and the central hero copy clear out at the
    // exact same moment the clicked portrait starts growing, and the page
    // itself starts darkening beneath all of it right away — one unified
    // motion instead of a sequence of separately-timed animations.
    document.body.classList.add("is-opening-analysis");
    allGalleryItems.forEach((other) => {
      if (other !== item) other.classList.add("is-hidden-for-analysis");
    });
    if (heroContent) heroContent.classList.add("is-hidden-for-analysis");

    flyToFullScreen(cardImg, data, reveal);
  }

  function close() {
    hero2.hidden = true;
    document.body.style.overflow = "";
    document.body.classList.remove("is-opening-analysis");
    allGalleryItems.forEach((other) => other.classList.remove("is-hidden-for-analysis"));
    if (heroContent) heroContent.classList.remove("is-hidden-for-analysis");
    appState = "IDLE";
    document.dispatchEvent(new CustomEvent("lumis:analysis-closed"));
  }

  document.querySelectorAll(".gallery__item").forEach((item) => {
    const trigger = item.querySelector(".card");
    if (!trigger) return;
    trigger.addEventListener("click", () => open(item));
  });

  const closeButton = document.getElementById("hero2Close");
  closeButton.addEventListener("click", close);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || hero2.hidden) return;
    if (anyDropdownOpen()) {
      closeDropdowns();
    } else {
      close();
    }
  });
})();
