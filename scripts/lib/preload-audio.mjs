import fs from 'node:fs';
import crypto from 'node:crypto';

export const MAX_PRELOAD_BYTES = 96_000_000;
export function inspectPcmWav(file) {
  const data = fs.readFileSync(file);
  if (data.length < 44 || data.length > MAX_PRELOAD_BYTES || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE' || data.readUInt32LE(4) !== data.length - 8) throw new Error(`Invalid complete WAV length/header: ${file}`);
  let format, payload, p = 12;
  while (p + 8 <= data.length) {
    const size = data.readUInt32LE(p + 4), name = data.toString('ascii', p, p + 4);
    if (p + 8 + size > data.length) throw new Error(`Truncated WAV block: ${file}`);
    if (name === 'fmt ') {
      if (size < 16 || data.readUInt16LE(p + 8) !== 3 || data.readUInt16LE(p + 22) !== 32) throw new Error(`Expected IEEE float32 PCM WAV: ${file}`);
      format = { sampleRate: data.readUInt32LE(p + 12), channels: data.readUInt16LE(p + 10), align: data.readUInt16LE(p + 20) };
    }
    if (name === 'data') { if (payload) throw new Error(`Duplicate data block: ${file}`); payload = data.subarray(p + 8, p + 8 + size); }
    p += 8 + size + (size & 1);
  }
  if (p !== data.length || !format || !payload || format.channels < 1 || format.channels > 2 || format.sampleRate < 8000 || format.sampleRate > 192000 || format.align !== format.channels * 4 || payload.length === 0 || payload.length % format.align) throw new Error(`Invalid complete WAV format/samples: ${file}`);
  for (let i = 0; i < payload.length; i += 4) if (!Number.isFinite(payload.readFloatLE(i))) throw new Error(`Non-finite audio sample: ${file}`);
  return { encoding: 'pcm-f32le', bytes: data.length, sampleRate: format.sampleRate, channels: format.channels, sampleFrames: payload.length / format.align, sha256: crypto.createHash('sha256').update(data).digest('hex') };
}
