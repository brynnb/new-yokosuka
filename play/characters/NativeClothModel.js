import {
  Material,
  VertexBuffer,
} from "@babylonjs/core";

const CONTROL_TO_RENDER_NODE_TYPE = new Map([
  [-0x47, 0x56],
  [-0x48, 0x57],
  [-0x49, 0x58],
  [-0x4a, 0x59],
  [-0x46, 0x5a],
  [-0x4b, 0x92],
  [-0x4c, 0x93],
  [-0x4d, 0x94],
  [-0x4e, 0x95],
]);

function surfaceMeshes(group, node) {
  return (node?.mesh?.getChildMeshes?.(false) || []).filter(mesh => (
    mesh._mt5NodeAddress === node.addr
  ));
}

function authoredSideOrientation(mesh) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  const indices = mesh.getIndices();
  if (!positions || !normals || !indices) {
    throw new Error("native cloth surface orientation data is unavailable");
  }
  let alignment = 0;
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const first = indices[triangle] * 3;
    const second = indices[triangle + 1] * 3;
    const third = indices[triangle + 2] * 3;
    const firstSecond = [
      positions[first] - positions[second],
      positions[first + 1] - positions[second + 1],
      positions[first + 2] - positions[second + 2],
    ];
    const thirdSecond = [
      positions[third] - positions[second],
      positions[third + 1] - positions[second + 1],
      positions[third + 2] - positions[second + 2],
    ];
    const windingNormal = [
      firstSecond[1] * thirdSecond[2] - firstSecond[2] * thirdSecond[1],
      firstSecond[2] * thirdSecond[0] - firstSecond[0] * thirdSecond[2],
      firstSecond[0] * thirdSecond[1] - firstSecond[1] * thirdSecond[0],
    ];
    const authoredNormal = [
      normals[first] + normals[second] + normals[third],
      normals[first + 1] + normals[second + 1] + normals[third + 1],
      normals[first + 2] + normals[second + 2] + normals[third + 2],
    ];
    alignment += (
      windingNormal[0] * authoredNormal[0]
      + windingNormal[1] * authoredNormal[1]
      + windingNormal[2] * authoredNormal[2]
    );
  }
  const meshOrientation = mesh.sideOrientation;
  if (alignment >= 0) return meshOrientation;
  return meshOrientation === Material.ClockWiseSideOrientation
    ? Material.CounterClockWiseSideOrientation
    : Material.ClockWiseSideOrientation;
}

function prepareNativeClothSurface(group, node, side) {
  for (const mesh of surfaceMeshes(group, node)) {
    mesh._mt5NativeClothOutput = true;
    mesh._mt5NativeClothSide = side;
    if (mesh._mt5NativeClothMaterialPrepared === true) continue;
    const material = mesh.material;
    if (!material?.clone) {
      throw new Error(`native cloth ${side} surface has no clonable material`);
    }
    // HUMANS actors historically disable culling for their whole model. The
    // paired CLTH surfaces are different: their opposite winding is the
    // authored exterior/lining selector. Isolate the material so restoring
    // native culling cannot alter unrelated body meshes sharing its atlas.
    const clothMaterial = material.clone(
      `${material.name}_native_cloth_${side}_${mesh.uniqueId}`,
    );
    const sideOrientation = authoredSideOrientation(mesh);
    clothMaterial.backFaceCulling = true;
    clothMaterial.twoSidedLighting = false;
    mesh.material = clothMaterial;
    mesh.sideOrientation = sideOrientation;
    clothMaterial.sideOrientation = null;
    mesh._mt5NativeClothMaterialPrepared = true;
  }
}

export const NATIVE_CLOTH_CONTROL_TO_RENDER_NODE_TYPE = Object.freeze(
  Object.fromEntries(CONTROL_TO_RENDER_NODE_TYPE),
);

export const NATIVE_CLOTH_CONTROL_NODE_TYPES = Object.freeze(
  [...CONTROL_TO_RENDER_NODE_TYPE.keys()],
);

export function signedMt5NodeType(node) {
  const value = Number(node?.flag);
  if (!Number.isFinite(value)) return null;
  const word = value & 0xffff;
  return word >= 0x8000 ? word - 0x10000 : word;
}

function nodeVertexCount(node) {
  const count = Number(node?.model?.nbVertex);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function uniqueNodeByType(nodes, type, label) {
  const matches = nodes.filter(node => signedMt5NodeType(node) === type);
  if (matches.length > 1) {
    throw new Error(
      `native cloth ${label} type ${type} occurs ${matches.length} times`,
    );
  }
  return matches[0] || null;
}

/**
 * Discover the control/output surface pairs constructed by Shenmue's CLTH
 * subsystem. Negative node types own the authored simulation lattice; the
 * mapped positive node is the rendered output surface. Two original models
 * intentionally have control-only groups, so an absent output is retained as
 * data instead of being synthesized or treated as a loader failure.
 */
export function discoverNativeClothGroups(modelRoot) {
  const nodes = modelRoot?._mt5Nodes;
  if (!Array.isArray(nodes)) return Object.freeze([]);

  const groups = [];
  for (const [controlType, renderType] of CONTROL_TO_RENDER_NODE_TYPE) {
    const controlNode = uniqueNodeByType(
      nodes,
      controlType,
      "control node",
    );
    if (!controlNode) continue;
    const renderNode = uniqueNodeByType(
      nodes,
      renderType,
      "render node",
    );
    const controlVertexCount = nodeVertexCount(controlNode);
    const renderVertexCount = nodeVertexCount(renderNode);
    if (controlVertexCount === null) {
      throw new Error(
        `native cloth control type ${controlType} has no vertex lattice`,
      );
    }
    if (
      renderNode
      && (
        renderVertexCount === null
        || renderVertexCount !== controlVertexCount
      )
    ) {
      throw new Error(
        `native cloth pair ${controlType}/${renderType} has mismatched vertices`,
      );
    }
    groups.push(Object.freeze({
      controlType,
      renderType,
      controlNode,
      renderNode,
      vertexCount: controlVertexCount,
      hasRenderSurface: renderNode !== null,
    }));
  }
  return Object.freeze(groups);
}

/**
 * Establishes native CLTH surface ownership before GPU character batching.
 * A negative control node carries the exterior atlas/winding while its paired
 * positive node carries the lining atlas/opposite winding. Both remain
 * separate so the cloth presenter can update their dynamic buffers and native
 * backface culling can select the authored side without coplanar z-fighting.
 */
export function prepareNativeClothModelSurfaces(modelRoot) {
  const groups = discoverNativeClothGroups(modelRoot);
  for (const group of groups) {
    prepareNativeClothSurface(group, group.controlNode, "exterior");
    if (group.renderNode) {
      prepareNativeClothSurface(group, group.renderNode, "lining");
    }
  }
  return Object.freeze({
    groups,
    preservedRenderKeys: Object.freeze(groups.flatMap(group => (
      group.renderNode
        ? [group.controlType, group.renderType]
        : [group.controlType]
    ))),
  });
}
