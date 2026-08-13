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
