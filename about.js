/* =============================================================
   About — scroll-driven, line-by-line text reveal
   Splits .about__body's paragraphs into per-word spans (leaving
   whitespace as plain text so wrapping is untouched), groups those
   words into visual lines by comparing offsetTop, then reveals lines
   one at a time — colour on plain words, the highlight box on any
   .hl phrase in that line — as a pure function of scroll position.
   No per-line thresholds, no setTimeout staggering: activeLineCount is
   recomputed from progress every scroll frame, so pausing mid-scroll
   freezes the reveal exactly where it is, and scrolling back up
   reverses it line by line, for free.
   ============================================================= */
(function () {
  var section = document.getElementById('about');
  if (!section) return;

  var frame = section.querySelector('.about__frame');
  var body = section.querySelector('.about__body');
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

  // ---------- Word-splitting ----------
  // Walks every text node under `body` (this naturally reaches inside
  // nested .hl spans too, since TreeWalker descends into child
  // elements) and replaces each with a run of alternating whitespace
  // text nodes and .word spans — whitespace stays as real text so the
  // browser's own line-wrapping is exactly as before.
  function wrapWords(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var textNodes = [];
    var node;
    while ((node = walker.nextNode())) textNodes.push(node);
    textNodes.forEach(function (textNode) {
      var text = textNode.nodeValue;
      if (!/\S/.test(text)) return; // whitespace-only node (e.g. between tags) — leave it alone
      var frag = document.createDocumentFragment();
      var re = /(\s+|\S+)/g;
      var m;
      while ((m = re.exec(text))) {
        var piece = m[0];
        if (/^\s+$/.test(piece)) {
          frag.appendChild(document.createTextNode(piece));
        } else {
          var span = document.createElement('span');
          span.className = 'word';
          span.textContent = piece;
          frag.appendChild(span);
        }
      }
      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  if (body) wrapWords(body);

  if (reducedMotion) {
    frame.style.setProperty('--about-progress', 1);
    if (body) {
      Array.prototype.slice.call(body.querySelectorAll('.word')).forEach(function (w) {
        if (!w.closest('.hl')) w.classList.add('is-active');
      });
      Array.prototype.slice.call(body.querySelectorAll('.hl')).forEach(function (hl) {
        hl.classList.add('is-active');
      });
    }
    return;
  }

  // ---------- Line grouping ----------
  // Consecutive words whose offsetTop matches (within a few px, to
  // absorb sub-pixel layout rounding) belong to the same visual line.
  // Recomputed on resize and once web fonts finish loading, since
  // either can change where lines actually break — never hardcoded.
  var lines = [];       // Array<Array<word element>>
  var lineHighlights = []; // Array<Array<.hl element>>, same indexing as lines

  function recomputeLines() {
    if (!body) { lines = []; lineHighlights = []; return; }
    var words = Array.prototype.slice.call(body.querySelectorAll('.word'));
    var newLines = [];
    var lastTop = null;
    words.forEach(function (w) {
      var top = Math.round(w.offsetTop);
      if (lastTop === null || Math.abs(top - lastTop) > 3) {
        newLines.push([]);
        lastTop = top;
      }
      newLines[newLines.length - 1].push(w);
    });
    lines = newLines;
    lineHighlights = lines.map(function (line) {
      var seen = [];
      line.forEach(function (w) {
        var hl = w.closest('.hl');
        if (hl && seen.indexOf(hl) === -1) seen.push(hl);
      });
      return seen;
    });
  }

  recomputeLines();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      recomputeLines();
      onScroll();
    });
  }

  var resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      recomputeLines();
      onScroll();
    }, 150);
  }

  // ---------- Reveal: activeLineCount is a pure function of progress ----------
  function applyLines(activeLineCount) {
    lines.forEach(function (line, i) {
      var isActive = i < activeLineCount;
      line.forEach(function (w) {
        if (!w.closest('.hl')) w.classList.toggle('is-active', isActive);
      });
    });
    lineHighlights.forEach(function (hls, i) {
      var isActive = i < activeLineCount;
      hls.forEach(function (hl) { hl.classList.toggle('is-active', isActive); });
    });
  }

  var ticking = false;

  function update() {
    ticking = false;

    // Photos: unchanged section-wide progress (0 when the section's top
    // reaches the viewport's bottom, 1 when the section's bottom does —
    // see the wide margin comment history in git log for why not
    // "bottom reaches the top": About is the last section on the page).
    var sectionRect = section.getBoundingClientRect();
    var vh = window.innerHeight;
    var sectionProgress = (vh - sectionRect.top) / sectionRect.height;
    frame.style.setProperty('--about-progress', Math.min(1, Math.max(0, sectionProgress)));

    // Text reveal: its own, tighter progress window scoped to the text
    // block itself (not the whole section) — 0 when the block's top
    // reaches 85% of viewport height (just below the fold), 1 when the
    // block's bottom reaches 45% of viewport height. That keeps the
    // reveal finishing while the block is still comfortably in view,
    // and works out to roughly one line per 45-60px of scroll.
    if (body && lines.length) {
      var bodyRect = body.getBoundingClientRect();
      var start = 0.85 * vh;
      var span = 0.4 * vh + bodyRect.height;
      var textProgress = (start - bodyRect.top) / span;
      textProgress = Math.min(1, Math.max(0, textProgress));
      applyLines(Math.ceil(textProgress * lines.length));
    }
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  update();
})();
