import fs from "node:fs/promises";
import path from "node:path";

const SAMPLE_RATE = 44100;
const TAU = Math.PI * 2;
const NOTE = { C:261.63, D:293.66, E:329.63, F:349.23, G:392.00, A:440.00, Bb:466.16, B:493.88 };

function isSuspenseGenre(genre, scenes) {
  const text = [genre, ...scenes.map(scene => scene.mood), ...scenes.map(scene => scene.heading)].join(" ").toLowerCase();
  return /horror|horor|mystery|misteri|thriller|suspense|dark/.test(text);
}

function writeWavHeader(buffer, dataLength) {
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);
}

export async function generateMusicBed({ outputPath, durationSeconds, genre = "", scenes = [] }) {
  const duration = Math.max(10, Number(durationSeconds) || 60);
  const frameCount = Math.ceil(duration * SAMPLE_RATE);
  const dataLength = frameCount * 4;
  const wav = Buffer.allocUnsafe(44 + dataLength);
  writeWavHeader(wav, dataLength);

  const suspense = isSuspenseGenre(genre, scenes);
  const bpm = suspense ? 68 : 76;
  const beat = 60 / bpm;
  const progression = suspense
    ? [
        [NOTE.D / 2, NOTE.F / 2, NOTE.A / 2, NOTE.D, NOTE.F],
        [NOTE.Bb / 2, NOTE.D, NOTE.F, NOTE.Bb, NOTE.D * 2],
        [NOTE.G / 2, NOTE.Bb / 2, NOTE.D, NOTE.G, NOTE.Bb],
        [NOTE.A / 2, NOTE.C, NOTE.E, NOTE.A, NOTE.C * 2]
      ]
    : [
        [NOTE.C / 2, NOTE.E / 2, NOTE.G / 2, NOTE.C, NOTE.E],
        [NOTE.G / 2, NOTE.B / 2, NOTE.D, NOTE.G, NOTE.B],
        [NOTE.A / 2, NOTE.C, NOTE.E, NOTE.A, NOTE.C * 2],
        [NOTE.F / 2, NOTE.A / 2, NOTE.C, NOTE.F, NOTE.A]
      ];

  const notes = [];
  const barSeconds = beat * 4;
  for (let start = 0, bar = 0; start < duration; start += barSeconds, bar++) {
    const chord = progression[bar % progression.length];
    const pattern = suspense ? [0, 2, 1, 2] : [0, 2, 3, 2, 1, 3, 2, 4];
    const step = suspense ? beat : beat / 2;
    for (let i = 0; i < pattern.length; i++) {
      const noteStart = start + i * step;
      if (noteStart >= duration) break;
      notes.push({
        start: Math.floor(noteStart * SAMPLE_RATE),
        frequency: chord[pattern[i] % chord.length],
        amplitude: suspense ? 0.075 : 0.085,
        decay: suspense ? 1.9 : 1.25
      });
    }
  }

  // Soft sustained chord pad underneath the plucked notes.
  const padFrequencies = progression[0].slice(0, 3);
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    const t = i / SAMPLE_RATE;
    const bar = Math.floor(t / barSeconds);
    const chord = progression[bar % progression.length];
    const local = t % barSeconds;
    const fadeIn = Math.min(1, t / 2.2);
    const fadeOut = Math.min(1, Math.max(0, (duration - t) / 3.5));
    const padGain = (suspense ? 0.045 : 0.032) * fadeIn * fadeOut;
    let pad = 0;
    for (let n = 0; n < 3; n++) {
      const f = chord[n];
      pad += Math.sin(TAU * f * t + n * 0.17) * 0.55;
      pad += Math.sin(TAU * f * 2 * t + n * 0.31) * 0.12;
    }
    const pulse = 0.92 + 0.08 * Math.sin(TAU * (suspense ? 0.12 : 0.07) * t);
    const base = pad * padGain * pulse;

    let pluck = 0;
    for (const note of notes) {
      const elapsed = i - note.start;
      if (elapsed < 0 || elapsed > note.decay * SAMPLE_RATE) continue;
      const seconds = elapsed / SAMPLE_RATE;
      const envelope = Math.exp(-seconds * (suspense ? 2.3 : 3.1)) * Math.min(1, seconds / 0.012);
      const fundamental = Math.sin(TAU * note.frequency * seconds);
      const harmonic = Math.sin(TAU * note.frequency * 2.01 * seconds) * 0.22;
      const upper = Math.sin(TAU * note.frequency * 3.98 * seconds) * 0.07;
      pluck += (fundamental + harmonic + upper) * note.amplitude * envelope;
    }

    const fade = fadeIn * fadeOut;
    left[i] = Math.tanh((base + pluck) * fade * 1.25) * 0.72;
    right[i] = Math.tanh((base + pluck * 0.97) * fade * 1.25) * 0.72;
  }

  for (let i = 0; i < frameCount; i++) {
    const offset = 44 + i * 4;
    wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(left[i] * 32767))), offset);
    wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(right[i] * 32767))), offset + 2);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, wav);
  return { file: path.basename(outputPath), durationSeconds: duration, style: suspense ? "cinematic-suspense" : "emotional-piano-pad" };
}
