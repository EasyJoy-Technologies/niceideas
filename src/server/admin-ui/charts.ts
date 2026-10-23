import { escapeHtml } from "@/server/render/escape";

/** Small trend line (colour from CSS via `cls`). Drawn on the server: no chart library, CSP-safe. */
export function sparkline(series: number[], cls: string): string {
  const w = 100;
  const h = 28;
  const max = Math.max(1, ...series);
  const step = series.length > 1 ? w / (series.length - 1) : 0;
  const pts = series.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    `<svg class="ad-spark ${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">` +
    `<polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`
  );
}

/** Axis step giving 4 round gridlines above the largest value (integers only). */
function axisStep(max: number): number {
  const raw = Math.max(max, 1) / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return Math.max(1, (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p);
}

export type Stack = { cls: string; values: number[] };

/** Stacked daily bars (one colour class per stack); x labels every 7th day counted from the newest. */
export function stackedBars(stacks: Stack[], labels: string[], label: string): string {
  const W = 760, H = 220, L = 30, B = 22, T = 6;
  const n = labels.length;
  const totals = labels.map((_, i) => stacks.reduce((s, k) => s + (k.values[i] ?? 0), 0));
  const step = axisStep(Math.max(0, ...totals));
  const max = step * 4;
  const ph = H - B - T;
  const slot = (W - L) / n;
  const bw = slot * 0.62;
  const y = (v: number) => T + ph - (v / max) * ph;
  let out = "";
  for (let k = 0; k <= 4; k++) {
    const yy = y(step * k).toFixed(1);
    out += `<line class="ad-gl" x1="${L}" x2="${W}" y1="${yy}" y2="${yy}"/><text class="ad-axis" x="${L - 6}" y="${(Number(yy) + 3).toFixed(1)}" text-anchor="end">${step * k}</text>`;
  }
  for (let i = 0; i < n; i++) {
    const x = (L + i * slot + (slot - bw) / 2).toFixed(1);
    let acc = 0;
    for (const s of stacks) {
      const v = s.values[i] ?? 0;
      if (v > 0) out += `<rect class="${s.cls}" x="${x}" y="${y(acc + v).toFixed(1)}" width="${bw.toFixed(1)}" height="${((v / max) * ph).toFixed(1)}" rx="1.5"/>`;
      acc += v;
    }
    if ((n - 1 - i) % 7 === 0) out += `<text class="ad-axis" x="${(L + i * slot + slot / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${escapeHtml(labels[i])}</text>`;
  }
  return `<svg class="ad-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(label)}">${out}</svg>`;
}
