const MT7_SIGNATURES = new Set([
  "MDC7",
  "MDL7",
  "MDO7",
  "MDP7",
]);

const SUPPORTED_VERTEX_TYPES = new Set([
  0x49,
  0x4a,
  0x51,
  0x52,
  0x53,
  0x56,
  0x69,
  0x6a,
  0x71,
  0x72,
  0x73,
  0x76,
]);

const TRIANGLE_LIST_VERTEX_TYPES = new Set([
  0x69,
  0x6a,
]);

function exactArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  throw new TypeError("Expected MT7 bytes");
}

function fourCC(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function textureIdHex(view, offset) {
  let result = "";
  for (let index = 0; index < 8; index += 1) {
    result += view.getUint8(offset + index).toString(16).padStart(2, "0");
  }
  return result;
}

function pvrFloat(reader, offset, clearLowBits = 0) {
  if (clearLowBits === 0) return reader.f32(offset);
  const raw = reader.u32(offset) & ~clearLowBits;
  const scratch = new ArrayBuffer(4);
  const view = new DataView(scratch);
  view.setUint32(0, raw, true);
  return view.getFloat32(0, true);
}

class Mt7Reader {
  constructor(bytes) {
    this.buffer = exactArrayBuffer(bytes);
    this.view = new DataView(this.buffer);
    this.size = this.buffer.byteLength;
  }

  require(offset, length, label) {
    if (!Number.isInteger(offset) || offset < 0 || offset + length > this.size) {
      throw new Error(`${label} exceeds MT7 bounds at 0x${offset.toString(16)}`);
    }
  }

  u32(offset, label = "uint32") {
    this.require(offset, 4, label);
    return this.view.getUint32(offset, true);
  }

  i32(offset, label = "int32") {
    this.require(offset, 4, label);
    return this.view.getInt32(offset, true);
  }

  f32(offset, label = "float32") {
    this.require(offset, 4, label);
    return this.view.getFloat32(offset, true);
  }

  vec2(offset, label = "vec2") {
    return [this.f32(offset, label), this.f32(offset + 4, label)];
  }

  vec3(offset, label = "vec3") {
    return [
      this.f32(offset, label),
      this.f32(offset + 4, label),
      this.f32(offset + 8, label),
    ];
  }
}

function parseTextureEntries(reader, textureCount) {
  const metadataOffset = 0x10;
  const idsOffset = metadataOffset + textureCount * 0x10;
  reader.require(metadataOffset, textureCount * 0x18, "MT7 texture table");
  const entries = [];
  for (let index = 0; index < textureCount; index += 1) {
    const metadata = metadataOffset + index * 0x10;
    const idOffset = idsOffset + index * 8;
    entries.push({
      index,
      width: reader.view.getUint16(metadata, true),
      height: reader.view.getUint16(metadata + 2, true),
      unknown1: reader.u32(metadata + 4),
      unknown2: reader.u32(metadata + 8),
      authoredIndex: reader.u32(metadata + 12),
      textureIdHex: textureIdHex(reader.view, idOffset),
    });
  }
  return entries;
}

function parseEmbeddedTextures(reader, declaredSize) {
  const textures = [];
  let cursor = Math.max(0, declaredSize);
  while (cursor + 12 <= reader.size) {
    const signature = fourCC(reader.view, cursor);
    if (signature !== "TXT7") {
      cursor += 4;
      continue;
    }
    const sectionSize = reader.u32(cursor + 4, "TXT7 size");
    const count = reader.u32(cursor + 8, "TXT7 count");
    const sectionEnd = cursor + sectionSize;
    if (sectionSize < 12 || sectionEnd > reader.size) {
      throw new Error(`TXT7 section exceeds MT7 bounds at 0x${cursor.toString(16)}`);
    }
    const offsetsStart = cursor + 12;
    const idsStart = offsetsStart + count * 4;
    reader.require(offsetsStart, count * 12, "TXT7 tables");
    for (let index = 0; index < count; index += 1) {
      const relativeOffset = reader.u32(offsetsStart + index * 4);
      const dataOffset = cursor + relativeOffset;
      reader.require(dataOffset, 12, "TXT7 texture");
      let pvrOffset = dataOffset;
      if (fourCC(reader.view, pvrOffset) === "GBIX") {
        pvrOffset += 8 + reader.u32(pvrOffset + 4, "GBIX size");
      }
      if (fourCC(reader.view, pvrOffset) !== "PVRT") {
        throw new Error(`TXT7 entry ${index} has no PVRT payload`);
      }
      const pvrLength = 8 + reader.u32(pvrOffset + 4, "PVRT size");
      reader.require(pvrOffset, pvrLength, "PVRT payload");
      textures.push({
        index,
        textureIdHex: textureIdHex(reader.view, idsStart + index * 8),
        byteOffset: pvrOffset,
        byteLength: pvrLength,
      });
    }
    cursor = sectionEnd;
  }
  return textures;
}

function signedNormalizedByte(value) {
  return Math.max(-1, value / 127);
}

function packedNormal(reader, offset) {
  reader.require(offset, 4, "MT7 packed normal");
  return [0, 1, 2].map((index) => signedNormalizedByte(
    reader.view.getInt8(offset + index),
  ));
}

function packedArgb(reader, offset) {
  const value = reader.u32(offset, "MT7 packed ARGB color");
  return [
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
    value >>> 24,
  ].map((channel) => channel / 255);
}

function parseFullVertex(reader, offset, packedNormalColor = false) {
  reader.require(offset, 32, "MT7 vertex");
  return {
    sourceOffset: offset,
    position: reader.vec3(offset, "MT7 vertex position"),
    normal: packedNormalColor
      ? packedNormal(reader, offset + 12)
      : reader.vec3(offset + 12, "MT7 vertex normal"),
    color: packedNormalColor ? packedArgb(reader, offset + 16) : null,
    offsetColor: packedNormalColor ? packedArgb(reader, offset + 20) : null,
    vertexEncoding: packedNormalColor ? "packed-normal-color" : "float-normal",
    // Dreamcast MT7 stores strip-control bits in the otherwise float32 V word.
    uv: [reader.f32(offset + 24), pvrFloat(reader, offset + 28, 0x3)],
    referenced: false,
  };
}

function parseReferencedVertex(reader, offset, packedNormalColor = false) {
  reader.require(offset, 8, "MT7 referenced vertex");
  const referenceControl = reader.u32(offset);
  const geometryRelativeOffset = reader.i32(offset + 4);
  const recordEnd = offset + 8;
  const geometryOffset = recordEnd + geometryRelativeOffset;
  // The second word points back to a complete 32-byte vertex record. The
  // 0x5f-prefixed first word is compact-record control, not a second pointer;
  // treating its low 24 bits as a UV displacement produces negative targets,
  // NaNs, and values from unrelated normal words in valid retail models.
  reader.require(geometryOffset, 32, "MT7 referenced geometry");
  return {
    sourceOffset: offset,
    geometrySourceOffset: geometryOffset,
    uvSourceOffset: geometryOffset + 24,
    referenceControl,
    position: reader.vec3(geometryOffset, "MT7 referenced position"),
    normal: packedNormalColor
      ? packedNormal(reader, geometryOffset + 12)
      : reader.vec3(geometryOffset + 12, "MT7 referenced normal"),
    color: packedNormalColor ? packedArgb(reader, geometryOffset + 16) : null,
    offsetColor: packedNormalColor ? packedArgb(reader, geometryOffset + 20) : null,
    vertexEncoding: packedNormalColor ? "packed-normal-color" : "float-normal",
    uv: [reader.f32(geometryOffset + 24), pvrFloat(reader, geometryOffset + 28, 0x3)],
    referenced: true,
  };
}

function parseMaterialGroup(reader, offset, index) {
  reader.require(offset, 80, "MT7 material-group header");
  const vertexDataSize = reader.u32(offset + 76, "MT7 vertex data size");
  let cursor = offset + 80;
  const end = cursor + vertexDataSize;
  reader.require(cursor, vertexDataSize, "MT7 vertex data");
  const group = {
    index,
    offset,
    polygonControl: reader.u32(offset),
    isp: reader.u32(offset + 4),
    tsp: reader.u32(offset + 8),
    textureControl: reader.u32(offset + 12),
    textureControlPixelFormat: reader.u32(offset + 12) >>> 26,
    // Each material group has its own index into the model-local texture table.
    textureIndex: reader.u32(offset + 32),
    vertexDataSize,
    batches: [],
    warning: null,
  };
  // PowerVR color-format 1 is the MT7 compact-lit layout: signed-byte XYZ
  // normal, packed ARGB base color, then packed ARGB offset color. Treating
  // those three words as float normals creates NaNs on authored ocean maps.
  const packedNormalColor = ((group.polygonControl >>> 4) & 0x3) === 1;
  group.vertexEncoding = packedNormalColor
    ? "packed-normal-color"
    : "float-normal";

  try {
    while (cursor < end) {
      reader.require(cursor, 8, "MT7 vertex batch");
      const type = reader.u32(cursor);
      const primitiveCount = reader.u32(cursor + 4);
      const baseType = type & 0x7f;
      if (!SUPPORTED_VERTEX_TYPES.has(baseType)) {
        throw new Error(
          `unsupported MT7 vertex type 0x${type.toString(16)} at 0x${cursor.toString(16)}`,
        );
      }
      if (primitiveCount === 0 || primitiveCount > 1_000_000) {
        throw new Error(`invalid MT7 primitive count ${primitiveCount} at 0x${cursor.toString(16)}`);
      }
      // 0x69/0x6a are explicit triangle lists. Their header word is the
      // triangle count, followed by three ordinary full/reference records per
      // triangle. Treating that word as a strip vertex count discarded the
      // final face polygons on retail characters. The converted Xbox model is
      // an independent oracle: KP5_L's 0x6a count of eight becomes exactly the
      // eight triangles present in its XB01 index list.
      const primitive = TRIANGLE_LIST_VERTEX_TYPES.has(baseType)
        ? "triangles"
        : "triangle-strip";
      const vertexCount = primitive === "triangles"
        ? primitiveCount * 3
        : primitiveCount;
      cursor += 8;
      const vertices = [];
      for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
        const marker = reader.u32(cursor, "MT7 vertex marker");
        if ((marker >>> 28) === 0x5) {
          vertices.push(parseReferencedVertex(reader, cursor, packedNormalColor));
          cursor += 8;
        } else {
          vertices.push(parseFullVertex(reader, cursor, packedNormalColor));
          cursor += 32;
        }
      }
      group.batches.push({
        type,
        baseType,
        primitive,
        primitiveCount,
        reverseWinding: Boolean(type & 0x80),
        vertices,
        materialGroupIndex: index,
      });
    }
    if (cursor !== end) {
      throw new Error(
        `MT7 vertex data ended at 0x${cursor.toString(16)}, expected 0x${end.toString(16)}`,
      );
    }
  } catch (error) {
    // The group size is explicit, so an unsupported vertex encoding does not
    // prevent later, independently sized material groups from being decoded.
    // Keep any complete primitives decoded before an unsupported command.
    group.warning = error.message;
  }

  return { group, end };
}

function parseMesh(reader, offset) {
  // A mesh begins with a 24-byte common header, followed by one or more
  // independently sized 80-byte material headers + vertex streams. A zero
  // polygon-control word and total-vertex-count word terminate the mesh.
  reader.require(offset, 24, "MT7 mesh header");
  const version = reader.u32(offset);
  const flags = reader.u32(offset + 4);
  if (version !== 1) {
    throw new Error(`unsupported MT7 mesh version ${version}`);
  }
  const materialGroups = [];
  let cursor = offset + 24;
  let totalVertexCount = null;
  while (true) {
    reader.require(cursor, 8, "MT7 material group or terminator");
    if (reader.u32(cursor) === 0) {
      totalVertexCount = reader.u32(cursor + 4, "MT7 total vertex count");
      cursor += 8;
      break;
    }
    const parsed = parseMaterialGroup(reader, cursor, materialGroups.length);
    materialGroups.push(parsed.group);
    cursor = parsed.end;
    if (materialGroups.length > 4096) {
      throw new Error(`too many MT7 material groups at 0x${offset.toString(16)}`);
    }
  }

  if (materialGroups.length === 0) {
    throw new Error(`MT7 mesh has no material groups at 0x${offset.toString(16)}`);
  }
  const first = materialGroups[0];

  return {
    offset,
    version,
    flags,
    materialGroupCount: materialGroups.length,
    boundsCenter: reader.vec3(offset + 8, "MT7 mesh center"),
    boundsRadius: reader.f32(offset + 20, "MT7 mesh radius"),
    totalVertexCount,
    materialGroups,
    // Retain first-group aliases for callers inspecting older parsed output.
    polygonControl: first.polygonControl,
    isp: first.isp,
    tsp: first.tsp,
    textureControl: first.textureControl,
    textureControlPixelFormat: first.textureControlPixelFormat,
    textureIndex: first.textureIndex,
    vertexDataSize: materialGroups.reduce((sum, group) => sum + group.vertexDataSize, 0),
    batches: materialGroups.flatMap((group) => group.batches),
  };
}

function parseNodes(reader, firstNodeOffset) {
  const nodes = [];
  const warnings = [];
  const visited = new Set();

  function visit(offset, expectedParentOffset = 0) {
    if (offset === 0) return null;
    if (visited.has(offset)) {
      throw new Error(`cyclic MT7 node pointer at 0x${offset.toString(16)}`);
    }
    visited.add(offset);
    reader.require(offset, 64, "MT7 node");
    const meshOffset = reader.u32(offset + 40);
    const childOffset = reader.u32(offset + 44);
    const siblingOffset = reader.u32(offset + 48);
    const parentOffset = reader.u32(offset + 52);
    const id = reader.u32(offset);
    const node = {
      offset,
      id,
      position: reader.vec3(offset + 4, "MT7 node position"),
      rotationRaw: [
        reader.i32(offset + 16),
        reader.i32(offset + 20),
        reader.i32(offset + 24),
      ],
      scale: reader.vec3(offset + 28, "MT7 node scale"),
      meshOffset,
      childOffset,
      siblingOffset,
      parentOffset,
      parentMismatch: parentOffset !== expectedParentOffset,
      mesh: null,
      child: null,
      sibling: null,
    };
    if (meshOffset !== 0) {
      try {
        node.mesh = parseMesh(reader, meshOffset);
        for (const group of node.mesh.materialGroups) {
          if (group.warning) {
            warnings.push({
              nodeOffset: offset,
              meshOffset,
              materialGroupOffset: group.offset,
              message: group.warning,
            });
          }
        }
      } catch (error) {
        warnings.push({
          nodeOffset: offset,
          meshOffset,
          message: error.message,
        });
      }
    }
    nodes.push(node);
    node.child = visit(childOffset, offset);
    node.sibling = visit(siblingOffset, expectedParentOffset);
    return node;
  }

  return { root: visit(firstNodeOffset), nodes, warnings };
}

function classifyRuntimeTextureGeometry(nodes) {
  let materialGroupCount = 0;
  let runtimeTextureGroupCount = 0;
  for (const node of nodes) {
    for (const group of node.mesh?.materialGroups || []) {
      materialGroupCount += 1;
      const textureEnabled = Boolean(group.polygonControl & (1 << 3));
      const textureVramAddress = group.textureControl & 0x001fffff;
      if (
        textureEnabled
        && textureVramAddress === 0
        && group.textureIndex === 0xffffffff
      ) {
        // These headers reference texture memory populated by the running
        // game, not a texture omitted from the MT7/PKF extraction. Preserve
        // the geometry for later renderer research, but mark it so viewers do
        // not present an invented white material as authored scenery.
        group.textureSource = "runtime-vram";
        group.runtimeTexture = {
          vramAddress: textureVramAddress,
          width: 8 << ((group.tsp >>> 3) & 0x7),
          height: 8 << (group.tsp & 0x7),
          nonTwiddled: Boolean(group.textureControl & (1 << 26)),
        };
        runtimeTextureGroupCount += 1;
      } else {
        group.textureSource = group.textureIndex === 0xffffffff
          ? "none"
          : "model-table";
        group.runtimeTexture = null;
      }
    }
  }
  return {
    runtimeTextureGroupCount,
    auxiliaryGeometry: (
      materialGroupCount > 0
      && runtimeTextureGroupCount === materialGroupCount
    ) ? {
        kind: "runtime-textured-auxiliary",
        visibleByDefault: false,
        materialGroupCount,
      } : null,
  };
}

export function isMt7(bytes) {
  try {
    const buffer = exactArrayBuffer(bytes);
    if (buffer.byteLength < 4) return false;
    return MT7_SIGNATURES.has(fourCC(new DataView(buffer), 0));
  } catch {
    return false;
  }
}

export function parseMt7(bytes) {
  const reader = new Mt7Reader(bytes);
  reader.require(0, 16, "MT7 header");
  const signature = fourCC(reader.view, 0);
  if (!MT7_SIGNATURES.has(signature)) {
    throw new Error(`unsupported MT7 signature ${signature}`);
  }
  const declaredSize = reader.u32(4, "MT7 size");
  const firstNodeOffset = reader.u32(8, "MT7 first node offset");
  const textureCount = reader.u32(12, "MT7 texture count");
  if (declaredSize > reader.size) {
    throw new Error(`MT7 declared size ${declaredSize} exceeds ${reader.size} bytes`);
  }
  const textures = parseTextureEntries(reader, textureCount);
  const embeddedTextures = parseEmbeddedTextures(reader, declaredSize);
  const nodeTree = parseNodes(reader, firstNodeOffset);
  const runtimeTextureGeometry = classifyRuntimeTextureGeometry(nodeTree.nodes);
  return {
    signature,
    declaredSize,
    byteLength: reader.size,
    firstNodeOffset,
    textureCount,
    textures,
    embeddedTextures,
    ...nodeTree,
    ...runtimeTextureGeometry,
  };
}

export function mt7TriangleIndices(vertexCount, reverseWinding = false) {
  const indices = [];
  for (let index = 0; index + 2 < vertexCount; index += 1) {
    const flip = Boolean(index & 1) !== Boolean(reverseWinding);
    indices.push(
      index,
      flip ? index + 2 : index + 1,
      flip ? index + 1 : index + 2,
    );
  }
  return indices;
}

export function mt7BatchTriangleIndices(batch) {
  if (batch?.primitive !== "triangles") {
    return mt7TriangleIndices(
      batch?.vertices?.length || 0,
      batch?.reverseWinding,
    );
  }
  const indices = [];
  for (let index = 0; index + 2 < batch.vertices.length; index += 3) {
    indices.push(
      index,
      batch.reverseWinding ? index + 2 : index + 1,
      batch.reverseWinding ? index + 1 : index + 2,
    );
  }
  return indices;
}
