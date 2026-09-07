import * as BABYLON from "@babylonjs/core";

import {
  AIM_GUIDE_NEUTRAL_URL,
  AIM_GUIDE_TARGET_URL,
  AIM_IMPACT_RING_URL,
} from "./LuckyBreakVisualAssets.js";
import {
  CUE_BALL_PLACEMENT_MARKER_URL,
} from "./LuckyBreakPlacementAsset.js";

// Lucky Break's play-area plane is y=0.75. The native cushion data uses
// y=0.795; treating that as the felt height made every overlay float 4.5 cm.
const TABLE_SURFACE_Y = 0.75;
const BALL_RADIUS = 0.03;
const MAX_GUIDE_DISTANCE = 1.6;
const GUIDE_FRAME_WIDTH = 125;
const GUIDE_FRAME_HEIGHT = 176;
const GUIDE_HEAD_HEIGHT = 30;
const CUE_LENGTH = 1.399841;

function poolPoint(point, tableCenter, yOffset = 0) {
  return new BABYLON.Vector3(
    tableCenter[0] + point.x,
    TABLE_SURFACE_Y + yOffset,
    tableCenter[2] + point.z,
  );
}

function makeColorMaterial(scene, name, color, alpha = 1) {
  const material = new BABYLON.ShaderMaterial(
    name,
    scene,
    {
      vertexSource: `
        precision highp float;
        attribute vec3 position;
        uniform mat4 worldViewProjection;
        void main(void) {
          gl_Position = worldViewProjection * vec4(position, 1.0);
        }
      `,
      fragmentSource: `
        precision highp float;
        uniform vec3 tint;
        uniform float opacity;
        void main(void) {
          gl_FragColor = vec4(tint, opacity);
        }
      `,
    },
    {
      attributes: ["position"],
      uniforms: ["worldViewProjection", "tint", "opacity"],
      needAlphaBlending: alpha < 1,
    },
  );
  material.setColor3("tint", color);
  material.setFloat("opacity", alpha);
  material.poolOverlayColor = color.clone();
  material.poolOverlayAlpha = alpha;
  material.disableDepthWrite = true;
  material.backFaceCulling = false;
  return material;
}

export function createPoolOverlayColorMaterial(
  scene,
  name,
  color,
  alpha = 1,
) {
  return makeColorMaterial(scene, name, color, alpha);
}

function makeTextureMaterial(scene, name, url, color) {
  const texture = new BABYLON.Texture(
    url,
    scene,
    false,
    false,
    BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.hasAlpha = true;
  texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 4;
  // Lucky Break's table overlays are not StandardMaterials. Their shader
  // multiplies the source image by the UI color and uses the source/vertex
  // alpha directly. Keeping that path here prevents lighting and material
  // defaults from turning the white guide black or dropping the orange fan.
  const material = new BABYLON.ShaderMaterial(
    name,
    scene,
    {
      vertexSource: `
        precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        attribute vec4 color;
        uniform mat4 worldViewProjection;
        varying vec2 vUV;
        varying vec4 vColor;
        void main(void) {
          vUV = uv;
          vColor = color;
          gl_Position = worldViewProjection * vec4(position, 1.0);
        }
      `,
      fragmentSource: `
        precision highp float;
        varying vec2 vUV;
        varying vec4 vColor;
        uniform sampler2D overlaySampler;
        uniform vec3 tint;
        uniform float opacity;
        void main(void) {
          vec4 sourceColor = texture2D(overlaySampler, vUV);
          gl_FragColor = vec4(
            sourceColor.rgb * tint * vColor.rgb,
            sourceColor.a * opacity * vColor.a
          );
        }
      `,
    },
    {
      attributes: ["position", "uv", "color"],
      uniforms: ["worldViewProjection", "tint", "opacity"],
      samplers: ["overlaySampler"],
      needAlphaBlending: true,
    },
  );
  material.setTexture("overlaySampler", texture);
  material.setColor3("tint", color);
  material.setFloat("opacity", 1);
  material.poolOverlayTexture = texture;
  material.poolOverlayColor = color.clone();
  material.poolSetColor = (nextColor) => {
    material.poolOverlayColor.copyFrom(nextColor);
    material.setColor3("tint", nextColor);
  };
  material.poolSetAlpha = (alpha) => material.setFloat("opacity", alpha);
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  return material;
}

function makeOverlayGround(scene, name, material, alphaIndex) {
  const mesh = BABYLON.MeshBuilder.CreateGround(
    name,
    { width: 1, height: 1 },
    scene,
  );
  mesh.material = material;
  const vertexCount = mesh.getTotalVertices();
  mesh.setVerticesData(
    BABYLON.VertexBuffer.ColorKind,
    new Array(vertexCount * 4).fill(1),
    false,
    4,
  );
  mesh.useVertexColors = true;
  mesh.hasVertexAlpha = true;
  mesh.isPickable = false;
  // Table helpers share the balls' depth buffer. Balls must occlude every
  // helper; the cue-attached power meter is the sole foreground exception.
  mesh.renderingGroupId = 0;
  mesh.alphaIndex = alphaIndex;
  mesh.setEnabled(false);
  return mesh;
}

function makeGuideSegment(
  scene,
  name,
  material,
  alphaIndex,
  includeTail,
) {
  const pairCount = includeTail ? 4 : 3;
  const vertexCount = pairCount * 2;
  const headRatio = GUIDE_HEAD_HEIGHT / GUIDE_FRAME_HEIGHT;
  const tailRatio = 1 - headRatio;
  const vCoordinates = includeTail
    ? [0, headRatio, tailRatio, 1]
    : [0, headRatio, tailRatio];
  const uvs = [];
  const colors = [];
  const indices = [];
  for (let pair = 0; pair < pairCount; pair++) {
    uvs.push(0, vCoordinates[pair], 1, vCoordinates[pair]);
    const alpha = pair < 2 ? 1 : 0;
    colors.push(1, 1, 1, alpha, 1, 1, 1, alpha);
    if (pair > 0) {
      const previous = (pair - 1) * 2;
      const current = pair * 2;
      indices.push(
        previous, previous + 1, current + 1,
        previous, current + 1, current,
      );
    }
  }
  const mesh = new BABYLON.Mesh(name, scene);
  mesh.setVerticesData(
    BABYLON.VertexBuffer.PositionKind,
    new Array(vertexCount * 3).fill(0),
    true,
  );
  mesh.setVerticesData(
    BABYLON.VertexBuffer.UVKind,
    uvs,
  );
  mesh.setVerticesData(
    BABYLON.VertexBuffer.NormalKind,
    Array.from({ length: vertexCount }, () => [0, 1, 0]).flat(),
  );
  mesh.setVerticesData(
    BABYLON.VertexBuffer.ColorKind,
    colors,
    false,
    4,
  );
  mesh.setIndices(indices);
  mesh.material = material;
  mesh.useVertexColors = true;
  mesh.hasVertexAlpha = true;
  mesh.isPickable = false;
  mesh.renderingGroupId = 0;
  mesh.alphaIndex = alphaIndex;
  mesh.metadata = {
    ...mesh.metadata,
    poolGuideIncludeTail: includeTail,
  };
  mesh.setEnabled(false);
  return mesh;
}

function makePowerBarMaterial(scene) {
  const material = new BABYLON.ShaderMaterial(
    "mjq_pool_power_bar_material",
    scene,
    {
      vertexSource: `
        precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 worldViewProjection;
        varying vec2 vUV;
        varying float vLen;
        void main(void) {
          vUV = uv;
          vLen = -position.x;
          gl_Position = worldViewProjection * vec4(position, 1.0);
        }
      `,
      fragmentSource: `
        precision highp float;
        varying vec2 vUV;
        varying float vLen;
        uniform vec3 highlightColor;
        uniform float alpha;
        uniform float bgAlpha;
        uniform float highlightLen;
        void main(void) {
          vec4 color = vec4(0.9, 0.92, 0.93, bgAlpha);
          if (vLen > highlightLen) {
            color = vec4(highlightColor, 1.0);
          }
          float across = min(vUV.y, 1.0 - vUV.y);
          float along = min(vUV.x, 1.0 - vUV.x);
          float edgeAlpha = smoothstep(0.0, 0.16, across)
            * smoothstep(0.0, 0.018, along);
          color.a *= alpha * edgeAlpha;
          gl_FragColor = color;
        }
      `,
    },
    {
      attributes: ["position", "uv"],
      uniforms: [
        "worldViewProjection",
        "highlightColor",
        "alpha",
        "bgAlpha",
        "highlightLen",
      ],
      needAlphaBlending: true,
    },
  );
  material.setColor3(
    "highlightColor",
    new BABYLON.Color3(0.12549, 0.70196, 1),
  );
  material.setFloat("alpha", 1);
  material.setFloat("bgAlpha", 0.25);
  material.setFloat("highlightLen", 0.115);
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  return material;
}

function makePowerBar(scene) {
  const mesh = new BABYLON.Mesh("mjq_pool_power_bar", scene);
  mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, [
    -0.19, 0.01, -0.01475,
    -0.19, 0.01, -0.01525,
    -0.1895, 0.01, -0.01475,
    -0.1895, 0.01, -0.01525,
    -0.0405, 0.01, -0.01475,
    -0.0405, 0.01, -0.01525,
    -0.04, 0.01, -0.01475,
    -0.04, 0.01, -0.01525,
  ]);
  mesh.setVerticesData(BABYLON.VertexBuffer.UVKind, [
    0, 0, 0, 1, 0.04, 0, 0.04, 1,
    0.96, 0, 0.96, 1, 1, 0, 1, 1,
  ]);
  mesh.setIndices([
    0, 1, 3, 0, 3, 2,
    2, 3, 5, 2, 5, 4,
    4, 5, 7, 4, 7, 6,
  ]);
  mesh.material = makePowerBarMaterial(scene);
  mesh.isPickable = false;
  mesh.renderingGroupId = 1;
  mesh.alphaIndex = 910;
  mesh.setEnabled(false);
  return mesh;
}

export function createLuckyBreakBallShadow(scene) {
  const material = new BABYLON.ShaderMaterial(
    "mjq_pool_ball_shadow_material",
    scene,
    {
      vertexSource: `
        precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 worldViewProjection;
        varying vec2 vUV;
        void main(void) {
          vUV = uv;
          gl_Position = worldViewProjection * vec4(position, 1.0);
        }
      `,
      fragmentSource: `
        precision highp float;
        varying vec2 vUV;
        void main(void) {
          float radius = length(vUV - vec2(0.5)) * 2.0;
          float alpha = 0.8 * (1.0 - smoothstep(0.18, 1.0, radius));
          gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
        }
      `,
    },
    {
      attributes: ["position", "uv"],
      uniforms: ["worldViewProjection"],
      needAlphaBlending: true,
    },
  );
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  const shadow = BABYLON.MeshBuilder.CreateGround(
    "mjq_pool_ball_shadow",
    { width: BALL_RADIUS * 2.6, height: BALL_RADIUS * 2.6 },
    scene,
  );
  shadow.material = material;
  shadow.position.y = TABLE_SURFACE_Y + 0.0005;
  shadow.renderingGroupId = 0;
  shadow.alphaIndex = 100;
  shadow.isPickable = false;
  return shadow;
}

function placeDisc(mesh, position, diameter) {
  mesh.position.copyFrom(position);
  mesh.scaling.set(diameter, 1, diameter);
  mesh.setEnabled(true);
}

export function targetGuideFanWidth(distance, width, openness) {
  const opening = Math.max(0, distance - width)
    * Math.max(0, openness)
    * 2.8;
  return width + opening * 2;
}

function placeGuideSegment(
  mesh,
  start,
  directionX,
  directionZ,
  distance,
  width,
  spacing,
  openness = 0,
) {
  if (distance <= spacing) {
    mesh.setEnabled(false);
    return;
  }
  const directionLength = Math.hypot(directionX, directionZ);
  if (directionLength <= 0.000001) {
    mesh.setEnabled(false);
    return;
  }
  const normalizedX = directionX / directionLength;
  const normalizedZ = directionZ / directionLength;
  const sideX = -normalizedZ;
  const sideZ = normalizedX;
  const segmentDistance = distance - spacing;
  const headLength = GUIDE_HEAD_HEIGHT * width / GUIDE_FRAME_WIDTH;
  const along = mesh.metadata.poolGuideIncludeTail
    ? [
      spacing,
      spacing + headLength,
      spacing + headLength + Math.max(0, segmentDistance - 2 * headLength),
      spacing + segmentDistance,
    ]
    : [
      spacing,
      spacing + headLength,
      spacing + headLength + Math.max(0, segmentDistance - headLength),
    ];
  const opening = Math.max(0, segmentDistance - width)
    * Math.max(0, openness)
    * 2.8;
  const positions = [];
  for (const longitudinal of along) {
    const openingOffset = segmentDistance > 0
      ? (longitudinal - spacing) / segmentDistance * opening
      : 0;
    const halfWidth = width * 0.5 + openingOffset;
    const centerX = start.x + normalizedX * longitudinal;
    const centerZ = start.z + normalizedZ * longitudinal;
    positions.push(
      centerX - sideX * halfWidth,
      start.y,
      centerZ - sideZ * halfWidth,
      centerX + sideX * halfWidth,
      start.y,
      centerZ + sideZ * halfWidth,
    );
  }
  mesh.updateVerticesData(
    BABYLON.VertexBuffer.PositionKind,
    positions,
    true,
  );
  mesh.setEnabled(true);
}

export function createCuePlacementMarker(scene) {
  const marker = new BABYLON.TransformNode("mjq_pool_placement_marker", scene);
  const colors = [
    new BABYLON.Color3(0.42, 1, 0.74),
    new BABYLON.Color3(0.92, 1, 0.97),
  ];
  const markerMaterials = colors.map((color, index) => makeColorMaterial(
    scene,
    `mjq_pool_placement_marker_${index}`,
    color,
    index === 0 ? 0.78 : 0.92,
  ));
  const ticks = [];
  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI / 4;
    const tick = BABYLON.MeshBuilder.CreateBox(
      `mjq_pool_placement_marker_tick_${index}`,
      { width: 0.025, height: 0.0015, depth: 0.006 },
      scene,
    );
    tick.parent = marker;
    tick.position.set(Math.cos(angle) * 0.066, 0, Math.sin(angle) * 0.066);
    tick.rotation.y = -angle + Math.PI / 2;
    tick.material = markerMaterials[index % markerMaterials.length];
    tick.isPickable = false;
    // Keep placement UI in the table's depth group so the opaque cue ball
    // occludes it instead of looking translucent through the marker.
    tick.renderingGroupId = 0;
    tick.alphaIndex = 920 + index;
    ticks.push(tick);
  }
  marker.position.y = TABLE_SURFACE_Y + 0.006;
  marker.metadata = {
    ...marker.metadata,
    poolMarkerMaterials: markerMaterials,
  };
  marker.disposePoolMarker = () => {
    for (const tick of ticks) tick.dispose();
    for (const material of markerMaterials) material.dispose();
    marker.dispose();
  };
  return marker;
}

export function createCuePlacementCursor(scene) {
  const material = makeTextureMaterial(
    scene,
    "mjq_pool_placement_cursor_material",
    CUE_BALL_PLACEMENT_MARKER_URL,
    new BABYLON.Color3(25 / 255, 205 / 255, 84 / 255),
  );
  material.alpha = 0.8;
  material.poolSetAlpha(0.8);
  const cursor = makeOverlayGround(
    scene,
    "mjq_pool_placement_cursor",
    material,
    910,
  );
  cursor.renderingGroupId = 0;
  cursor.scaling.set(0.08, 1, 0.08);
  cursor.setValid = (valid) => {
    material.poolSetColor(new BABYLON.Color3(
      valid ? 25 / 255 : 1,
      valid ? 205 / 255 : 80 / 255,
      valid ? 84 / 255 : 15 / 255,
    ));
  };
  return cursor;
}

export class LuckyBreakPoolVisuals {
  constructor(scene, tableCenter) {
    this.scene = scene;
    this.tableCenter = tableCenter;
    const neutral = new BABYLON.Color3(218 / 255, 218 / 255, 218 / 255);
    const target = new BABYLON.Color3(237 / 255, 181 / 255, 30 / 255);
    this.cueLine = makeGuideSegment(
      scene,
      "mjq_pool_aim_cue",
      makeTextureMaterial(
        scene,
        "mjq_pool_aim_cue_material",
        AIM_GUIDE_NEUTRAL_URL,
        neutral,
      ),
      900,
      true,
    );
    this.cueImpact = makeOverlayGround(
      scene,
      "mjq_pool_aim_cue_impact",
      makeTextureMaterial(
        scene,
        "mjq_pool_aim_cue_impact_material",
        AIM_IMPACT_RING_URL,
        neutral,
      ),
      904,
    );
    this.cueDeflection = makeGuideSegment(
      scene,
      "mjq_pool_aim_cue_deflection",
      makeTextureMaterial(
        scene,
        "mjq_pool_aim_cue_deflection_material",
        AIM_GUIDE_NEUTRAL_URL,
        neutral,
      ),
      901,
      false,
    );
    this.targetImpact = makeOverlayGround(
      scene,
      "mjq_pool_aim_target_impact",
      makeTextureMaterial(
        scene,
        "mjq_pool_aim_target_impact_material",
        AIM_IMPACT_RING_URL,
        neutral,
      ),
      905,
    );
    this.targetLine = makeGuideSegment(
      scene,
      "mjq_pool_aim_target",
      makeTextureMaterial(
        scene,
        "mjq_pool_aim_target_material",
        AIM_GUIDE_TARGET_URL,
        target,
      ),
      902,
      false,
    );
    this.guideMeshes = [
      this.cueLine,
      this.cueImpact,
      this.cueDeflection,
      this.targetImpact,
      this.targetLine,
    ];
    for (const mesh of this.guideMeshes) mesh.material.poolSetAlpha(0.6);

    this.powerBar = makePowerBar(scene);
    this.lastPredictionKey = "";
  }

  hideGuides() {
    for (const mesh of this.guideMeshes) mesh.setEnabled(false);
    this.lastPredictionKey = "";
  }

  updateAiming({ game, snapshot, aimAngle, power, sideSpin, topSpin }) {
    const cueBall = snapshot?.balls.find((ball) => ball.number === 0);
    if (!game || !cueBall?.active) {
      this.hideGuides();
      return;
    }
    const predictionKey = [
      aimAngle,
      power,
      sideSpin,
      topSpin,
      cueBall.position.x,
      cueBall.position.z,
      snapshot.targetBallNumber,
    ].join(":");
    if (predictionKey === this.lastPredictionKey) return;
    this.lastPredictionKey = predictionKey;
    const prediction = game.predictShot({
      directionX: Math.cos(aimAngle),
      directionZ: Math.sin(aimAngle),
      power,
      sideSpin,
      topSpin,
    }, MAX_GUIDE_DISTANCE);
    if (!prediction) {
      this.hideGuides();
      return;
    }

    const start = poolPoint(prediction.p0, this.tableCenter, 0.002);
    this.cueImpact.setEnabled(false);
    this.cueDeflection.setEnabled(false);
    this.targetImpact.setEnabled(false);
    this.targetLine.setEnabled(false);
    if (!prediction.impactOccured) {
      const cueEnd = poolPoint(prediction.cue, this.tableCenter, 0.002);
      const cueDeltaX = cueEnd.x - start.x;
      const cueDeltaZ = cueEnd.z - start.z;
      placeGuideSegment(
        this.cueLine,
        start,
        cueDeltaX,
        cueDeltaZ,
        Math.hypot(cueDeltaX, cueDeltaZ),
        BALL_RADIUS,
        BALL_RADIUS,
      );
      return;
    }

    const cueImpact = poolPoint(prediction.p1, this.tableCenter, 0.003);
    const impactDeltaX = cueImpact.x - start.x;
    const impactDeltaZ = cueImpact.z - start.z;
    const impactDistance = Math.hypot(impactDeltaX, impactDeltaZ);
    placeGuideSegment(
      this.cueLine,
      start,
      impactDeltaX,
      impactDeltaZ,
      impactDistance - BALL_RADIUS,
      BALL_RADIUS,
      BALL_RADIUS,
    );
    placeDisc(this.cueImpact, cueImpact, BALL_RADIUS * 2);
    const cueAfter = poolPoint(prediction.cue, this.tableCenter, 0.002);
    const cueAfterDeltaX = cueAfter.x - cueImpact.x;
    const cueAfterDeltaZ = cueAfter.z - cueImpact.z;
    const cueTravel = 0.5 * (
      cueAfterDeltaX * cueAfterDeltaX
      + cueAfterDeltaZ * cueAfterDeltaZ
    );
    const cueEnergy = 0.5 * Math.max(0, prediction.cueVSq || 0);
    const cueDeflectionDistance = Math.min(
      cueTravel + cueEnergy,
      MAX_GUIDE_DISTANCE - impactDistance,
    );
    placeGuideSegment(
      this.cueDeflection,
      cueImpact,
      cueAfterDeltaX,
      cueAfterDeltaZ,
      cueDeflectionDistance,
      BALL_RADIUS,
      BALL_RADIUS,
    );
    if (!prediction.hasImpactTarget) return;

    const targetImpact = poolPoint(prediction.p2, this.tableCenter, 0.004);
    placeDisc(this.targetImpact, targetImpact, BALL_RADIUS * 2);
    const validTarget = prediction.targetNumber === snapshot.targetBallNumber;
    this.targetImpact.material.poolSetColor(
      validTarget
        ? new BABYLON.Color3(218 / 255, 218 / 255, 218 / 255)
        : new BABYLON.Color3(1, 80 / 255, 15 / 255),
    );
    const targetAfter = poolPoint(prediction.target, this.tableCenter, 0.002);
    const targetDeltaX = targetAfter.x - targetImpact.x;
    const targetDeltaZ = targetAfter.z - targetImpact.z;
    const targetDirectionLength = Math.hypot(targetDeltaX, targetDeltaZ);
    if (targetDirectionLength <= 0.0001) {
      this.targetLine.setEnabled(false);
      return;
    }
    const targetDistance = Math.min(
      0.5 * Math.max(0, prediction.targetVSq || 0),
      0.4,
    );
    const cueDirectionX = impactDeltaX / Math.max(0.0001, impactDistance);
    const cueDirectionZ = impactDeltaZ / Math.max(0.0001, impactDistance);
    const openness = 1 - (
      cueDirectionX * targetDeltaX / targetDirectionLength
      + cueDirectionZ * targetDeltaZ / targetDirectionLength
    );
    placeGuideSegment(
      this.targetLine,
      targetImpact,
      targetDeltaX,
      targetDeltaZ,
      targetDistance,
      BALL_RADIUS * 0.5,
      BALL_RADIUS,
      openness,
    );
  }

  updatePower({ cuePivot, power, visible }) {
    if (!visible || !cuePivot) {
      this.powerBar.setEnabled(false);
      return;
    }
    if (this.powerBar.parent !== cuePivot) {
      this.powerBar.parent = cuePivot;
      this.powerBar.position.set(CUE_LENGTH * 0.5, 0, 0);
      this.powerBar.rotationQuaternion = BABYLON.Quaternion.Identity();
    }
    this.powerBar.material.setFloat(
      "highlightLen",
      0.15 * (1 - BABYLON.Scalar.Clamp(power, 0, 1)) + 0.04,
    );
    this.powerBar.setEnabled(true);
  }

  dispose() {
    for (const mesh of [
      ...this.guideMeshes,
      this.powerBar,
    ]) {
      mesh.material?.poolOverlayTexture?.dispose?.();
      mesh.material?.dispose?.();
      mesh.dispose();
    }
  }
}
