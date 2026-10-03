import * as B from '@babylonjs/core';
import { GACHA_CAPSULE as SOURCE } from '../../src/DobuitaGachaInteraction.js';
import { Mt5Loader } from '../../src/Mt5Loader.js';
import { fetchAsset } from '../../src/assetLoader.js';
import { runtimeAssetUrl } from '../../src/RuntimeAssets.js';
import { fetchAssetResponse } from '../../src/AssetCache.js';
import { configureMt5TexturePack } from '../assets/configureMt5TexturePack.js';

const REFLECT = B.Matrix.Scaling(-1, 1, 1);
const sourceTransform = (position, rotationRaw) => B.Matrix.FromArray(Mt5Loader.sourceTransformMatrix({
  pos: B.Vector3.FromArray(position), rot: B.Vector3.FromArray(rotationRaw.map(v => v * Math.PI / 32768)),
  scl: B.Vector3.One(),
}));

function applyTransform(root, matrix, parent) {
  root.parent = parent;
  root.rotationQuaternion ||= B.Quaternion.Identity();
  if (!matrix.decompose(root.scaling, root.rotationQuaternion, root.position)) {
    throw new Error('Invalid capsule prop transform.');
  }
  root.rotation.setAll(0);
  root.computeWorldMatrix(true);
  root.setEnabled(true);
}

// The shell is separate from the server-awarded prize. Its four cosmetic
// colors use the native uniform choice; this never influences prize rarity.
export class CapsulePurchaseProps {
  constructor({scene, getCharacterRoot, getCharacterPoseAt}) {
    Object.assign(this, {scene, getCharacterRoot, getCharacterPoseAt});
    this.roots = [];
    this.generation = 0;
  }

  async prepare() {
    const generation = this.generation;
    try {
      const response = await fetchAssetResponse(runtimeAssetUrl('play/assets/dobuita/GACHA_textures.bin'));
      if (!response.ok) throw new Error(`Capsule texture request failed (${response.status}).`);
      const textures = await response.arrayBuffer();
      // These existing S3 catalog models are byte-identical to Disc 1 OMG's
      // CAPS5*.CHRM resources (hashes recorded by the source audit).
      for (const filename of [SOURCE.lidModel, ...SOURCE.baseModels]) {
        const buffer = await fetchAsset(filename).then(r => r.arrayBuffer());
        if (generation !== this.generation) return;
        const loader = new Mt5Loader(this.scene);
        configureMt5TexturePack(loader, textures);
        const [root] = await loader.load(buffer, textures);
        if (!root) throw new Error(`Missing capsule prop ${filename}`);
        // load() releases its temporary texture wrappers; inspect the retained
        // materials, not the loader cache, to validate the rendered resource.
        if (root.getChildMeshes(false).some(mesh => mesh.getTotalVertices() > 0 && !mesh.material?.diffuseTexture)) {
          root.dispose(false, true);
          throw new Error(`Capsule atlas is missing textures for ${filename}.`);
        }
        if (generation !== this.generation) { root.dispose(false, true); return; }
        root.name = filename;
        root.setEnabled(false);
        for (const mesh of root.getChildMeshes(false)) {
          mesh.isPickable = false;
          mesh.checkCollisions = false;
        }
        this.roots.push(root);
      }
    } catch (error) {
      if (generation === this.generation) this.clear();
      throw error;
    }
  }

  restore() {
    for (const root of this.roots) if (!root.isDisposed()) {
      root.setEnabled(false);
      root.parent = null;
    }
    this.active = null;
  }

  clear() {
    this.generation++;
    this.restore();
    for (const root of this.roots) if (!root.isDisposed()) root.dispose(false, true);
    this.roots = [];
  }

  update(emote, machine, frame) {
    if (!machine || frame < SOURCE.dispenseFrame || this.roots.length !== 5) {
      this.restore();
      return;
    }
    if (this.active?.emote !== emote) {
      this.restore();
      this.active = {emote, lid: this.roots[0], base: this.roots[1 + Math.floor(Math.random() * 4)], flights: new Map()};
    }
    const {lid, base} = this.active;
    if (frame < SOURCE.pickupFrame) {
      this.dispense(lid, base, machine, frame);
      return;
    }
    this.updateHalf(lid, SOURCE.rightGrip, SOURCE.lidReleaseFrame, frame);
    this.updateHalf(base, frame < SOURCE.openFrame ? SOURCE.rightGrip : SOURCE.leftGrip, SOURCE.baseReleaseFrame, frame);
  }

  dispense(lid, base, machine, frame) {
    const elapsed = frame - SOURCE.dispenseFrame;
    const position = [...SOURCE.dispensePosition];
    // Native coroutine drops 8 cm, accelerating by .001 source units/tick.
    // Sampling by clip frame makes this independent of browser frame rate.
    position[1] -= Math.min(SOURCE.dropDistance, SOURCE.dropAcceleration * elapsed * (elapsed + 1) / 2);
    const transform = REFLECT.multiply(sourceTransform(position, [0, 0, 0])).multiply(REFLECT);
    for (const root of [lid, base]) applyTransform(root, transform, machine.highDetailRoot);
  }

  gripAt(grip, frame) {
    let position = grip.position;
    if (grip === SOURCE.leftGrip && frame >= SOURCE.regripFrame) {
      const t = Math.min(1, (frame - SOURCE.regripFrame) / (SOURCE.regripEndFrame - SOURCE.regripFrame));
      position = position.map((value, i) => value + (SOURCE.leftRegrip[i] - value) * t);
    }
    return sourceTransform(position, grip.rotationRaw);
  }

  updateHalf(root, grip, releaseFrame, frame) {
    const character = this.getCharacterRoot();
    const parent = character?._mt5CharacterContentRoot || character;
    if (frame >= releaseFrame) {
      let flight = this.active.flights.get(root);
      if (!flight) {
        const sourceHand = this.getCharacterPoseAt('dobuitaGacha:loop', releaseFrame).get(grip.renderKey);
        if (!sourceHand) throw new Error('Capsule release hand pose is missing.');
        const world = REFLECT.multiply(this.gripAt(grip, releaseFrame))
          .multiply(B.Matrix.FromArray(sourceHand)).multiply(parent.computeWorldMatrix(true));
        applyTransform(root, world, null);
        flight = {start: root.position.clone(), rotation: root.rotationQuaternion.clone()};
        this.active.flights.set(root, flight);
      }
      // Native detachment frames, browser-authored short gravity drop. The
      // native throw coroutine's entire bin/collision trajectory is not ported.
      const seconds = (frame - releaseFrame) / 30;
      root.position.copyFrom(flight.start);
      root.position.y -= 4.905 * seconds * seconds;
      root.rotationQuaternion = flight.rotation.multiply(B.Quaternion.RotationAxis(B.Axis.Z, seconds * 7));
      root.setEnabled(seconds < 0.35);
      return;
    }
    const node = character?._mt5Nodes?.find(n => (n.flag << 16 >> 16) === grip.renderKey);
    const hand = character?._mt5CharacterWorldMatrices?.get(node?.addr);
    if (!hand) throw new Error(`Capsule hand ${grip.renderKey} is missing.`);
    // Same coordinate boundary as VendingDrinkProp: undo generic prop vertex
    // reflection, attach to the rendered/retargeted source hand, then inherit
    // the character content reflection. Raw modelOffset would mirror the grip.
    applyTransform(root, REFLECT.multiply(this.gripAt(grip, frame)).multiply(B.Matrix.FromArray(hand)), parent);
  }
}
