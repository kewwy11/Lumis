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
    if (hoveredItem) return; // paused for the duration of any hover

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

      if (!hoveredItem && !prefersReducedMotion) {
        pauseAutoScan(); // guard against a stray double-schedule
        scheduleNextAutoScan();
      }
    });
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
    setInterval(() => {
      index = (index + 1) % WORDS.length;
      const next = WORDS[index];
      buildChars(next.text);
      chip.dataset.theme = next.theme;
    }, ROTATE_INTERVAL);
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

  setInterval(rotate, ROTATE_INTERVAL);
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

  // Each portrait's already-established condition (from its hover card)
  // is the featured marker/stat; the other two extend that same finding
  // across nearby facial areas. Marker positions are plain px within the
  // fixed 1512x982 frame (see the wide-screen media query), tuned per
  // photo's crop. skinType uses Figma's own fixed option vocabulary
  // (node 2144:11662's skin-type dropdown, "Frame 1010/Variant2").
  const PORTRAITS = {
    "top-left": {
      image: "images/woman_topleft.png",
      name: "Deborah Clark",
      age: "29 years old",
      skinType: "Olive skin",
      confidence: "98%",
      otherConditions: "HPI, dryness.....",
      objectPosition: "50% 42%",
      markers: [
        { label: "Acne Vulgaris", severity: "87% Severe", mx: "49.7%", my: "652px" },
        { label: "Hyper-pigmentation", mx: "26.5%", my: "430px" },
        { label: "Red Rashes", mx: "80.2%", my: "526px" },
      ],
    },
    "top-right": {
      image: "images/man_topright.png",
      name: "Marcus Webb",
      age: "22 years old",
      skinType: "Milky white skin",
      confidence: "90%",
      otherConditions: "Enlarged pores, oiliness",
      objectPosition: "50% 26%",
      markers: [
        { label: "Redness", severity: "88% Moderate", mx: "36%", my: "580px" },
        { label: "Acne Vulgaris", mx: "65%", my: "560px" },
        { label: "Enlarged Pores", mx: "51%", my: "615px" },
      ],
    },
    "left": {
      image: "images/woman_middleleft.png",
      name: "Aisha Bello",
      age: "26 years old",
      skinType: "Deep brown skin",
      confidence: "95%",
      otherConditions: "Freckles, dark spots",
      objectPosition: "50% 30%",
      markers: [
        { label: "Hyperpigmentation", severity: "93% Severe", mx: "30%", my: "506px" },
        { label: "Freckles", mx: "34%", my: "260px" },
        { label: "Dark Spots", mx: "28%", my: "753px" },
      ],
    },
    "right": {
      image: "images/woman_middleright.png",
      name: "Naledi Okafor",
      age: "24 years old",
      skinType: "Black Skin",
      confidence: "97%",
      otherConditions: "Smooth texture",
      objectPosition: "50% 22%",
      markers: [
        { label: "Even Tone", severity: "96% Balanced", mx: "48%", my: "440px" },
        { label: "Smooth Texture", mx: "35%", my: "320px" },
        { label: "Balanced Hydration", mx: "60%", my: "544px" },
      ],
    },
    "bottom-left": {
      image: "images/woman_bottomleft.png",
      name: "Simone Carter",
      age: "31 years old",
      skinType: "Dark Skin",
      confidence: "96%",
      otherConditions: "Dry patches, sun sensitivity",
      objectPosition: "50% 20%",
      markers: [
        { label: "Vitiligo", severity: "94% Widespread", mx: "55%", my: "245px" },
        { label: "Dry Patches", mx: "39%", my: "405px" },
        { label: "Sun Sensitivity", mx: "70%", my: "636px" },
      ],
    },
    "bottom-right": {
      image: "images/woman_bottomright.png",
      name: "Mei Tanaka",
      age: "27 years old",
      skinType: "Bronze skin",
      confidence: "93%",
      otherConditions: "Uneven tone, sun damage",
      objectPosition: "50% 60%",
      markers: [
        { label: "Pigmentation", severity: "90% Moderate", mx: "54%", my: "550px" },
        { label: "Uneven Tone", mx: "42%", my: "795px" },
        { label: "Sun Damage", mx: "66%", my: "579px" },
      ],
    },
  };

  const POSITION_CLASSES = Object.keys(PORTRAITS);

  function positionKeyFor(item) {
    return POSITION_CLASSES.find((key) => item.classList.contains(`gallery__item--${key}`));
  }

  function populate(data) {
    bg.src = data.image;
    bg.style.objectPosition = data.objectPosition || "50% 50%";
    nameEl.textContent = data.name;
    skinTypeEl.textContent = data.skinType;
    ageEl.textContent = data.age;
    confidenceEl.textContent = data.confidence;
    otherEl.textContent = data.otherConditions;

    const [primary, ...rest] = data.markers;
    statNameEl.textContent = `${primary.label}:`;
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

  function open(item) {
    const key = positionKeyFor(item);
    const data = PORTRAITS[key];
    if (!data) return;

    populate(data);
    closeDropdowns();
    hero2.hidden = false;
    document.body.style.overflow = "hidden";
    closeButton.focus();
  }

  function close() {
    hero2.hidden = true;
    document.body.style.overflow = "";
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
