import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { convertMt5ToMt7 } from '../tools/assets/mt5_to_mt7.js';
import { parseMt7 } from '../src/Mt7Parser.js';

// Authored synthetic fixtures: no proprietary model bytes in the test suite.
function fixture() {
  const pvr = Buffer.alloc(144);
  pvr.write('PVRT'); pvr.writeUInt32LE(136, 4);
  pvr[8] = 1; pvr[9] = 9; pvr.writeUInt16LE(8, 12); pvr.writeUInt16LE(8, 14);
  pvr.fill(255, 16);
  const id = Buffer.from('0102030405060708', 'hex');
  const source = Buffer.alloc(380);
  source.write('HRCM'); source.writeUInt32LE(208, 4); source.writeUInt32LE(12, 8);
  source.writeUInt32LE(0xffff, 12); source.writeUInt32LE(76, 16);
  source.writeInt32LE(16384, 24);
  [32, 36, 40].forEach(at => source.writeFloatLE(1, at));
  source.writeFloatLE(7, 44);
  source.writeUInt32LE(108, 80); source.writeUInt32LE(3, 84); source.writeUInt32LE(180, 88);
  const positions = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
  positions.forEach((p, i) => [...p, 0, 0, 1].forEach((v, j) => source.writeFloatLE(v, 108 + i * 24 + j * 4)));
  source.writeUInt16LE(0x11, 180); source.writeUInt16LE(22, 182);
  source.writeUInt16LE(1, 184); source.writeInt16LE(-3, 186);
  positions.forEach((p, i) => {
    source.writeInt16LE(i, 188 + i * 6);
    source.writeInt16LE(p[0] * 256, 190 + i * 6);
    source.writeInt16LE(p[1] * 256, 192 + i * 6);
  });
  source.writeUInt16LE(0x8000, 206);
  source.write('TEXD', 208); source.writeUInt32LE(12, 212); source.writeUInt32LE(1, 216);
  source.write('TEXN', 220); source.writeUInt32LE(160, 224); id.copy(source, 228); pvr.copy(source, 236);
  const template = Buffer.alloc(496);
  template.write('MDP7'); template.writeUInt32LE(328, 4); template.writeUInt32LE(48, 8); template.writeUInt32LE(1, 12);
  template.writeUInt16LE(8, 16); template.writeUInt16LE(8, 18); id.copy(template, 32);
  template.writeUInt32LE(1, 40); template.writeUInt32LE(48, 44);
  [76, 80, 84].forEach(at => template.writeFloatLE(1, at)); template.writeUInt32LE(112, 88);
  template.writeUInt32LE(1, 112); template.writeUInt32LE(1, 116);
  template.writeUInt32LE(0x800000ac, 136); template.writeUInt32LE(0x83000000, 140);
  template.writeUInt32LE(104, 212); template.writeUInt32LE(0x56, 216); template.writeUInt32LE(3, 220);
  template.writeUInt32LE(3, 324);
  template.write('TXT7', 328); template.writeUInt32LE(168, 332); template.writeUInt32LE(1, 336);
  template.writeUInt32LE(24, 340); id.copy(template, 344); pvr.copy(template, 352);
  return { source, template, positions };
}

test('converts source geometry, UVs, winding, transforms and original texture bytes deterministically', () => {
  const { source, template, positions } = fixture();
  const originalSource = Buffer.from(source), originalTemplate = Buffer.from(template);
  const result = convertMt5ToMt7(source, template);
  const m = parseMt7(result.bytes);
  assert.deepEqual(m.warnings, []);
  assert.equal(m.nodes.length, 1);
  assert.deepEqual(m.nodes[0].position, [7, 0, 0]);
  assert.deepEqual(m.nodes[0].rotationRaw, [0, 16384, 0]);
  const batch = m.nodes[0].mesh.batches[0];
  assert.deepEqual(batch.vertices.map(v => v.position), positions);
  assert.deepEqual(batch.vertices.map(v => v.uv), [[0, 0], [1, 0], [0, 1]]);
  assert.equal(batch.reverseWinding, true);
  assert.equal(m.nodes[0].mesh.totalVertexCount, 3);
  assert.equal(m.nodes[0].mesh.boundsRadius, Math.fround(Math.SQRT1_2));
  assert.deepEqual(result.bytes.subarray(m.declaredSize), template.subarray(328));
  assert.deepEqual(convertMt5ToMt7(source, template), result);
  assert.deepEqual(source, originalSource); assert.deepEqual(template, originalTemplate);
  assert.equal(result.report.meshes[0].triangles, 1);
});

test('rejects unsupported or corrupt input rather than silently losing geometry', () => {
  const cases = [
    [b => b.writeUInt32LE(12, 56), /cyclic/],
    [b => b.writeUInt32LE(0x7001, 12), /Character/],
    [b => b.writeUInt32LE(0xffffffff, 84), /range outside/],
    [b => b.writeUInt16LE(0x7777, 180), /Unsupported MT5 chunk/],
    [b => b.writeUInt16LE(1, 182), /length mismatch/],
    [b => b.writeInt16LE(10, 188), /vertex index/],
    [b => b.writeInt16LE(-1, 188), /Parent-vertex/],
    [b => b.writeFloatLE(NaN, 108), /Non-finite/],
    [b => b.write('NAME', 220), /embedded TEXN/],
    [b => b.writeUInt32LE(10000, 240), /PVRT exceeds/],
  ];
  for (const [mutate, error] of cases) {
    const { source, template } = fixture(); mutate(source);
    assert.throws(() => convertMt5ToMt7(source, template), error);
  }
  const { source, template } = fixture();
  assert.throws(() => convertMt5ToMt7(source.subarray(0, 150), template), /range outside/);
  const differentTexture = Buffer.from(template); differentTexture[400] ^= 1;
  assert.throws(() => convertMt5ToMt7(source, differentTexture), /same texture ID and PVRT/);
});

test('relocates child/parent/mesh pointers while preserving source transforms and donor node IDs', () => {
  const original = fixture();
  const source = Buffer.concat([original.source, Buffer.alloc(64)]);
  source.writeUInt32LE(380, 56);
  source.writeUInt32LE(0xffff, 380); source.writeUInt32LE(12, 432);
  [400, 404, 408].forEach(at => source.writeFloatLE(1, at)); source.writeFloatLE(5, 412);
  const template = Buffer.concat([original.template.subarray(0, 328), Buffer.alloc(64), original.template.subarray(328)]);
  template.writeUInt32LE(392, 4); template.writeUInt32LE(328, 92);
  template.writeUInt32LE(42, 328); template.writeUInt32LE(48, 380);
  [356, 360, 364].forEach(at => template.writeFloatLE(1, at));
  const m = parseMt7(convertMt5ToMt7(source, template).bytes);
  assert.equal(m.nodes[0].childOffset, m.nodes[1].offset);
  assert.equal(m.nodes[1].parentOffset, m.nodes[0].offset);
  assert.equal(m.nodes[1].id, 42);
  assert.equal(m.nodes[0].mesh.batches[0].vertices.length, 3);
  assert.deepEqual(m.nodes[1].position, [5, 0, 0]);
  assert.deepEqual(m.warnings, []);
});

for (const code of ['GACO1IR', 'GACOKIR']) {
  const sourcePath = `extracted_disc3_v2/data/MODEL/ITEM/${code}G.MT5`;
  const templatePath = `.disc-work/shenmue2-models/models/S2DC_D1_GLOBAL_ITEM_${code}I.MT7`;
  test(`retail ${code} retains 464 triangles, 242 positions and unchanged PVR data`, {
    skip: !fs.existsSync(sourcePath) || !fs.existsSync(templatePath),
  }, () => {
    const template = fs.readFileSync(templatePath);
    const result = convertMt5ToMt7(fs.readFileSync(sourcePath), template);
    const model = parseMt7(result.bytes), native = parseMt7(template);
    const positions = m => m.nodes.flatMap(n => n.mesh.batches.flatMap(b => b.vertices.map(v => v.position)));
    const actual = positions(model), expected = positions(native);
    assert.equal(new Set(actual.map(p => p.join(','))).size, 242);
    assert.equal(result.report.meshes[0].triangles, 464);
    // The source games use different strip ordering and float quantization.
    // Compare vertex proximity, not rounded-bin equality at boundary values.
    assert.ok(actual.every(p => expected.some(q => p.every((v, axis) => Math.abs(v - q[axis]) < 0.000002))));
    assert.deepEqual(result.bytes.subarray(model.declaredSize), template.subarray(native.declaredSize));
    assert.deepEqual(model.warnings, []);
  });
}

test('CLI writes a report, refuses overwrites, and creates no output for invalid input', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt5-mt7-test-'));
  try {
    const { source, template } = fixture();
    const input = path.join(dir, 'input.MT5'), donor = path.join(dir, 'template.MT7'), output = path.join(dir, 'result.MT7');
    fs.writeFileSync(input, source); fs.writeFileSync(donor, template);
    const args = ['tools/assets/convert_mt5_to_mt7.mjs', input, output, '--template', donor];
    const run = () => spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(run().status, 0);
    assert.equal(JSON.parse(fs.readFileSync(`${output}.json`)).mode, 'template-assisted-static');
    const before = fs.readFileSync(output);
    assert.equal(run().status, 1); assert.deepEqual(fs.readFileSync(output), before);
    args[2] = path.join(dir, 'invalid.MT7'); fs.writeFileSync(input, 'invalid');
    assert.equal(run().status, 1); assert.equal(fs.existsSync(args[2]), false);
  } finally { fs.rmSync(dir, { recursive: true }); }
});
