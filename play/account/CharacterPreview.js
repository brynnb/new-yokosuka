import { runtimeAssetUrl } from "../../src/RuntimeAssets.js";
import * as BABYLON from "@babylonjs/core";
import { MotnLoader } from "../../src/MotnLoader.js";
import {
  RYO_YK_RENDER_MATRIX_ROUTES,
} from "../../src/RuntimeMatrixRecording.js";
const previewMotionUrl = runtimeAssetUrl("play/assets/account/M_ZAKO.MOTN");
const scheduledActorMotionUrl = runtimeAssetUrl("play/assets/scheduled-actors/M_MOBJ.BIN");
import { CharacterRuntime } from "../characters/CharacterRuntime.js";
import {
  ScheduledActorMotionRuntime,
} from "../characters/ScheduledActorMotionRuntime.js";

const PREVIEW_MOTION_BANK = "preview";
const PREVIEW_MOTION_NAME = "YKI_AKI_KAMAE1_LP";
const PREVIEW_SELECTION = Object.freeze({
  bank: PREVIEW_MOTION_BANK,
  name: PREVIEW_MOTION_NAME,
  loop: true,
});
const WALK_MOTION_BY_CONTROLLER_FAMILY = new Map([
  [3, "DEB_WALK_LP"],
  [4, "GAK_WALK_LP_F"],
  [7, "JIJ_YNG_WALK_LP_F"],
  [8, "KOD_KOD_WALK_LP"],
  [10, "OTH_OTH_WALK_LP"],
  [12, "SYP_SYP_WALK_LP"],
  [15, "SIN_SIN_WALK_LP"],
  [16, "CAT_CAT_WALK_LP"],
  [18, "DOG_DOG_WALK_LP"],
  [19, "PNW_WALK_LP_F"],
]);
const WALK_MOTION_NAMES = [...new Set(WALK_MOTION_BY_CONTROLLER_FAMILY.values())];
const motionBankPromises = new Map();

async function fetchArrayBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.arrayBuffer();
}

function enabledMeshBounds(root) {
  let minimum = null;
  let maximum = null;
  for (const node of [root, ...root.getDescendants(false)]) {
    if (
      !node.isEnabled()
      || typeof node.getBoundingInfo !== "function"
      || typeof node.getTotalVertices !== "function"
      || node.getTotalVertices() <= 0
    ) {
      continue;
    }
    node.computeWorldMatrix(true);
    node.refreshBoundingInfo();
    const bounds = node.getBoundingInfo().boundingBox;
    minimum = minimum
      ? BABYLON.Vector3.Minimize(minimum, bounds.minimumWorld)
      : bounds.minimumWorld.clone();
    maximum = maximum
      ? BABYLON.Vector3.Maximize(maximum, bounds.maximumWorld)
      : bounds.maximumWorld.clone();
  }
  return minimum && maximum ? { minimum, maximum } : null;
}

function loadMotionBank(url, names) {
  const key = `${url}:${names.join(",")}`;
  if (!motionBankPromises.has(key)) {
    motionBankPromises.set(key, fetchArrayBuffer(url).then((buffer) => {
      const motion = MotnLoader.parse(buffer, { sequenceNames: names });
      return names.map((name) => {
        const sequence = motion.getSequence(name);
        if (!sequence?.valid || !sequence.valueData?.complete) {
          throw new Error(`Preview motion unavailable: ${name}`);
        }
        return sequence;
      });
    }));
  }
  return motionBankPromises.get(key);
}

export class CharacterPreview {
  constructor(host, { motion = "idle", yawDegrees = 0 } = {}) {
    this.host = host;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "character-preview-canvas";
    this.status = document.createElement("span");
    this.status.className = "character-preview-status";
    this.status.textContent = "Loading model…";
    host.append(this.canvas, this.status);

    this.engine = new BABYLON.Engine(this.canvas, true, {
      alpha: true,
      preserveDrawingBuffer: false,
      stencil: false,
    });
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
    this.camera = new BABYLON.UniversalCamera(
      "account_character_camera",
      new BABYLON.Vector3(0, 1, -3),
      this.scene,
    );
    this.camera.fov = 0.58;
    this.scene.activeCamera = this.camera;

    const ambient = new BABYLON.HemisphericLight(
      "account_character_ambient",
      new BABYLON.Vector3(0, 1, -0.4),
      this.scene,
    );
    ambient.intensity = 1.5;
    const key = new BABYLON.DirectionalLight(
      "account_character_key",
      new BABYLON.Vector3(-0.5, -0.8, 0.7),
      this.scene,
    );
    key.position = new BABYLON.Vector3(2, 4, -3);
    key.intensity = 1.2;

    this.runtime = new CharacterRuntime({
      scene: this.scene,
      renderMatrixByKey: new Map(RYO_YK_RENDER_MATRIX_ROUTES),
      fetchArrayBuffer,
    });
    this.motionRuntime = new ScheduledActorMotionRuntime({
      renderMatrixByKey: new Map(RYO_YK_RENDER_MATRIX_ROUTES),
      characterRuntime: this.runtime,
      fetchArrayBuffer,
      bankUrls: {},
    });
    this.motionMode = motion;
    this.yawRadians = BABYLON.Tools.ToRadians(yawDegrees);
    this.previewSelection = PREVIEW_SELECTION;
    const motionUrl = motion === "walk" ? scheduledActorMotionUrl : previewMotionUrl;
    const motionNames = motion === "walk"
      ? WALK_MOTION_NAMES
      : [PREVIEW_MOTION_NAME];
    this.motionPromise = loadMotionBank(motionUrl, motionNames).then((sequences) => {
      for (const sequence of sequences) {
        const key = `${PREVIEW_MOTION_BANK}:${sequence.name}`;
        this.motionRuntime.sequences.set(key, sequence);
        if (motion === "walk") this.motionRuntime.movementNames.add(key);
      }
    });
    this.root = null;
    this.previewModel = null;
    this.motionElapsedSeconds = 0;
    this.revision = 0;
    this.resizeObserver = new ResizeObserver(() => this.engine.resize());
    this.resizeObserver.observe(host);
    this.engine.runRenderLoop(() => {
      if (this.previewModel) {
        this.motionElapsedSeconds += this.engine.getDeltaTime() / 1000;
        this.#applyPreviewMotion();
      }
      this.scene.render();
    });
  }

  async show(character) {
    const revision = ++this.revision;
    this.status.hidden = false;
    this.status.textContent = "Loading model…";
    this.previewModel = null;
    this.root?.dispose(false, true);
    this.root = null;
    try {
      const [{ loader, root }] = await Promise.all([
        this.runtime.createModel(character),
        this.motionPromise,
      ]);
      if (revision !== this.revision) {
        root.dispose(false, true);
        return;
      }
      this.root = root;
      this.runtime.setReferenceBind(loader, root);
      this.previewModel = {
        loader,
        renderRoot: root,
        modelCode: character.modelCode,
        humanoidControlRigs: new Map(),
      };
      const walkName = WALK_MOTION_BY_CONTROLLER_FAMILY.get(
        character.controllerFamily,
      ) || WALK_MOTION_BY_CONTROLLER_FAMILY.get(10);
      this.previewSelection = this.motionMode === "walk"
        ? { bank: PREVIEW_MOTION_BANK, name: walkName, loop: true }
        : PREVIEW_SELECTION;
      this.motionElapsedSeconds = 0;
      this.#applyPreviewMotion();
      this.runtime.setOutdoorFootwear(root, character.id === "ryo");
      root.computeWorldMatrix(true);
      const bounds = enabledMeshBounds(root);
      if (bounds) {
        const center = bounds.minimum.add(bounds.maximum).scale(0.5);
        const size = bounds.maximum.subtract(bounds.minimum);
        const height = Math.max(size.y, 0.5);
        const distance = Math.max(
          height / (2 * Math.tan(this.camera.fov / 2)) * 1.08,
          size.x * 1.6,
          size.z * 2,
        );
        const cameraOffset = BABYLON.Vector3.TransformCoordinates(
          new BABYLON.Vector3(0, 0, -distance),
          BABYLON.Matrix.RotationY(this.yawRadians),
        );
        this.camera.position.copyFrom(center.add(cameraOffset));
        this.camera.setTarget(center);
        this.camera.minZ = Math.max(0.01, distance / 100);
        this.camera.maxZ = Math.max(100, distance * 10);
      }
      this.status.hidden = true;
    } catch (error) {
      if (revision !== this.revision) return;
      console.error("[Character preview]", error);
      this.status.textContent = "Preview unavailable";
    }
  }

  dispose() {
    this.revision += 1;
    this.resizeObserver.disconnect();
    this.previewModel = null;
    this.root?.dispose(false, true);
    this.scene.dispose();
    this.engine.dispose();
    this.host = null;
  }

  #applyPreviewMotion() {
    if (!this.motionRuntime.applyNamed(
      this.previewModel,
      this.previewSelection,
      this.motionElapsedSeconds,
    )) {
      return;
    }
    if (this.root?._mt5OutdoorFootwear) {
      this.runtime.applyCharacterRigWorldMatrices(
        this.previewModel.loader,
        this.root,
        this.previewModel.latestRetargetedRoutes,
      );
    }
  }
}
