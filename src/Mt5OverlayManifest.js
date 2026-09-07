import * as BABYLON from "@babylonjs/core";

export const MAXIMUM_DEPTH_OVERLAY_RANK = 8;

export function normalizeOverlayFilename(filename) {
  return String(filename || "").split("/").pop().toUpperCase();
}

export function overlayDefinitionForFile(manifest, filename, byteLength) {
  const normalized = normalizeOverlayFilename(filename);
  const definition = manifest?.files?.[normalized];
  if (!definition) return null;
  if (
    Number.isFinite(definition.byteLength)
    && Number.isFinite(byteLength)
    && definition.byteLength !== byteLength
  ) {
    return null;
  }
  return definition;
}

function textureIdForMesh(mesh) {
  const match = /^mt5_tex_(\d+)$/.exec(mesh?.name || "");
  return match ? Number.parseInt(match[1], 10) : null;
}

function nodeAddressForMesh(mesh) {
  let current = mesh?.parent || null;
  while (current) {
    if (Number.isInteger(current._mt5Node?.addr)) {
      return current._mt5Node.addr;
    }
    current = current.parent || null;
  }
  return null;
}

function compactVertexData(source, selectedIndices) {
  const sourcePositions = source.getVerticesData(
    BABYLON.VertexBuffer.PositionKind,
  );
  if (!sourcePositions) return null;

  const attributes = [
    [BABYLON.VertexBuffer.PositionKind, 3, "positions"],
    [BABYLON.VertexBuffer.NormalKind, 3, "normals"],
    [BABYLON.VertexBuffer.UVKind, 2, "uvs"],
    [BABYLON.VertexBuffer.ColorKind, 4, "colors"],
  ].map(([kind, stride, property]) => ({
    kind,
    stride,
    property,
    values: source.getVerticesData(kind),
    compact: [],
  }));
  const sourcePositionValues = source._mt5SourcePositions || null;
  const sourceNormalValues = source._mt5SourceNormals || null;
  const compactSourcePositions = [];
  const compactSourceNormals = [];
  const remap = new Map();
  const indices = [];

  for (const sourceIndex of selectedIndices) {
    let targetIndex = remap.get(sourceIndex);
    if (targetIndex === undefined) {
      targetIndex = remap.size;
      remap.set(sourceIndex, targetIndex);
      for (const attribute of attributes) {
        if (!attribute.values) continue;
        const start = sourceIndex * attribute.stride;
        for (let offset = 0; offset < attribute.stride; offset += 1) {
          attribute.compact.push(attribute.values[start + offset]);
        }
      }
      if (sourcePositionValues) {
        compactSourcePositions.push(
          sourcePositionValues[sourceIndex * 3],
          sourcePositionValues[sourceIndex * 3 + 1],
          sourcePositionValues[sourceIndex * 3 + 2],
        );
      }
      if (sourceNormalValues) {
        compactSourceNormals.push(
          sourceNormalValues[sourceIndex * 3],
          sourceNormalValues[sourceIndex * 3 + 1],
          sourceNormalValues[sourceIndex * 3 + 2],
        );
      }
    }
    indices.push(targetIndex);
  }

  const vertexData = new BABYLON.VertexData();
  for (const attribute of attributes) {
    if (attribute.values) {
      vertexData[attribute.property] = attribute.compact;
    }
  }
  vertexData.indices = indices;
  return {
    vertexData,
    sourcePositions: sourcePositionValues ? compactSourcePositions : null,
    sourceNormals: sourceNormalValues ? compactSourceNormals : null,
  };
}

function copyLocalTransform(source, target) {
  target.position.copyFrom(source.position);
  target.scaling.copyFrom(source.scaling);
  if (source.rotationQuaternion) {
    target.rotationQuaternion = source.rotationQuaternion.clone();
  } else {
    target.rotation.copyFrom(source.rotation);
  }
}

function copyTextureAddressModes(sourceTexture, targetTexture) {
  if (!sourceTexture || !targetTexture) return;
  targetTexture.wrapU = sourceTexture.wrapU;
  targetTexture.wrapV = sourceTexture.wrapV;
  targetTexture.wrapR = sourceTexture.wrapR;
}

function overlayMaterial(source, rank, options) {
  const material = source.material?.clone?.(
    `${source.material.name}_depth_overlay_${rank}`,
  );
  if (!material) return source.material || null;

  // Babylon clones the texture wrapper along with the material, but the
  // wrapper's address modes fall back to clamp. Preserve the MT5 loader's
  // per-strip repeat/mirror state so UV spans beyond 1.0 do not smear.
  copyTextureAddressModes(
    source.material?.diffuseTexture,
    material.diffuseTexture,
  );

  const factor = Number.isFinite(options.depthBiasFactor)
    ? options.depthBiasFactor
    : 1;
  const units = Number.isFinite(options.depthBiasUnits)
    ? options.depthBiasUnits
    : 1;
  material.zOffset = (source.material?.zOffset || 0) - factor * rank;
  material.zOffsetUnits = (
    source.material?.zOffsetUnits || 0
  ) - units * rank;
  material.metadata = {
    ...(material.metadata || {}),
    preserveEmissive: true,
    mt5DepthOverlay: true,
    mt5DepthOverlayRank: rank,
  };
  return material;
}

function boundedOverlayRank(rank) {
  return Math.min(
    MAXIMUM_DEPTH_OVERLAY_RANK,
    Math.max(1, Number.parseInt(rank, 10) || 1),
  );
}

function splitOverlayFaces(source, groups, options) {
  const originalIndices = Array.from(source.getIndices() || []);
  if (originalIndices.length === 0) return [];

  const validGroups = groups.map((group) => ({
    rank: boundedOverlayRank(group.rank),
    manifestRank: Math.max(1, Number.parseInt(group.rank, 10) || 1),
    faceIds: [...new Set(group.faceIds || [])]
      .filter((faceId) => (
        Number.isInteger(faceId)
        && faceId >= 0
        && faceId * 3 + 2 < originalIndices.length
      ))
      .sort((left, right) => left - right),
  })).filter((group) => group.faceIds.length > 0);
  if (validGroups.length === 0) return [];

  const selectedFaces = new Set(
    validGroups.flatMap((group) => group.faceIds),
  );
  const faceCount = originalIndices.length / 3;
  if (
    validGroups.length === 1
    && selectedFaces.size === faceCount
  ) {
    const [group] = validGroups;
    source.material = overlayMaterial(source, group.rank, options);
    source._mt5OriginalFaceIds = Array.from(
      { length: faceCount },
      (_, faceId) => faceId,
    );
    source.checkCollisions = false;
    source.metadata = {
      ...(source.metadata || {}),
      mt5DepthOverlay: true,
      mt5DepthOverlayRank: group.rank,
      mt5DepthOverlayManifestRank: group.manifestRank,
      mt5DepthOverlaySourceMesh: source.name,
      mt5DepthOverlayOriginalFaces: [...group.faceIds],
    };
    return [source];
  }

  const remainingIndices = [];
  const remainingOriginalFaces = [];
  for (let faceId = 0; faceId < originalIndices.length / 3; faceId += 1) {
    if (selectedFaces.has(faceId)) continue;
    remainingIndices.push(
      originalIndices[faceId * 3],
      originalIndices[faceId * 3 + 1],
      originalIndices[faceId * 3 + 2],
    );
    remainingOriginalFaces.push(faceId);
  }

  const overlays = [];
  for (const group of validGroups) {
    const selectedIndices = group.faceIds.flatMap((faceId) => [
      originalIndices[faceId * 3],
      originalIndices[faceId * 3 + 1],
      originalIndices[faceId * 3 + 2],
    ]);
    const compact = compactVertexData(source, selectedIndices);
    if (!compact) continue;

    const overlay = new BABYLON.Mesh(
      `${source.name}_depth_overlay_${group.rank}`,
      source.getScene(),
    );
    compact.vertexData.applyToMesh(overlay);
    overlay._mt5SourcePositions = compact.sourcePositions;
    overlay._mt5SourceNormals = compact.sourceNormals;
    overlay._mt5OriginalFaceIds = [...group.faceIds];
    overlay.parent = source.parent;
    copyLocalTransform(source, overlay);
    overlay.material = overlayMaterial(source, group.rank, options);
    overlay.visibility = source.visibility;
    overlay.isVisible = source.isVisible;
    overlay.isPickable = source.isPickable;
    overlay.checkCollisions = false;
    overlay.layerMask = source.layerMask;
    overlay.renderingGroupId = source.renderingGroupId;
    overlay.alwaysSelectAsActiveMesh = source.alwaysSelectAsActiveMesh;
    overlay.metadata = {
      ...(source.metadata || {}),
      mt5DepthOverlay: true,
      mt5DepthOverlayRank: group.rank,
      mt5DepthOverlayManifestRank: group.manifestRank,
      mt5DepthOverlaySourceMesh: source.name,
      mt5DepthOverlayOriginalFaces: [...group.faceIds],
    };
    overlays.push(overlay);
  }

  source.makeGeometryUnique?.();
  source.setIndices(remainingIndices, null, true);
  source._mt5OriginalFaceIds = remainingOriginalFaces;
  source.metadata = {
    ...(source.metadata || {}),
    mt5DepthOverlaySource: true,
  };
  return overlays;
}

export function applyMt5OverlayDefinition(
  modelRoot,
  definition,
  options = {},
) {
  if (!modelRoot || !Array.isArray(definition?.overlays)) return [];

  const meshGroups = new Map();
  for (const entry of definition.overlays) {
    const nodeAddress = Number(entry.nodeAddress);
    const textureId = Number(entry.textureId);
    if (
      !Number.isInteger(nodeAddress)
      || !Number.isInteger(textureId)
      || !Array.isArray(entry.faceIds)
    ) {
      continue;
    }
    const key = `${nodeAddress}:${textureId}`;
    if (!meshGroups.has(key)) meshGroups.set(key, []);
    meshGroups.get(key).push(entry);
  }

  const meshes = modelRoot.getDescendants(false).filter((node) => (
    typeof node.getIndices === "function"
  ));
  const overlays = [];
  for (const source of meshes) {
    const key = `${nodeAddressForMesh(source)}:${textureIdForMesh(source)}`;
    const groups = meshGroups.get(key);
    if (!groups) continue;
    overlays.push(...splitOverlayFaces(source, groups, options));
  }
  return overlays;
}
