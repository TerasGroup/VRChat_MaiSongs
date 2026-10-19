import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectPcmWav, MAX_PRELOAD_BYTES } from './lib/preload-audio.mjs';

const root = process.cwd();
const candidates = [process.env.FFMPEG, 'C:/Users/94886/AppData/Local/oopz/ffmpeg.exe', 'C:/Program Files/Softdeluxe/Free Download Manager/ffmpeg.exe', 'ffmpeg'].filter(Boolean);
const ffmpeg = candidates.find(x => spawnSync(x, ['-version'], { stdio: 'ignore', windowsHide: true }).status === 0);
if (!ffmpeg) throw new Error('FFmpeg is required to prepare complete audio');
for (const id of fs.readdirSync(path.join(root, 'songs')).filter(x => /^\d+$/.test(x))) {
  const metadata = path.join(root, 'songs', id, 'song.json');
  const song = JSON.parse(fs.readFileSync(metadata, 'utf8'));
  const source = path.resolve(root, song.media.audio.path);
  const targetRel = `media/preload/${id}.wav`, target = path.join(root, targetRel), temp = target + '.staging.wav';
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const result = spawnSync(ffmpeg, ['-v', 'error', '-y', '-i', source, '-map', '0:a:0', '-vn', '-c:a', 'pcm_f32le', temp], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`FFmpeg failed for ${id}: ${result.stderr}`);
  try {
    const wav = fs.readFileSync(temp); let rate, channels, payload;
    for (let p = 12; p + 8 <= wav.length;) {
      const size = wav.readUInt32LE(p + 4), name = wav.toString('ascii', p, p + 4);
      if (p + 8 + size > wav.length) throw new Error('Truncated conversion output');
      if (name === 'fmt ') { channels = wav.readUInt16LE(p + 10); rate = wav.readUInt32LE(p + 12); }
      if (name === 'data') payload = wav.subarray(p + 8, p + 8 + size);
      p += 8 + size + (size & 1);
    }
    if (!payload || !rate || !channels || payload.length + 44 > MAX_PRELOAD_BYTES) throw new Error(`Song ${id} exceeds complete-audio limit or has invalid audio`);
    const header = Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(payload.length + 36, 4);header.write('WAVEfmt ', 8);header.writeUInt32LE(16, 16);header.writeUInt16LE(3, 20);header.writeUInt16LE(channels, 22);header.writeUInt32LE(rate, 24);header.writeUInt32LE(rate * channels * 4, 28);header.writeUInt16LE(channels * 4, 32);header.writeUInt16LE(32, 34);header.write('data', 36);header.writeUInt32LE(payload.length, 40);
    fs.writeFileSync(target, Buffer.concat([header, payload]));
    const info = inspectPcmWav(target);
    song.media.audio.preload = { path: targetRel };
    fs.writeFileSync(metadata, JSON.stringify(song, null, 2) + '\n');
    console.log(`PASS ${id}: ${info.sampleRate} Hz / ${info.channels} channels / ${info.sampleFrames} frames / ${info.bytes} bytes`);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
