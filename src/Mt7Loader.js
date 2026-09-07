import * as BABYLON from "@babylonjs/core";
import { parseMt7, mt7BatchTriangleIndices } from "./Mt7Parser.js";
import {
  mt7MapEffectDefinition,
  mt7MapEffectMaterialState,
} from "./Mt7MapEffects.js";
import { PvrDecoder } from "./PvrDecoder.js";
import { findCharacterRigSeamGroups } from "./Mt5CharacterRig.js";

// This texture ID is consistently authored as the tiled harbor/ocean surface
// across the audited Shenmue II Dreamcast maps. Identifying the material by
// its native ID also works when water batches share a MAP with solid scenery.
export const MT7_WATER_TEXTURE_IDS = new Set([
  "ea96c0718630305f",
]);

function exactArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  throw new TypeError("Expected MT7 bytes");
}

export function indexMt7TexturePack(value) {
  const buffer = exactArrayBuffer(value);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries = new Map();
  const ordered = [];
  let cursor = 0;
  while (cursor + 12 <= buffer.byteLength) {
    const id = Array.from(bytes.subarray(cursor, cursor + 8))
      .map((part) => part.toString(16).padStart(2, "0"))
      .join("");
    const length = view.getUint32(cursor + 8, true);
    const offset = cursor + 12;
    if (length === 0 || offset + length > buffer.byteLength) break;
    const entry = { textureIdHex: id, offset, length };
    if (!entries.has(id)) entries.set(id, entry);
    ordered.push(entry);
    cursor = offset + length;
  }
  return { buffer, entries, ordered };
}

export function resolveMt7TextureEntry(model, external, embeddedById, textureIndex) {
  const textureEntry = model.textures[textureIndex];
  if (!textureEntry) return { textureEntry: null, embedded: null, packed: null };
  return {
    textureEntry,
    embedded: embeddedById.get(textureEntry.textureIdHex) || null,
    packed: external?.entries.get(textureEntry.textureIdHex) || null,
  };
}

export function mt7FixedTurnRadians(value) {
  return value * Math.PI * 2 / 65536;
}

export function mt7SourceRotationQuaternion([x, sourceY, sourceZ]) {
  // Shenmue source geometry is reflected across X when brought into the
  // Babylon scene (the same conversion used by Mt5Loader). Conjugating the
  // authored Rx * Ry * Rz matrix by that reflection keeps X rotation and
  // negates Y/Z rotation.
  const y = -sourceY;
  const z = -sourceZ;
  // Shenmue's recovered row-vector rule is Rx * Ry * Rz. Babylon stores
  // column-major matrices, where this multiplication produces the equivalent
  // authored transform used by the offline exporter.
  const matrix = BABYLON.Matrix.RotationX(x)
    .multiply(BABYLON.Matrix.RotationY(y))
    .multiply(BABYLON.Matrix.RotationZ(z));
  return BABYLON.Quaternion.FromRotationMatrix(matrix);
}

export function mt7RotationQuaternion(rotationRaw) {
  return mt7SourceRotationQuaternion(rotationRaw.map(mt7FixedTurnRadians));
}

export function mt7BrowserVector([x, y, z]) {
  return [x === 0 ? 0 : -x, y, z];
}

export function mt7SamplerState(tsp) {
  const clampV = Boolean(tsp & (1 << 15));
  const clampU = Boolean(tsp & (1 << 16));
  const flipV = Boolean(tsp & (1 << 17));
  const flipU = Boolean(tsp & (1 << 18));
  const addressMode = (clamp, flip) => (
    clamp ? "clamp" : flip ? "mirror" : "repeat"
  );
  return {
    width: 8 << ((tsp >>> 3) & 0x7),
    height: 8 << (tsp & 0x7),
    filterMode: (tsp >>> 13) & 0x3,
    addressU: addressMode(clampU, flipU),
    addressV: addressMode(clampV, flipV),
    ignoreTextureAlpha: Boolean(tsp & (1 << 19)),
    useVertexAlpha: Boolean(tsp & (1 << 20)),
    destinationBlend: (tsp >>> 26) & 0x7,
    sourceBlend: (tsp >>> 29) & 0x7,
  };
}

export function mt7MaterialState(polygonControl, tsp, isp = 0) {
  const sampler = mt7SamplerState(tsp);
  const listType = (polygonControl >>> 24) & 0x7;
  return {
    ...sampler,
    listType,
    cullMode: (isp >>> 27) & 0x3,
    transparency: listType === 2
      ? "blend"
      : listType === 4
        ? "alphatest"
        : "opaque",
  };
}

export function mt7TextureCoordinates(sourceU, sourceV, dataFormat) {
  // PvrDecoder's ordinary Dreamcast twiddled output uses the viewer's V/U
  // axis convention. TWIDDLED_RECT (0x0d) is already decoded in native axis
  // order. Byte-identical MT5/MT7 item pairs prove both formats author the
  // same raw U/V values, so MT7 must use the same format-aware conversion as
  // Mt5Loader.
  return dataFormat === 0x0d
    ? [sourceU, sourceV]
    : [sourceV, sourceU];
}

export function mt7TextureAddressModes(sampler, dataFormat) {
  return dataFormat === 0x0d
    ? { u: sampler.addressU, v: sampler.addressV }
    : { u: sampler.addressV, v: sampler.addressU };
}

function babylonAddressMode(mode) {
  if (mode === "clamp") return BABYLON.Texture.CLAMP_ADDRESSMODE;
  if (mode === "mirror") return BABYLON.Texture.MIRROR_ADDRESSMODE;
  return BABYLON.Texture.WRAP_ADDRESSMODE;
}

export class Mt7Loader {
  constructor(scene, {
    generateMipMaps = true,
    characterRigSeamMode = null,
    characterRigSeamEpsilon = 1e-5,
  } = {}) {
    this.scene = scene;
    this.generateMipMaps = generateMipMaps;
    this.characterRigSeamMode = characterRigSeamMode === "weld"
      ? "weld"
      : null;
    this.characterRigSeamEpsilon = characterRigSeamEpsilon;
    this.materials = new Set();
    this.textures = new Set();
    this.materialCache = new Map();
    this.textureSourceCache = new Map();
  }

  clearCaches() {
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.materials.clear();
    this.textures.clear();
    this.materialCache.clear();
    this.textureSourceCache.clear();
  }

  createCharacterGpuRig(modelRoot) {
    const entries = modelRoot?._mt7Nodes || [];
    if (!modelRoot || entries.length === 0) return null;
    modelRoot.computeWorldMatrix(true);
    const inverseRoot = modelRoot.getWorldMatrix().clone().invert();
    const skeleton = new BABYLON.Skeleton(
      `${modelRoot.name}_skeleton`,
      `${modelRoot.name}_skeleton`,
      this.scene,
    );
    const boneByNodeOffset = new Map();
    const skinByMesh = new Map();
    const seamVertices = [];

    entries.forEach(({ sourceNode, transform }, nodeIndex) => {
      transform.computeWorldMatrix(true);
      const bindMatrix = transform.getWorldMatrix().multiply(inverseRoot);
      const directMeshes = transform.getChildren().filter((child) => (
        child instanceof BABYLON.Mesh && child.getTotalVertices() > 0
      ));
      if (directMeshes.length === 0) return;
      const boneIndex = skeleton.bones.length;
      const bone = new BABYLON.Bone(
        `mt7_node_${sourceNode.offset.toString(16)}`,
        skeleton,
        null,
        bindMatrix,
        bindMatrix.clone(),
        bindMatrix.clone(),
        boneIndex,
      );
      bone._mt7PoseMatrix = bindMatrix.clone();
      boneByNodeOffset.set(sourceNode.offset, bone);

      for (const mesh of directMeshes) {
        const positions = mesh.getVerticesData(
          BABYLON.VertexBuffer.PositionKind,
        );
        const normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
        if (!positions) continue;
        const bakedPositions = [];
        const bakedNormals = [];
        for (let offset = 0; offset < positions.length; offset += 3) {
          const position = BABYLON.Vector3.TransformCoordinates(
            BABYLON.Vector3.FromArray(positions, offset),
            bindMatrix,
          );
          bakedPositions.push(position.x, position.y, position.z);
          if (normals?.length === positions.length) {
            const normal = BABYLON.Vector3.TransformNormal(
              BABYLON.Vector3.FromArray(normals, offset),
              bindMatrix,
            ).normalize();
            bakedNormals.push(normal.x, normal.y, normal.z);
          }
          seamVertices.push({
            nodeIndex,
            child: mesh,
            vertexIndex: offset / 3,
            sourcePosition: [position.x, position.y, position.z],
          });
        }
        mesh.setVerticesData(
          BABYLON.VertexBuffer.PositionKind,
          bakedPositions,
          false,
        );
        if (bakedNormals.length === bakedPositions.length) {
          mesh.setVerticesData(
            BABYLON.VertexBuffer.NormalKind,
            bakedNormals,
            false,
          );
        }
        mesh.parent = modelRoot;
        mesh.position.set(0, 0, 0);
        mesh.rotationQuaternion = BABYLON.Quaternion.Identity();
        mesh.scaling.set(1, 1, 1);
        const vertexCount = positions.length / 3;
        const indices = new Float32Array(vertexCount * 4);
        const weights = new Float32Array(vertexCount * 4);
        for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
          indices[vertexIndex * 4] = boneIndex;
          weights[vertexIndex * 4] = 1;
        }
        skinByMesh.set(mesh, {
          indices,
          weights,
          maximumInfluencers: 1,
        });
      }
    });

    const seamGroups = findCharacterRigSeamGroups(
      seamVertices,
      this.characterRigSeamEpsilon,
      (leftIndex, rightIndex) => {
        const left = entries[leftIndex]?.sourceNode;
        const right = entries[rightIndex]?.sourceNode;
        return Boolean(
          left
          && right
          && (
            left.parentOffset === right.offset
            || right.parentOffset === left.offset
          )
        );
      },
    );
    for (const group of seamGroups) {
      const boneIndices = [...new Set(group.map((vertex) => {
        const nodeOffset = entries[vertex.nodeIndex]?.sourceNode?.offset;
        return boneByNodeOffset.get(nodeOffset)?.getIndex();
      }).filter(Number.isInteger))].slice(0, 4);
      if (boneIndices.length < 2) continue;
      const weight = 1 / boneIndices.length;
      for (const vertex of group) {
        const skin = skinByMesh.get(vertex.child);
        const offset = vertex.vertexIndex * 4;
        if (!skin) continue;
        skin.maximumInfluencers = Math.max(
          skin.maximumInfluencers,
          boneIndices.length,
        );
        for (let influence = 0; influence < 4; influence += 1) {
          skin.indices[offset + influence] = boneIndices[influence] ?? 0;
          skin.weights[offset + influence] = influence < boneIndices.length
            ? weight
            : 0;
        }
      }
    }
    for (const [mesh, skin] of skinByMesh) {
      mesh.setVerticesData(
        BABYLON.VertexBuffer.MatricesIndicesKind,
        skin.indices,
        false,
        4,
      );
      mesh.setVerticesData(
        BABYLON.VertexBuffer.MatricesWeightsKind,
        skin.weights,
        false,
        4,
      );
      mesh.numBoneInfluencers = skin.maximumInfluencers;
      mesh.skeleton = skeleton;
      mesh.computeBonesUsingShaders = true;
    }
    modelRoot._mt7CharacterRigSeamGroups = seamGroups;
    modelRoot._mt7CharacterGpuRig = {
      skeleton,
      boneByNodeOffset,
      skinnedMeshes: [...skinByMesh.keys()],
    };
    modelRoot.onDisposeObservable.addOnce(() => skeleton.dispose());
    return modelRoot._mt7CharacterGpuRig;
  }

  updateCharacterGpuRig(modelRoot) {
    const rig = modelRoot?._mt7CharacterGpuRig;
    if (!rig) return false;
    modelRoot.computeWorldMatrix(true);
    const inverseRoot = modelRoot.getWorldMatrix().clone().invert();
    for (const { sourceNode, transform } of modelRoot._mt7Nodes || []) {
      const bone = rig.boneByNodeOffset.get(sourceNode.offset);
      if (!bone) continue;
      transform.computeWorldMatrix(true);
      bone._mt7PoseMatrix.copyFrom(
        transform.getWorldMatrix().multiply(inverseRoot),
      );
      bone._matrix = bone._mt7PoseMatrix;
    }
    rig.skeleton._markAsDirty();
    return true;
  }

  mergeCharacterGpuRigMeshes(modelRoot) {
    const rig = modelRoot?._mt7CharacterGpuRig;
    if (!rig) return [];
    const activeMeshes = rig.skinnedMeshes.filter((mesh) => (
      mesh?.isEnabled?.() && mesh.getTotalVertices?.() > 0
    ));
    const inactiveMeshes = rig.skinnedMeshes.filter(
      (mesh) => !activeMeshes.includes(mesh),
    );
    const groups = [];
    for (const mesh of activeMeshes) {
      // Merge only batches with identical render state and vertex layouts.
      // Babylon cannot merge a colored strip with an uncolored strip without
      // manufacturing an attribute, and alpha ordering must remain authored.
      const vertexKinds = mesh.getVerticesDataKinds().sort().join(",");
      let group = groups.find((candidate) => (
        candidate.material === mesh.material
        && candidate.vertexKinds === vertexKinds
        && candidate.alphaIndex === mesh.alphaIndex
        && candidate.renderingGroupId === mesh.renderingGroupId
        && candidate.useVertexColors === mesh.useVertexColors
        && candidate.hasVertexAlpha === mesh.hasVertexAlpha
      ));
      if (!group) {
        group = {
          material: mesh.material,
          vertexKinds,
          alphaIndex: mesh.alphaIndex,
          renderingGroupId: mesh.renderingGroupId,
          useVertexColors: mesh.useVertexColors,
          hasVertexAlpha: mesh.hasVertexAlpha,
          meshes: [],
        };
        groups.push(group);
      }
      group.meshes.push(mesh);
    }

    const renderMeshes = [];
    let groupIndex = 0;
    for (const group of groups) {
      if (group.meshes.length === 1) {
        renderMeshes.push(group.meshes[0]);
        continue;
      }
      const maximumInfluencers = Math.max(...group.meshes.map(
        (mesh) => mesh.numBoneInfluencers || 0,
      ));
      for (const mesh of group.meshes) {
        mesh.parent = null;
        mesh.computeWorldMatrix(true);
      }
      const merged = BABYLON.Mesh.MergeMeshes(
        group.meshes,
        true,
        true,
      );
      if (!merged) {
        for (const mesh of group.meshes) mesh.parent = modelRoot;
        renderMeshes.push(...group.meshes);
        continue;
      }
      merged.name = `${modelRoot.name}_material_${groupIndex}`;
      groupIndex += 1;
      merged.parent = modelRoot;
      merged.material = group.material;
      merged.alphaIndex = group.alphaIndex;
      merged.renderingGroupId = group.renderingGroupId;
      merged.useVertexColors = group.useVertexColors;
      merged.hasVertexAlpha = group.hasVertexAlpha;
      merged.skeleton = rig.skeleton;
      merged.numBoneInfluencers = maximumInfluencers;
      merged.computeBonesUsingShaders = true;
      merged.alwaysSelectAsActiveMesh = false;
      merged.isPickable = false;
      merged.checkCollisions = false;
      renderMeshes.push(merged);
    }
    rig.skinnedMeshes = [...inactiveMeshes, ...renderMeshes];
    modelRoot.metadata = {
      ...(modelRoot.metadata || {}),
      characterMeshCountBeforeMerge: activeMeshes.length,
      characterMeshCountAfterMerge: renderMeshes.length,
    };
    return renderMeshes;
  }

  decodeTexture(buffer, offset, length) {
    try {
      const generateMipMaps = typeof this.generateMipMaps === "function"
        ? this.generateMipMaps()
        : this.generateMipMaps;
      const texture = new PvrDecoder(buffer, offset, length).decode(
        this.scene,
        { generateMipMaps: generateMipMaps !== false },
      );
      if (texture) {
        texture._mt7AuthoredHasAlpha = texture.hasAlpha;
        this.textures.add(texture);
      }
      return texture;
    } catch (error) {
      console.warn("[MT7] Failed to decode texture", error);
      return null;
    }
  }

  load(bytes, texturePack = null, options = {}) {
    const buffer = exactArrayBuffer(bytes);
    const model = parseMt7(buffer);
    const sourceName = options.sourceFilename || model.signature;
    const mapEffect = mt7MapEffectDefinition(sourceName, model);
    const external = texturePack ? indexMt7TexturePack(texturePack) : null;
    const embeddedById = new Map(
      model.embeddedTextures.map((entry) => [entry.textureIdHex, entry]),
    );
    const textureCache = new Map();

    const textureFor = (textureIndex) => {
      if (textureCache.has(textureIndex)) return textureCache.get(textureIndex);
      // A PKF is shared by every model in its PKS archive, so its global order
      // is not the model's local texture-table order. Resolve the mesh index
      // through the MT7 table, then join that authored ID to the PKF.
      const { embedded, packed } = resolveMt7TextureEntry(
        model,
        external,
        embeddedById,
        textureIndex,
      );
      const textureIdentity = model.textures[textureIndex]?.textureIdHex;
      if (textureIdentity && this.textureSourceCache.has(textureIdentity)) {
        const cached = this.textureSourceCache.get(textureIdentity);
        textureCache.set(textureIndex, cached);
        return cached;
      }
      let texture = null;
      if (embedded) {
        texture = this.decodeTexture(buffer, embedded.byteOffset, embedded.byteLength);
      } else if (packed) {
        texture = this.decodeTexture(external.buffer, packed.offset, packed.length);
      }
      if (texture && textureIdentity) {
        this.textureSourceCache.set(textureIdentity, texture);
      }
      textureCache.set(textureIndex, texture);
      return texture;
    };

    const materialFor = (textureIndex, meshData) => {
      const textureIdentity = (
        model.textures[textureIndex]?.textureIdHex || `index-${textureIndex}`
      );
      const state = mt7MapEffectMaterialState(
        mapEffect,
        textureIdentity,
        mt7MaterialState(meshData.polygonControl, meshData.tsp, meshData.isp),
      );
      const stateKey = [
        textureIdentity,
        state.addressU,
        state.addressV,
        state.filterMode,
        state.transparency,
        state.ignoreTextureAlpha ? 1 : 0,
        state.cullMode,
        mapEffect?.id || "static",
      ].join(":");
      if (this.materialCache.has(stateKey)) {
        return this.materialCache.get(stateKey);
      }
      const material = new BABYLON.StandardMaterial(
        `mt7_material_${stateKey}`,
        this.scene,
      );
      material.backFaceCulling = false;
      // Map strips carry authored lighting normals, independent of which
      // side Babylon considers front-facing. Flipping those normals for
      // no-cull materials reintroduces the lighting regression fixed in
      // 35badb66. Keep the later character/prop back-face treatment separate.
      material.twoSidedLighting = options.assetKind !== "MAPM" && state.cullMode <= 1;
      material.diffuseColor.set(1, 1, 1);
      material.specularColor.set(0, 0, 0);
      material.emissiveColor.set(0.08, 0.08, 0.08);

      const sourceTexture = textureFor(textureIndex);
      if (sourceTexture) {
        const addressModes = mt7TextureAddressModes(
          state,
          sourceTexture._pvrDataFormat,
        );
        // Keep one decoded source per native texture ID and clone only its
        // inexpensive sampler state for each distinct material state.
        const texture = sourceTexture.clone();
        texture.hasAlpha = sourceTexture._mt7AuthoredHasAlpha;
        texture._mt7AuthoredHasAlpha = sourceTexture._mt7AuthoredHasAlpha;
        texture._hasGradientAlpha = sourceTexture._hasGradientAlpha;
        texture._pvrDataFormat = sourceTexture._pvrDataFormat;
        this.textures.add(texture);
        texture.wrapU = babylonAddressMode(addressModes.u);
        texture.wrapV = babylonAddressMode(addressModes.v);
        texture.updateSamplingMode(
          state.filterMode === 0
            ? BABYLON.Texture.NEAREST_SAMPLINGMODE
            : BABYLON.Texture.BILINEAR_SAMPLINGMODE,
        );
        material.diffuseTexture = texture;
        const usesTextureAlpha = (
          sourceTexture._mt7AuthoredHasAlpha
          && !state.ignoreTextureAlpha
        );
        material.useAlphaFromDiffuseTexture = usesTextureAlpha;
        texture.hasAlpha = usesTextureAlpha;
        if (state.transparency === "blend") {
          material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
          material.alpha = 1;
          material.separateCullingPass = true;
        } else if (state.transparency === "alphatest") {
          material.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST;
          material.alphaCutOff = 0.5;
          material.alpha = 1;
        } else {
          material.transparencyMode = BABYLON.Material.MATERIAL_OPAQUE;
          material.useAlphaFromDiffuseTexture = false;
          texture.hasAlpha = false;
        }
      } else {
        material.diffuseColor.set(0.68, 0.72, 0.75);
      }
      this.materials.add(material);
      this.materialCache.set(stateKey, material);
      return material;
    };

    const root = new BABYLON.Mesh(`mt7_${sourceName}`, this.scene);
    root.metadata = {
      format: "MT7",
      sourceFilename: options.sourceFilename || null,
      warnings: model.warnings,
      auxiliaryGeometry: model.auxiliaryGeometry,
      hiddenRuntimeTextureGroupCount: 0,
      authoredWaterMeshCount: 0,
      mt7MapEffect: mapEffect?.id || null,
    };
    root._mt7MapEffectDefinition = mapEffect;
    const transforms = new Map();
    for (const node of model.nodes) {
      const transform = new BABYLON.TransformNode(
        `mt7_node_${node.offset.toString(16)}`,
        this.scene,
      );
      transform.position.set(...mt7BrowserVector(node.position));
      transform.rotationQuaternion = mt7RotationQuaternion(node.rotationRaw);
      transform.scaling.set(...node.scale);
      transforms.set(node.offset, transform);
    }
    // Preserve the native MT7 node identity for runtime bindings. PROP assets
    // use these authored hierarchy offsets to identify moving door leaves;
    // mesh names and spatial guesses are not stable enough for that job.
    root._mt7Nodes = model.nodes.map((sourceNode) => ({
      sourceNode,
      transform: transforms.get(sourceNode.offset),
    }));
    for (const node of model.nodes) {
      const transform = transforms.get(node.offset);
      transform.parent = transforms.get(node.parentOffset) || root;
      if (!node.mesh) continue;
      for (const group of node.mesh.materialGroups) {
        if (group.runtimeTexture && options.showRuntimeTextureGeometry !== true) {
          root.metadata.hiddenRuntimeTextureGroupCount += 1;
          continue;
        }
        const sourceTexture = textureFor(group.textureIndex);
        const textureDataFormat = sourceTexture?._pvrDataFormat;
        const textureId = model.textures[group.textureIndex]?.textureIdHex;
        const isAuthoredWater = MT7_WATER_TEXTURE_IDS.has(textureId);
        for (const [batchIndex, batch] of group.batches.entries()) {
          const mesh = new BABYLON.Mesh(
            `mt7_${node.offset.toString(16)}_${group.index}_${batchIndex}`,
            this.scene,
          );
          const positions = batch.vertices.flatMap((vertex) => (
            mt7BrowserVector(vertex.position)
          ));
          const normals = batch.vertices.flatMap((vertex) => (
            mt7BrowserVector(vertex.normal)
          ));
          const uvs = batch.vertices.flatMap((vertex) => (
            textureDataFormat === undefined
              ? vertex.uv
              : mt7TextureCoordinates(
                vertex.uv[0],
                vertex.uv[1],
                textureDataFormat,
              )
          ));
          const vertexData = new BABYLON.VertexData();
          vertexData.positions = positions;
          vertexData.normals = normals;
          vertexData.uvs = uvs;
          if (batch.vertices.every((vertex) => vertex.color !== null)) {
            vertexData.colors = batch.vertices.flatMap((vertex) => vertex.color);
          }
          vertexData.indices = mt7BatchTriangleIndices({
            ...batch,
            reverseWinding: !batch.reverseWinding,
          });
          vertexData.applyToMesh(mesh);
          const materialState = mt7MaterialState(
            group.polygonControl,
            group.tsp,
            group.isp,
          );
          mesh.material = materialFor(group.textureIndex, group);
          if (vertexData.colors) {
            mesh.useVertexColors = true;
            mesh.hasVertexAlpha = (
              materialState.useVertexAlpha
              && batch.vertices.some((vertex) => vertex.color[3] < 1)
            );
          }
          mesh.metadata = {
            ...(mesh.metadata || {}),
            mt7VertexEncoding: group.vertexEncoding,
            mt7NodeOffset: node.offset,
            sourceTextureId: textureId || null,
            surfaceKind: isAuthoredWater ? "water" : null,
            authoredWater: isAuthoredWater,
          };
          if (isAuthoredWater) root.metadata.authoredWaterMeshCount += 1;
          if (materialState.transparency === "blend") mesh.alphaIndex = 1000;
          if (materialState.transparency === "alphatest") mesh.alphaIndex = 500;
          mesh.parent = transform;
        }
      }
    }

    const renderedMeshCount = root.getChildMeshes().length;
    if (
      renderedMeshCount > 0
      && root.metadata.authoredWaterMeshCount === renderedMeshCount
    ) {
      root.metadata.surfaceKind = "water-layer";
    } else if (root.metadata.authoredWaterMeshCount > 0) {
      root.metadata.surfaceKind = "mixed-with-water";
    }

    if (this.characterRigSeamMode === "weld") {
      this.createCharacterGpuRig(root);
    }

    return [root];
  }
}
