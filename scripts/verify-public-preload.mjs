import fs from 'node:fs';
import crypto from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const expected=JSON.parse(fs.readFileSync('songs.json','utf8'));
const base=expected.publicBaseUrl.replace(/\/$/,'');
async function verify() {
  const catalogResponse=await fetch(`${base}/songs.json`,{signal:AbortSignal.timeout(60_000),cache:'no-store'});
  if(!catalogResponse.ok)throw new Error(`Catalog HTTP ${catalogResponse.status}`);
  const catalog=await catalogResponse.json();
  if(catalog.catalogSha256!==expected.catalogSha256)throw new Error('Pages catalog has not reached this publication yet');
  const songs=[];
  for(const song of catalog.songs){
    const meta=song.media.audio.preload;
    if(!meta)throw new Error(`Missing preload for ${song.songId}`);
    const url=`${base}/runtime/${String(song.runtimeSlot).padStart(catalog.runtime.slotPadWidth,'0')}/audio.wav`;
    const response=await fetch(url,{signal:AbortSignal.timeout(180_000)});
    if(response.status!==200)throw new Error(`Audio HTTP ${response.status}: ${url}`);
    const hash=crypto.createHash('sha256');let bytes=0;
    for await(const chunk of response.body){hash.update(chunk);bytes+=chunk.byteLength;}
    const sha256=hash.digest('hex');
    if(bytes!==meta.bytes||sha256!==meta.sha256)throw new Error(`Public audio bytes/hash mismatch: ${url}`);
    const row={songId:song.songId,url,status:200,bytes,sha256};songs.push(row);console.log('PASS_PUBLIC_AUDIO '+JSON.stringify(row));
  }
  const report={pass:true,catalogSha256:catalog.catalogSha256,songs};fs.writeFileSync('public-audio-verification.json',JSON.stringify(report,null,2)+'\n');console.log('PASS_PUBLIC_PRELOAD '+JSON.stringify(report));
}
for(let attempt=1;;attempt++){
  try{await verify();break;}
  catch(error){if(attempt>=6)throw error;console.log(`Waiting for Pages propagation (${attempt}/6): ${error.message}`);await delay(10_000);}
}
