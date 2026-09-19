/**
 * Tiny WebAudio cue generator. Perfectly optional: every function degrades
 * silently when the browser refuses an AudioContext or the tab is muted.
 */

export type CueKind = 'ship' | 'breakdown' | 'repair' | 'event' | 'order';

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = 'sine',
  gain = 0.05,
): void {
  const a = ac();
  if (!a) return;
  if (a.state === 'suspended') void a.resume();
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, a.currentTime + start);
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + start + dur);
  osc.connect(g);
  g.connect(a.destination);
  osc.start(a.currentTime + start);
  osc.stop(a.currentTime + start + dur + 0.02);
}

export function playCue(kind: CueKind): void {
  switch (kind) {
    case 'ship':
      tone(660, 0, 0.12, 'sine', 0.05);
      tone(990, 0.1, 0.14, 'sine', 0.045);
      break;
    case 'breakdown':
      tone(140, 0, 0.5, 'sawtooth', 0.05);
      tone(90, 0.06, 0.5, 'sawtooth', 0.035);
      break;
    case 'repair':
      tone(440, 0, 0.1, 'triangle', 0.04);
      tone(660, 0.09, 0.12, 'triangle', 0.04);
      break;
    case 'event':
      tone(880, 0, 0.2, 'sine', 0.045);
      tone(1174, 0.14, 0.28, 'sine', 0.04);
      break;
    case 'order':
      tone(520, 0, 0.08, 'square', 0.02);
      break;
  }
}