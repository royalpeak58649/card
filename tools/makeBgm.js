// 「별의 돌격」: 138 BPM, D minor, 32마디 오리지널 피아노 전투곡.
// 재생성: node tools/makeBgm.js /path/to/ffmpeg
// 외부 샘플 없이 해머 어택과 감쇠 배음을 합성한다. 출력은 브라우저용 MP3.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const rate = 32000;
const beat = 60 / 138;
const bars = 32;
const length = Math.round(bars * 4 * beat * rate);
const left = new Float32Array(length);
const right = new Float32Array(length);
const cache = new Map();
const tau = Math.PI * 2;
function piano(midi, duration) {
  const key = `${midi}:${duration}`;
  if (cache.has(key)) return cache.get(key);
  const freq = 440 * 2 ** ((midi - 69) / 12);
  const size = Math.round((duration + 0.45) * rate);
  const wave = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const t = i / rate;
    const release = t <= duration ? 1 : Math.exp(-(t - duration) * 17);
    let value = 0;
    for (let h = 1; h <= 7; h++) {
      const envelope = Math.exp(-t * (1.3 + h * 0.65)) / h ** 1.5;
      const partial = freq * h * Math.sqrt(1 + 0.00011 * h * h);
      value += envelope * (Math.sin(tau * partial * t) * 0.8 + Math.sin(tau * partial * 1.0009 * t) * 0.2);
    }
    const hammer = Math.sin(t * 18743 + Math.sin(t * 23791) * 7) * Math.exp(-t * 100) * 0.07;
    wave[i] = (value + hammer) * Math.min(1, t * 550) * release;
  }
  cache.set(key, wave);
  return wave;
}
function note(at, midi, duration, velocity = 0.3) {
  const wave = piano(midi, duration * beat);
  const start = Math.round(at * beat * rate);
  const pan = Math.max(-0.55, Math.min(0.55, (midi - 60) / 38));
  const l = Math.sqrt((1 - pan) / 2) * velocity;
  const r = Math.sqrt((1 + pan) / 2) * velocity;
  for (let i = 0; i < wave.length; i++) {
    const j = (start + i) % length;
    left[j] += wave[i] * l;
    right[j] += wave[i] * r;
  }
}
function drum(at, kind, velocity) {
  const start = Math.round(at * beat * rate);
  const duration = kind === 'kick' ? 0.23 : 0.12;
  let phase = 0;
  for (let i = 0; i < duration * rate; i++) {
    const t = i / rate;
    const noise = Math.sin(i * 78.233 + Math.sin(i * 12.9898) * 437.1);
    phase += tau * (49 + 95 * Math.exp(-t * 34)) / rate;
    const value = kind === 'kick' ? Math.sin(phase) * Math.exp(-t * 23) : kind === 'snare' ? (noise * 0.65 + Math.sin(tau * 185 * t) * 0.35) * Math.exp(-t * 34) : noise * Math.exp(-t * 90) * 0.3;
    left[(start + i) % length] += value * velocity;
    right[(start + i) % length] += value * velocity;
  }
}
const chords = [
  [38, 50, 53, 57, 62], [34, 46, 53, 58, 62],
  [41, 48, 53, 57, 60], [36, 48, 52, 55, 60],
  [38, 50, 53, 57, 62], [34, 46, 53, 58, 62],
  [31, 43, 50, 55, 58], [33, 45, 52, 57, 61],
];
const melody = [
  [74, 77, 81, 79, 77, 76, 74, 72], [74, 77, 82, 81, 77, 74, 72, 74],
  [77, 81, 84, 81, 79, 77, 76, 77], [79, 76, 72, 76, 79, 81, 79, 76],
  [81, 77, 74, 77, 81, 84, 81, 79], [82, 81, 77, 74, 77, 74, 72, 70],
  [79, 82, 86, 82, 79, 77, 74, 70], [73, 76, 81, 85, 81, 79, 76, 73],
];
for (let bar = 0; bar < bars; bar++) {
  const at = bar * 4;
  const chord = chords[bar % 8];
  const section = Math.floor(bar / 8);
  const intensity = [0.78, 0.96, 0.7, 1][section];
  for (const position of [0, 1.5, 2, 3.5]) {
    note(at + position, chord[0], 0.7, 0.38 * intensity);
    note(at + position, chord[0] + 12, 0.6, 0.19 * intensity);
  }
  const pattern = [1, 2, 3, 4, 3, 2, 4, 3];
  pattern.forEach((index, i) => note(at + i * 0.5, chord[index] + 12, 0.42, (i % 2 ? 0.16 : 0.21) * intensity));
  // 주선율에 옥타브를 겹쳐 힘을 더한다.
  const phrase = melody[bar % 8];
  phrase.forEach((midi, i) => {
    const high = section === 2 ? -12 : 0;
    note(at + i * 0.5, midi + high, i === 7 ? 0.45 : 0.7, 0.29 * intensity);
    if (section === 1 || section === 3) note(at + i * 0.5, midi - 12, 0.5, 0.14);
  });
  if (section === 1 || section === 3) {
    for (const position of [0, 2]) {
      for (const pitch of chord.slice(1)) note(at + position + 0.01, pitch + 12, 0.65, 0.11);
    }
  }
  for (const position of [0, 2, 2.75]) drum(at + position, 'kick', 0.18 * intensity);
  for (const position of [1, 3]) drum(at + position, 'snare', 0.09 * intensity);
  for (let i = 0; i < 8; i++) drum(at + i * 0.5, 'hat', (i % 2 ? 0.045 : 0.065) * intensity);
}
// 원형 지연: 마지막 잔향을 첫 마디로 이어 루프 경계의 갑작스러운 단절을 피한다.
const dryL = left.slice();
const dryR = right.slice();
for (const [delay, gain] of [[0.061, 0.14], [0.113, 0.1], [beat * 0.75, 0.11], [beat * 1.5, 0.06]]) {
  const offset = Math.round(delay * rate);
  for (let i = 0; i < length; i++) {
    const j = (i + offset) % length;
    left[j] += dryR[i] * gain;
    right[j] += dryL[i] * gain;
  }
}
let peak = 0;
for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
const pcm = Buffer.alloc(length * 4);
for (let i = 0; i < length; i++) {
  pcm.writeInt16LE(Math.round(Math.tanh(left[i] / peak * 1.7) * 28000), i * 4);
  pcm.writeInt16LE(Math.round(Math.tanh(right[i] / peak * 1.7) * 28000), i * 4 + 2);
}
const raw = join(tmpdir(), `card-bgm-${process.pid}.pcm`);
writeFileSync(raw, pcm);
mkdirSync('client/audio', { recursive: true });
const result = spawnSync(process.argv[2] || 'ffmpeg', ['-y', '-f', 's16le', '-ar', String(rate), '-ac', '2', '-i', raw, '-codec:a', 'libmp3lame', '-b:a', '160k', '-metadata', 'title=별의 돌격', '-metadata', 'artist=Card Duel Original', 'client/audio/star-charge.mp3'], { encoding: 'utf8' });
unlinkSync(raw);
if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
console.log(`별의 돌격: ${(length / rate).toFixed(2)}s, ${bars} bars, 138 BPM, D minor`);
