import * as BABYLON from "@babylonjs/core";
import {
  YOU_ARCADE_BACKLIT_SIGNS,
  YOU_ARCADE_DIGITAL_DISPLAYS,
  YOU_ARCADE_HIDDEN_SCREEN_FACES,
  YOU_ARCADE_POSTERS,
} from "../config/arcadeFixtures.js";

const arcadeBacklitSignMeshes = [];
const arcadeBacklitMaterialBindings = [];
const arcadeDigitalDisplays = [];
const arcadePosterMeshes = [];
export const YOU_ARCADE_MAP01_JUKEBOX_NODE_ADDRESS = 67560;

function nearestMt5Node(node) {
  let current = node;
  while (current && !current._mt5Node) current = current.parent;
  return current?._mt5Node || null;
}

export function keepOnlyYouArcadeMap01Jukebox(currentMeshes) {
  let retainedTriangles = 0;
  let suppressedTriangles = 0;
  for (const root of currentMeshes) {
    if (root._filename !== "S3_DGCT_MAP01.MT5") continue;
    for (const mesh of root.getChildMeshes(false)) {
      const indices = mesh.getIndices?.();
      if (!indices?.length) continue;
      const triangleCount = Math.floor(indices.length / 3);
      if (
        nearestMt5Node(mesh)?.addr
        === YOU_ARCADE_MAP01_JUKEBOX_NODE_ADDRESS
      ) {
        retainedTriangles += triangleCount;
        continue;
      }
      mesh.makeGeometryUnique?.();
      mesh.setIndices([], null, true);
      mesh.refreshBoundingInfo?.();
      mesh.isPickable = false;
      mesh.checkCollisions = false;
      mesh.metadata = {
        ...(mesh.metadata || {}),
        arcadeSuppressedVariant: true,
      };
      suppressedTriangles += triangleCount;
    }
  }
  return { retainedTriangles, suppressedTriangles };
}

export function hideYouArcadeScreenFaces(currentMeshes) {
  for (const suppression of YOU_ARCADE_HIDDEN_SCREEN_FACES) {
    const roots = currentMeshes.filter(
      (root) => root._filename === suppression.sourceFilename,
    );
    for (const root of roots) {
      const meshes = [
        ...(root.getClassName?.() === "Mesh" ? [root] : []),
        ...root.getChildMeshes(false),
      ];
      for (const mesh of meshes) {
        if (mesh.name !== suppression.meshName) continue;
        const indices = Array.from(mesh.getIndices() || []);
        if (indices.length === 0) continue;
        for (const faceId of suppression.faceIds) {
          const offset = faceId * 3;
          if (offset + 2 >= indices.length) continue;
          // Degenerate only the selected face. Keeping the index count intact
          // preserves the loader's submesh ranges and every other face ID.
          indices[offset + 1] = indices[offset];
          indices[offset + 2] = indices[offset];
        }
        mesh.makeGeometryUnique?.();
        mesh.setIndices(indices, null, true);
        mesh.refreshBoundingInfo();
      }
    }
  }
}

export function disposeYouArcadeBacklitSigns() {
  for (const mesh of arcadeBacklitSignMeshes.splice(0)) {
    mesh.material?.dispose(false, false);
    mesh.dispose(false, false);
  }
  for (const binding of arcadeBacklitMaterialBindings.splice(0)) {
    if (!binding.mesh.isDisposed()) binding.mesh.material = binding.original;
    binding.emissive.dispose(false, false);
  }
}

export function disposeYouArcadePosters() {
  for (const mesh of arcadePosterMeshes.splice(0)) {
    mesh.material?.dispose(false, true);
    mesh.dispose(false, false);
  }
}

export function createYouArcadePosters(scene, currentMeshes) {
  disposeYouArcadePosters();
  for (const definition of YOU_ARCADE_POSTERS) {
    const targetCenter = BABYLON.Vector3.FromArray(definition.sourceCenter);
    const candidates = currentMeshes.filter(
      (root) => root._filename === definition.sourceFilename,
    ).flatMap((root) => root.getChildMeshes(false)).filter((mesh) => (
      mesh.name === definition.meshName
      && definition.faceIds.every(
        (faceId) => faceId * 3 + 2 < (mesh.getIndices()?.length || 0),
      )
    )).map((mesh) => {
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
    if (!source) continue;

    const sourceIndices = Array.from(source.getIndices() || []);
    for (const faceId of definition.faceIds) {
      const offset = faceId * 3;
      sourceIndices[offset + 1] = sourceIndices[offset];
      sourceIndices[offset + 2] = sourceIndices[offset];
    }
    source.makeGeometryUnique?.();
    source.setIndices(sourceIndices, null, true);
    source.refreshBoundingInfo?.();

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
      arcadePoster: true,
    };
    arcadePosterMeshes.push(mesh);
  }
}

function createYouArcadeBacklitMaterial(source, name, definition = {}) {
  const material = source.material.clone(name);
  if (definition.splitMirroredV) {
    if (material.diffuseTexture) {
      material.diffuseTexture = material.diffuseTexture.clone();
      material.diffuseTexture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
      material.diffuseTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    }
    material.emissiveTexture = material.diffuseTexture || null;
    material.emissiveColor = new BABYLON.Color3(0.72, 0.7, 0.65);
  } else if (definition.preserveDiffuseMapping) {
    // Reusing a mirrored Dreamcast texture in both the diffuse and emissive
    // slots can produce a second, differently wrapped sample. Keep the
    // authored diffuse sample and make it self-lit instead.
    material.emissiveTexture = null;
    material.emissiveColor = new BABYLON.Color3(0.14, 0.13, 0.11);
  } else {
    material.emissiveTexture = material.diffuseTexture || null;
    material.emissiveColor = new BABYLON.Color3(0.72, 0.7, 0.65);
  }
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.zOffset = -8;
  material.zOffsetUnits = -8;
  material.metadata = {
    ...(material.metadata || {}),
    preserveEmissive: true,
  };
  return material;
}

function clipUvV(vertices, keepBelow) {
  const result = [];
  for (let index = 0; index < vertices.length; index++) {
    const current = vertices[index];
    const previous = vertices[
      (index + vertices.length - 1) % vertices.length
    ];
    const currentInside = keepBelow
      ? current.uv[1] <= 1
      : current.uv[1] >= 1;
    const previousInside = keepBelow
      ? previous.uv[1] <= 1
      : previous.uv[1] >= 1;
    if (currentInside !== previousInside) {
      const amount = (
        (1 - previous.uv[1])
        / (current.uv[1] - previous.uv[1])
      );
      result.push({
        position: BABYLON.Vector3.Lerp(
          previous.position,
          current.position,
          amount,
        ),
        uv: [
          previous.uv[0]
            + (current.uv[0] - previous.uv[0]) * amount,
          1,
        ],
      });
    }
    if (currentInside) result.push(current);
  }
  return result;
}

function appendUvPolygon(polygon, mirrorUpper, positions, uvs, indices) {
  if (polygon.length < 3) return;
  for (let triangle = 1; triangle < polygon.length - 1; triangle++) {
    for (const vertex of [
      polygon[0],
      polygon[triangle],
      polygon[triangle + 1],
    ]) {
      positions.push(...vertex.position.asArray());
      uvs.push(
        vertex.uv[0],
        mirrorUpper ? 2 - vertex.uv[1] : vertex.uv[1],
      );
      indices.push(indices.length);
    }
  }
}

export function createYouArcadeBacklitSigns(scene, currentMeshes) {
  disposeYouArcadeBacklitSigns();
  for (const definition of YOU_ARCADE_BACKLIT_SIGNS) {
    const roots = currentMeshes.filter(
      (candidate) => candidate._filename === definition.sourceFilename,
    );
    const targetCenter = BABYLON.Vector3.FromArray(definition.glowCenter);
    const candidates = roots.flatMap(
      (root) => root.getChildMeshes(false),
    ).filter((mesh) => (
      mesh.name === definition.meshName
      && definition.faceIds.every(
        (faceId) => faceId * 3 + 2 < (mesh.getIndices()?.length || 0),
      )
    )).map((mesh) => {
      mesh.computeWorldMatrix(true);
      const positions = mesh.getVerticesData(
        BABYLON.VertexBuffer.PositionKind,
      );
      const indices = mesh.getIndices();
      const center = BABYLON.Vector3.Zero();
      let pointCount = 0;
      if (positions && indices) {
        for (const faceId of definition.faceIds) {
          for (let corner = 0; corner < 3; corner++) {
            const sourceIndex = indices[faceId * 3 + corner];
            center.addInPlace(BABYLON.Vector3.TransformCoordinates(
              BABYLON.Vector3.FromArray(positions, sourceIndex * 3),
              mesh.getWorldMatrix(),
            ));
            pointCount++;
          }
        }
      }
      if (pointCount > 0) center.scaleInPlace(1 / pointCount);
      return {
        mesh,
        distance: pointCount > 0
          ? BABYLON.Vector3.Distance(center, targetCenter)
          : Number.POSITIVE_INFINITY,
      };
    }).sort((left, right) => left.distance - right.distance);
    const source = candidates[0]?.mesh;
    if (!source?.material) continue;

    if (definition.wholeMesh) {
      const original = source.material;
      const emissive = createYouArcadeBacklitMaterial(
        source,
        `${definition.meshName}_backlit_material`,
        definition,
      );
      source.material = emissive;
      source.metadata = {
        ...(source.metadata || {}),
        localEffect: true,
        arcadeBacklitSign: true,
      };
      arcadeBacklitMaterialBindings.push({
        mesh: source,
        original,
        emissive,
      });
      continue;
    }

    source.computeWorldMatrix(true);
    const sourcePositions = source.getVerticesData(
      BABYLON.VertexBuffer.PositionKind,
    );
    const sourceUvs = source.getVerticesData(BABYLON.VertexBuffer.UVKind);
    const sourceIndices = Array.from(source.getIndices() || []);
    if (!sourcePositions || !sourceUvs || !sourceIndices) continue;

    const positions = [];
    const uvs = [];
    const indices = [];
    for (const faceId of definition.faceIds) {
      const faceOffset = faceId * 3;
      const vertices = [];
      for (let corner = 0; corner < 3; corner++) {
        const sourceIndex = sourceIndices[faceOffset + corner];
        const position = BABYLON.Vector3.TransformCoordinates(
          BABYLON.Vector3.FromArray(sourcePositions, sourceIndex * 3),
          source.getWorldMatrix(),
        );
        vertices.push({
          position,
          uv: [
            sourceUvs[sourceIndex * 2],
            sourceUvs[sourceIndex * 2 + 1],
          ],
        });
      }
      if (definition.splitMirroredV) {
        appendUvPolygon(
          clipUvV(vertices, true),
          false,
          positions,
          uvs,
          indices,
        );
        appendUvPolygon(
          clipUvV(vertices, false),
          true,
          positions,
          uvs,
          indices,
        );
      } else {
        for (const vertex of vertices) {
          positions.push(...vertex.position.asArray());
          uvs.push(...vertex.uv);
          indices.push(indices.length);
        }
      }
    }

    const normal = BABYLON.Vector3.FromArray(
      definition.glowNormal,
    ).normalize();
    // Remove the original two faces before adding their emissive replacement.
    // This avoids coplanar depth fighting at oblique viewing angles.
    const remainingIndices = [...sourceIndices];
    for (const faceId of definition.faceIds) {
      const offset = faceId * 3;
      remainingIndices[offset + 1] = remainingIndices[offset];
      remainingIndices[offset + 2] = remainingIndices[offset];
    }
    source.makeGeometryUnique?.();
    source.setIndices(remainingIndices, null, true);

    for (let offset = 0; offset < positions.length; offset += 3) {
      const separation = definition.offset ?? 0.006;
      positions[offset] += normal.x * separation;
      positions[offset + 1] += normal.y * separation;
      positions[offset + 2] += normal.z * separation;
    }
    const normals = [];
    BABYLON.VertexData.ComputeNormals(positions, indices, normals);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.uvs = uvs;
    vertexData.normals = normals;

    const mesh = new BABYLON.Mesh("darts_backlit_sign", scene);
    vertexData.applyToMesh(mesh);
    const material = createYouArcadeBacklitMaterial(
      source,
      "darts_backlit_sign_material",
      definition,
    );
    mesh.material = material;
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.metadata = {
      localEffect: true,
      arcadeBacklitSign: true,
    };
    arcadeBacklitSignMeshes.push(mesh);
  }
}

const SEVEN_SEGMENT_DIGITS = Object.freeze({
  0: "abcdef",
  1: "bc",
  2: "abdeg",
  3: "abcdg",
  4: "bcfg",
  5: "acdfg",
  6: "acdefg",
  7: "abc",
  8: "abcdefg",
  9: "abcdfg",
});

function drawSevenSegmentDigit(
  context,
  digit,
  x,
  y,
  width,
  height,
  thickness,
) {
  const activeSegments = SEVEN_SEGMENT_DIGITS[digit] || "";
  const left = x + thickness * 0.65;
  const right = x + width - thickness * 0.65;
  const top = y + thickness * 0.65;
  const middle = y + height / 2;
  const bottom = y + height - thickness * 0.65;
  const jointGap = thickness * 0.7;
  const segments = {
    a: [left + jointGap, top, right - jointGap, top],
    b: [right, top + jointGap, right, middle - jointGap],
    c: [right, middle + jointGap, right, bottom - jointGap],
    d: [left + jointGap, bottom, right - jointGap, bottom],
    e: [left, middle + jointGap, left, bottom - jointGap],
    f: [left, top + jointGap, left, middle - jointGap],
    g: [left + jointGap, middle, right - jointGap, middle],
  };
  context.lineWidth = thickness;
  context.lineCap = "round";
  context.strokeStyle = "#ff3028";
  context.shadowColor = "rgba(255, 30, 20, 0.9)";
  context.shadowBlur = thickness * 0.65;
  for (const segment of activeSegments) {
    const [x1, y1, x2, y2] = segments[segment];
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
  }
}

function drawSevenSegmentText(
  context,
  text,
  {
    x,
    y,
    width,
    height,
    thickness,
    gap,
  },
) {
  let cursor = x;
  for (const character of text) {
    if (character === ".") {
      context.beginPath();
      context.fillStyle = "#ff3028";
      context.shadowColor = "rgba(255, 30, 20, 0.9)";
      context.shadowBlur = thickness * 0.65;
      context.arc(
        cursor + thickness * 0.35,
        y + height - thickness * 0.45,
        thickness * 0.42,
        0,
        Math.PI * 2,
      );
      context.fill();
      cursor += thickness + gap * 0.4;
      continue;
    }
    drawSevenSegmentDigit(
      context,
      character,
      cursor,
      y,
      width,
      height,
      thickness,
    );
    cursor += width + gap;
  }
}

export function disposeYouArcadeDigitalDisplays() {
  for (const display of arcadeDigitalDisplays.splice(0)) {
    const { mesh } = display;
    const material = mesh.material;
    const textures = material?.getActiveTextures?.() || [];
    mesh.dispose(false, false);
    material?.dispose(false, false);
    for (const texture of textures) texture.dispose();
  }
}

function drawYouArcadeDigitalDisplay(
  texture,
  definition,
  value = 0,
  digitsVisible = true,
) {
  const context = texture.getContext();
  context.clearRect(0, 0, 1024, 256);
  if (definition.opaqueBackground) {
    context.fillStyle = definition.backgroundColor || "#08090b";
    context.fillRect(0, 0, 1024, 256);
  }
  if (
    definition.scoreSource
    && digitsVisible
    && Number.isInteger(definition.decimalPlaces)
  ) {
    const maximum = Number.isFinite(definition.maximum)
      ? definition.maximum
      : 99999;
    const decimalPlaces = Math.max(0, definition.decimalPlaces);
    const displayValue = Math.min(
      maximum,
      Math.max(0, Number(value) || 0),
    ).toFixed(decimalPlaces);
    const [whole, fraction = ""] = displayValue.split(".");
    drawSevenSegmentText(context, `${whole}.`, {
      x: 411 - Math.max(0, whole.length - 1) * 123,
      y: 45,
      width: 103,
      height: 165,
      thickness: 15,
      gap: 20,
    });
    drawSevenSegmentText(context, fraction, {
      x: 560,
      y: 87,
      width: 82,
      height: 123,
      thickness: 12,
      gap: 15,
    });
  } else if (definition.scoreSource && digitsVisible) {
    const maximum = Number.isFinite(definition.maximum)
      ? definition.maximum
      : 99999;
    const digits = Number.isInteger(definition.digits)
      ? definition.digits
      : 5;
    const score = Math.min(
      maximum,
      Math.max(0, Math.floor(Number(value) || 0)),
    );
    drawSevenSegmentText(
      context,
      String(score).padStart(digits, "0").slice(-digits),
      {
        x: 137,
        y: 42,
        width: 130,
        height: 172,
        thickness: 16,
        gap: 25,
      },
    );
  } else if (!definition.scoreSource) {
    drawSevenSegmentText(context, definition.largeText, {
      x: definition.largeX ?? 165,
      y: 45,
      width: 103,
      height: 165,
      thickness: 15,
      gap: 20,
    });
    drawSevenSegmentText(context, definition.smallText, {
      x: 560,
      y: 87,
      width: 82,
      height: 123,
      thickness: 12,
      gap: 15,
    });
  }
  texture.update(false);
}

export function updateYouArcadePaddleScores(
  score,
  highScore,
  lastScore,
) {
  for (const display of arcadeDigitalDisplays) {
    if (!display.definition.scoreSource?.startsWith("paddles")) continue;
    let sourceValue = score;
    if (display.definition.scoreSource === "paddlesHighScore") {
      sourceValue = highScore;
    } else if (display.definition.scoreSource === "paddlesLastScore") {
      sourceValue = lastScore;
    }
    const value = Math.min(
      display.definition.maximum ?? 99999,
      Math.max(0, Math.floor(Number(sourceValue) || 0)),
    );
    if (display.value === value) continue;
    display.value = value;
    drawYouArcadeDigitalDisplay(
      display.texture,
      display.definition,
      value,
      display.digitsVisible !== false,
    );
  }
}

export function updateYouArcadeDartScores(
  boardIndex,
  { score = 0, highScore = 0, lastScore = 0, timeBonus = 10 } = {},
) {
  const prefix = `darts${boardIndex}`;
  const values = {
    [`${prefix}Score`]: score,
    [`${prefix}HighScore`]: highScore,
    [`${prefix}LastScore`]: lastScore,
    [`${prefix}TimeBonus`]: timeBonus,
  };
  for (const display of arcadeDigitalDisplays) {
    const source = display.definition.scoreSource;
    if (!(source in values)) continue;
    const value = Math.min(
      display.definition.maximum ?? 99999,
      Math.max(0, Number(values[source]) || 0),
    );
    const rounded = Number(value.toFixed(
      display.definition.decimalPlaces ?? 0,
    ));
    if (display.value === rounded) continue;
    display.value = rounded;
    drawYouArcadeDigitalDisplay(
      display.texture,
      display.definition,
      rounded,
      display.digitsVisible !== false,
    );
  }
}

export function setYouArcadeDartScoreVisibility(
  boardIndex,
  { score = true, highScore = true, lastScore = true } = {},
) {
  const sources = {
    [`darts${boardIndex}Score`]: score,
    [`darts${boardIndex}HighScore`]: highScore,
    [`darts${boardIndex}LastScore`]: lastScore,
  };
  for (const display of arcadeDigitalDisplays) {
    const source = display.definition.scoreSource;
    if (!(source in sources)) continue;
    const digitsVisible = Boolean(sources[source]);
    if (display.digitsVisible === digitsVisible) continue;
    display.digitsVisible = digitsVisible;
    drawYouArcadeDigitalDisplay(
      display.texture,
      display.definition,
      display.value,
      digitsVisible,
    );
  }
}

export function setYouArcadePaddleScoreVisibility({
  score = true,
  highScore = true,
  lastScore = true,
} = {}) {
  for (const display of arcadeDigitalDisplays) {
    let visible = true;
    if (display.definition.scoreSource === "paddles") visible = score;
    else if (
      display.definition.scoreSource === "paddlesHighScore"
    ) visible = highScore;
    else if (
      display.definition.scoreSource === "paddlesLastScore"
    ) visible = lastScore;
    else continue;
    const digitsVisible = Boolean(visible);
    if (display.digitsVisible === digitsVisible) continue;
    display.digitsVisible = digitsVisible;
    drawYouArcadeDigitalDisplay(
      display.texture,
      display.definition,
      display.value,
      digitsVisible,
    );
  }
}

export function createYouArcadeDigitalDisplays(scene) {
  disposeYouArcadeDigitalDisplays();
  for (const definition of YOU_ARCADE_DIGITAL_DISPLAYS) {
    const texture = new BABYLON.DynamicTexture(
      `${definition.name}_texture`,
      { width: 1024, height: 256 },
      scene,
      true,
    );
    texture.hasAlpha = definition.opaqueBackground !== true;
    texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    drawYouArcadeDigitalDisplay(texture, definition, 0);

    const material = new BABYLON.StandardMaterial(
      `${definition.name}_material`,
      scene,
    );
    material.disableLighting = true;
    material.diffuseColor = BABYLON.Color3.Black();
    material.specularColor = BABYLON.Color3.Black();
    const emissiveBoost = Number.isFinite(definition.emissiveBoost)
      ? definition.emissiveBoost
      : 1;
    material.emissiveColor = new BABYLON.Color3(
      emissiveBoost,
      emissiveBoost,
      emissiveBoost,
    );
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    if (definition.opaqueBackground) {
      material.transparencyMode = BABYLON.Material.MATERIAL_OPAQUE;
      material.useAlphaFromDiffuseTexture = false;
    } else {
      material.opacityTexture = texture;
      material.useAlphaFromDiffuseTexture = true;
    }
    material.backFaceCulling = false;
    material.zOffset = -10;
    material.zOffsetUnits = -10;

    const mesh = new BABYLON.Mesh(definition.name, scene);
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
    vertexData.uvs = definition.uvs || [1, 1, 0, 1, 1, 0, 0, 0];
    vertexData.normals = [];
    BABYLON.VertexData.ComputeNormals(
      positions,
      indices,
      vertexData.normals,
    );
    vertexData.applyToMesh(mesh);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.metadata = {
      localEffect: true,
      arcadeDigitalDisplay: true,
    };
    arcadeDigitalDisplays.push({
      mesh,
      texture,
      definition,
      value: definition.scoreSource ? 0 : null,
      digitsVisible: true,
    });
  }
}
