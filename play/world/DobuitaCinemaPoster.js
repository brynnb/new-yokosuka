import * as BABYLON from "@babylonjs/core";

export const DOBUITA_CINEMA_POSTER = Object.freeze({
  name: "dobuita_godzilla_biollante_poster",
  imageUrl: "/assets/cinema/godzilla-vs-biollante-poster.jpg",
  sourceFilename: "S1_D000_MAP.MT5",
  nodeAddress: 0x55e98,
  meshName: "mt5_tex_43",
  faceIds: Object.freeze([12, 13]),
  sourceCenter: Object.freeze([39.492699, 4.247398, 45.7749]),
  // Offset toward the street so the replacement cannot z-fight with the
  // original panel even before its source triangles are suppressed.
  bottomLeft: Object.freeze([38.667698, 3.147398, 45.7809]),
  bottomRight: Object.freeze([40.3177, 3.147398, 45.7809]),
  topLeft: Object.freeze([38.667698, 5.347399, 45.7809]),
  topRight: Object.freeze([40.3177, 5.347399, 45.7809]),
});

export const DOBUITA_CINEMA_LOWER_POSTER = Object.freeze({
  name: "dobuita_super_godzilla_biollante_poster",
  imageUrl: "/assets/cinema/super-godzilla-vs-biollante-poster.jpg",
  sourceFilename: "S1_D000_MAP.MT5",
  nodeAddress: 0x55e98,
  meshName: "mt5_tex_43",
  faceIds: Object.freeze([32, 35]),
  sourceCenter: Object.freeze([37.492697, 1.243891, 45.74363]),
  // This lower display leans toward the wall as it reaches the pavement.
  // Preserve that authored angle and offset it toward the street to avoid
  // z-fighting before the two source faces are suppressed.
  bottomLeft: Object.freeze([36.667698, 0.149608, 45.637622]),
  bottomRight: Object.freeze([38.317696, 0.149608, 45.637626]),
  topLeft: Object.freeze([36.667698, 2.338174, 45.861636]),
  topRight: Object.freeze([38.317696, 2.338174, 45.861636]),
});

export const DOBUITA_CINEMA_POSTERS = Object.freeze([
  DOBUITA_CINEMA_POSTER,
  DOBUITA_CINEMA_LOWER_POSTER,
]);

export const DOBUITA_CINEMA_FACADE_HIDDEN_FACES = Object.freeze([
  Object.freeze({
    sourceFilename: "S1_D000_MAP.MT5",
    nodeAddress: 0x55e98,
    meshName: "mt5_tex_44",
    faceIds: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7]),
  }),
  Object.freeze({
    sourceFilename: "S1_D000_MAP.MT5",
    nodeAddress: 0x57858,
    meshName: "mt5_tex_27",
    // Position-connected components resolved from the five user-selected
    // seed faces 26, 35, 47, 61, and 87. Faces 52-55 and 72-73 belong to
    // separate components and intentionally remain visible.
    evidenceSeedFaceIds: Object.freeze([26, 35, 47, 61, 87]),
    faceIds: Object.freeze([
      ...Array.from({ length: 32 }, (_value, index) => 20 + index),
      ...Array.from({ length: 16 }, (_value, index) => 56 + index),
      ...Array.from({ length: 16 }, (_value, index) => 74 + index),
    ]),
  }),
]);

let posterMeshes = [];

function meshesForDefinition(currentMeshes, definition) {
  return currentMeshes.filter(
    (root) => root._filename === definition.sourceFilename,
  ).flatMap((root) => [
    ...(root.getClassName?.() === "Mesh" ? [root] : []),
    ...root.getChildMeshes(false),
  ]).filter((mesh) => (
    mesh.name === definition.meshName
    && (
      !Number.isInteger(definition.nodeAddress)
      || nearestMt5Node(mesh)?.addr === definition.nodeAddress
    )
  ));
}

function nearestMt5Node(node) {
  let current = node;
  while (current && !current._mt5Node) current = current.parent;
  return current?._mt5Node || null;
}

export function suppressDobuitaCinemaFacadeFaces(currentMeshes) {
  let suppressedFaceCount = 0;
  for (const definition of DOBUITA_CINEMA_FACADE_HIDDEN_FACES) {
    for (const mesh of meshesForDefinition(currentMeshes, definition)) {
      const indices = Array.from(mesh.getIndices?.() || []);
      if (indices.length === 0) continue;
      for (const faceId of definition.faceIds) {
        const offset = faceId * 3;
        if (offset + 2 >= indices.length) continue;
        indices[offset + 1] = indices[offset];
        indices[offset + 2] = indices[offset];
        suppressedFaceCount += 1;
      }
      mesh.makeGeometryUnique?.();
      mesh.setIndices(indices, null, true);
      mesh.refreshBoundingInfo?.();
    }
  }
  return suppressedFaceCount;
}

export function disposeDobuitaCinemaPoster() {
  for (const mesh of posterMeshes) {
    mesh.material?.dispose(false, true);
    mesh.dispose(false, false);
  }
  posterMeshes = [];
}

function createPosterMesh(scene, definition) {
  const texture = new BABYLON.Texture(
    definition.imageUrl,
    scene,
    false,
    true,
  );
  texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 8;

  const material = new BABYLON.StandardMaterial(
    `${definition.name}_material`,
    scene,
  );
  material.diffuseTexture = texture;
  material.diffuseColor = BABYLON.Color3.White();
  material.specularColor = BABYLON.Color3.Black();
  material.backFaceCulling = false;

  const positions = [
    ...definition.bottomLeft,
    ...definition.bottomRight,
    ...definition.topLeft,
    ...definition.topRight,
  ];
  const indices = [0, 1, 2, 1, 3, 2];
  const vertexData = new BABYLON.VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.uvs = [1, 0, 0, 0, 1, 1, 0, 1];
  vertexData.normals = [];
  BABYLON.VertexData.ComputeNormals(
    positions,
    indices,
    vertexData.normals,
  );

  const mesh = new BABYLON.Mesh(definition.name, scene);
  vertexData.applyToMesh(mesh);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.checkCollisions = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.metadata = {
    localEffect: true,
    dobuitaCinemaPoster: true,
    dobuitaCinemaPosterName: definition.name,
  };
  return mesh;
}

function suppressPosterSourceFaces(currentMeshes, definition) {
  const targetCenter = BABYLON.Vector3.FromArray(definition.sourceCenter);
  const candidates = meshesForDefinition(currentMeshes, definition).filter(
    (mesh) => definition.faceIds.every(
      (faceId) => faceId * 3 + 2 < (mesh.getIndices()?.length || 0),
    ),
  ).map((mesh) => {
    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo().boundingBox;
    return {
      mesh,
      distance: BABYLON.Vector3.DistanceSquared(
        bounds.centerWorld,
        targetCenter,
      ),
    };
  }).sort((left, right) => left.distance - right.distance);
  const source = candidates[0]?.mesh;
  if (!source) return false;

  const indices = Array.from(source.getIndices() || []);
  for (const faceId of definition.faceIds) {
    const offset = faceId * 3;
    indices[offset + 1] = indices[offset];
    indices[offset + 2] = indices[offset];
  }
  source.makeGeometryUnique?.();
  source.setIndices(indices, null, true);
  source.refreshBoundingInfo?.();
  return true;
}

export function createDobuitaCinemaPoster(scene, currentMeshes = []) {
  disposeDobuitaCinemaPoster();
  posterMeshes = [];
  for (const definition of DOBUITA_CINEMA_POSTERS) {
    if (!suppressPosterSourceFaces(currentMeshes, definition)) continue;
    posterMeshes.push(createPosterMesh(scene, definition));
  }
  return posterMeshes[0] || null;
}
