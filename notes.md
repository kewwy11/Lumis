# Lumis — build notes

Static HTML/CSS/JS marketing site for Lumis (skincare-analysis brand). No
build step, no framework. Figma is the visual source of truth throughout —
every layout, spacing, and content decision traces back to a Figma node.

## Structure

- `index.html` — all markup (hero1 + hero2, both always in the DOM)
- `style.css` — all styles
- `script.js` — three independent, self-invoking IIFEs (see below)
- `images/`, `icons/` — assets, organized by portrait position / icon name

## Hero 1 — landing hero

Nav, headline, subtitle, two download CTAs, and a ring of 6 portraits
(top-left/top-right/left/right/bottom-left/bottom-right).

- **Responsive system**: mobile flows normally; `@media (min-width: 940px)`
  switches to an absolutely-positioned "Figma ring" layout scaled by
  `html { font-size: clamp(10px, 1.0582vw, 16px) }` (16px = 1512px frame width) —
  this only ever accounts for viewport *width*, unlike hero2 (below).
- **Ring spacing** (wide layout): 48px margin above the top row, 32px
  below the bottom row, 64px gap between each of the 3 stacked portraits
  per side. `.stage`'s own height (934px) is *derived* from that — unlike
  hero2's frame, it isn't pinned to the 982px Figma artboard height, since
  48+242+64+242+64+242+32 doesn't sum to 982 (there's no portrait-size
  change on record that would make it), so the stage was sized to fit the
  spacing exactly rather than the other way around.
- **Nav sized to match hero2's**: `.nav` is plain px (box *and* every
  descendant — logo mark, toggle button, its bars) plus its own
  `transform: scale(min(1, vw/1512, vh/982))` in the wide-layout query,
  deliberately duplicating `.hero2__frame`'s exact formula so the two navs
  render at the identical size on any viewport. Without this, hero1's nav
  only ever shrank for width (the root font-size clamp above), so on a
  short/wide window — where hero2 *also* shrinks for height, since it can
  never scroll — hero1's nav stayed visibly larger. Fixing this surfaced a
  real bug on the hero2 side too: `.hero2__logo img` and
  `.hero2__close-bars` were still in rem, so under `.hero2__frame`'s
  transform they were shrinking *twice* (once via rem/root-font-size, once
  via the frame's own scale) — landing smaller than the pill/button around
  them. Converted to px like the rest of that frame already was.
- **Portrait entrance**: staggered fade+rise on page load, eased with a
  gentle overshoot (`cubic-bezier(0.34, 1.56, 0.64, 1)`), cascading in
  100ms apart (was 600ms), each one taking 1.5s to settle (was 0.8s) — the
  fast stagger against the slower individual duration means several are
  mid-animation at once rather than one at a time.
- **Automatic skin-scan**: every 10–15s, a glowing sweep line crosses a
  random portrait (never the same one twice), then holds 2–3 annotation
  markers for 2s before fading. Only one portrait animates at a time.
- **Hover interaction**: lifts the portrait, stops every other portrait's
  animation, re-runs its own scan, then slides an info card out — direction
  (left/right) is fixed per position, not "toward center." The card's "View
  analysis" link opens that same portrait's hero2 (same `open(item)` the
  `.card` image itself uses) — no longer `aria-hidden` now that it's a real
  control, not just decorative.
- **Rotating pill**: chip text cycles through 6 Figma-exact words/colors
  every 15s, with a per-character vertical "roll" (Framer-style), staggered
  left-to-right on exit and entry.
- **Button hover**: CTA labels roll vertically on hover (`.button__label`/
  `-track`/`-text`, two stacked copies of the label sliding up one line —
  see the comment beside `.button__label` in style.css). hero2's own
  "Get started" CTA reuses these exact classes rather than its own copy,
  so `.hero2__cta:hover` triggers the identical roll.
- All animated features respect `prefers-reduced-motion`.

## Hero 2 — full-screen analysis view

Opened by clicking any portrait. Fixed 1512×982px canvas, scaled via
`transform: scale(min(1, 100vw/1512px, 100vh/982px))` so it always fits the
viewport with **no scrolling**, independent of hero1's rem/clamp system.

- Full-screen photo background (`object-fit: cover`, per-portrait
  `object-position` so the face doesn't jump), dark scrim, nav with white
  logo variant, close button, "Get started" CTA. Nav and CTA sit 48px from
  the frame's top edge, the footer row 32px from the bottom — unlike
  hero1, the 982px frame itself is untouched here; only those two rows'
  offsets changed.
- 3 annotation markers per portrait, positioned in plain px within the fixed
  frame — one "featured" condition (matching the hover-card data) plus two
  more extending the same finding across nearby facial areas.
- Bottom row: name dropdown (age, dominant condition, confidence, other
  conditions), skin-type dropdown (6-option list), and a condition/severity
  stat — evenly spaced (`justify-content: space-between; padding: 0 80px`).
  Both dropdown panels open with a combined `scaleY` grow + `clip-path:
  inset()` wipe (bottom-to-top, `transform-origin: bottom center`) so the
  content reads as emerging up out of the pill, not just fading in above
  it — the clip starts collapsed to a zero-height sliver right at the
  pill's edge and wipes open in step with the scale.
- 6-bar side nav that tracks which portrait is open, synced to reading
  order (top-left → top-right → left → right → bottom-left → bottom-right)
  — and doubles as a jump-to-portrait control: clicking a bar calls the
  same `switchPerson()` the skin-type dropdown uses, so it's the same
  single crossfade (no stagger, no bounce). The logo button does the same
  as the X (`close()`) — back to hero1.
- All content (names, ages, skin types, confidence %, marker positions) is
  real, per-portrait data for all 6 people (Deborah, Marcus, Aisha, Naledi,
  Simone, Mei), pixel-verified against exported Figma reference screenshots.

### Shared-element entrance transition (most recent work)

Clicking a portrait doesn't just reveal hero2 — the clicked portrait's
image physically grows into the full-screen photo, styled after React/
Framer Motion's `layoutId` shared-layout pattern, hand-rolled as a manual
FLIP (First-Last-Invert-Play) since this is vanilla JS.

Sequence, all timed from a single click timestamp (not chained/sequential):

1. **Click** → internal state machine moves `IDLE → OPENING_ANALYSIS`.
   Dispatches a `lumis:analysis-opening` custom event that the scan/hover
   IIFE and the pill-rotation IIFE listen for, so both freeze immediately
   (auto-scan stops, hover is disabled, pill stops cycling words). The
   state guard also blocks clicking any other portrait, or re-triggering,
   until the transition finishes.
2. **0–150ms**: clicked portrait does a small "press" acknowledgment
   (`translateY(-4px) scale(1.01)`).
3. **~120ms**: the other 5 portraits fade + settle down 8px (400ms,
   ease-out).
4. **~150ms**: the central hero content (pill, headline, subtitle, CTAs)
   fades + lifts -12px as one unit (380ms, ease-out).
5. **~0–500ms**: the page background itself gradually shifts white → dark
   (`body.is-opening-analysis`), so the environment darkens underneath the
   fading elements rather than snapping.
6. **~150–850ms**: a cloned `<img>` ("ghost") of the clicked portrait grows
   from its exact grid position/size to full-screen (`cubic-bezier(0.22, 1,
   0.36, 1)`, 700ms), with border-radius and `object-position` animating
   together with the size so the crop stays consistent throughout.
7. **~850ms+**: once the ghost lands, the real (already-populated) hero2 is
   revealed underneath and its chrome fades in (~350ms) → state becomes
   `ANALYSIS_ACTIVE`.

Closing reverses all of it for free — removing the same CSS classes
(`is-opening-analysis`, `is-hidden-for-analysis`) re-triggers the same
transitions in reverse, and a `lumis:analysis-closed` event resumes the
auto-scan and pill rotation.

Cross-module coordination is done via `document.dispatchEvent(new
CustomEvent(...))` rather than a shared global, keeping the three IIFEs
decoupled.

### Skin switch (picking a different skin type re-targets the whole person)

Choosing an option in the skin-type dropdown doesn't just relabel the pill —
it switches the full analysis to whichever of the six people that skin type
maps to (`SKIN_OPTION_TO_KEY` in script.js; two of the six options don't
share exact wording with any portrait's own `skinType`, so the map is
explicit rather than derived). Sequence, once the dropdown itself has
finished closing:

1. **Annotations fade out** (250ms) — the currently-showing markers'
   label/connector opacity 1→0, ring opacity 1→0 + scale→0.8. Since the
   reveal-in is a forwards-filled CSS keyframe animation, a plain class
   removal would just snap it away, so the current computed opacity/
   transform is captured to an inline style first and *that* is what
   transitions out.
2. **Photo crossfades** (500ms) — `hero2__bg-frame` (a wrapper around
   `hero2__bg` added solely for this) lets the crossfade scale/fade
   independent of `hero2__bg`'s own cover-fit crop math. The outgoing
   photo is a cloned snapshot of the wrapper ("ghost"); the incoming one
   is the real wrapper, starting at scale(1.015)/opacity 0 and easing to
   scale(1)/opacity 1.
3. **~100ms pause**, then the same `runScan()` used on first open runs
   again for the new person.

Rapid re-selection (latest wins, never stacks): every step is gated behind
comparing its captured `token` to the current `switchToken`, which every
new `switchPerson()` call bumps — a superseded call's remaining steps just
stop advancing instead of finishing alongside the call that outran it.
Verified via browser automation (see quirks below — the mid-flight
cancellation case only visibly resolves once something forces a paint).

## Partners strip

A continuous, edge-fading horizontal marquee of partner logos sitting below
hero1 — "entering and coming out of a portal," per the Figma reference
(node `2323:1094`) and a local mockup screenshot. Its own file
(`partners.css`, linked after `style.css`), per the "split as you go"
convention for new sections — no JS needed, it's pure CSS.

- **Heading**: "Lumis Partners", plain centered label (`--grey-400`, 20px,
  normal weight/line-height — same recipe as `.hero__subtitle`). Figma
  originally specced a blue "Our Partners" pill badge for this section;
  when the design was later updated, the pill was dropped in favor of this
  plain label, so `.partners__badge`/`.partners__badge-dot` were replaced
  by `.partners__heading` rather than kept alongside it.
- **Logos**: Nvidia, Pfizer, Google, CeraVe, Stanford Medicine,
  La Roche-Posay (this order, per the updated Figma) — sized to each
  logo's Figma-specified box rather than its raw SVG intrinsic size, via
  the `width`/`height` HTML attributes on each `<img>` (Nvidia 128×128,
  Pfizer 126×52, Google 122×122, CeraVe 142×50, Stanford 335×78.5,
  La Roche-Posay 157×64) — sourced from `icons/`.
- **Loop mechanism**: two identical `<ul>` tracks placed side by side
  (`.partners__marquee`, `width: max-content`), animated as one unit via
  `translateX(0 → -50%)`. Since the tracks are equal width, -50% of the
  pair lands exactly at the start of the second track, so the loop repeats
  with no visible seam. Only the first track carries real `alt` text; the
  second is `aria-hidden="true"` with empty `alt`s — it exists purely to
  fill in behind the first as it scrolls off.
- **Portal fade**: `.partners__viewport` clips to its own width (not the
  raw browser viewport — `.partners` itself is capped at the site's usual
  1512px frame) and masks its edges with a `linear-gradient` (`mask-image`/
  `-webkit-mask-image`), fading logos in/out as they cross the edge.
- **Seam-math gotcha**: the trailing gap between the two tracks has to live
  on `.partners__track` (`padding: 0 2rem 0 0`) rather than on
  `.partners__marquee` (`gap`) — a gap on the marquee would only count half
  that space towards each 50%, landing the loop 16px short and causing a
  visible jump. This was caught in review before ever being tested live.
- **Sizing-override gotcha (real bug, caught via live pixel measurement
  after the Figma update asked for per-logo resizing)**: `.partners__logo
  img` had `width: auto; height: auto;` to counter the global `img {
  max-width: 100% }` reset — but *any* author CSS touching width/height
  (even to `auto`) overrides the HTML `width`/`height` attribute hints
  entirely, so every logo was silently rendering at its own SVG's
  intrinsic size regardless of what the attributes said. Harmless while
  the attributes happened to match intrinsic size; became a real bug once
  the updated design asked for different (smaller, more uniform) boxes per
  logo. Fixed by dropping `width`/`height` from that rule entirely — with
  only `max-width: none` left, the browser falls back to each `<img>`'s
  own `width`/`height` attributes as intended.
- **Eager-loading gotcha (real bug, caught via live pixel measurement)**:
  the logo `<img>`s originally had `loading="lazy"`, which is the wrong
  default for a marquee — "offscreen" is temporary and expected to become
  visible by design, so lazy-loading caused genuinely asymmetric track
  widths (some images still `complete: false` seconds after load) which
  broke the seam math (`-50%` no longer landed exactly at the second
  track's start) and would have caused visible pop-in as images scrolled
  into view. Removed `loading="lazy"` from all 12 `<img>`s; verified after
  the fix that both tracks measure pixel-identical and `marqueeWidth / 2 ===
  track width` exactly.
- Respects `prefers-reduced-motion`: animation stops entirely and the
  `aria-hidden` duplicate track is hidden, leaving one static, accessible
  row of logos.

## Known quirks / gotchas (not real bugs)

- Chrome tabs driven by automation throttle `setTimeout`/`rAF`/CSS
  transitions when not actively painted — a forced screenshot flushes
  state. Never indicative of a problem for real, foregrounded users. This
  showed up concretely testing rapid skin switching: a cancelled-then-new
  crossfade's `requestAnimationFrame` callback sat pending (ghost stuck at
  full opacity over the new, already-loaded photo) until a screenshot
  forced a paint, at which point it resolved correctly on the next frame.
- `script.js` can get cached stale during dev; use
  `fetch('script.js', {cache: 'no-store'})` + `eval()` when iterating live
  in a browser tab instead of a hard reload.

## Status as of last session

Sections 2–10 of the shared-element transition spec, and the skin-switch
spec (annotation fade-out, photo crossfade, recognition pause, rapid-switch
cancellation), are implemented and verified (no console errors, clean
open/close cycles, correct per-portrait data on repeated opens).
