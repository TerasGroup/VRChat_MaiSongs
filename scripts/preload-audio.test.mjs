import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectPcmWav } from './lib/preload-audio.mjs';

function wave() {
  const b=Buffer.alloc(44+32);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);b.writeUInt16LE(2,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(384000,28);b.writeUInt16LE(8,32);b.writeUInt16LE(32,34);b.write('data',36);b.writeUInt32LE(32,40);return b;
}
function inspect(bytes) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vmc-preload-'));const file=path.join(dir,'fixture.wav');
  try { fs.writeFileSync(file,bytes);return inspectPcmWav(file); }
  finally { fs.unlinkSync(file);fs.rmdirSync(dir); }
}
test('complete stereo float audio has deterministic frames and fingerprint',()=>{
  const first=inspect(wave()),second=inspect(wave());assert.equal(first.sampleFrames,4);assert.equal(first.channels,2);assert.equal(first.sampleRate,48000);assert.equal(first.sha256,second.sha256);
});
test('truncated downloads cannot be published',()=>assert.throws(()=>inspect(wave().subarray(0,73)),/length|header|Truncated/));
test('wrong codec cannot enter complete-audio slot',()=>{const b=wave();b.writeUInt16LE(1,20);assert.throws(()=>inspect(b),/float32/);});
test('partial interleaved frames rejected',()=>{const b=wave().subarray(0,72);b.writeUInt32LE(b.length-8,4);b.writeUInt32LE(28,40);assert.throws(()=>inspect(b),/samples/);});
test('non-finite PCM rejected before distribution',()=>{const b=wave();b.writeFloatLE(NaN,44);assert.throws(()=>inspect(b),/Non-finite/);});
test('unsupported channel counts rejected',()=>{const b=wave();b.writeUInt16LE(6,22);assert.throws(()=>inspect(b),/format/);});
