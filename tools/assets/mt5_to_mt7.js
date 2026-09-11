import { createHash } from 'node:crypto';
import { BinaryReader } from '../../src/BinaryReader.js';
import { Mt5Loader } from '../../src/Mt5Loader.js';
import { parseMt7 } from '../../src/Mt7Parser.js';

// A deliberately narrow, template-assisted STATIC model converter. Source-space
// geometry comes from the runtime's MT5 polygon decoder, never Babylon meshes.
// Native material/node metadata comes from a user-supplied retail MT7; it is not
// a claimed translation of every MT5 draw-state command. See the tool guide.
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const vec3 = (b, at) => [0, 4, 8].map(i => b.readFloatLE(at + i));
const xyz = values => Object.fromEntries(['x', 'y', 'z'].map((key, i) => [key, values[i]]));

// The interactive reader intentionally tolerates incomplete assets. Exporting
// must not turn its zero-filled/truncated reads into a plausible output file.
class StrictReader extends BinaryReader {
  canRead(length) {
    check(Number.isInteger(length) && length >= 0 && this.offset + length <= this.size,
      `Truncated MT5 read at 0x${this.offset.toString(16)} (${length} bytes)`);
    return true;
  }
  seek(offset) {
    check(Number.isInteger(offset) && offset >= 0 && offset <= this.size, 'MT5 pointer outside file');
    this.offset = offset;
  }
  readBytes(length) { this.canRead(length); return super.readBytes(length); }
}

class ConversionLoader extends Mt5Loader {
  readPolygons(...args) { return super.readPolygons(...args, { strict: true }); }
}

function readSource(bytes) {
  const b = Buffer.from(bytes);
  const range = (at, size) => check(Number.isInteger(at) && at >= 0 && size >= 0 && at + size <= b.length,
    `MT5 range outside file at 0x${at.toString(16)} (${size} bytes)`);
  range(0, 12);
  check(b.toString('ascii', 0, 4) === 'HRCM', 'Expected an uncompressed HRCM/MT5 file');
  const reader = new StrictReader(b.buffer, b.byteOffset, b.byteLength);
  const loader = new ConversionLoader(null);
  const nodes = [];
  const seen = new Set();
  const pending = [[b.readUInt32LE(8), 0]];
  while (pending.length) {
    const [at, parent] = pending.pop();
    range(at, 64);
    check(at >= 12 && !seen.has(at), 'Invalid or cyclic MT5 hierarchy');
    check(nodes.length < 4096, 'MT5 hierarchy exceeds converter node limit');
    seen.add(at);
    const flag = b.readUInt32LE(at);
    check((flag & 0xffff) < 0x7001 || (flag & 0xffff) > 0x7015,
      'Character controller hierarchies are not supported by this static converter');
    const node = {
      addr: at, flag, parentAddr: parent,
      modelAddr: b.readUInt32LE(at + 4),
      rotationRaw: [8, 12, 16].map(i => b.readInt32LE(at + i)),
      scl: xyz(vec3(b, at + 20)), pos: xyz(vec3(b, at + 32)),
      child: b.readUInt32LE(at + 44), sibling: b.readUInt32LE(at + 48),
    };
    node.rot = xyz(node.rotationRaw.map(v => v * Math.PI * 2 / 65536));
    check(b.readUInt32LE(at + 52) === parent, `MT5 parent pointer mismatch at 0x${at.toString(16)}`);
    check([...Object.values(node.pos), ...Object.values(node.scl)].every(Number.isFinite), 'Non-finite MT5 transform');
    if (node.modelAddr) {
      range(node.modelAddr, 32);
      const vertices = b.readUInt32LE(node.modelAddr + 4);
      const count = b.readUInt32LE(node.modelAddr + 8);
      const polygons = b.readUInt32LE(node.modelAddr + 12);
      check(count > 0 && vertices > 0 && polygons > 0, 'Empty or missing MT5 geometry');
      range(vertices, count * 24);
      range(polygons, 2);
      reader.seek(node.modelAddr);
      node.model = loader.readModel(reader, node, nodes);
      check(node.model.polygons.length > 0, 'MT5 mesh has no supported polygons');
    }
    nodes.push(node);
    if (node.sibling) pending.push([node.sibling, parent]);
    if (node.child) pending.push([node.child, at]);
  }
  const tex = b.readUInt32LE(4);
  range(tex, 12);
  check(b.toString('ascii', tex, tex + 4) === 'TEXD', 'MT5 needs an embedded TEXD texture table');
  const headerSize = b.readUInt32LE(tex + 4);
  check(headerSize >= 12, 'Invalid TEXD header size');
  let cursor = tex + headerSize;
  const textureCount = b.readUInt32LE(tex + 8);
  check(textureCount > 0 && textureCount <= 4096, 'Invalid or unsupported MT5 texture count');
  const textures = [];
  for (let i = 0; i < textureCount; i++) {
    range(cursor, 16);
    check(b.toString('ascii', cursor, cursor + 4) === 'TEXN',
      'First pass requires embedded TEXN textures; external NAME/PKF references are not supported');
    const length = b.readUInt32LE(cursor + 4);
    check(length >= 32, 'Invalid TEXN length');
    range(cursor, length);
    let pvr = cursor + 16;
    if (b.toString('ascii', pvr, pvr + 4) === 'GBIX') {
      range(pvr, 8);
      pvr += 8 + b.readUInt32LE(pvr + 4);
    }
    range(pvr, 16);
    check(b.toString('ascii', pvr, pvr + 4) === 'PVRT', 'TEXN has no supported PVRT payload');
    const pvrSize = 8 + b.readUInt32LE(pvr + 4);
    check(pvrSize >= 16 && pvr + pvrSize <= cursor + length, 'PVRT exceeds TEXN bounds');
    textures.push({ id: b.subarray(cursor + 8, cursor + 16).toString('hex'), pvr: b.subarray(pvr, pvr + pvrSize) });
    cursor += length;
  }
  return { nodes, textures, vertices: loader.globalVertices };
}

export function convertMt5ToMt7(sourceBytes, templateBytes) {
  const source = readSource(sourceBytes);
  const template = Buffer.from(templateBytes);
  const native = parseMt7(template);
  check(['MDP7', 'MDO7'].includes(native.signature), 'Template must be a static Dreamcast MDP7 or MDO7 model');
  check(native.warnings.length === 0, 'Template contains unsupported or malformed geometry');
  check(native.nodes.length === source.nodes.length, 'Source and template must have the same static hierarchy topology');
  const sourceIndex = new Map(source.nodes.map((n, i) => [n.addr, i]));
  const nativeIndex = new Map(native.nodes.map((n, i) => [n.offset, i]));
  const tableEnd = 16 + native.textureCount * 24;
  check(native.firstNodeOffset === tableEnd + 8 && template.readUInt32LE(tableEnd) === 1
    && template.readUInt32LE(tableEnd + 4) === native.firstNodeOffset,
  'Unsupported MT7 root table layout');
  check(native.embeddedTextures.length === native.textureCount, 'Template needs embedded TXT7 textures');
  check(template.toString('ascii', native.declaredSize, native.declaredSize + 4) === 'TXT7'
    && native.declaredSize + template.readUInt32LE(native.declaredSize + 4) === template.length,
  'Template has extra or unsupported trailing sections (FACE/CLSG are not converted)');
  const embedded = new Map(native.embeddedTextures.map(t => [t.textureIdHex, t]));
  const textureMap = source.textures.map(t => {
    const index = native.textures.findIndex(n => n.textureIdHex === t.id);
    const entry = embedded.get(t.id);
    check(index >= 0 && entry && t.pvr.equals(template.subarray(entry.byteOffset, entry.byteOffset + entry.byteLength)),
      `Template must contain the same texture ID and PVRT bytes: ${t.id}`);
    return index;
  });
  const reports = [];
  const meshBuffers = [];
  for (const [i, node] of source.nodes.entries()) {
    const target = native.nodes[i];
    check(!target.parentMismatch, `Invalid template parent pointer at node ${i}`);
    check(sourceIndex.get(node.parentAddr) === nativeIndex.get(target.parentOffset)
      && sourceIndex.get(node.child) === nativeIndex.get(target.childOffset)
      && sourceIndex.get(node.sibling) === nativeIndex.get(target.siblingOffset),
    `Hierarchy topology mismatch at node ${i}`);
    check(template.readBigUInt64LE(target.offset + 56) === 0n, 'Unsupported nonzero MT7 node extension');
    check(Boolean(node.model) === Boolean(target.mesh), `Mesh ownership mismatch at node ${i}`);
    if (!node.model) { meshBuffers.push(null); continue; }
    const parts = [];
    let vertexCount = 0;
    let triangleCount = 0;
    const positions = [];
    for (const poly of node.model.polygons) {
      check(poly.hasUV && !poly.hasColor && poly.materialColor.every(v => v === 1),
        `Node ${i}: only UV-textured, untinted strips are supported (MT5 type 0x${poly.head.toString(16)})`);
      const textureIndex = textureMap[poly.texId];
      check(textureIndex !== undefined, `Node ${i}: invalid MT5 texture index ${poly.texId}`);
      const groups = target.mesh.materialGroups.filter(g => g.textureIndex === textureIndex);
      check(groups.length === 1 && groups[0].vertexEncoding === 'float-normal',
        `Node ${i}: template needs one unambiguous float-normal material for texture ${textureIndex}`);
      const donor = groups[0];
      const donorStrip = donor.batches.find(b => b.primitive === 'triangle-strip' && b.vertices.every(v => !v.referenced));
      check(donorStrip, `Node ${i}: template material needs a full-record triangle-strip example`);
      const header = Buffer.from(template.subarray(donor.offset, donor.offset + 80));
      const streams = [];
      for (const strip of poly.strips) {
        check(strip.length >= 3, `Node ${i}: degenerate strip length`);
        check(!strip._mt5GeneratedEnvironmentUV, 'Generated environment UVs are not supported');
        const tsp = donor.tsp;
        check(Boolean(tsp & (1 << 18)) === Boolean(strip._mt5MirrorU)
          && Boolean(tsp & (1 << 17)) === Boolean(strip._mt5MirrorV), 'Template/MT5 mirror state mismatch');
        const stream = Buffer.alloc(8 + strip.length * 32);
        stream.writeUInt32LE(donorStrip.baseType | (strip._mt5FlipFirstTriangle ? 0x80 : 0), 0);
        stream.writeUInt32LE(strip.length, 4);
        strip.forEach((v, vertexIndex) => {
          check(!v.vertexOverride && v.externalParentVertexOffset == null, 'Parent-vertex attachments are not supported');
          check(v.idx >= node.model.vertexBase && v.idx < node.model.vertexBase + node.model.nbVertex,
            'MT5 vertex index outside its mesh');
          const vertex = source.vertices[v.idx];
          const values = [...vertex.sourcePos, ...vertex.sourceNorm, v.u, v.v];
          check(values.every(Number.isFinite), 'Non-finite vertex data');
          const at = 8 + vertexIndex * 32;
          values.forEach((value, component) => stream.writeFloatLE(value, at + component * 4));
          check((stream.readUInt32LE(at) >>> 28) !== 5, 'Position collides with MT7 relative-reference marker');
          // This prototype emits full records only and clears the V control
          // bits, as the reader does. Native control-bit semantics still need
          // emulator validation; reader success alone is not game compatibility.
          stream.writeUInt32LE((stream.readUInt32LE(at + 28) & 0xfffffffc) >>> 0, at + 28);
          positions.push(vertex.sourcePos);
        });
        vertexCount += strip.length;
        triangleCount += strip.length - 2;
        streams.push(stream);
      }
      const data = Buffer.concat(streams);
      header.writeUInt32LE(data.length, 76);
      parts.push(header, data);
    }
    const mesh = Buffer.from(template.subarray(target.mesh.offset, target.mesh.offset + 24));
    const min = [0, 1, 2].map(axis => positions.reduce((n, p) => Math.min(n, p[axis]), Infinity));
    const max = [0, 1, 2].map(axis => positions.reduce((n, p) => Math.max(n, p[axis]), -Infinity));
    const center = min.map((v, axis) => (v + max[axis]) / 2);
    const radius = positions.reduce((r, p) => Math.max(r, Math.hypot(...p.map((v, axis) => v - center[axis]))), 0);
    check([...center, radius].every(v => Number.isFinite(Math.fround(v))), 'MT5 bounds overflow float32');
    [...center, radius].forEach((v, index) => mesh.writeFloatLE(v, 8 + index * 4));
    const end = Buffer.alloc(8);
    end.writeUInt32LE(vertexCount, 4);
    meshBuffers.push(Buffer.concat([mesh, ...parts, end]));
    reports.push({ node: i, vertices: vertexCount, triangles: triangleCount, materialGroups: node.model.polygons.length });
  }
  const prefix = Buffer.from(template.subarray(0, native.firstNodeOffset));
  const nodeOffset = i => native.firstNodeOffset + i * 64;
  let cursor = nodeOffset(source.nodes.length);
  const nodeBuffers = source.nodes.map((node, i) => {
    const bytes = Buffer.from(template.subarray(native.nodes[i].offset, native.nodes[i].offset + 64));
    Object.values(node.pos).forEach((v, axis) => bytes.writeFloatLE(v, 4 + axis * 4));
    node.rotationRaw.forEach((v, axis) => bytes.writeInt32LE(v, 16 + axis * 4));
    Object.values(node.scl).forEach((v, axis) => bytes.writeFloatLE(v, 28 + axis * 4));
    bytes.writeUInt32LE(meshBuffers[i] ? cursor : 0, 40);
    [node.child, node.sibling, node.parentAddr].forEach((addr, index) => bytes.writeUInt32LE(addr ? nodeOffset(sourceIndex.get(addr)) : 0, 44 + index * 4));
    cursor += meshBuffers[i]?.length || 0;
    return bytes;
  });
  prefix.writeUInt32LE(cursor, 4);
  const bytes = Buffer.concat([prefix, ...nodeBuffers, ...meshBuffers.filter(Boolean), template.subarray(native.declaredSize)]);
  const parsed = parseMt7(bytes);
  check(parsed.warnings.length === 0, 'Generated MT7 failed parser validation');
  return {
    bytes,
    report: {
      version: 1, mode: 'template-assisted-static', sourceSha256: hash(sourceBytes), templateSha256: hash(templateBytes),
      outputSha256: hash(bytes), outputBytes: bytes.length, nodes: source.nodes.length, textures: source.textures.length, meshes: reports,
      limitations: [
        'Experimental Dreamcast output; not tested in the original game or an emulator.',
        'Materials and native node IDs are inherited from the template, not translated from MT5 draw state.',
        'No character, animation, FACE/CLSG, vertex-color, external texture, or parent-attachment conversion.',
        'Full vertex records using the first full-record donor strip opcode; low two V control bits are cleared. Native stream execution remains unverified.',
      ],
    },
  };
}
