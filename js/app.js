// ══════════════════════════════════════════════════════════════════════════════
//  DATE UTILITIES
// ══════════════════════════════════════════════════════════════════════════════

const parseISODateUTC = s => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const FIRST_EVENT_DATE = parseISODateUTC('1890-01-01');
const NBA_EPOCH_MS = FIRST_EVENT_DATE.getTime();
const TODAY = new Date();
const TODAY_UTC = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), TODAY.getUTCDate()));
const TOTAL_DAYS = Math.floor((TODAY_UTC.getTime() - NBA_EPOCH_MS) / 86400000);
const START_YR = FIRST_EVENT_DATE.getUTCFullYear();
const END_YR = TODAY_UTC.getUTCFullYear();

const dayOf = s => Math.max(0, Math.floor((parseISODateUTC(s).getTime() - NBA_EPOCH_MS) / 86400000));
const dayToDate = d => new Date(NBA_EPOCH_MS + d * 86400000);
const fy = yr => Math.max(0, Math.floor((Date.UTC(yr, 0, 1) - NBA_EPOCH_MS) / 86400000));
const fm = (yr, mo) => Math.max(0, Math.floor((Date.UTC(yr, mo, 1) - NBA_EPOCH_MS) / 86400000));
const MOS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ══════════════════════════════════════════════════════════════════════════════
//  VISUAL CONSTANTS — these never change with zoom
// ══════════════════════════════════════════════════════════════════════════════

const DOT_R    = 3;            // base dot radius (px) at desktop sizing
const DOT_STEP = 10;           // vertical spacing (px) at desktop sizing
const DOT_DIAM = DOT_R * 2;    // desktop overlap threshold

// Phones can't stretch horizontally, so dots start tiny and grow a lot as you
// zoom in. 0.3 on small phones (radius ~0.9px) → 1.0 on ~900px+ width.
function viewportFactor() {
  const dim = Math.min(W || window.innerWidth, H || window.innerHeight);
  const t = Math.max(0, Math.min(1, (dim - 360) / (900 - 360)));
  return 0.3 + t * 0.7;
}
function dotBaseR()    { return DOT_R    * viewportFactor(); }
function dotBaseStep() { return DOT_STEP * viewportFactor(); }

// ── Era-tinted placeholder color ─────────────────────────────────────────────
const SOURCE_META = {
  'nba.com/history': {
    color: '#ff9f1c',
    label: 'NBA.com/history',
    url: 'https://www.nba.com/history'
  },
  'hoopsrewind.app': {
    color: '#ffd84d',
    label: 'Hoopsrewind.app',
    url: 'https://hoopsrewind.app'
  },
  'sports_events': {
    color: '#64b5f6',
    label: 'Sports Events',
    url: ''
  }
};

const DOT_COLOR = SOURCE_META['nba.com/history'].color;
const COLORS = {
  championship:DOT_COLOR, record:DOT_COLOR, draft:DOT_COLOR,
  rule:DOT_COLOR, tragedy:DOT_COLOR, expansion:DOT_COLOR, milestone:DOT_COLOR,
};

function eraRGB(t) {                        // t = 0..1 across timeline
  if (t < 0.28) return [22,  48, 105];      // deep navy   — foundational era
  if (t < 0.52) return [28,  38, 115];      // indigo-blue — Bird/Magic/Jordan
  if (t < 0.76) return [42,  32, 108];      // purple-blue — Shaq/Kobe/LeBron
  return              [18,  62, 125];        // vivid blue  — modern era
}

// ══════════════════════════════════════════════════════════════════════════════
//  REAL EVENT DATA
//  (REAL_EVENTS_DATA is loaded from js/data.js before this file)
// ══════════════════════════════════════════════════════════════════════════════

// ── Build real dot objects ────────────────────────────────────────────────────
function buildDots(events) {
  return events.map((e, i) => {
    const sourceMeta = SOURCE_META[e.source] || {};
    return {
      worldX : dayOf(e.date),
      imp    : e.imp,
      cat    : e.cat,
      color  : sourceMeta.color || COLORS[e.cat] || '#c9082a',
      title  : e.title,
      desc   : e.desc,
      source : e.source,
      date   : e.date,
      hoverT : 0,
      id     : i,
      _sx    : null,
      _sy    : null,
      _binDays     : null,
      _yOff        : null,
      _initialEntry: true,
    };
  });
}

let realDots = [];
let visibleRealDots = [];

function updateSourceCounts() {
  const nbaCount = realDots.filter(d => d.source === 'nba.com/history').length;
  const hoopsCount = realDots.filter(d => d.source === 'hoopsrewind.app').length;
  document.getElementById('nba-count').textContent = nbaCount.toLocaleString('en-US');
  document.getElementById('hoops-count').textContent = hoopsCount.toLocaleString('en-US');
  document.getElementById('event-count').textContent = (nbaCount + hoopsCount).toLocaleString('en-US');
}

function updateVisibleDots() {
  const showNBA = document.getElementById('filter-nba').checked;
  const showHoops = document.getElementById('filter-hoops').checked;
  visibleRealDots = realDots.filter(d =>
    (showNBA && d.source === 'nba.com/history') ||
    (showHoops && d.source === 'hoopsrewind.app') ||
    d.source === 'sports_events'
  );
  if (hovered && !visibleRealDots.includes(hovered)) { hovered.hoverT = 0; hovered = null; }
  if (fadingDot && !visibleRealDots.includes(fadingDot)) { fadingDot.hoverT = 0; fadingDot = null; }
  // Reset animated layout positions: dots that were hidden then reappear
  // would otherwise slide from wherever they were last drawn.
  for (const d of realDots) { d._binDays = null; d._yOff = null; }
  hidePopup();
  dirty = true;
}

// ══════════════════════════════════════════════════════════════════════════════
//  PLACEHOLDER EVENT GENERATION & DENSITY (PREFIX SUMS)
// ══════════════════════════════════════════════════════════════════════════════

const r01 = s => { const v = (Math.sin(s * 9301 + 49297) * 233280) % 1; return v < 0 ? v + 1 : v; };

// ══════════════════════════════════════════════════════════════════════════════
//  DYNAMIC BINNING
//
//  bin_width = the day range that collapses into one visual column.
//  When scale (px/day) is small, adjacent dots would overlap, so we group them.
//  The group then stacks vertically with organic height from actual event density.
// ══════════════════════════════════════════════════════════════════════════════

// ── Dot radius grows continuously as you zoom in ────────────────────────────
// Maps current zoom (scale = px/day) onto a 0..1 log range, then adds growth
// proportional to viewport size. Continuous from min zoom to max zoom — not
// a stepwise threshold.
function zoomedDotR() {
  const base = dotBaseR();
  const minS = (W || 1) * 0.52 / TOTAL_DAYS;   // matches clampViewport's floor
  const maxS = 120;                            // matches clampViewport's cap
  // Log term gives gentle, perceptible growth across early zoom; linear-in-
  // scale term keeps growing at deep zoom where the log plateaus. Growth is
  // intentionally NOT scaled by viewportFactor — that way mobile dots (which
  // start tiny) grow as fast in absolute px as desktop dots, so each scroll
  // step on a phone has the same visible size delta as on a 32" monitor.
  const tLog = Math.log(Math.max(scale, minS) / minS) / Math.log(maxS / minS);
  const tLin = Math.max(0, scale - minS) / (maxS - minS);
  const grow = tLog * 12 + tLin * 14;
  return base + grow;
}

function stackStep() {
  const r = zoomedDotR();
  const zoomBoost = Math.max(0, scale - 18) * 0.22;
  // The dot-to-dot gap scales with viewport so phones get tighter columns:
  // 6px on desktop, ~1.8px on small phones. Floor is also viewport-scaled.
  const gap = 6 * viewportFactor();
  return Math.max(dotBaseStep(), r * 2 + gap + zoomBoost);
}

function drawAxisText(text, x, y, fillStyle, strokeWidth = 4, strokeStyle = 'rgba(6,10,20,0.96)', shadowBlur = 0) {
  const label = String(text);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = strokeWidth;
  if (shadowBlur > 0) {
    ctx.shadowColor = 'rgba(0,0,0,0.30)';
    ctx.shadowBlur = shadowBlur;
  }
  ctx.strokeText(label, x, y);
  ctx.fillStyle = fillStyle;
  ctx.fillText(label, x, y);
  ctx.restore();
}

function binWidth() {
  // Snap to a sparse, calendar-aligned ladder instead of Math.ceil on every
  // integer. This means bin merges happen once cleanly at each threshold
  // rather than flickering between adjacent values as you zoom — a dot pair
  // stacked vs. side-by-side won't keep swapping with small zoom changes.
  const raw = 2 * zoomedDotR() / scale;
  const STEPS = [1, 2, 3, 4, 5, 7, 10, 14, 20, 30, 45, 60, 91, 130, 182, 270, 365];
  for (const s of STEPS) if (s >= raw) return s;
  return 365;
}

// ══════════════════════════════════════════════════════════════════════════════
//  VIEWPORT
// ══════════════════════════════════════════════════════════════════════════════

const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
let W, H;
let scale = 1;
let panX  = TOTAL_DAYS / 2;
let panY  = 0;

// Size the canvas backing store at devicePixelRatio so dots stay crisp on
// HiDPI screens (Retina, XPS, phones). CSS keeps the element at logical size;
// the context is pre-scaled so the rest of the draw code uses CSS pixels.
let cssDPR = 1;
function resizeCanvas() {
  cssDPR = Math.min(3, window.devicePixelRatio || 1);
  // First make the element fill the visible viewport at CSS sizing, then
  // measure it. Using innerWidth alone is unreliable on iOS during the URL-
  // bar animation; getBoundingClientRect gives the actual rendered size.
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  const rect = canvas.getBoundingClientRect();
  W = Math.round(rect.width);
  H = Math.round(rect.height);
  canvas.width  = Math.round(W * cssDPR);
  canvas.height = Math.round(H * cssDPR);
  ctx.setTransform(cssDPR, 0, 0, cssDPR, 0, 0);
}

const axisY = ()   => H / 2 + panY;
const toSX  = wx   => (wx - panX) * scale + W / 2;
const toSY  = yOff => axisY() + yOff;
const toWX  = sx   => (sx - W / 2) / scale + panX;

function initViewport() {
  scale = W * 0.90 / TOTAL_DAYS;
  panX  = TOTAL_DAYS / 2;
  panY  = 0;
}

function clampViewport() {
  const minS = W * 0.52 / TOTAL_DAYS;
  const maxS = 120;
  scale = Math.max(minS, Math.min(maxS, scale));
  const hw = W / (2 * scale);
  panX = Math.max(-hw * 0.3, Math.min(TOTAL_DAYS + hw * 0.3, panX));
  panY = Math.max(-700, Math.min(700, panY));
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOD — importance alpha
// ══════════════════════════════════════════════════════════════════════════════

const IMP_FADE = { 1:[0, 0.02], 2:[0.10, 0.35], 3:[0.70, 1.80] };

function impAlpha(imp) { return 1; }

// ══════════════════════════════════════════════════════════════════════════════
//  DRAW
// ══════════════════════════════════════════════════════════════════════════════

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawVignette();
  drawGrid();
  drawBins();         // ← the core: dynamic binning renders everything
  drawAxisLabels();
}

function drawVignette() {
  const g = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H) * 0.65);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(3,5,18,0.84)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function drawGrid() {
  const yearPx  = scale * 365;
  const monthPx = scale * 30;
  const dayPx   = scale;
  const vL = toWX(-4), vR = toWX(W + 4);
  const fyU = yr => Math.floor((Date.UTC(yr, 0, 1) - NBA_EPOCH_MS) / 86400000);
  const sd = dayToDate(Math.floor(vL)), ed = dayToDate(Math.ceil(vR));
  const sY = sd.getUTCFullYear(), eY = ed.getUTCFullYear();

  ctx.save(); ctx.lineWidth = 1;

  // Decade lines — always present, extend beyond data bounds
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  for (let yr = Math.ceil(sY / 10) * 10; yr <= eY; yr += 10) {
    const sx = toSX(fyU(yr));
    if (sx < -1 || sx > W + 1) continue;
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
  }

  // Year lines
  const yrA = Math.min(0.10, Math.max(0, (yearPx - 28) / 140) * 0.10);
  if (yrA > 0.002) {
    ctx.strokeStyle = `rgba(255,255,255,${yrA})`;
    for (let yr = sY; yr <= eY; yr++) {
      if (yr % 10 === 0) continue;
      const sx = toSX(fyU(yr));
      if (sx < -1 || sx > W + 1) continue;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
    }
  }

  // Month lines
  const moA = Math.min(0.07, Math.max(0, (monthPx - 12) / 70) * 0.07);
  if (moA > 0.002) {
    ctx.strokeStyle = `rgba(255,255,255,${moA})`;
    let yr = sY, mo = sd.getUTCMonth();
    for (let i = 0; i < 500; i++) {
      const d = fm(yr, mo);
      if (d > vR) break;
      const sx = toSX(d);
      if (sx >= -1 && sx <= W + 1) { ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke(); }
      mo++; if (mo > 11) { mo = 0; yr++; }
    }
  }

  // Day lines
  const dayA = Math.min(0.06, Math.max(0, (dayPx - 8) / 50) * 0.06);
  if (dayA > 0.002) {
    ctx.strokeStyle = `rgba(255,255,255,${dayA})`;
    for (let d = Math.max(0, Math.floor(vL)); d <= Math.min(TOTAL_DAYS, Math.ceil(vR)); d++) {
      const sx = toSX(d);
      if (sx < -1 || sx > W + 1) continue;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
    }
  }

  // Axis line
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  const ay = axisY();
  ctx.beginPath(); ctx.moveTo(0, ay); ctx.lineTo(W, ay); ctx.stroke();

  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════════
//  DRAW BINS — the heart of the system
//
//  For each visible bin:
//    1. Sum real events + placeholder events in the bin's day range
//    2. Real events occupy the innermost (lowest) slots — most visible
//    3. Placeholder events fill outer slots, compressed via power curve
//    4. Columns grow taller in denser eras — naturally, from actual data
// ══════════════════════════════════════════════════════════════════════════════

function drawBins() {
  const bw   = binWidth();
  const ay   = axisY();
  const r0   = zoomedDotR();   // base radius grows with zoom

  // Detect bin-width ladder step and animate a blend between old and new bin
  // centers so columns spread apart gradually instead of snapping all at once.
  if (bwCurr === 0) {
    bwCurr = bwPrev = bw; bwBlend = 1;
  } else if (bw !== bwCurr) {
    bwPrev = bwCurr; bwCurr = bw; bwBlend = 0;
  }

  // Clear screen-position cache (dots not drawn this frame become unhoverable)
  for (const d of realDots) { d._sx = null; d._sy = null; }

  // Frame-rate-independent lerp factor. Higher rate = snappier settle.
  // _binDays animates in WORLD-SPACE days; _yOff animates in CSS pixels. Pan
  // is applied at draw time via toSX() so panning never animates.
  // Entry (initial load): fast so the fall-in feels snappy.
  // Shuffle (zoom rebin): slower so repositioning looks graceful.
  const lerpTEntry   = 1 - Math.exp(-18 * lastFrameDt);
  const lerpTShuffle = 1 - Math.exp(-5  * lastFrameDt);

  const vL    = toWX(-r0 - 2);
  const vR    = toWX(W + r0 + 2);
  const firstBin = Math.floor(Math.max(0, vL) / bw);
  const lastBin  = Math.ceil(Math.min(TOTAL_DAYS, vR) / bw);

  let stillAnimating = false;

  // Keep animating while bin-width blend is in progress.
  if (bwBlend < 1) {
    bwBlend = Math.min(1, bwBlend + 4 * lastFrameDt);
    stillAnimating = true;
  }

  for (let b = firstBin; b <= lastBin; b++) {
    const d0 = b * bw;
    const d1 = Math.min(TOTAL_DAYS, (b + 1) * bw - 1);
    if (d0 > TOTAL_DAYS) break;

    const currBinCenter = (d0 + d1) / 2;
    const targetSx = toSX(currBinCenter);
    if (targetSx < -r0 - 2 || targetSx > W + r0 + 2) continue;

    // Collect real events in this bin, innermost (imp 1) first
    const binReal = [];
    for (const dot of visibleRealDots) {
      if (dot.worldX >= d0 && dot.worldX <= d1) binReal.push(dot);
    }
    binReal.sort((a, b_) => a.imp - b_.imp);

    // Draw each real event
    for (let i = 0; i < binReal.length; i++) {
      const dot  = binReal[i];
      const row  = Math.floor(i / 2);
      const sign = (i % 2 === 0) ? -1 : 1;
      const targetYOff = sign * (row + 0.5) * stackStep();

      // Blend the x-target between old bin center and new bin center so columns
      // spread apart gradually when the bin ladder steps.
      let targetBinDays = currBinCenter;
      if (bwBlend < 1 && bwPrev > 0) {
        const pb = Math.floor(dot.worldX / bwPrev);
        const prevCenter = (pb * bwPrev + Math.min(TOTAL_DAYS, (pb + 1) * bwPrev - 1)) / 2;
        targetBinDays = prevCenter + (currBinCenter - prevCenter) * bwBlend;
      }

      // First-ever positioning: snap x, start y at axis so dots fall into place.
      if (dot._binDays === null) {
        dot._binDays = targetBinDays;
        dot._yOff    = 0;
        if (Math.abs(targetYOff) > 0.5) stillAnimating = true;
      } else {
        const lerpT  = dot._initialEntry ? lerpTEntry : lerpTShuffle;
        const dxDays = targetBinDays - dot._binDays;
        const dyPx   = targetYOff   - dot._yOff;
        // Snap when the remaining delta would render as <0.5px (sub-pixel),
        // otherwise lerp and request another frame.
        if (Math.abs(dxDays) * scale > 0.5 || Math.abs(dyPx) > 0.5) {
          dot._binDays += dxDays * lerpT;
          dot._yOff    += dyPx   * lerpT;
          stillAnimating = true;
        } else {
          dot._binDays     = targetBinDays;
          dot._yOff        = targetYOff;
          dot._initialEntry = false;
        }
      }

      const sx = toSX(dot._binDays);
      const sy = ay + dot._yOff;

      if (sy < -r0 - 2 || sy > H + r0 + 2) continue;

      // Record for hover detection
      dot._sx = sx;
      dot._sy = sy;

      const lod = impAlpha(dot.imp);
      if (lod < 0.02) continue;

      const r = r0 + dot.hoverT * 27;

      ctx.save();
      if (dot.hoverT > 0.02) {
        ctx.shadowColor = dot.color;
        ctx.shadowBlur  = 5 + 25 * dot.hoverT;
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle   = dot.color;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  if (stillAnimating) dirty = true;
}

// ══════════════════════════════════════════════════════════════════════════════
//  HOVER LABEL
// ══════════════════════════════════════════════════════════════════════════════

function drawHoverLabel(d) {
  // no-op — popup is handled via HTML overlay
}

// ══════════════════════════════════════════════════════════════════════════════
//  AXIS LABELS
// ══════════════════════════════════════════════════════════════════════════════

function drawAxisLabels() {
  const ay      = axisY();
  const yearPx  = scale * 365;
  const monthPx = scale * 30;
  const dayPx   = scale;
  const vL = toWX(-10), vR = toWX(W + 10);
  const fyU = yr => Math.floor((Date.UTC(yr, 0, 1) - NBA_EPOCH_MS) / 86400000);
  const sd = dayToDate(Math.floor(vL)), ed = dayToDate(Math.ceil(vR));
  const sY = sd.getUTCFullYear(), eY = ed.getUTCFullYear();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Fixed bottom band for years so they always remain visible.
  const decSz = Math.max(12, Math.min(34, yearPx * 0.055));
  const decA  = Math.min(0.96, 0.60 + yearPx * 0.0012);
  const yrFade = Math.min(1, Math.max(0, (yearPx - 28) / 48));
  const yrSz = Math.max(10, Math.min(22, yearPx * 0.044));
  const bottomBandH = Math.max(70, decSz + (yrFade > 0.02 ? yrSz + 20 : 0) + 24);
  const bottomBandTop = H - bottomBandH;

  const bottomFade = ctx.createLinearGradient(0, bottomBandTop, 0, H);
  bottomFade.addColorStop(0, 'rgba(6,10,20,0.00)');
  bottomFade.addColorStop(0.22, 'rgba(6,10,20,0.34)');
  bottomFade.addColorStop(1, 'rgba(6,10,20,0.94)');
  ctx.fillStyle = bottomFade;
  ctx.fillRect(0, bottomBandTop, W, bottomBandH);

  const decadeY = H - 16;
  const yearY   = decadeY - decSz - 10;

  // Cross-fade: 5-year labels fade out as individual year labels fade in
  // Decade labels anchored to the bottom of the screen.
  ctx.font = `${decSz}px "DM Mono", monospace`;
  for (let yr = Math.ceil(sY / 10) * 10; yr <= eY; yr += 10) {
    const d0 = fyU(yr), d1 = fyU(yr + 1) - 1;
    const cx = toSX((d0 + d1) / 2);
    if (cx < 38 || cx > W - 38) continue;
    const tx = toSX(d0);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(tx, bottomBandTop + 8); ctx.lineTo(tx, bottomBandTop + 24); ctx.stroke();
    ctx.restore();
    drawAxisText(yr, cx, decadeY, `rgba(255,255,255,${decA})`, 6, 'rgba(6,10,20,0.98)', 8);
  }

  // Individual year labels
  if (yrFade > 0.02) {
    ctx.font = `${yrSz}px "DM Mono", monospace`;
    for (let yr = sY; yr <= eY; yr++) {
      if (yr % 10 === 0) continue;
      const d0 = fyU(yr), d1 = fyU(yr + 1) - 1;
      const cx = toSX((d0 + d1) / 2);
      if (cx < 28 || cx > W - 28) continue;
      drawAxisText(yr, cx, yearY, `rgba(255,255,255,${0.78 * yrFade})`, 4.5, 'rgba(6,10,20,0.98)', 5);
    }
  }

  // Months and days stay on separate rows so they never overlap.
  const moFade = Math.min(1, Math.max(0, (monthPx - 14) / 16));
  const dayFade = Math.min(1, Math.max(0, (dayPx - 14) / 12));
  const moSz = Math.max(9, Math.min(16, monthPx * 0.30));
  const daySz = Math.max(10, Math.min(18, dayPx * 0.17));
  const safeBottom = bottomBandTop - 10;

  let placeBelowAxis = ay + moSz + (dayFade > 0.02 ? daySz + 30 : 16) < safeBottom;
  let monthY = null;
  let dayY = null;

  if (moFade > 0.02) {
    if (placeBelowAxis) {
      monthY = Math.min(ay + moSz + 14, safeBottom - (dayFade > 0.02 ? daySz + 16 : 0));
    } else {
      if (dayFade > 0.02) {
        dayY = Math.max(26, ay - 12);
        monthY = Math.max(16, dayY - daySz - 14);
      } else {
        monthY = Math.max(16, ay - 12);
      }
    }
  }

  if (dayFade > 0.02) {
    if (placeBelowAxis) {
      if (monthY === null) monthY = Math.min(ay + moSz + 14, safeBottom - daySz - 16);
      dayY = monthY + daySz + 14;
    } else {
      if (dayY === null) dayY = Math.max(26, ay - 12);
      if (monthY === null) monthY = Math.max(16, dayY - daySz - 14);
    }
  }

  // Month labels
  if (moFade > 0.02 && monthY !== null) {
    ctx.font = `${moSz}px "DM Mono", monospace`;
    let yr = sY, mo = sd.getUTCMonth();
    for (let i = 0; i < 500; i++) {
      const d0 = fm(yr, mo), d1 = fm(yr, mo + 1) - 1;
      if (d0 > vR) break;
      const cx = toSX((d0 + Math.min(TOTAL_DAYS, d1)) / 2);
      if (cx > 28 && cx < W - 28) {
        drawAxisText(MOS[mo], cx, monthY, `rgba(255,255,255,${0.60 * moFade})`, 3.5, 'rgba(6,10,20,0.96)', 3);
      }
      mo++; if (mo > 11) { mo = 0; yr++; }
    }
  }

  // Day labels
  if (dayFade > 0.02 && dayY !== null) {
    ctx.font = `${daySz}px "DM Mono", monospace`;
    const tickAlpha = 0.12 + dayFade * 0.24;
    for (let d = Math.max(0, Math.floor(vL)); d <= Math.min(TOTAL_DAYS, Math.ceil(vR)); d++) {
      const dt  = dayToDate(d);
      const dom = dt.getUTCDate();
      const sx  = toSX(d + 0.5);
      if (sx <= 18 || sx >= W - 18) continue;
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${tickAlpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (placeBelowAxis) {
        ctx.moveTo(sx, ay + 1); ctx.lineTo(sx, ay + 8);
      } else {
        ctx.moveTo(sx, ay - 1); ctx.lineTo(sx, ay - 8);
      }
      ctx.stroke();
      ctx.restore();
      drawAxisText(dom, sx, dayY, `rgba(255,255,255,${0.84 * dayFade})`, 4, 'rgba(6,10,20,0.98)', 3);
    }
  }

  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════════
//  HOVER DETECTION & ANIMATION
// ══════════════════════════════════════════════════════════════════════════════

let hovered   = null;
let fadingDot = null;
let lockedDot = null;   // desktop: dot whose popup is pinned open by a click
let dirty     = true;

// Bin-width transition — smoothly blends old→new bin centers when the ladder steps.
let bwPrev  = 0;
let bwCurr  = 0;
let bwBlend = 1.0; // 0 = fully prev, 1 = fully curr

function findNearest(mx, my) {
  const HIT2 = 22 * 22;
  let best = null, bd = HIT2;
  for (const d of visibleRealDots) {
    if (d._sx === null) continue;         // not rendered this frame
    if (impAlpha(d.imp) < 0.06) continue; // below LOD threshold — not hoverable
    const dx = d._sx - mx, dy = d._sy - my;
    const dd = dx * dx + dy * dy;
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}

let lastTime = 0;
let lastFrameDt = 1 / 60;   // read by drawBins() for layout-lerp speed
function tick(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05); lastTime = now;
  lastFrameDt = dt;
  let nd = dirty;

  const anim = (d, tgt) => {
    const p = d.hoverT;
    d.hoverT = Math.max(0, Math.min(1, d.hoverT + (tgt - d.hoverT) * 11 * dt));
    if (Math.abs(d.hoverT - p) > 0.0005) nd = true;
  };

  if (hovered) anim(hovered, 1);
  if (lockedDot && lockedDot !== hovered) anim(lockedDot, 1);
  if (fadingDot && fadingDot !== lockedDot) {
    anim(fadingDot, 0);
    if (fadingDot.hoverT <= 0.001) { fadingDot.hoverT = 0; fadingDot = null; }
  } else if (fadingDot === lockedDot) {
    fadingDot = null; // lockedDot wins, cancel the fade
  }

  if (nd) {
    // Clear before draw — drawBins can re-arm `dirty` if dots are still
    // animating toward their target column/row, requesting another frame.
    dirty = false;
    draw();
    if (lockedDot && lockedDot._sx !== null) showPopup(lockedDot);
  }
  requestAnimationFrame(tick);
}

// ══════════════════════════════════════════════════════════════════════════════
//  INPUT
// ══════════════════════════════════════════════════════════════════════════════

let isDragging = false, dragSX, dragSY, dragPX, dragPY;

const popup     = document.getElementById('popup');
const popupDate = document.getElementById('popup-date');
const popupDesc = document.getElementById('popup-desc');
const popupSource = document.getElementById('popup-source');
const popupSourceLink = document.getElementById('popup-source-link');
const popupStem = document.getElementById('popup-stem');

let popupTimer = null;
let didDrag = false;
let touchedActiveDot = null; // dot whose popup was open when a touch started


const MOBILE_BREAKPOINT = 760;
const headerEl = document.getElementById('header');
const headerSubEl = headerEl.querySelector('.h-sub');
const sidebarEl = document.getElementById('sidebar');
const hamburgerBtn = document.getElementById('hamburger');
hamburgerBtn.addEventListener('click', () => {
  sidebarEl.classList.toggle('open');
  headerEl.classList.toggle('pushed');
});
document.querySelectorAll('.sb-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sb-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.sb-page').forEach(p => p.classList.add('sb-hidden'));
    btn.classList.add('active');
    document.getElementById(`sb-${btn.dataset.page}`).classList.remove('sb-hidden');
  });
});

const vpEl = document.getElementById('vp');
const vpCloseBtn = document.getElementById('vp-close');
const vpShowBtn = document.getElementById('vp-show');
const hintEl = document.getElementById('hint');
let vpInitialized = false;

vpCloseBtn.addEventListener('click', () => {
  vpEl.classList.add('hidden');
  vpShowBtn.classList.add('visible');
});
vpShowBtn.addEventListener('click', () => {
  vpEl.classList.remove('hidden');
  vpShowBtn.classList.remove('visible');
  applyResponsiveChrome();
});

const DESKTOP_COPY = {
  headerSub: 'Scroll to zoom · Drag to pan · 1894-Present',
  hint: 'Scroll to dive in · Drag to explore'
};

const MOBILE_COPY = {
  headerSub: 'Pinch to zoom · Drag to pan',
  hint: 'Pinch to zoom · Drag to explore · Tap a dot'
};

let suppressMouseUntil = 0;
let touchMode = null;
let touchMoved = false;
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let pinchStartDist = 0;
let pinchStartScale = 1;
let pinchAnchorWX = 0;
let pinchStartMidX = 0;
let pinchStartMidY = 0;
let pinchStartPanY = 0;

function isMobileLayout() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

function applyResponsiveChrome() {
  const mobile = isMobileLayout();
  const copy = mobile ? MOBILE_COPY : DESKTOP_COPY;
  headerSubEl.textContent = copy.headerSub;
  hintEl.textContent = copy.hint;

  const headerBottom = Math.round(headerEl.offsetTop + headerEl.offsetHeight + 10);

  if (mobile) {
    vpEl.style.left = '14px';
    vpEl.style.right = '12px';
    vpEl.style.top = `${headerBottom}px`;
    vpShowBtn.style.left = '14px';
    vpShowBtn.style.right = 'auto';
    vpShowBtn.style.top = `${headerBottom}px`;
    vpShowBtn.style.bottom = 'auto';
  } else {
    vpEl.style.left = 'auto';
    vpEl.style.right = '38px';
    vpEl.style.top = '24px';
    vpShowBtn.style.left = 'auto';
    vpShowBtn.style.right = '38px';
    vpShowBtn.style.top = '24px';
    vpShowBtn.style.bottom = 'auto';
  }

  if (!vpInitialized) {
    vpInitialized = true;
    if (mobile) {
      vpEl.classList.add('hidden');
      vpShowBtn.classList.add('visible');
    }
  }
}

function setActiveDot(dot, showNow = false) {
  if (hovered && hovered !== dot) {
    if (fadingDot && fadingDot !== hovered) fadingDot.hoverT = 0;
    fadingDot = hovered;
  }
  hovered = dot;
  dirty = true;
  if (dot && showNow) showPopup(dot);
  if (!dot) hidePopup();
}

function touchDistance(t0, t1) {
  return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
}

function touchMidpoint(t0, t1) {
  return {
    x: (t0.clientX + t1.clientX) / 2,
    y: (t0.clientY + t1.clientY) / 2,
  };
}

function sourceToUrl(source) {
  if (!source) return '#';
  if (SOURCE_META[source]?.url) return SOURCE_META[source].url;
  return /^https?:\/\//i.test(source) ? source : `https://${source}`;
}

function showPopup(d) {
  const sx = d._sx, sy = d._sy;
  const r  = dotBaseR() + d.hoverT * 27;
  const col = d.color;

  const dateFmt = parseISODateUTC(d.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  popupDate.textContent  = dateFmt;
  popupDate.style.color  = col;
  popupDesc.textContent  = d.desc;
  popupSource.style.display = d.source ? 'block' : 'none';
  popupSourceLink.textContent = d.source || '';
  popupSourceLink.href = sourceToUrl(d.source);

  // Position: prefer above, fall back below
  const PW = Math.min(360, W - 16), PH = popup.offsetHeight || 140;
  const MARGIN = 14;

  let cardX = sx - PW / 2;
  let cardY = sy - r - MARGIN - PH;
  let stemTop = false; // stem goes down from card bottom to dot

  if (cardY < 8) {
    // Not enough room above — place below
    cardY = sy + r + MARGIN;
    stemTop = true; // stem goes up from card top to dot
  }

  // Clamp horizontally
  cardX = Math.max(8, Math.min(W - PW - 8, cardX));

  popup.style.left   = cardX + 'px';
  popup.style.top    = cardY + 'px';
  popup.style.width  = PW + 'px';

  // Connector stem
  const stemX  = sx - cardX;   // x within popup space
  const stemLen = MARGIN + r;
  popupStem.style.left   = Math.max(4, Math.min(PW - 4, stemX)) + 'px';
  popupStem.style.height = stemLen + 'px';

  if (stemTop) {
    popupStem.style.top    = (-stemLen) + 'px';
    popupStem.style.bottom = 'auto';
  } else {
    popupStem.style.bottom = (-stemLen) + 'px';
    popupStem.style.top    = 'auto';
  }

  popup.classList.add('visible');
}

function hidePopup() {
  if (lockedDot) return;
  clearTimeout(popupTimer);
  popup.classList.remove('visible');
}

function unlockPopup() {
  if (!lockedDot) return;
  popup.classList.remove('locked');
  if (fadingDot && fadingDot !== lockedDot) fadingDot.hoverT = 0;
  fadingDot = lockedDot;
  lockedDot = null;
  clearTimeout(popupTimer);
  popup.classList.remove('visible');
  dirty = true;
}

function updateHover(mx, my) {
  if (isDragging) return;
  const found = findNearest(mx, my);
  if (found !== hovered) {
    if (hovered) { if (fadingDot && fadingDot !== hovered) fadingDot.hoverT = 0; fadingDot = hovered; }
    hovered = found; dirty = true;
    canvas.style.cursor = found ? 'pointer' : 'grab';
    if (found && !lockedDot) {
      clearTimeout(popupTimer);
      popupTimer = setTimeout(() => { if (hovered) showPopup(hovered); }, 350);
    } else if (!found && !lockedDot) {
      hidePopup();
    }
  } else if (lockedDot && lockedDot._sx !== null) {
    showPopup(lockedDot);
  } else if (found && found._sx !== null) {
    showPopup(found);
  }
}


canvas.addEventListener('touchstart', e => {
  suppressMouseUntil = Date.now() + 800;
  if (e.touches.length === 1) {
    const t = e.touches[0];
    touchMode = 'pan';
    touchMoved = false;
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartTime = Date.now();
    dragSX = t.clientX;
    dragSY = t.clientY;
    dragPX = panX;
    dragPY = panY;
    isDragging = true;
    // Snapshot which dot's popup was open before hidePopup() clears it.
    touchedActiveDot = popup.classList.contains('visible') ? hovered : null;
    hidePopup();
  } else if (e.touches.length >= 2) {
    const t0 = e.touches[0], t1 = e.touches[1];
    const mid = touchMidpoint(t0, t1);
    touchMode = 'pinch';
    touchMoved = true;
    isDragging = false;
    pinchStartDist = Math.max(1, touchDistance(t0, t1));
    pinchStartScale = scale;
    pinchStartMidX = mid.x;
    pinchStartMidY = mid.y;
    pinchAnchorWX = toWX(mid.x);
    pinchStartPanY = panY;
    if (hovered) {
      if (fadingDot && fadingDot !== hovered) fadingDot.hoverT = 0;
      fadingDot = hovered;
      hovered = null;
    }
    dirty = true;
    hidePopup();
  }
  hintEl.classList.add('gone');
}, { passive: true });

canvas.addEventListener('touchmove', e => {
  suppressMouseUntil = Date.now() + 800;
  if (e.touches.length === 1 && touchMode === 'pan') {
    const t = e.touches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) touchMoved = true;
    panX = dragPX - (t.clientX - dragSX) / scale;
    panY = dragPY + (t.clientY - dragSY);
    clampViewport();
    dirty = true;
    hidePopup();
  } else if (e.touches.length >= 2) {
    const t0 = e.touches[0], t1 = e.touches[1];
    const mid = touchMidpoint(t0, t1);
    const nextScale = pinchStartScale * (touchDistance(t0, t1) / Math.max(1, pinchStartDist));
    scale = nextScale;
    clampViewport();
    panX = pinchAnchorWX - (mid.x - W / 2) / scale;
    panY = pinchStartPanY + (mid.y - pinchStartMidY);
    clampViewport();
    dirty = true;
    hidePopup();
  }
  hintEl.classList.add('gone');
}, { passive: true });

canvas.addEventListener('touchend', e => {
  suppressMouseUntil = Date.now() + 800;

  if (touchMode === 'pan' && e.touches.length === 0) {
    const dt = Date.now() - touchStartTime;
    isDragging = false;
    if (!touchMoved && dt < 280) {
      const t = e.changedTouches[0];
      const found = findNearest(t.clientX, t.clientY);
      if (found && found === touchedActiveDot) {
        setActiveDot(null); // tap same dot whose popup was open → close
      } else if (found) {
        setActiveDot(found, true);
      } else {
        setActiveDot(null);
      }
      touchedActiveDot = null;
    }
  }

  if (e.touches.length === 1) {
    const t = e.touches[0];
    const wasPinching = touchMode === 'pinch';
    touchMode = 'pan';
    touchMoved = wasPinching; // coming off a pinch must not register as a tap
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartTime = Date.now();
    dragSX = t.clientX;
    dragSY = t.clientY;
    dragPX = panX;
    dragPY = panY;
    isDragging = true;
  } else if (e.touches.length >= 2) {
    const t0 = e.touches[0], t1 = e.touches[1];
    const mid = touchMidpoint(t0, t1);
    touchMode = 'pinch';
    pinchStartDist = Math.max(1, touchDistance(t0, t1));
    pinchStartScale = scale;
    pinchStartMidX = mid.x;
    pinchStartMidY = mid.y;
    pinchAnchorWX = toWX(mid.x);
    pinchStartPanY = panY;
    isDragging = false;
  } else {
    touchMode = null;
    isDragging = false;
  }
}, { passive: true });

canvas.addEventListener('touchcancel', () => {
  suppressMouseUntil = Date.now() + 800;
  touchMode = null;
  isDragging = false;
}, { passive: true });

canvas.addEventListener('mousemove', e => {
  if (Date.now() < suppressMouseUntil) return;
  if (isDragging) {
    didDrag = true;
    panX = dragPX - (e.clientX - dragSX) / scale;
    panY = dragPY + (e.clientY - dragSY);
    clampViewport(); dirty = true;
  } else updateHover(e.clientX, e.clientY);
});

canvas.addEventListener('mousedown', e => {
  if (Date.now() < suppressMouseUntil) return;
  isDragging = true; dragSX = e.clientX; dragSY = e.clientY; dragPX = panX; dragPY = panY;
  didDrag = false;
  canvas.classList.add('dragging');
  if (hovered) {
    if (fadingDot && fadingDot !== hovered) fadingDot.hoverT = 0;
    fadingDot = hovered;
    hovered = null;
    dirty = true;
  }
  hidePopup();
});

canvas.addEventListener('click', e => {
  if (Date.now() < suppressMouseUntil) return;
  if (didDrag) return;
  const found = findNearest(e.clientX, e.clientY);
  if (found) {
    if (found === lockedDot) {
      unlockPopup();
    } else {
      if (lockedDot) unlockPopup();
      lockedDot = found;
      hovered = found;
      if (fadingDot === found) fadingDot = null;
      popup.classList.add('locked');
      showPopup(found);
      dirty = true;
    }
  } else {
    unlockPopup();
  }
});

window.addEventListener('mouseup', () => {
  if (Date.now() < suppressMouseUntil) return;
  if (isDragging) { isDragging = false; canvas.classList.remove('dragging'); dirty = true; }
});

canvas.addEventListener('mouseleave', () => {
  if (Date.now() < suppressMouseUntil) return;
  if (hovered) {
    if (fadingDot && fadingDot !== hovered) fadingDot.hoverT = 0;
    fadingDot = hovered;
    hovered = null;
    dirty = true;
  }
  canvas.style.cursor = 'grab';
  hidePopup();
});

canvas.addEventListener('wheel', e => {
  if (Date.now() < suppressMouseUntil) return;
  e.preventDefault();
  const factor = Math.exp(-e.deltaY / (e.deltaMode === 0 ? 500 : 15000));
  const wx     = toWX(e.clientX);
  scale *= factor;
  clampViewport();
  panX = wx - (e.clientX - W / 2) / scale;
  clampViewport();
  dirty = true;
  if (lockedDot) {
    if (hovered && hovered !== lockedDot) { hovered.hoverT = 0; hovered = null; }
    if (fadingDot && fadingDot !== lockedDot) { fadingDot.hoverT = 0; fadingDot = null; }
  } else if (hovered) {
    hovered.hoverT = 0;
    if (fadingDot && fadingDot !== hovered) fadingDot.hoverT = 0;
    fadingDot = null;
    hovered = null;
    hidePopup();
  }
  document.getElementById('hint').classList.add('gone');
}, { passive: false });

const filterNBAEl = document.getElementById('filter-nba');
const filterHoopsEl = document.getElementById('filter-hoops');

function onFilterToggle(changedEl) {
  if (!filterNBAEl.checked && !filterHoopsEl.checked) {
    changedEl.checked = true;
    return;
  }
  updateVisibleDots();
}

filterNBAEl.addEventListener('change', () => onFilterToggle(filterNBAEl));
filterHoopsEl.addEventListener('change', () => onFilterToggle(filterHoopsEl));

function handleViewportChange() {
  resizeCanvas();
  clampViewport();
  applyResponsiveChrome();
  dirty = true;
}

window.addEventListener('resize', handleViewportChange);
// iOS Safari fires orientationchange but sometimes skips a clean resize
// when the URL bar collapses, so wire those events too.
window.addEventListener('orientationchange', handleViewportChange);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', handleViewportChange);
}
// Safari can restore the page from back-forward cache (bfcache) without
// re-running init, leaving us with a stale backing buffer / DPR. Force a
// full re-resize on bfcache restore.
window.addEventListener('pageshow', e => {
  if (e.persisted) handleViewportChange();
});

// ══════════════════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════════════════

// Start the canvas loop immediately so the grid renders before events arrive.
resizeCanvas();
initViewport();
clampViewport();
applyResponsiveChrome();
requestAnimationFrame(tick);
setTimeout(() => document.getElementById('hint').classList.add('gone'), 5000);

// Populate dots once fonts + data are both ready; they animate in from the axis.
Promise.all([document.fonts.ready, loadEvents()]).then(([, events]) => {
  realDots = buildDots(events);
  visibleRealDots = realDots.slice();
  updateSourceCounts();
  updateVisibleDots();
  dirty = true;
});
