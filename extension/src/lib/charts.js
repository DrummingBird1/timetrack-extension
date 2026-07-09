// Tiny dependency-free SVG chart toolkit (CSP-safe, no external libraries).
// Each function renders into a container element. Colors come from CSS vars so
// charts follow the active theme.

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function clear(container) {
  container.textContent = '';
}

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Vertical bar chart. data: [{ label, value, title? }]. Bars use the accent
 * gradient; an optional `goal` draws a dashed reference line.
 */
export function barChart(container, data, { height = 220, goal = 0, valueFmt = (v) => v } = {}) {
  clear(container);
  const W = container.clientWidth || 600;
  const H = height;
  const padX = 8;
  const padBottom = 26;
  const padTop = 12;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, class: 'chart' }, container);

  const max = Math.max(goal, ...data.map((d) => d.value), 1);
  const n = data.length || 1;
  const slot = (W - padX * 2) / n;
  const barW = Math.max(2, Math.min(slot * 0.62, 46));
  const accent = cssVar('--accent', '#6366f1');
  const accent2 = cssVar('--accent-2', '#8b5cf6');

  const grad = el('linearGradient', { id: 'barGrad', x1: '0', y1: '0', x2: '0', y2: '1' }, svg);
  el('stop', { offset: '0', 'stop-color': accent2 }, grad);
  el('stop', { offset: '1', 'stop-color': accent }, grad);

  const plotH = H - padBottom - padTop;

  if (goal > 0) {
    const gy = padTop + plotH - (goal / max) * plotH;
    el('line', {
      x1: padX, x2: W - padX, y1: gy, y2: gy,
      stroke: cssVar('--warn', '#f59e0b'), 'stroke-width': 1.5, 'stroke-dasharray': '5 4', opacity: 0.8,
    }, svg);
  }

  data.forEach((d, i) => {
    const x = padX + i * slot + (slot - barW) / 2;
    const h = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * plotH);
    const y = padTop + plotH - h;
    const rect = el('rect', {
      x, y, width: barW, height: h, rx: Math.min(6, barW / 2),
      fill: d.value > 0 ? 'url(#barGrad)' : cssVar('--border', '#2a2a3a'),
      class: 'bar',
    }, svg);
    el('title', {}, rect).textContent = d.title || `${d.label}: ${valueFmt(d.value)}`;
    if (d.label) {
      const t = el('text', {
        x: x + barW / 2, y: H - 8, 'text-anchor': 'middle', class: 'chart-axis',
      }, svg);
      t.textContent = d.label;
    }
  });
}

/** Donut chart. slices: [{ label, value, color }]. Renders a legend too. */
export function donutChart(container, slices, { size = 200, thickness = 28, legend = null } = {}) {
  clear(container);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'chart' }, container);
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;

  if (!total) {
    el('circle', { cx, cy, r, fill: 'none', stroke: cssVar('--border', '#2a2a3a'), 'stroke-width': thickness }, svg);
  } else {
    let offset = 0;
    for (const s of slices) {
      if (s.value <= 0) continue;
      const frac = s.value / total;
      const arc = el('circle', {
        cx, cy, r, fill: 'none', stroke: s.color, 'stroke-width': thickness,
        'stroke-dasharray': `${frac * C} ${C}`, 'stroke-dashoffset': -offset,
        transform: `rotate(-90 ${cx} ${cy})`, class: 'donut-seg',
      }, svg);
      el('title', {}, arc).textContent = `${s.label}: ${Math.round(frac * 100)}%`;
      offset += frac * C;
    }
  }
  if (legend) renderLegend(legend, slices, total);
}

function renderLegend(legendEl, slices, total) {
  legendEl.textContent = '';
  for (const s of slices) {
    if (s.value <= 0) continue;
    const row = document.createElement('div');
    row.className = 'legend-row';
    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.background = s.color;
    const label = document.createElement('span');
    label.className = 'legend-label';
    label.textContent = s.label;
    const pct = document.createElement('span');
    pct.className = 'legend-pct';
    pct.textContent = total ? `${Math.round((s.value / total) * 100)}%` : '0%';
    row.append(dot, label, pct);
    legendEl.appendChild(row);
  }
}

/**
 * Weekday × hour heatmap. matrix[7][24] of seconds. weekdayLabels indexed 0..6.
 */
export function heatmap(container, matrix, { weekdayLabels = [], hourFmt = (h) => h } = {}) {
  clear(container);
  const cols = 24;
  const rows = 7;
  const labelW = 28;
  const W = container.clientWidth || 720;
  const cell = Math.max(10, Math.floor((W - labelW) / cols) - 3);
  const gap = 3;
  const gridW = labelW + cols * (cell + gap);
  const gridH = rows * (cell + gap) + 18;
  const svg = el('svg', { viewBox: `0 0 ${gridW} ${gridH}`, width: '100%', height: gridH, class: 'chart' }, container);

  let max = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) max = Math.max(max, matrix[r][c]);

  const base = cssVar('--accent', '#6366f1');
  for (let r = 0; r < rows; r++) {
    const lbl = el('text', { x: labelW - 6, y: r * (cell + gap) + cell / 2 + 4, 'text-anchor': 'end', class: 'chart-axis' }, svg);
    lbl.textContent = weekdayLabels[r] || r;
    for (let c = 0; c < cols; c++) {
      const v = matrix[r][c];
      const intensity = max ? v / max : 0;
      const rect = el('rect', {
        x: labelW + c * (cell + gap), y: r * (cell + gap),
        width: cell, height: cell, rx: 3,
        fill: intensity ? base : cssVar('--surface-3', '#1c1c2a'),
        'fill-opacity': intensity ? (0.18 + intensity * 0.82).toFixed(3) : 1,
        class: 'heat-cell',
      }, svg);
      el('title', {}, rect).textContent =
        `${weekdayLabels[r] || r} ${hourFmt(c)}: ${formatSecShort(v)}`;
    }
  }
  // Hour ticks every 3 hours.
  for (let c = 0; c < cols; c += 3) {
    const t = el('text', {
      x: labelW + c * (cell + gap) + cell / 2, y: gridH - 4, 'text-anchor': 'middle', class: 'chart-axis',
    }, svg);
    t.textContent = c;
  }
}

function formatSecShort(s) {
  s = Math.round(s);
  if (s >= 3600) return `${(s / 3600).toFixed(1)} שע׳`;
  if (s >= 60) return `${Math.round(s / 60)} דק׳`;
  return `${s} שנ׳`;
}

/** Thin sparkline of values for trend cards. */
export function sparkline(container, values, { height = 40, color } = {}) {
  clear(container);
  const W = container.clientWidth || 120;
  const H = height;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H }, container);
  const max = Math.max(...values, 1);
  const n = values.length;
  if (n < 2) return;
  const stroke = color || cssVar('--accent', '#6366f1');
  const pts = values.map((v, i) => {
    const x = (i / (n - 1)) * W;
    const y = H - 3 - (v / max) * (H - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  el('polyline', { points: pts.join(' '), fill: 'none', stroke, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
}
