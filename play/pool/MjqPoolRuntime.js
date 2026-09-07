import * as BABYLON from "@babylonjs/core";
import {
  ensureLuckyBreakMaterialShaders,
  luckyBreakMaterialShadersRegistered,
} from "./lucky-break-rendering/registerMaterialShaders.ts";
import HdrCubeTexture from "./lucky-break-rendering/ibl/HdrCubeTexture.ts";
import LightProbeManager from "./lucky-break-rendering/ibl/LightProbeManager.ts";
import DynamicIBLMaterial from "./lucky-break-rendering/materials/DynamicIBLMaterial.ts";
import {
  NineBallGameEvents,
  ShenmueCushionNormalMapUrl,
  ShenmueNineBallGame,
  SimulatorEvents,
} from "@brynnb/lucky-break-engine";
import {
  MJQ_POOL_TABLE_CENTER,
  MJQ_POOL_WORLD_ID,
} from "../config/pool.js";
import { syncPoolUi } from "../ui/react/poolStore.js";
import {
  createPoolOverlayColorMaterial,
  createCuePlacementCursor,
  createCuePlacementMarker,
  createLuckyBreakBallShadow,
  LuckyBreakPoolVisuals,
} from "./LuckyBreakPoolVisuals.js";
import {
  LuckyBreakCueController,
  luckyBreakStrokeTiming,
} from "./LuckyBreakCueController.js";

const BALL_MODEL = "S1_DJAZ_BOLK5DYG.MT5";
const CUE_MODEL = "S1_DJAZ_CYUW1H1G.MT5";
const AIM_SPEED = 1.1;
const POWER_SPEED = 0.55;
const AI_SHOT_DELAY = 0.9;
const TABLE_WIDTH = 3.1;
const TABLE_HEIGHT = 1.61;
const TABLE_SURFACE_Y = 0.75;
const HEAD_STRING_X = -0.75;
const CAMERA_TRANSITION_SECONDS = 1.08;
const LUCKY_BREAK_OUTER_TRACK_RADIUS = 1.72 * 0.85;
const LUCKY_BREAK_OUTER_TRACK_SCALE_X = 1.5;
const LUCKY_BREAK_AIM_DISTANCE = 0.41;
const LUCKY_BREAK_AIM_HEIGHT = 0.165;
const LUCKY_BREAK_CAMERA_FOV = 0.9;

export const LUCKY_BREAK_SHENMUE_BALL_MATERIAL = Object.freeze({
  textureLevel: 0.72,
  reflectivity: 0.012,
  roughness: 0,
  // The original Lucky Break environment was HDR (peak luminance 114) and
  // used 0.01. The authored MJQ PNG is ordinary LDR, so it needs a much
  // higher level while remaining restrained enough not to overpower the ball.
  radianceLevel: 0.1,
});

const LUCKY_BREAK_BALL_ASSET_ROOT = "/assets/pool/lucky-break";
const LUCKY_BREAK_REFLECTION_SIZE = 256;
export const MJQ_POOL_REFLECTION_URL =
  "/assets/pool/mjq-jazz-bar-pool-reflection.png?v=lbenv-348a6eeb";

function srgbChannelToLinear(channel) {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

class SrgbPanoramaCubeTexture extends BABYLON.EquiRectangularCubeTexture {
  constructor(url, scene, size) {
    // The custom Lucky Break shader samples linear cube data directly, so the
    // texture itself must not advertise gamma-space sampling.
    super(url, scene, size, false, false);
  }

  _getFloat32ArrayFromArrayBuffer(buffer) {
    const channels = super._getFloat32ArrayFromArrayBuffer(buffer);
    for (let index = 0; index < channels.length; index += 1) {
      channels[index] = srgbChannelToLinear(channels[index]);
    }
    return channels;
  }
}

function sourceFilenameInHierarchy(node) {
  let current = node;
  while (current) {
    const filename = sourceFilename(current);
    if (filename) return filename;
    current = current.parent;
  }
  return "";
}

export function isMjqRoomReflectionMesh(mesh) {
  return /^S[13]_DJAZ_MAP(?:01)?\.MT5$/i.test(
    sourceFilenameInHierarchy(mesh),
  );
}

export function luckyBreakBallProbeConfig(
  tableCenter = MJQ_POOL_TABLE_CENTER,
) {
  const centerX = tableCenter[0];
  const centerZ = tableCenter[2];
  return {
    id: "mjq-lucky-break-balls",
    lpx: [-1.6, -1.04, 0, 1.04, 1.6].map((x) => x + centerX),
    lpz: [-0.7, 0, 0.7].map((z) => z + centerZ),
    lpy: [0.90625, 1.65],
    aabbPosition: [centerX, 0.90625, centerZ],
    // LightProbeAABB expects absolute world-space bounds. Keep Lucky
    // Break's room-sized box centered on the native MJQ table; leaving
    // these at the standalone app's origin reverses/distorts parallax rays.
    aabbSizeMin: [centerX - 2.2, 0, centerZ - 1.3],
    aabbSizeMax: [centerX + 2.2, 1.74, centerZ + 1.3],
    aabbAO: [0.4, 1.1, 0.1],
  };
}

export function createLuckyBreakBallLighting(scene) {
  const manager = new LightProbeManager(
    scene,
    "",
    [
      `${LUCKY_BREAK_BALL_ASSET_ROOT}/irradiance-lower.hdr`,
      `${LUCKY_BREAK_BALL_ASSET_ROOT}/irradiance-upper.hdr`,
    ],
    luckyBreakBallProbeConfig(),
  );
  manager.radianceMap = new SrgbPanoramaCubeTexture(
    MJQ_POOL_REFLECTION_URL,
    scene,
    LUCKY_BREAK_REFLECTION_SIZE,
  );
  const aoTexture = new HdrCubeTexture(
    scene,
    "mjq-lucky-break-ball-ao",
    `${LUCKY_BREAK_BALL_ASSET_ROOT}/ball-ambient-occlusion.png`,
  );
  return { manager, aoTexture };
}

export function createMjqRoomReflectionProbe(scene) {
  const renderList = scene.meshes.filter(isMjqRoomReflectionMesh);
  if (renderList.length === 0) return null;

  const config = luckyBreakBallProbeConfig();
  const probe = new BABYLON.ReflectionProbe(
    "mjq_pool_room_reflection",
    LUCKY_BREAK_REFLECTION_SIZE,
    scene,
    true,
    true,
    true,
  );
  probe.position.copyFromFloats(...config.aabbPosition);
  probe.renderList = renderList;
  probe.refreshRate = BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
  probe.cubeTexture.renderParticles = false;
  probe.cubeTexture.renderSprites = false;
  probe.cubeTexture.render();
  return probe;
}

function linearChannelToSrgb(channel) {
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

// Reflection probes contain linear-light values because that is what the ball
// shader needs. A regular PNG viewer expects display-encoded sRGB instead.
export function encodeLinearPanoramaForDisplay(pixelData) {
  const output = new Uint8Array(pixelData.length);
  for (let index = 0; index < pixelData.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const linear = Math.max(0, Math.min(1, pixelData[index + channel] / 255));
      output[index + channel] = Math.round(
        255 * linearChannelToSrgb(linear),
      );
    }
    output[index + 3] = pixelData[index + 3];
  }
  return output;
}

const RACK_POSITIONS = Object.freeze([
  Object.freeze({ number: 0, x: -1.11, z: 0 }),
  Object.freeze({ number: 1, x: 0.756, z: 0 }),
  Object.freeze({ number: 2, x: 0.808481, z: -0.0303 }),
  Object.freeze({ number: 3, x: 0.808481, z: 0.0303 }),
  Object.freeze({ number: 4, x: 0.860962, z: -0.0606 }),
  Object.freeze({ number: 9, x: 0.860962, z: 0 }),
  Object.freeze({ number: 5, x: 0.860962, z: 0.0606 }),
  Object.freeze({ number: 6, x: 0.913443, z: -0.0303 }),
  Object.freeze({ number: 7, x: 0.913443, z: 0.0303 }),
  Object.freeze({ number: 8, x: 0.965924, z: 0 }),
]);

function sourceFilename(root) {
  return String(root?._filename || "").toUpperCase();
}

function rootCenter(root) {
  const vectors = root.getHierarchyBoundingVectors?.(true);
  if (vectors?.min && vectors?.max) {
    return vectors.min.add(vectors.max).scale(0.5);
  }
  return root.getAbsolutePosition?.() || root.position;
}

function squaredDistance2D(left, right) {
  const dx = left.x - right.x;
  const dz = left.z - right.z;
  return dx * dx + dz * dz;
}

export function matchPoolBallRoots(
  roots,
  tableCenter = MJQ_POOL_TABLE_CENTER,
) {
  const candidates = roots
    .filter((root) => sourceFilename(root) === BALL_MODEL)
    .flatMap((root) => root.getDescendants?.(false) || [])
    .filter((node) => {
      const children = node.getChildren?.() || [];
      const hasDirectGeometry = children.some(
        (child) => (child.getTotalVertices?.() || 0) > 0,
      );
      if (!hasDirectGeometry) return false;
      const vectors = node.getHierarchyBoundingVectors?.(true);
      if (!vectors) return false;
      const size = vectors.max.subtract(vectors.min);
      return (
        Math.abs(size.x - 0.06) < 0.015
        && Math.abs(size.y - 0.06) < 0.015
        && Math.abs(size.z - 0.06) < 0.015
      );
    })
    .map((root) => ({ root, center: rootCenter(root) }));
  const result = new Map();
  for (const rackPosition of RACK_POSITIONS) {
    const expected = {
      x: tableCenter[0] + rackPosition.x,
      z: tableCenter[2] + rackPosition.z,
    };
    let closest = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      if (result.has(candidate.root)) continue;
      const distance = squaredDistance2D(candidate.center, expected);
      if (distance < closestDistance) {
        closest = candidate;
        closestDistance = distance;
      }
    }
    if (closest) result.set(closest.root, rackPosition.number);
  }
  return result;
}

export function poolAimingCameraPose(ball, aimAngle, lowView = false) {
  const directionX = Math.cos(aimAngle);
  const directionZ = Math.sin(aimAngle);
  const distance = lowView ? 0.34 : LUCKY_BREAK_AIM_DISTANCE;
  const height = lowView ? 0.115 : LUCKY_BREAK_AIM_HEIGHT;
  return {
    position: new BABYLON.Vector3(
      ball.x - directionX * distance,
      TABLE_SURFACE_Y + height,
      ball.z - directionZ * distance,
    ),
    target: new BABYLON.Vector3(
      ball.x,
      TABLE_SURFACE_Y + 0.03,
      ball.z,
    ),
  };
}

export function poolHorizontalRotationInput(input, viewMode) {
  return viewMode === "aiming" ? -input : input;
}

export function poolWheelPowerDelta(deltaY, deltaMode = 0) {
  return 0.0005 * deltaY * (1 + 39 * deltaMode);
}

export function poolKeyboardEventTargetsTextInput(
  event,
  documentRoot = globalThis.document,
) {
  const selector = "input, textarea, select, [contenteditable='true']";
  return Boolean(
    event?.target?.closest?.(selector)
    || documentRoot?.activeElement?.matches?.(selector),
  );
}

export function poolWorldPosition(
  localPosition,
  tableCenter = MJQ_POOL_TABLE_CENTER,
) {
  return {
    x: tableCenter[0] + localPosition.x,
    y: localPosition.y,
    z: tableCenter[2] + localPosition.z,
  };
}

function preserveUnderPivot(root, pivot) {
  root.computeWorldMatrix?.(true);
  root.unfreezeWorldMatrix?.();
  for (const descendant of root.getDescendants?.(false) || []) {
    descendant.unfreezeWorldMatrix?.();
  }
  root.setParent(pivot);
}

function disposeLuckyBreakBallMaterials(materials) {
  for (const material of materials) {
    material.diffuseTexture?.dispose?.();
    material.dispose(true, false);
  }
  materials.clear();
}

export function applyLuckyBreakBallMaterialSettings(
  root,
  lighting = { manager: null, aoTexture: null },
) {
  const materials = new Set();
  for (const node of [root, ...(root.getDescendants?.(false) || [])]) {
    const source = node.material;
    if (!source) continue;
    if (source.metadata?.mjqLuckyBreakBallMaterial) {
      materials.add(source);
      continue;
    }
    const material = new DynamicIBLMaterial(
      `${source.name}_mjq_lucky_break_ball`,
      node.getScene?.() || root.getScene?.(),
      lighting.manager,
    );
    material.metadata = {
      ...material.metadata,
      mjqLuckyBreakBallMaterial: true,
    };
    const sourceTexture = source.diffuseTexture
      || source.emissiveTexture
      || source.albedoTexture;
    if (sourceTexture) {
      material.diffuseTexture = sourceTexture.clone?.() || sourceTexture;
      material.diffuseTexture.level =
        LUCKY_BREAK_SHENMUE_BALL_MATERIAL.textureLevel;
    }
    material.diffuseColor.copyFrom(
      source.diffuseColor || source.albedoColor || BABYLON.Color3.White(),
    );
    material.aoTexture = lighting.aoTexture;
    material.reflectivityColor = new BABYLON.Color3(
      LUCKY_BREAK_SHENMUE_BALL_MATERIAL.reflectivity,
      LUCKY_BREAK_SHENMUE_BALL_MATERIAL.reflectivity,
      LUCKY_BREAK_SHENMUE_BALL_MATERIAL.reflectivity,
    );
    material.roughness = LUCKY_BREAK_SHENMUE_BALL_MATERIAL.roughness;
    material.radianceLevel = LUCKY_BREAK_SHENMUE_BALL_MATERIAL.radianceLevel;
    material.irradianceLevel = 1;
    material.toneMappingMode = 2;
    material.useRadianceLodRoughness = true;
    material.setLodFallOff(1.5, 3, 5, 2);
    node.material = material;
    materials.add(material);
  }
  return materials;
}

function loadImageData(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Pool cushion map requires a 2D canvas context."));
        return;
      }
      context.drawImage(image, 0, 0);
      resolve(context.getImageData(0, 0, canvas.width, canvas.height));
    };
    image.onerror = () => reject(new Error("Pool cushion map failed to load."));
    image.src = url;
  });
}

export class MjqPoolRuntime {
  constructor({
    scene,
    camera,
    canvas,
    dom,
    getWorldId,
    setMovementLocked,
    getLeaveBinding = () => "KeyX",
    onActiveChange = () => {},
    sounds = null,
  }) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.dom = dom;
    this.getWorldId = getWorldId;
    this.setMovementLocked = setMovementLocked;
    this.getLeaveBinding = getLeaveBinding;
    this.onActiveChange = onActiveChange;
    this.sounds = sounds;
    this.active = false;
    this.available = false;
    this.game = null;
    this.ballPivots = new Map();
    this.ballShadows = new Map();
    this.ballMaterials = new Set();
    this.ballLighting = null;
    this.roomReflectionProbe = null;
    this.pendingBallRoots = null;
    this.cuePivot = null;
    this.cueRoots = [];
    this.cueController = new LuckyBreakCueController();
    this.aimAngle = 0;
    this.power = 0.5;
    this.sideSpin = 0;
    this.topSpin = 0;
    this.viewMode = "standing";
    this.lowView = false;
    this.placementSelected = false;
    this.placementValid = true;
    this.placementRegion = null;
    this.placementLine = null;
    this.placementMarker = null;
    this.placementCursor = null;
    this.poolVisuals = new LuckyBreakPoolVisuals(
      scene,
      MJQ_POOL_TABLE_CENTER,
    );
    this.cameraMinZBeforePool = null;
    this.cameraFovBeforePool = null;
    this.cameraTransition = null;
    this.cameraTarget = new BABYLON.Vector3();
    this.shotCameraPosition = new BABYLON.Vector3();
    this.aiShot = null;
    this.strokeState = null;
    this.foul = "";
    this.foulTimer = 0;
    this.pots = [];
    this.aiDelay = -1;
    this.physicsReady = false;
    this.normalMapImageData = null;
    this.normalMapPromise = null;
    this.keys = new Set();
    this.gamepadInput = { horizontal: 0, vertical: 0 };
    this.dragPointerId = null;
    this.dragX = 0;
    this.dragY = 0;
    this.dragMoved = false;

    this.onKeyDown = (event) => this.handleKeyDown(event);
    this.onKeyUp = (event) => this.handleKeyUp(event);
    this.onWheel = (event) => this.handleWheel(event);
    this.onPointerDown = (event) => this.handlePointerDown(event);
    this.onPointerMove = (event) => this.handlePointerMove(event);
    this.onPointerUp = (event) => this.handlePointerUp(event);
  }

  bind(roots) {
    const ballRoots = roots.filter(
      (root) => sourceFilename(root) === BALL_MODEL,
    );
    const cueRoots = roots.filter(
      (root) => sourceFilename(root) === CUE_MODEL,
    );
    if (ballRoots.length > 0) this.bindBalls(ballRoots);
    if (cueRoots.length > 0) this.bindCue(cueRoots);
    this.available = this.ballPivots.size === 10 && this.cueRoots.length > 0;
    if (!this.active) this.setCueVisible(false);
    return this.available;
  }

  captureRoomReflection() {
    if (this.roomReflectionProbe || this.getWorldId() !== MJQ_POOL_WORLD_ID) {
      return Boolean(this.roomReflectionProbe);
    }
    const probe = createMjqRoomReflectionProbe(this.scene);
    if (!probe) return false;

    this.roomReflectionProbe = probe;
    return true;
  }

  async downloadRoomReflectionPanorama() {
    if (this.getWorldId() !== MJQ_POOL_WORLD_ID) {
      return false;
    }
    if (!this.roomReflectionProbe && !this.captureRoomReflection()) return false;
    const [{ captureEquirectangularFromScene }, { DumpData }] =
      await Promise.all([
        import("@babylonjs/core/Misc/equirectangularCapture.js"),
        import("@babylonjs/core/Misc/dumpTools.js"),
      ]);
    const linearPixels = await captureEquirectangularFromScene(this.scene, {
      probe: this.roomReflectionProbe,
      size: LUCKY_BREAK_REFLECTION_SIZE,
      // The probe already has the exact static-room render list. Prevent the
      // export helper from appending balls, characters, particles, or UI.
      meshesFilter: () => false,
    });
    if (!linearPixels) return false;
    const displayPixels = encodeLinearPanoramaForDisplay(linearPixels);
    await DumpData(
      LUCKY_BREAK_REFLECTION_SIZE * 2,
      LUCKY_BREAK_REFLECTION_SIZE,
      displayPixels,
      undefined,
      "image/png",
      "MJQ-Jazz-Bar-Pool-Reflection.png",
    );
    return true;
  }

  createPlacementVisuals(openingBreak) {
    this.disposePlacementVisuals();
    const minimumX = -TABLE_WIDTH * 0.5;
    const maximumX = openingBreak ? HEAD_STRING_X : TABLE_WIDTH * 0.5;
    const width = maximumX - minimumX;
    this.placementRegion = BABYLON.MeshBuilder.CreateGround(
      "mjq_pool_placement_region",
      { width, height: TABLE_HEIGHT },
      this.scene,
    );
    this.placementRegion.position.set(
      MJQ_POOL_TABLE_CENTER[0] + minimumX + width * 0.5,
      TABLE_SURFACE_Y + 0.004,
      MJQ_POOL_TABLE_CENTER[2],
    );
    const material = createPoolOverlayColorMaterial(
      this.scene,
      "mjq_pool_placement_region_material",
      new BABYLON.Color3(0.08, 0.75, 0.42),
      0.18,
    );
    this.placementRegion.material = material;
    this.placementRegion.isPickable = false;
    this.placementRegion.renderingGroupId = 0;
    this.placementRegion.alphaIndex = 900;

    if (openingBreak) {
      this.placementLine = BABYLON.MeshBuilder.CreateGround(
        "mjq_pool_head_string",
        {
          width: 0.012,
          height: TABLE_HEIGHT,
        },
        this.scene,
      );
      this.placementLine.position.set(
        MJQ_POOL_TABLE_CENTER[0] + HEAD_STRING_X,
        TABLE_SURFACE_Y + 0.006,
        MJQ_POOL_TABLE_CENTER[2],
      );
      const lineMaterial = createPoolOverlayColorMaterial(
        this.scene,
        "mjq_pool_head_string_material",
        new BABYLON.Color3(0.3, 1, 0.68),
        0.9,
      );
      this.placementLine.material = lineMaterial;
      this.placementLine.isPickable = false;
      this.placementLine.renderingGroupId = 0;
      this.placementLine.alphaIndex = 901;
    }

    this.placementMarker = createCuePlacementMarker(this.scene);
    this.placementMarker.position.set(
      MJQ_POOL_TABLE_CENTER[0] - 1.11,
      0.801,
      MJQ_POOL_TABLE_CENTER[2],
    );
    this.placementCursor = createCuePlacementCursor(this.scene);
  }

  disposePlacementVisuals() {
    for (const mesh of [this.placementRegion, this.placementLine]) {
      mesh?.material?.dispose?.();
      mesh?.dispose?.();
    }
    this.placementMarker?.disposePoolMarker?.();
    this.placementCursor?.material?.poolOverlayTexture?.dispose?.();
    this.placementCursor?.material?.dispose?.();
    this.placementCursor?.dispose?.();
    this.placementRegion = null;
    this.placementLine = null;
    this.placementMarker = null;
    this.placementCursor = null;
  }

  bindBalls(roots) {
    if (!luckyBreakMaterialShadersRegistered) {
      const pending = this.pendingBallRoots = [...roots];
      void ensureLuckyBreakMaterialShaders().then(() => {
        if (this.pendingBallRoots !== pending) return;
        this.pendingBallRoots = null;
        this.bindBalls(pending);
        this.available = this.ballPivots.size === 10 && this.cueRoots.length > 0;
      }).catch(error => {
        if (this.pendingBallRoots === pending) console.error("Pool shaders failed", error);
      });
      return;
    }
    this.ballLighting ??= createLuckyBreakBallLighting(this.scene);
    for (const pivot of this.ballPivots.values()) pivot.dispose();
    for (const shadow of this.ballShadows.values()) {
      shadow.material?.dispose?.();
      shadow.dispose();
    }
    disposeLuckyBreakBallMaterials(this.ballMaterials);
    this.ballPivots.clear();
    this.ballShadows.clear();
    const matches = matchPoolBallRoots(roots);
    for (const [root, number] of matches) {
      const materials = applyLuckyBreakBallMaterialSettings(
        root,
        this.ballLighting,
      );
      for (const material of materials) this.ballMaterials.add(material);
      const center = rootCenter(root);
      const pivot = new BABYLON.TransformNode(
        `mjq_pool_ball_${number}`,
        this.scene,
      );
      pivot.position.copyFrom(center);
      preserveUnderPivot(root, pivot);
      this.ballPivots.set(number, pivot);
      this.ballShadows.set(number, createLuckyBreakBallShadow(this.scene));
    }
  }

  bindCue(roots) {
    if (this.poolVisuals.powerBar.parent === this.cuePivot) {
      this.poolVisuals.powerBar.parent = null;
    }
    this.cuePivot?.dispose();
    this.cueRoots = [...roots];
    const minimum = new BABYLON.Vector3(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );
    const maximum = new BABYLON.Vector3(
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    );
    for (const root of roots) {
      const vectors = root.getHierarchyBoundingVectors?.(true);
      if (!vectors) continue;
      minimum.minimizeInPlace(vectors.min);
      maximum.maximizeInPlace(vectors.max);
    }
    const center = minimum.add(maximum).scale(0.5);
    this.cuePivot = new BABYLON.TransformNode("mjq_pool_cue", this.scene);
    this.cuePivot.position.copyFrom(center);
    for (const root of roots) preserveUnderPivot(root, this.cuePivot);
  }

  start(mode = "challenge") {
    if (
      this.active
      || !this.available
      || this.getWorldId() !== MJQ_POOL_WORLD_ID
    ) {
      return false;
    }
    this.mode = mode === "practice" ? "practice" : "challenge";
    this.aiDifficulty = ["rookie", "steady", "ace"].includes(mode)
      ? mode
      : "steady";
    const players = [{ id: "ryo", name: "Ryo" }];
    if (this.mode === "challenge") {
      const opponents = {
        rookie: { id: "fuku-san", name: "Fuku-san" },
        steady: { id: "goro", name: "Goro" },
        ace: { id: "chai", name: "Chai" },
      };
      players.push({
        ...opponents[this.aiDifficulty],
        isAI: true,
      });
    }
    this.game = new ShenmueNineBallGame(players);
    const game = this.game;
    this.physicsReady = false;
    this.normalMapPromise ??= loadImageData(ShenmueCushionNormalMapUrl)
      .then(imageData => {
        this.normalMapImageData = imageData;
        return imageData;
      }).catch(error => {
        this.normalMapPromise = null;
        console.error("Pool cushion texture failed", error);
        return null;
      });
    void this.normalMapPromise.then((imageData) => {
      if (this.game !== game) return;
      if (imageData) game.applyCushionNormalMap(imageData);
      this.physicsReady = true;
      this.updateHud();
    });
    this.game.on(NineBallGameEvents.SHOT_ENDED, () => {
      const snapshot = this.game?.snapshot();
      this.foul = snapshot?.foul || "";
      this.foulTimer = this.foul ? 6 : 0;
      this.aiShot = null;
      if (snapshot?.winnerIndex !== null) {
        this.viewMode = "complete";
        this.setCueVisible(false);
        this.setTableCamera(snapshot);
      } else if (this.currentPlayer(snapshot)?.isAI) {
        this.viewMode = "standing";
        this.aiDelay = AI_SHOT_DELAY;
        this.setStandingCamera(snapshot);
      } else if (snapshot?.inHand) {
        this.power = 0.5;
        this.sideSpin = 0;
        this.topSpin = 0;
        this.enterPlacement(snapshot);
      } else {
        this.power = 0.5;
        this.sideSpin = 0;
        this.topSpin = 0;
        this.viewMode = "standing";
        this.setStandingCamera(snapshot);
      }
      this.updateHud();
    });
    this.game.on(NineBallGameEvents.SHOT_STARTED, () => {
      this.viewMode = "watching";
      this.setShotCamera(this.game?.snapshot());
      this.updateHud();
    });
    this.game.on(NineBallGameEvents.GAME_OVER, () => this.updateHud());
    this.game.on(NineBallGameEvents.BALL_POTTED, () => {
      this.sounds?.pocket();
    });
    this.game.on(NineBallGameEvents.BALL_POTTED, ({ number }) => {
      if (number > 0 && this.pots[this.game.snapshot().currentPlayerIndex]) {
        this.pots[this.game.snapshot().currentPlayerIndex].pots++;
      }
    });
    this.game.simulator.on(SimulatorEvents.BALL_IMPACT, (speed) => {
      this.sounds?.impact(speed);
    });
    this.active = true;
    this.enablePoolCameraClipping();
    this.aimAngle = 0;
    this.power = 0.5;
    this.sideSpin = 0;
    this.topSpin = 0;
    this.aiDelay = -1;
    this.aiShot = null;
    this.strokeState = null;
    this.foul = "";
    this.foulTimer = 0;
    this.pots = this.game.players.map((player) => ({
      name: player.name,
      pots: 0,
    }));
    if (this.dom.poolControlsHud) this.dom.poolControlsHud.hidden = false;
    document.body.classList.add("pool-active");
    this.setMovementLocked(true);
    this.setCueVisible(true);
    this.attachInput();
    this.syncPresentation();
    this.enterPlacement(this.game.snapshot(), true);
    this.updateHud();
    this.onActiveChange(true, this.mode);
    return true;
  }

  close() {
    if (!this.active) return false;
    this.active = false;
    this.detachInput();
    this.keys.clear();
    this.setGamepadDirection(0, 0);
    this.dragPointerId = null;
    this.disposePlacementVisuals();
    this.poolVisuals.hideGuides();
    this.poolVisuals.updatePower({ visible: false });
    this.cameraTransition = null;
    this.restoreWorldCameraClipping();
    if (this.dom.poolControlsHud) this.dom.poolControlsHud.hidden = true;
    document.body.classList.remove("pool-active");
    this.setCueVisible(false);
    this.setMovementLocked(false);
    this.game?.removeAllListeners();
    this.game?.simulator?.removeAllListeners();
    this.game = null;
    syncPoolUi({ active: false, chooserOpen: false });
    this.onActiveChange(false, this.mode);
    return true;
  }

  clearWorld() {
    this.pendingBallRoots = null;
    this.close();
    this.restoreWorldCameraClipping();
    this.available = false;
    for (const pivot of this.ballPivots.values()) pivot.dispose();
    for (const shadow of this.ballShadows.values()) {
      shadow.material?.dispose?.();
      shadow.dispose();
    }
    disposeLuckyBreakBallMaterials(this.ballMaterials);
    if (this.poolVisuals.powerBar.parent === this.cuePivot) {
      this.poolVisuals.powerBar.parent = null;
    }
    this.cuePivot?.dispose();
    this.ballPivots.clear();
    this.ballShadows.clear();
    this.cuePivot = null;
    this.cueRoots = [];
  }

  dispose() {
    this.clearWorld();
    this.poolVisuals.dispose();
    this.roomReflectionProbe?.dispose();
    this.roomReflectionProbe = null;
    this.ballLighting?.manager.dispose();
    this.ballLighting?.aoTexture.dispose();
  }

  enablePoolCameraClipping() {
    if (this.cameraMinZBeforePool === null) {
      this.cameraMinZBeforePool = this.camera.minZ;
    }
    if (this.cameraFovBeforePool === null) {
      this.cameraFovBeforePool = this.camera.fov;
    }
    this.camera.minZ = 0.01;
    this.camera.fov = LUCKY_BREAK_CAMERA_FOV;
  }

  restoreWorldCameraClipping() {
    if (this.cameraMinZBeforePool !== null) {
      this.camera.minZ = this.cameraMinZBeforePool;
      this.cameraMinZBeforePool = null;
    }
    if (this.cameraFovBeforePool !== null) {
      this.camera.fov = this.cameraFovBeforePool;
      this.cameraFovBeforePool = null;
    }
  }

  setPower(value) {
    this.power = BABYLON.Scalar.Clamp(Number(value), 0.05, 1);
    this.updateHud();
    this.updateCue();
  }

  setSideSpin(value) {
    this.sideSpin = BABYLON.Scalar.Clamp(Number(value), -1, 1);
    this.updateHud();
    this.updateCue();
  }

  setTopSpin(value) {
    this.topSpin = BABYLON.Scalar.Clamp(Number(value), -1, 1);
    this.updateHud();
    this.updateCue();
  }

  setGamepadDirection(horizontal, vertical) {
    this.gamepadInput.horizontal = BABYLON.Scalar.Clamp(
      Number(horizontal) || 0,
      -1,
      1,
    );
    this.gamepadInput.vertical = BABYLON.Scalar.Clamp(
      Number(vertical) || 0,
      -1,
      1,
    );
  }

  handleGamepadAction(action) {
    if (!this.active) return false;
    if (action === "primary") return this.primaryAction();
    if (action === "resetSpin") {
      this.sideSpin = 0;
      this.topSpin = 0;
      this.updateHud();
      this.updateCue();
      return true;
    }
    if (action === "lowView") {
      this.lowView = !this.lowView;
      if (this.viewMode === "aiming") this.setAimingCamera();
      return true;
    }
    if (action === "moveCueBall") {
      if (!this.game?.snapshot().inHand) return false;
      this.enterPlacement();
      return true;
    }
    if (action === "leave") return this.close();
    return false;
  }

  primaryAction() {
    if (this.viewMode === "placing") return this.confirmPlacement();
    if (this.viewMode === "standing") {
      this.enterAiming();
      return true;
    }
    return this.shoot();
  }

  restart() {
    const mode = this.mode === "practice" ? "practice" : this.aiDifficulty;
    if (!this.close()) return false;
    return this.start(mode);
  }

  enterPlacement(snapshot = this.game?.snapshot(), immediate = false) {
    if (!snapshot || !snapshot.inHand || this.currentPlayer(snapshot)?.isAI) {
      return false;
    }
    this.viewMode = "placing";
    this.placementSelected = true;
    this.placementValid = true;
    this.createPlacementVisuals(snapshot.openingBreak);
    const cueBall = snapshot.balls.find((ball) => ball.number === 0);
    if (cueBall && this.placementMarker) {
      const world = poolWorldPosition(cueBall.position);
      this.placementMarker.position.set(
        world.x,
        TABLE_SURFACE_Y + 0.006,
        world.z,
      );
    }
    this.setPlacementCamera(snapshot, immediate);
    this.updateHud(snapshot);
    return true;
  }

  confirmPlacement() {
    if (
      this.viewMode !== "placing"
      || !this.placementSelected
      || !this.placementValid
    ) {
      return false;
    }
    this.disposePlacementVisuals();
    this.viewMode = "standing";
    this.setStandingCamera(this.game?.snapshot());
    this.updateHud();
    return true;
  }

  enterAiming(snapshot = this.game?.snapshot()) {
    if (
      !snapshot
      || snapshot.phase !== "ready"
      || snapshot.winnerIndex !== null
      || this.currentPlayer(snapshot)?.isAI
    ) {
      return false;
    }
    this.viewMode = "aiming";
    this.setAimingCamera(snapshot);
    this.updateHud(snapshot);
    return true;
  }

  beginCameraTransition(position, target, immediate = false) {
    if (immediate) {
      this.camera.position.copyFrom(position);
      this.camera.setTarget(target);
      this.cameraTarget.copyFrom(target);
      this.cameraTransition = null;
      return;
    }
    this.cameraTransition = {
      elapsed: 0,
      duration: CAMERA_TRANSITION_SECONDS,
      fromPosition: this.camera.position.clone(),
      fromTarget: this.cameraTarget.lengthSquared() > 0
        ? this.cameraTarget.clone()
        : target.clone(),
      toPosition: position.clone(),
      toTarget: target.clone(),
    };
  }

  advanceCameraTransition(deltaSeconds) {
    const transition = this.cameraTransition;
    if (!transition) return false;
    transition.elapsed += deltaSeconds;
    const raw = Math.min(1, transition.elapsed / transition.duration);
    // Lucky Break uses its Power2 ease-in-out curve for this transition.
    const inverse = 1 - raw;
    const ratio = raw < 0.5
      ? 4 * raw * raw * raw
      : 1 - 4 * inverse * inverse * inverse;
    BABYLON.Vector3.LerpToRef(
      transition.fromPosition,
      transition.toPosition,
      ratio,
      this.camera.position,
    );
    BABYLON.Vector3.LerpToRef(
      transition.fromTarget,
      transition.toTarget,
      ratio,
      this.cameraTarget,
    );
    this.camera.setTarget(this.cameraTarget);
    if (raw >= 1) this.cameraTransition = null;
    return true;
  }

  setPlacementCamera(snapshot, immediate = false) {
    const cueBall = snapshot?.balls.find((ball) => ball.number === 0);
    const ball = cueBall
      ? poolWorldPosition(cueBall.position)
      : {
        x: MJQ_POOL_TABLE_CENTER[0] - 1.11,
        y: 0.78,
        z: MJQ_POOL_TABLE_CENTER[2],
      };
    this.beginCameraTransition(
      new BABYLON.Vector3(
        MJQ_POOL_TABLE_CENTER[0] - 1.45,
        2.55,
        MJQ_POOL_TABLE_CENTER[2] + 1.78,
      ),
      new BABYLON.Vector3(ball.x + 0.3, 0.76, ball.z),
      immediate,
    );
  }

  setStandingCamera(snapshot = this.game?.snapshot(), immediate = false) {
    const cueBall = snapshot?.balls.find((ball) => ball.number === 0);
    const ball = cueBall
      ? poolWorldPosition(cueBall.position)
      : {
        x: MJQ_POOL_TABLE_CENTER[0],
        y: 0.78,
        z: MJQ_POOL_TABLE_CENTER[2],
      };
    this.beginCameraTransition(
      new BABYLON.Vector3(
        MJQ_POOL_TABLE_CENTER[0]
          - Math.cos(this.aimAngle)
          * LUCKY_BREAK_OUTER_TRACK_RADIUS
          * LUCKY_BREAK_OUTER_TRACK_SCALE_X,
        1.72,
        MJQ_POOL_TABLE_CENTER[2]
          - Math.sin(this.aimAngle) * LUCKY_BREAK_OUTER_TRACK_RADIUS,
      ),
      new BABYLON.Vector3(ball.x + 0.35, 0.76, ball.z),
      immediate,
    );
  }

  setAimingCamera(snapshot = this.game?.snapshot(), immediate = false) {
    const cueBall = snapshot?.balls.find((ball) => ball.number === 0);
    if (!cueBall) return;
    const ball = poolWorldPosition(cueBall.position);
    const pose = poolAimingCameraPose(ball, this.aimAngle, this.lowView);
    this.beginCameraTransition(
      pose.position,
      pose.target,
      immediate,
    );
  }

  setShotCamera(snapshot = this.game?.snapshot()) {
    const cueBall = snapshot?.balls.find((ball) => ball.number === 0);
    if (!cueBall) return;
    const ball = poolWorldPosition(cueBall.position);
    const directionX = Math.cos(this.aimAngle);
    const directionZ = Math.sin(this.aimAngle);
    this.shotCameraPosition.set(
      ball.x - directionX * 1.12 - directionZ * 0.2,
      1.13,
      ball.z - directionZ * 1.12 + directionX * 0.2,
    );
    this.beginCameraTransition(
      this.shotCameraPosition,
      new BABYLON.Vector3(ball.x, ball.y, ball.z),
    );
  }

  setTableCamera(snapshot = this.game?.snapshot()) {
    this.beginCameraTransition(
      new BABYLON.Vector3(
        MJQ_POOL_TABLE_CENTER[0] - 2.25,
        2.5,
        MJQ_POOL_TABLE_CENTER[2] + 2.05,
      ),
      new BABYLON.Vector3(
        MJQ_POOL_TABLE_CENTER[0],
        0.75,
        MJQ_POOL_TABLE_CENTER[2],
      ),
    );
  }

  update(deltaSeconds) {
    if (!this.active || !this.game) return;
    const turn = this.currentPlayer();
    if (this.strokeState) {
      this.strokeState.elapsed += deltaSeconds;
      if (
        !this.strokeState.launched
        && this.strokeState.elapsed >= this.strokeState.contactTime
      ) {
        this.strokeState.launched = true;
        this.sounds?.impact(this.strokeState.shot.power * 3);
        this.game.shoot(this.strokeState.shot);
        this.strokeState = null;
      }
    }
    if (
      this.game.snapshot().phase === "ready"
      && !turn?.isAI
      && ["standing", "aiming", "placing"].includes(this.viewMode)
    ) {
      const aimInput = BABYLON.Scalar.Clamp(
        (this.keys.has("ArrowRight") || this.keys.has("KeyD") ? 1 : 0)
        - (this.keys.has("ArrowLeft") || this.keys.has("KeyA") ? 1 : 0)
        + this.gamepadInput.horizontal,
        -1,
        1,
      );
      const powerInput = this.viewMode === "aiming"
        ? BABYLON.Scalar.Clamp(
          (this.keys.has("ArrowUp") || this.keys.has("KeyW") ? 1 : 0)
          - (this.keys.has("ArrowDown") || this.keys.has("KeyS") ? 1 : 0)
          + this.gamepadInput.vertical,
          -1,
          1,
        )
        : 0;
      const placementPitchInput = this.viewMode === "placing"
        ? BABYLON.Scalar.Clamp(
          (this.keys.has("ArrowUp") || this.keys.has("KeyW") ? 1 : 0)
          - (this.keys.has("ArrowDown") || this.keys.has("KeyS") ? 1 : 0)
          + this.gamepadInput.vertical,
          -1,
          1,
        )
        : 0;
      if (aimInput !== 0) {
        if (this.viewMode === "placing") {
          this.orbitPlacementCamera(aimInput * AIM_SPEED * deltaSeconds);
        } else {
          this.aimAngle += poolHorizontalRotationInput(aimInput, this.viewMode)
            * AIM_SPEED
            * deltaSeconds;
        }
        if (this.viewMode === "aiming") {
          this.setAimingCamera(this.game.snapshot(), true);
        } else if (this.viewMode === "standing") {
          this.setStandingCamera(this.game.snapshot(), true);
        }
      }
      if (placementPitchInput !== 0) {
        this.orbitPlacementCamera(
          0,
          placementPitchInput * AIM_SPEED * deltaSeconds,
        );
      }
      if (powerInput !== 0) {
        this.power = BABYLON.Scalar.Clamp(
          this.power + powerInput * POWER_SPEED * deltaSeconds,
          0.05,
          1,
        );
      }
    }
    if (this.game.snapshot().phase === "simulating") {
      const orbitInput = BABYLON.Scalar.Clamp(
        (this.keys.has("ArrowRight") || this.keys.has("KeyD") ? 1 : 0)
        - (this.keys.has("ArrowLeft") || this.keys.has("KeyA") ? 1 : 0)
        + this.gamepadInput.horizontal,
        -1,
        1,
      );
      if (orbitInput !== 0) {
        this.orbitWatchingCamera(orbitInput * AIM_SPEED * deltaSeconds);
      }
    }

    this.game.step(deltaSeconds);
    const snapshot = this.game.snapshot();
    if (this.foulTimer > 0) {
      this.foulTimer = Math.max(0, this.foulTimer - deltaSeconds);
      if (this.foulTimer === 0) this.foul = "";
    }
    if (
      snapshot.phase === "ready"
      && this.currentPlayer()?.isAI
      && this.aiDelay >= 0
    ) {
      this.aiDelay -= deltaSeconds;
      if (!this.aiShot && this.aiDelay < AI_SHOT_DELAY * 0.55) {
        this.aiShot = this.game.planAIShot(this.aiDifficulty);
        if (this.aiShot) {
          this.aimAngle = Math.atan2(
            this.aiShot.directionZ,
            this.aiShot.directionX,
          );
          this.power = this.aiShot.power;
          this.sideSpin = this.aiShot.sideSpin || 0;
          this.topSpin = this.aiShot.topSpin || 0;
          this.viewMode = "aiming";
          this.setAimingCamera(snapshot);
        }
      }
      if (this.aiDelay < 0) {
        if (this.aiShot) this.queueShot(this.aiShot);
        else this.aiDelay = 0.25;
      }
    }
    this.syncPresentation(snapshot);
    this.updateCue(snapshot);
    if (this.placementMarker) {
      this.placementMarker.rotation.y += 0.022;
    }
    if (this.viewMode === "aiming" && !turn?.isAI) {
      this.poolVisuals.updateAiming({
        game: this.game,
        snapshot,
        aimAngle: this.aimAngle,
        power: this.power,
        sideSpin: this.sideSpin,
        topSpin: this.topSpin,
      });
    } else {
      this.poolVisuals.hideGuides();
    }
    this.poolVisuals.updatePower({
      cuePivot: this.cuePivot,
      power: this.power,
      visible: this.viewMode === "aiming" && !turn?.isAI,
    });
    this.updateCamera(snapshot, deltaSeconds);
    this.updateHud(snapshot);
  }

  shoot() {
    if (
      !this.active
      || !this.game
      || !this.physicsReady
      || this.currentPlayer()?.isAI
      || this.viewMode !== "aiming"
      || this.strokeState
    ) {
      return false;
    }
    const shot = {
      directionX: Math.cos(this.aimAngle),
      directionZ: Math.sin(this.aimAngle),
      power: this.power,
      sideSpin: this.sideSpin,
      topSpin: this.topSpin,
    };
    return this.queueShot(shot);
  }

  queueShot(shot) {
    if (this.strokeState || this.game?.snapshot().phase !== "ready") {
      return false;
    }
    const timing = luckyBreakStrokeTiming(shot.power);
    this.viewMode = "stroking";
    this.strokeState = {
      elapsed: 0,
      contactTime: timing.contactTime,
      timing,
      launched: false,
      shot,
    };
    this.updateHud();
    return true;
  }

  currentPlayer(snapshot = this.game?.snapshot()) {
    return snapshot
      ? this.game?.players[snapshot.currentPlayerIndex]
      : null;
  }

  syncPresentation(snapshot = this.game?.snapshot()) {
    if (!snapshot) return;
    for (const ball of snapshot.balls) {
      const pivot = this.ballPivots.get(ball.number);
      const shadow = this.ballShadows.get(ball.number);
      shadow?.setEnabled(ball.active);
      if (!pivot) continue;
      pivot.setEnabled(ball.active);
      if (!ball.active) continue;
      const world = poolWorldPosition(ball.position);
      if (shadow) {
        shadow.position.x = world.x;
        shadow.position.z = world.z;
      }
      pivot.position.set(world.x, world.y, world.z);
      pivot.rotationQuaternion ||= BABYLON.Quaternion.Identity();
      pivot.rotationQuaternion.set(
        ball.orientation.x,
        ball.orientation.y,
        ball.orientation.z,
        ball.orientation.w,
      );
    }
  }

  updateCue(snapshot = this.game?.snapshot()) {
    if (!snapshot || !this.cuePivot) return;
    const cueBall = snapshot.balls.find((ball) => ball.number === 0);
    const visible = (
      this.active
      && snapshot.phase === "ready"
      && cueBall?.active
      && ["aiming", "stroking"].includes(this.viewMode)
    );
    this.setCueVisible(visible);
    if (!visible) return;
    const worldCueBall = {
      ...cueBall,
      position: poolWorldPosition(cueBall.position),
    };
    const cue = this.cueController.update({
      cueBall: worldCueBall,
      aimAngle: this.aimAngle,
      sideSpin: this.sideSpin,
      topSpin: this.topSpin,
      strokeState: this.strokeState,
    });
    this.cuePivot.position.copyFrom(cue.centerPosition);
    this.cuePivot.rotationQuaternion ||= BABYLON.Quaternion.Identity();
    this.cuePivot.rotationQuaternion.copyFrom(cue.rotation);
  }

  updateCamera(snapshot = this.game?.snapshot(), deltaSeconds = 0) {
    if (!this.active || !snapshot) return;
    if (this.advanceCameraTransition(deltaSeconds)) return;
    const cueBall = snapshot.balls.find((ball) => ball.number === 0);
    if (!cueBall) return;
    const ball = poolWorldPosition(cueBall.position);
    if (this.viewMode === "watching") {
      const target = new BABYLON.Vector3(ball.x, ball.y, ball.z);
      BABYLON.Vector3.LerpToRef(
        this.cameraTarget,
        target,
        Math.min(1, deltaSeconds * 4.5),
        this.cameraTarget,
      );
      this.camera.setTarget(this.cameraTarget);
    }
  }

  orbitWatchingCamera(angle) {
    const offset = this.camera.position.subtract(this.cameraTarget);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    this.camera.position.set(
      this.cameraTarget.x + offset.x * cosine - offset.z * sine,
      this.camera.position.y,
      this.cameraTarget.z + offset.x * sine + offset.z * cosine,
    );
    this.shotCameraPosition.copyFrom(this.camera.position);
    this.camera.setTarget(this.cameraTarget);
  }

  orbitPlacementCamera(horizontal, vertical = 0) {
    const offset = this.camera.position.subtract(this.cameraTarget);
    const radius = Math.max(0.001, offset.length());
    const yaw = Math.atan2(offset.z, offset.x) + horizontal;
    const pitch = BABYLON.Scalar.Clamp(
      Math.asin(BABYLON.Scalar.Clamp(offset.y / radius, -1, 1)) + vertical,
      0.12,
      1.35,
    );
    const horizontalRadius = radius * Math.cos(pitch);
    this.camera.position.set(
      this.cameraTarget.x + Math.cos(yaw) * horizontalRadius,
      this.cameraTarget.y + Math.sin(pitch) * radius,
      this.cameraTarget.z + Math.sin(yaw) * horizontalRadius,
    );
    this.camera.setTarget(this.cameraTarget);
    this.cameraTransition = null;
  }

  updateHud(snapshot = this.game?.snapshot()) {
    if (!snapshot) return;
    const player = this.currentPlayer(snapshot);
    const canShoot = !(
      snapshot.phase !== "ready"
      || !this.physicsReady
      || Boolean(player?.isAI)
      || snapshot.winnerIndex !== null
      || this.viewMode !== "aiming"
    );
    syncPoolUi({
      active: this.active,
      mode: this.mode,
      power: this.power,
      sideSpin: this.sideSpin,
      topSpin: this.topSpin,
      canShoot,
      viewMode: this.viewMode,
      placing: this.viewMode === "placing",
      placementValid: this.placementSelected && this.placementValid,
      foul: this.foul,
      winner: snapshot.winnerIndex === null
        ? ""
        : this.game.players[snapshot.winnerIndex].name,
      currentPlayerName: snapshot.winnerIndex === null
        ? player?.name || ""
        : "",
      targetBallNumber: snapshot.winnerIndex === null
        ? snapshot.targetBallNumber
        : null,
      players: this.pots,
    });
  }

  setCueVisible(visible) {
    this.cuePivot?.setEnabled(Boolean(visible));
  }

  attachInput() {
    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("keyup", this.onKeyUp, true);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
  }

  detachInput() {
    window.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("keyup", this.onKeyUp, true);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
  }

  handleKeyDown(event) {
    if (!this.active) return;
    if (poolKeyboardEventTargetsTextInput(event)) {
      this.keys.clear();
      return;
    }
    if (event.code === this.getLeaveBinding()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
      return;
    }
    if (
      event.code === "Space"
      || event.code === "KeyC"
      || event.code === "KeyM"
      || event.code === "KeyR"
      || event.code.startsWith("Arrow")
      || ["KeyA", "KeyD", "KeyS", "KeyW"].includes(event.code)
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat && ["Space", "KeyC", "KeyM", "KeyR"].includes(event.code)) {
        return;
      }
      if (event.code === "Space") {
        this.primaryAction();
      } else if (event.code === "KeyM") {
        if (this.game?.snapshot().inHand) this.enterPlacement();
      } else if (event.code === "KeyR") {
        this.handleGamepadAction("lowView");
      } else if (event.code === "KeyC") {
        this.handleGamepadAction("resetSpin");
      } else {
        this.keys.add(event.code);
      }
    }
  }

  handleKeyUp(event) {
    this.keys.delete(event.code);
  }

  handleWheel(event) {
    if (!this.active || this.viewMode !== "aiming") return;
    event.preventDefault();
    this.power = BABYLON.Scalar.Clamp(
      this.power + poolWheelPowerDelta(event.deltaY, event.deltaMode),
      0.05,
      1,
    );
    this.updateHud();
    this.updateCue();
  }

  handlePointerDown(event) {
    if (!this.active || event.button !== 0) return;
    if (this.viewMode === "placing") event.preventDefault();
    this.dragPointerId = event.pointerId;
    this.dragX = event.clientX;
    this.dragY = event.clientY;
    this.dragMoved = false;
    this.canvas.setPointerCapture?.(event.pointerId);
  }

  handlePointerMove(event) {
    if (!this.active) return;
    if (this.viewMode === "placing") {
      if (event.pointerId === this.dragPointerId) {
        const deltaX = event.clientX - this.dragX;
        const deltaY = event.clientY - this.dragY;
        this.dragX = event.clientX;
        this.dragY = event.clientY;
        this.dragMoved ||= Math.abs(deltaX) + Math.abs(deltaY) > 3;
        if (this.dragMoved) {
          this.orbitPlacementCamera(deltaX * 0.0045, deltaY * 0.0045);
        }
      }
      this.updatePlacementFromPointer(event, false);
      return;
    }
    if (event.pointerId !== this.dragPointerId) return;
    const deltaX = event.clientX - this.dragX;
    const deltaY = event.clientY - this.dragY;
    this.dragX = event.clientX;
    this.dragY = event.clientY;
    this.dragMoved ||= Math.abs(deltaX) + Math.abs(deltaY) > 1;
    if (event.altKey && this.viewMode === "aiming") {
      this.sideSpin = BABYLON.Scalar.Clamp(
        this.sideSpin - deltaX * 0.008,
        -1,
        1,
      );
      this.topSpin = BABYLON.Scalar.Clamp(
        this.topSpin - deltaY * 0.008,
        -1,
        1,
      );
      this.updateHud();
    } else {
      if (this.viewMode === "watching") {
        this.orbitWatchingCamera(deltaX * 0.0045);
      } else {
        this.aimAngle += deltaX * (
          this.viewMode === "aiming" ? 0.0045 : 0.006
        );
      }
      if (this.viewMode === "aiming") {
        this.setAimingCamera(undefined, true);
      } else if (this.viewMode === "standing") {
        this.setStandingCamera(undefined, true);
      }
    }
  }

  handlePointerUp(event) {
    if (event.pointerId !== this.dragPointerId) return;
    const placeCueBall = this.viewMode === "placing" && !this.dragMoved;
    this.canvas.releasePointerCapture?.(event.pointerId);
    this.dragPointerId = null;
    if (placeCueBall) this.updatePlacementFromPointer(event, true);
  }

  pointerTablePosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    const ray = this.scene.createPickingRay(
      event.clientX - rect.left,
      event.clientY - rect.top,
      BABYLON.Matrix.Identity(),
      this.camera,
      false,
    );
    if (Math.abs(ray.direction.y) < 0.00001) return null;
    const distance = (TABLE_SURFACE_Y - ray.origin.y) / ray.direction.y;
    if (distance <= 0) return null;
    const world = ray.origin.add(ray.direction.scale(distance));
    return {
      localX: world.x - MJQ_POOL_TABLE_CENTER[0],
      localZ: world.z - MJQ_POOL_TABLE_CENTER[2],
      world,
    };
  }

  validPlacement(position, snapshot = this.game?.snapshot()) {
    if (!position || !snapshot || !this.game) return false;
    if (
      snapshot.openingBreak
      && position.localX > HEAD_STRING_X + 0.0001
    ) {
      return false;
    }
    if (!this.game.pointProjectionOnTable(
      position.localX,
      0.78,
      position.localZ,
    )) {
      return false;
    }
    return !snapshot.balls.some((ball) => (
      ball.active
      && ball.number !== 0
      && Math.hypot(
        ball.position.x - position.localX,
        ball.position.z - position.localZ,
      ) < 0.061
    ));
  }

  updatePlacementFromPointer(event, commit) {
    if (!this.game || this.viewMode !== "placing") return false;
    const position = this.pointerTablePosition(event);
    const valid = this.validPlacement(position);
    if (this.placementCursor && position) {
      this.placementCursor.position.set(
        position.world.x,
        TABLE_SURFACE_Y + 0.008,
        position.world.z,
      );
      this.placementCursor.setValid?.(valid);
      this.placementCursor.setEnabled(true);
    } else {
      this.placementCursor?.setEnabled(false);
    }
    if (commit && valid) {
      if (this.game.placeCueBall(position.localX, position.localZ)) {
        this.placementSelected = true;
        this.placementValid = true;
        this.syncPresentation();
        this.placementMarker?.position.set(
          position.world.x,
          TABLE_SURFACE_Y + 0.006,
          position.world.z,
        );
      } else {
        this.placementValid = this.placementSelected;
      }
    }
    this.updateHud();
    return valid;
  }
}
