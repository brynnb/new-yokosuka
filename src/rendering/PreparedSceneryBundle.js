import * as B from "@babylonjs/core";
import { Mt5Loader, Mt5AlphaToCoverageMaterial } from "../Mt5Loader.js";
import { buildAlphaAwareMipChain, uploadMipChain } from "../PvrDecoder.js";
import { SceneStandardMaterial } from "./SceneStandardMaterial.js";
import { SceneryTextureArrayMaterial } from "./SceneryTextureArrayMaterial.js";
import { batchStaticWorldRoots, batchStaticSceneryLayer, immutableMt5Mesh } from "./StaticWorldBatching.js";
import { isWorldMapFile } from "../WorldMapFiles.js";

export const SCENERY_BUNDLE_SCHEMA = "new-yokosuka-scenery-experiment-v2";
const COLORS = ["diffuseColor", "ambientColor", "emissiveColor", "specularColor"];
const MATERIAL = ["alpha", "backFaceCulling", "twoSidedLighting", "sideOrientation",
  "disableLighting", "specularPower", "maxSimultaneousLights", "useVertexColors",
  "useAlphaFromDiffuseTexture", "transparencyMode", "alphaCutOff", "zOffset", "zOffsetUnits",
  "separateCullingPass", "needDepthPrePass", "disableDepthWrite", "disableColorWrite",
  "fogEnabled", "useLogarithmicDepth", "useSpecularOverAlpha", "useReflectionOverAlpha"];
const MESH = ["sideOrientation", "alphaIndex", "renderingGroupId", "layerMask",
  "useVertexColors", "hasVertexAlpha", "isPickable", "checkCollisions", "receiveShadows",
  "applyFog", "visibility", "isVisible"];
const SAMPLER = ["wrapU", "wrapV", "uOffset", "vOffset", "uScale", "vScale",
  "uAng", "vAng", "wAng", "coordinatesIndex", "coordinatesMode", "level",
  "hasAlpha", "gammaSpace", "anisotropicFilteringLevel"];
const copy = value => JSON.parse(JSON.stringify(value));
const fields = (object, keys) => Object.fromEntries(keys.filter(key => object[key] !== undefined)
  .map(key => [key, object[key]]));
function enabledWithinRoot(mesh, root) {
  for (let node = mesh; node && node !== root; node = node.parent) if (!node.isEnabled(false)) return false;
  return true;
}
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
  .map(value => value.toString(16).padStart(2, "0")).join("");

class BinaryWriter {
  chunks = [];
  length = 0;
  add(array) {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const span = {offset: this.length, length: array.length, type: array.constructor.name};
    this.chunks.push({offset: this.length, bytes});
    this.length += Math.ceil(bytes.byteLength / 4) * 4;
    return span;
  }
  finish() {
    const result = new Uint8Array(this.length);
    for (const chunk of this.chunks) result.set(chunk.bytes, chunk.offset);
    return result;
  }
}

const TYPES = {Float32Array, Uint32Array, Uint8Array};
function readSpan(binary, span) {
  const Type = TYPES[span?.type];
  if (!Type || !Number.isSafeInteger(span.offset) || span.offset < 0
    || !Number.isSafeInteger(span.length) || span.length < 0
    || span.offset % Type.BYTES_PER_ELEMENT !== 0
    || span.offset + span.length * Type.BYTES_PER_ELEMENT > binary.byteLength) {
    throw new Error("Invalid scenery bundle binary span");
  }
  return new Type(binary.buffer, binary.byteOffset + span.offset, span.length);
}

function materialRecord(material) {
  if (!(material instanceof B.StandardMaterial)
    || material.getActiveTextures().some(texture => texture !== material.diffuseTexture)
    || material.pluginManager?._activePlugins.length) {
    throw new Error(`Unsupported scenery material: ${material.name}`);
  }
  return {
    ...fields(material, MATERIAL),
    ...Object.fromEntries(COLORS.map(key => [key, material[key].asArray()])),
    alphaMode: material._mt5AlphaMode,
    alphaToCoverage: material instanceof Mt5AlphaToCoverageMaterial,
  };
}

function restoreMetadata(metadata) {
  const value = copy(metadata || {});
  for (const source of value.staticBatchSources || []) {
    const bounds = source.pickingBounds;
    bounds.inverseWorld = B.Matrix.FromArray(bounds.inverseWorld);
    bounds.minimum = B.Vector3.FromArray(bounds.minimum);
    bounds.maximum = B.Vector3.FromArray(bounds.maximum);
    bounds.sphere.center = B.Vector3.FromArray(bounds.sphere.center);
  }
  return value;
}

function serialMetadata(mesh) {
  const value = {...mesh.metadata};
  if (value.staticBatchSources) value.staticBatchSources = value.staticBatchSources.map(source => ({
    ...source, meshUniqueId: undefined, pickingSubMesh: undefined,
    pickingBounds: {
      inverseWorld: source.pickingBounds.inverseWorld.asArray(),
      minimum: source.pickingBounds.minimum.asArray(), maximum: source.pickingBounds.maximum.asArray(),
      sphere: {center: source.pickingBounds.sphere.center.asArray(), radius: source.pickingBounds.sphere.radius},
    },
  }));
  return copy(value);
}

/**
 * A scene-only prototype, intentionally not a gameplay save/export format.
 * Use unbatched resident map roots after shared visibility/surface preparation.
 * Root/layer identity survives; scripts and characters are excluded. A caller
 * may additionally supply one audited fixed-placement layer. This is explicit
 * permission for its direct children only, never a global placement exemption.
 * The compiler mutates its disposable input scene. Production never calls it.
 */
export async function compileSceneryBundle(roots, {
  signal, cellSize = 128, textureArrays = true, maxArrayLayers = 64,
  provenance = {}, yieldWork = () => new Promise(resolve => setTimeout(resolve, 0)),
  fixedPlacementLayer = null,
} = {}) {
  if (!Number.isInteger(maxArrayLayers) || maxArrayLayers < 1 || maxArrayLayers > 256) {
    throw new Error("Invalid scenery texture array limit");
  }
  roots = [...roots].sort((a, b) => a === fixedPlacementLayer ? 1 : b === fixedPlacementLayer ? -1
    : String(a._filename || a.name).localeCompare(String(b._filename || b.name)));
  if (fixedPlacementLayer && !roots.includes(fixedPlacementLayer)) throw new Error("Missing fixed-placement layer");
  const fixedPlacementRoots = new Set(fixedPlacementLayer?.getChildren() || []);
  for (const root of roots) {
    if ((root !== fixedPlacementLayer && !isWorldMapFile(root._filename || ""))
      || root._runtimePlacement || root._scheduledSceneObject) throw new Error(`Unapproved scenery root: ${root.name}`);
  }
  for (const root of fixedPlacementRoots) {
    if (!root._runtimePlacement || !root.metadata?.sceneryPlacement || !root.isEnabled(false)) {
      throw new Error(`Invalid fixed-placement root: ${root.name}`);
    }
  }
  const writer = new BinaryWriter();
  const textures = [];
  const textureKeys = new Map();
  const textureRecords = new Map();
  const materials = [];
  const materialKeys = new Map();
  const materialRecords = new Map();
  const originalCount = roots.reduce((sum, root) => sum + root.getChildMeshes().filter(m => m.getTotalVertices()).length, 0);
  const rootMeshes = roots.map(root => {
    if (root.metadata?.staticBatchInputMeshCount !== undefined) throw new Error("Compile before static batching");
    return root.getChildMeshes().filter(mesh => mesh.getTotalVertices() > 0);
  });
  for (const meshes of rootMeshes) for (const mesh of meshes) {
    signal?.throwIfAborted();
    for (let node = mesh; node; node = node.parent) {
      if (node.animations?.length || node.actionManager || node._scheduledSceneObject
        || (node._runtimePlacement && !fixedPlacementRoots.has(node))
        || node.metadata?.runtimeObject || node.metadata?.nativeAseqSceneObject
        || Object.keys(node.metadata || {}).some(key => key.startsWith("interactive"))) {
        throw new Error(`Runtime-owned scenery: ${mesh.name}`);
      }
    }
    if (mesh.skeleton || mesh.morphTargetManager || !mesh.isWorldMatrixFrozen
      || mesh.subMeshes.length !== 1 || mesh.getVerticesDataKinds().some(kind => !["position", "normal", "uv", "uv2", "color"].includes(kind))) {
      throw new Error(`Non-static or unsupported scenery: ${mesh.name}`);
    }
    const material = mesh.material;
    if (materialRecords.has(material)) continue;
    const description = materialRecord(material);
    const texture = material.diffuseTexture;
    if (texture && !textureRecords.has(texture)) {
      const internal = texture.getInternalTexture();
      const pixels = internal?._bufferView;
      const {width, height} = texture.getSize();
      if (!(pixels instanceof Uint8Array) || pixels.length !== width * height * 4
        || internal.format !== B.Constants.TEXTUREFORMAT_RGBA || internal.type !== B.Constants.TEXTURETYPE_UNSIGNED_BYTE) {
        throw new Error(`Scenery requires retained RGBA pixels: ${texture.name}`);
      }
      const settings = {...fields(texture, SAMPLER), width, height,
        samplingMode: texture.samplingMode, generateMipMaps: internal.generateMipMaps,
        invertY: internal.invertY, alphaAware: internal._pvrUploadPolicy?.alphaAware === true,
        gradientAlpha: internal._pvrUploadPolicy?.gradientAlpha === true,
        preserveCoverage: internal._pvrUploadPolicy?.preserveCoverage === true};
      const hash = await digest(pixels);
      const key = JSON.stringify([settings, hash]);
      let index = textureKeys.get(key);
      if (index === undefined) {
        index = textures.length;
        textureKeys.set(key, index);
        textures.push({...settings, hash, pixels: writer.add(pixels)});
      }
      textureRecords.set(texture, index);
    }
    const record = {...description, texture: texture ? textureRecords.get(texture) : null};
    const key = JSON.stringify(record);
    let id = materialKeys.get(key);
    if (id === undefined) {
      id = materials.length;
      materialKeys.set(key, id);
      materials.push(record);
    }
    materialRecords.set(material, id);
    await yieldWork();
  }

  const arrays = [];
  const arrayGroups = new Map();
  const arrayMaterialIds = new Map();
  const assignments = [];
  if (textureArrays) for (let r = 0; r < roots.length; r++) for (const mesh of rootMeshes[r]) {
    const material = mesh.material;
    const record = materials[materialRecords.get(material)];
    const texture = record.texture === null ? null : textures[record.texture];
    // Alpha/coverage queues retain their established material and sorting code.
    // uv2 and nontrivial texture transforms are not silently reinterpreted.
    if (!immutableMt5Mesh(mesh, roots[r], {fixedPlacementRoots}) || record.alphaMode !== "opaque"
      || record.alpha !== 1 || !texture || texture.hasAlpha || texture.level !== 1
      || mesh.isVerticesDataPresent("uv2") || texture.coordinatesIndex !== 0
      || texture.uScale !== 1 || texture.vScale !== 1
      || [texture.uOffset, texture.vOffset, texture.uAng, texture.vAng, texture.wAng].some(value => value !== 0)) continue;
    const settings = {...texture};
    delete settings.hash; delete settings.pixels;
    const groupKey = JSON.stringify([{...record, texture: null}, settings]);
    if (!arrayGroups.has(groupKey)) arrayGroups.set(groupKey, {record, settings, textures: new Map(), meshes: []});
    const group = arrayGroups.get(groupKey);
    if (!group.textures.has(record.texture)) group.textures.set(record.texture, group.textures.size);
    group.meshes.push(mesh);
  }
  for (const group of arrayGroups.values()) {
    const ids = [...group.textures.keys()];
    if (ids.length < 2) continue;
    for (let start = 0; start < ids.length; start += maxArrayLayers) {
      const layers = ids.slice(start, start + maxArrayLayers);
      const arrayId = arrays.length;
      arrays.push({textures: layers, ...group.settings});
      const id = materials.length;
      materials.push({...group.record, texture: null, array: arrayId});
      const first = group.meshes.find(mesh => layers.includes(materials[materialRecords.get(mesh.material)].texture));
      const common = first.material.clone(`scenery_array_${arrayId}`);
      // A compiler marker only; the uploaded array/plugin is created by the
      // bundle reader. Material identity lets the existing batcher combine it.
      arrayMaterialIds.set(common, id);
      for (const mesh of group.meshes) {
        const layer = layers.indexOf(materials[materialRecords.get(mesh.material)]?.texture);
        if (layer < 0) continue;
        assignments.push({mesh, common, layer});
      }
    }
  }
  for (const {mesh, common, layer} of assignments) {
    const uv2 = new Float32Array(mesh.getTotalVertices() * 2);
    for (let i = 0; i < uv2.length; i += 2) uv2[i] = layer;
    mesh.setVerticesData("uv2", uv2, false);
    mesh.material = common;
  }
  // Deduplicate ordinary materials too, without changing native source IDs.
  const shared = new Map();
  for (const meshes of rootMeshes) for (const mesh of meshes) {
    if (arrayMaterialIds.has(mesh.material)) continue;
    const id = materialRecords.get(mesh.material);
    if (!shared.has(id)) shared.set(id, mesh.material);
    mesh.material = shared.get(id);
  }
  let batches;
  try {
    batches = await batchStaticWorldRoots(roots, {signal, cellSize, yieldWork});
    if (fixedPlacementLayer) batches.push({layer: "fixed-placements",
      ...await batchStaticSceneryLayer(fixedPlacementLayer, {signal, cellSize, yieldWork, fixedPlacementRoots})});
  } finally {
    // Replaced source materials no longer have mesh owners. Dispose them even
    // if batching was cancelled; the caller owns the remaining scene roots.
    const used = new Set(roots.flatMap(root => root.getChildMeshes().map(mesh => mesh.material)));
    const candidates = new Set();
    for (const material of [...materialRecords.keys(), ...arrayMaterialIds.keys()]) {
      for (const texture of material.getActiveTextures()) candidates.add(texture);
      if (!used.has(material)) material.dispose(false, false);
    }
    for (const material of used) for (const texture of material?.getActiveTextures() || []) candidates.delete(texture);
    for (const texture of candidates) texture.dispose();
  }
  const records = roots.map(root => {
    const inverse = root.getWorldMatrix().clone().invert();
    return {
      filename: root._filename, name: root._filename || root.name, enabled: root.isEnabled(false),
      matrix: root.getWorldMatrix().asArray(), metadata: serialMetadata(root),
      meshes: root.getChildMeshes().filter(mesh => mesh.getTotalVertices() > 0).map(mesh => ({
        name: mesh.name, enabled: enabledWithinRoot(mesh, root), properties: fields(mesh, MESH),
        matrix: mesh.getWorldMatrix().multiply(inverse).asArray(),
        material: arrayMaterialIds.get(mesh.material) ?? materialRecords.get(mesh.material),
        nodeAddress: mesh._mt5NodeAddress ?? null,
        originalFaceIds: mesh._mt5OriginalFaceIds ? Array.from(mesh._mt5OriginalFaceIds) : null,
        metadata: serialMetadata(mesh), alphaToCoverage: mesh._mt5AlphaToCoverage === true,
        vertices: Object.fromEntries(mesh.getVerticesDataKinds().map(kind => [kind, writer.add(new Float32Array(mesh.getVerticesData(kind)))])),
        indices: writer.add(new Uint32Array(mesh.getIndices())),
      })),
    };
  });
  const binary = writer.finish();
  const manifest = {schema: SCENERY_BUNDLE_SCHEMA, provenance, cellSize,
    binaryBytes: binary.length, binaryHash: await digest(binary),
    textures, arrays, materials, roots: records,
    statistics: {sourceMeshes: originalCount, outputMeshes: records.reduce((n, root) => n + root.meshes.length, 0),
      uniqueTextures: textures.length, arrayGroups: arrays.length, arraySourceMeshes: assignments.length, batches}};
  return {manifest, binary};
}

/** Load prebuilt scenery without MT5 parsing or mesh merging. Fail closed. */
export async function loadSceneryBundle(scene, manifest, binary, {signal} = {}) {
  signal?.throwIfAborted();
  if (manifest.schema !== SCENERY_BUNDLE_SCHEMA || binary.byteLength !== manifest.binaryBytes
    || await digest(binary) !== manifest.binaryHash) throw new Error("Invalid or corrupt scenery bundle");
  if (manifest.arrays.length && (scene.getEngine().webGLVersion < 2 || scene.getEngine().isWebGPU)) {
    throw new Error("Experimental scenery texture arrays require WebGL 2");
  }
  const ownedTextures = [], ownedMaterials = [], roots = [];
  const textures = new Map();
  const textureFor = id => {
    if (textures.has(id)) return textures.get(id);
    const record = manifest.textures[id];
    if (!record) throw new Error("Invalid scenery texture reference");
    const pixels = readSpan(binary, record.pixels);
    const texture = new B.RawTexture(pixels, record.width, record.height, B.Constants.TEXTUREFORMAT_RGBA,
      scene, record.generateMipMaps, record.invertY, record.samplingMode);
    ownedTextures.push(texture);
    Object.assign(texture, fields(record, SAMPLER));
    if (record.alphaAware && record.generateMipMaps) {
      const levels = buildAlphaAwareMipChain(pixels, record.width, record.height, {preserveCoverage: record.preserveCoverage});
      uploadMipChain(texture, levels);
    }
    textures.set(id, texture);
    return texture;
  };
  try {
    const arrays = manifest.arrays.map(record => {
      const pixels = new Uint8Array(record.width * record.height * 4 * record.textures.length);
      record.textures.forEach((id, layer) => {
        const texture = manifest.textures[id];
        if (!texture || texture.width !== record.width || texture.height !== record.height) throw new Error("Invalid scenery array layer");
        pixels.set(readSpan(binary, texture.pixels), layer * record.width * record.height * 4);
      });
      const texture = new B.RawTexture2DArray(pixels, record.width, record.height, record.textures.length,
        B.Constants.TEXTUREFORMAT_RGBA, scene, record.generateMipMaps, record.invertY, record.samplingMode);
      ownedTextures.push(texture);
      Object.assign(texture, fields(record, SAMPLER));
      return texture;
    });
    const materialFor = id => {
      if (ownedMaterials[id]) return ownedMaterials[id];
      const record = manifest.materials[id];
      if (!record) throw new Error("Invalid scenery material reference");
      const material = record.alphaToCoverage
        ? new Mt5AlphaToCoverageMaterial(`prepared_${id}`, scene)
        : new SceneStandardMaterial(`prepared_${id}`, scene);
      ownedMaterials[id] = material;
      Object.assign(material, fields(record, MATERIAL));
      for (const key of COLORS) material[key] = B.Color3.FromArray(record[key]);
      material._mt5AlphaMode = record.alphaMode;
      material._mt5PreservesAlphaForCoverage = record.alphaToCoverage;
      if (record.array !== undefined) {
        if (!arrays[record.array]) throw new Error("Invalid scenery array reference");
        new SceneryTextureArrayMaterial(material, arrays[record.array]);
      } else if (record.texture !== null) material.diffuseTexture = textureFor(record.texture);
      return material;
    };
    const coverage = new Mt5Loader(scene);
    for (const record of manifest.roots) {
      signal?.throwIfAborted();
      const root = new B.TransformNode(record.name, scene);
      roots.push(root);
      root._filename = record.filename;
      root.metadata = restoreMetadata(record.metadata);
      root.setPreTransformMatrix(B.Matrix.FromArray(record.matrix));
      root.setEnabled(record.enabled);
      root.freezeWorldMatrix();
      for (const part of record.meshes) {
        const mesh = new B.Mesh(part.name, scene);
        mesh.parent = root;
        for (const [kind, span] of Object.entries(part.vertices)) mesh.setVerticesData(kind, readSpan(binary, span), false);
        mesh.setIndices(readSpan(binary, part.indices));
        mesh.setPreTransformMatrix(B.Matrix.FromArray(part.matrix));
        Object.assign(mesh, part.properties);
        mesh.metadata = restoreMetadata(part.metadata);
        mesh._mt5NodeAddress = part.nodeAddress;
        mesh._mt5OriginalFaceIds = part.originalFaceIds;
        mesh.material = materialFor(part.material);
        mesh.setEnabled(part.enabled);
        mesh.freezeWorldMatrix();
        if (part.alphaToCoverage) coverage.configureAlphaToCoverage(mesh, "alphatest");
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    return {roots, dispose() {
      for (const root of roots) root.dispose(false, false);
      for (const material of ownedMaterials) material?.dispose();
      for (const texture of ownedTextures) texture.dispose();
    }};
  } catch (error) {
    for (const root of roots) root.dispose(false, false);
    for (const material of ownedMaterials) material?.dispose();
    for (const texture of ownedTextures) texture.dispose();
    throw error;
  }
}
