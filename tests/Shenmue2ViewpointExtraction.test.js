import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractViewpoints } from '../tools/worlds/build_shenmue2_viewpoints.mjs';

test('arrival candidates use reciprocal destination-side records, not outgoing route coordinates', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2-viewpoint-test-'));
  try {
    fs.mkdirSync(path.join(root,'data/MISC'), {recursive:true});
    const bytes = Buffer.alloc(16 + 64);
    bytes.writeUInt32LE(bytes.length,12);
    for (const [offset,id,area,entry,x] of [[16,88,'ROOM',1,100],[48,1,'ROAD',88,200]]) {
      bytes.writeUInt32LE(id,offset); bytes.write(area,offset+4);
      bytes.writeUInt32LE(entry,offset+8); bytes.writeFloatLE(x,offset+12);
      bytes.writeUInt16LE(49152,offset+24);
    }
    fs.writeFileSync(path.join(root,'data/MISC/AREATBL2.BIN'),bytes);
    const catalog={models:[{filename:'S2DC_D2_ROOM_MPK00_MAP.MT7',disc:2,scene:'02',area:'ROOM'}]};
    const poses=extractViewpoints(root,catalog)['2/02/ROOM'];
    assert.equal(poses.length,1);
    assert.deepEqual(poses[0].position,[-200,0,0]);
    assert.equal(poses[0].source,'AREATBL2.BIN@0x30');
    assert.equal(poses[0].entry,1);
    assert.equal(poses[0].sourceSha256.length,64);
    assert.equal(poses[0].yaw,-Math.PI/2);
    assert.deepEqual(extractViewpoints(root,{models:[{filename:'S2DC_D4_TEST_MPK00_MAP.MT7'}]}),{});
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
