export const TUNING = [64, 59, 55, 50, 45, 40]; // string 1 (thin) to 6 (thick)
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const frequencyFor = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export const noteName = (midi: number) => NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
export function noteFor(frequency: number) {
  const exact = 69 + 12 * Math.log2(frequency / 440);
  const midi = Math.round(exact);
  return { midi, name: noteName(midi), cents: (exact - midi) * 100 };
}
export function positions(midi: number) {
  return TUNING.flatMap((open, i) => midi >= open && midi <= open + 21 ? [{ string: i + 1, fret: midi - open }] : []);
}
// YIN cumulative mean normalized difference. Range covers standard guitar, 21 frets.
export function detectPitch(samples: Float32Array, rate: number, gateDb = -50) {
  let mean = 0;
  for (const x of samples) mean += x;
  mean /= samples.length;
  let energy = 0, peak = 0;
  for (const x of samples) { energy += (x - mean) ** 2; peak = Math.max(peak, Math.abs(x)); }
  const rms = Math.sqrt(energy / samples.length);
  const level = 20 * Math.log10(Math.max(rms, 1e-9));
  const base = { frequency: null, confidence: 0, level, peak };
  if (level < gateDb) return base;
  const maxLag = Math.min(Math.ceil(rate / 70), Math.floor(samples.length / 2) - 1);
  const minLag = Math.floor(rate / 1400);
  const size = samples.length - maxLag;
  const difference = new Float32Array(maxLag + 1);
  let cumulative = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += (samples[i] - samples[i + lag]) ** 2;
    cumulative += sum;
    difference[lag] = cumulative ? sum * lag / cumulative : 1;
  }
  for (let lag = minLag; lag < maxLag - 1; lag++) {
    if (difference[lag] >= 0.15) continue;
    while (lag + 1 < maxLag && difference[lag + 1] < difference[lag]) lag++;
    if (lag >= maxLag) return base;
    const a = difference[lag - 1], b = difference[lag], c = difference[lag + 1];
    const denom = a - 2 * b + c;
    const refined = lag + (denom ? Math.max(-1, Math.min(1, 0.5 * (a - c) / denom)) : 0);
    return { ...base, frequency: rate / refined, confidence: 1 - b };
  }
  return base;
}
// A hit requires consecutive matching samples spanning 450ms, not one noisy frame.
export type PitchResult = ReturnType<typeof detectPitch>;
export class HoldTracker {
 since: number | null = null;
 last: number | null = null;
  constructor() { this.reset(); }
  reset() { this.since = null; this.last = null; }
  update(matches: boolean, now: number) {
    if (!matches || (this.last !== null && now - this.last > 250)) this.reset();
    if (!matches) return false;
    this.last = now;
    this.since ??= now;
    return now - this.since >= 450;
  }
}
