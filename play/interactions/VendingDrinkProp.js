import { runtimeAssetGroup } from "../../src/RuntimeAssets.js";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import {
  configureMt5TexturePack,
} from "../assets/configureMt5TexturePack.js";

const MODEL_FILE_BY_RESOURCE = Object.freeze({
  COKE: "COKS5SHG.CHRM",
  FATO: "FAOS5SHG.CHRM",
  FATG: "FAGS5SHG.CHRM",
  SPRT: "SPRS5SHG.CHRM",
  CAFE: "GEOS5SHG.CHRM",
  ATRK: "ATRS500G.CHRM",
});

const bundledModels = runtimeAssetGroup(["play/assets/vending/*.CHRM","!play/assets/vending/JIHS5KNG.CHRM"]);
const bundledTextures = runtimeAssetGroup("play/assets/vending/*_textures.bin");

const RIGHT_HAND_RENDER_KEY = -0x41;
const SOURCE_REFLECTION = BABYLON.Matrix.Scaling(-1, 1, 1);

// Original CAN1 -> AKIR control 18 FIXO arguments, D000 MAPINFO.BIN:
// call 0x89392, translation literals 0x893ac..0x893b4 and angles
// 0x893b8..0x893c0. These describe the can's grip, not the wrist origin.
export const VENDING_CAN_GRIP = Object.freeze({
  translation: Object.freeze([0.10809999704360962, 0.019200000911951065, -0.013399999588727951]),
  rotationRaw: Object.freeze([-4125, 20600, -9448]),
});
const [gripX, gripY, gripZ] = VENDING_CAN_GRIP.translation;
const [angleX, angleY, angleZ] = VENDING_CAN_GRIP.rotationRaw.map(value => value * Math.PI / 32768);
const GRIP_MATRIX = BABYLON.Matrix.FromArray(Mt5Loader.sourceTransformMatrix({
  pos: {x: gripX, y: gripY, z: gripZ},
  rot: {x: angleX, y: angleY, z: angleZ}, scl: {x: 1, y: 1, z: 1},
}));
// Browser choreography, checked against the M_DJUC discard gesture. These
// are source MOTN frames, NOT wall-clock time or total emote time. The hot
// and cold clips share this gesture's timing, although their roots differ.
export const VENDING_CAN_RELEASE_FRAME = 660;
export const VENDING_CAN_FLIGHT_FRAMES = 12;

function assetUrl(collection, filename) {
  return collection[`play/assets/vending/${filename}`] || null;
}

export class VendingDrinkProp {
  constructor({
    scene,
    state,
    modelOffset,
    fetchArrayBuffer,
    getCharacterRoot,
    getCharacterPoseAt,
  }) {
    this.scene = scene;
    this.state = state;
    this.modelOffset = modelOffset;
    this.fetchArrayBuffer = fetchArrayBuffer;
    this.getCharacterRoot = getCharacterRoot;
    this.getCharacterPoseAt = getCharacterPoseAt;
    this.roots = new Map();
    this.activeRoot = null;
    this.generation = 0;
  }

  async prepare(resourceCode, {signal, bin} = {}) {
    this.hide();
    this.bin = bin;
    const generation = this.generation;
    const checkActive = () => {
      signal?.throwIfAborted();
      if (generation !== this.generation) throw new DOMException("Vending prop was cleared", "AbortError");
    };
    checkActive();
    let root = this.roots.get(resourceCode);
    if (root?.isDisposed()) {
      this.roots.delete(resourceCode);
      root = null;
    }
    if (!root) {
      const modelFile = MODEL_FILE_BY_RESOURCE[resourceCode];
      const modelUrl = assetUrl(bundledModels, modelFile);
      const textureUrl = assetUrl(
        bundledTextures,
        `${resourceCode}_textures.bin`,
      );
      if (!modelFile || !modelUrl || !textureUrl) {
        throw new Error(`Missing vending prop asset ${resourceCode}.`);
      }
      const [modelBuffer, texturePack] = await Promise.all([
        this.fetchArrayBuffer(modelUrl, {signal}),
        this.fetchArrayBuffer(textureUrl, {signal}),
      ]);
      checkActive();
      const loader = new Mt5Loader(this.scene);
      configureMt5TexturePack(loader, texturePack);
      [root] = await loader.load(modelBuffer, texturePack);
      if (!root) throw new Error(`${modelFile} did not produce a can prop.`);
      try { checkActive(); } catch (error) {
        root.dispose(false, true);
        throw error;
      }
      root.name = `${root.name}_vending_${resourceCode}`;
      root._filename = `VEND_${modelFile}`;
      root.parent = this.modelOffset;
      root.setEnabled(false);
      for (const node of [root, ...root.getDescendants(false)]) {
        node.isPickable = false;
        node.checkCollisions = false;
      }
      this.roots.set(resourceCode, root);
      this.state.currentMeshes.push(root);
    }
    this.activeRoot = root;
    return root;
  }

  update(frame, nextFrame, amount, animationState) {
    if (!this.activeRoot || this.activeRoot.isDisposed()) return;
    const visible = (
      animationState === "vendingDrink:loop"
      || animationState === "vendingDrink:exit"
      || animationState === "vendingCoffee:loop"
      || animationState === "vendingCoffee:exit"
    );
    this.activeRoot.setEnabled(visible);
    if (!visible) return;
    const sourceFrame = frame.frame + Math.max(0, amount) * (
      nextFrame.frame > frame.frame ? nextFrame.frame - frame.frame : 1
    );
    if (this.flight || (animationState.endsWith(":exit") && sourceFrame >= VENDING_CAN_RELEASE_FRAME)) {
      this.updateFlight(animationState, sourceFrame);
      return;
    }
    const character = this.getCharacterRoot();
    const hand = character?._mt5Nodes?.find(node => (node.flag << 16 >> 16) === RIGHT_HAND_RENDER_KEY);
    const sourceMatrix = character?._mt5CharacterWorldMatrices?.get(hand?.addr);
    if (!sourceMatrix) {
      this.activeRoot.setEnabled(false);
      return;
    }
    // Read the pose actually rendered (including retargeting and blends).
    // Generic MT5 prop vertices are already X-reflected; undo that before
    // applying the source hand matrix, then inherit the character's own
    // content reflection. Using the raw hand under modelOffset skips this
    // coordinate conversion and makes the can move on the opposite side.
    const matrix = SOURCE_REFLECTION.multiply(GRIP_MATRIX).multiply(BABYLON.Matrix.FromArray(sourceMatrix));
    const scaling = BABYLON.Vector3.One();
    const rotation = BABYLON.Quaternion.Identity();
    const translation = BABYLON.Vector3.Zero();
    if (!matrix.decompose(scaling, rotation, translation)) return;
    this.activeRoot.parent = character._mt5CharacterContentRoot || character;
    this.activeRoot.position.copyFrom(translation);
    this.activeRoot.rotation.setAll(0);
    this.activeRoot.rotationQuaternion = rotation;
    this.activeRoot.scaling.copyFrom(scaling);
    this.activeRoot.computeWorldMatrix(true);
  }

  updateFlight(animationState, sourceFrame) {
    if (!this.flight) {
      const character = this.getCharacterRoot();
      const hand = this.getCharacterPoseAt(animationState, VENDING_CAN_RELEASE_FRAME).get(RIGHT_HAND_RENDER_KEY);
      if (!hand || !this.bin?.root || this.bin.root.isDisposed()) {
        throw new Error("Vending release is missing its hand pose or bin.");
      }
      // Sample the exact release pose even if rendering skipped that frame.
      // Freeze it in world space: later hand motion must not steer the can.
      const parent = character._mt5CharacterContentRoot || character;
      const world = SOURCE_REFLECTION.multiply(GRIP_MATRIX)
        .multiply(BABYLON.Matrix.FromArray(hand)).multiply(parent.computeWorldMatrix(true));
      const scaling = BABYLON.Vector3.One(), rotation = BABYLON.Quaternion.Identity();
      const start = BABYLON.Vector3.Zero();
      if (!world.decompose(scaling, rotation, start)) throw new Error("Invalid vending release transform.");
      this.flight = {
        start, rotation, scaling,
        target: BABYLON.Vector3.TransformCoordinates(this.bin.opening, this.bin.root.computeWorldMatrix(true)),
      };
      this.activeRoot.parent = null;
    }
    const t = Math.min(1, Math.max(0, (sourceFrame - VENDING_CAN_RELEASE_FRAME) / VENDING_CAN_FLIGHT_FRAMES));
    const {start, target, scaling, rotation} = this.flight;
    BABYLON.Vector3.LerpToRef(start, target, t, this.activeRoot.position);
    const seconds = VENDING_CAN_FLIGHT_FRAMES / 30;
    this.activeRoot.position.y += 0.5 * 9.81 * seconds * seconds * t * (1 - t);
    this.activeRoot.rotationQuaternion = rotation.multiply(
      BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, Math.PI * 2 * t),
    );
    this.activeRoot.scaling.copyFrom(scaling);
    this.activeRoot.computeWorldMatrix(true);
    this.activeRoot.setEnabled(t < 1);
  }

  hide() {
    this.activeRoot?.setEnabled(false);
    this.activeRoot = null;
    this.flight = null;
    this.bin = null;
  }

  clear() {
    this.generation += 1;
    this.hide();
    for (const root of this.roots.values()) {
      if (!root.isDisposed()) root.dispose(false, true);
    }
    this.roots.clear();
  }
}
