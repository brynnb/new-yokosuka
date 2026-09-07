import * as BABYLON from "@babylonjs/core";
import { interpolateAffineMatrix } from "../../src/AnimationMatrixInterpolation.js";
import { fetchAsset, getTexturePack } from "../../src/assetLoader.js";
import {
  DOBUITA_GACHA_MACHINES,
  activeGachaMachineTag,
} from "../../src/DobuitaGachaInteraction.js";
import {
  DOBUITA_PHONE_BOOK_ATTACHMENTS,
  attachedSourceMatrix,
  phoneBookNativeAttachmentState,
  phoneBookNativeSceneComposition,
  phoneBookPropState,
} from "../../src/DobuitaPhoneBookInteraction.js";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import {
  configureMt5TexturePack,
} from "../assets/configureMt5TexturePack.js";

function captureRootTransform(root) {
  return {
    parent: root.parent,
    position: root.position.clone(),
    rotation: root.rotation.clone(),
    rotationQuaternion: root.rotationQuaternion?.clone() || null,
    scaling: root.scaling.clone(),
  };
}

function restoreRootTransform(root, transform) {
  if (!root || !transform || root.isDisposed()) return;
  root.parent = transform.parent;
  root.position.copyFrom(transform.position);
  root.rotation.copyFrom(transform.rotation);
  root.rotationQuaternion = transform.rotationQuaternion?.clone() || null;
  root.scaling.copyFrom(transform.scaling);
  root.computeWorldMatrix(true);
}

export class DobuitaInteractionProps {
  constructor({
    scene,
    state,
    modelOffset,
    bundledModels,
    fetchArrayBuffer,
    getActiveEmote,
    getAnimationState,
    getRetargetMatrices,
    getNativeSceneState = () => null,
  }) {
    this.scene = scene;
    this.state = state;
    this.modelOffset = modelOffset;
    this.bundledModels = bundledModels;
    this.fetchArrayBuffer = fetchArrayBuffer;
    this.getActiveEmote = getActiveEmote;
    this.getAnimationState = getAnimationState;
    this.getRetargetMatrices = getRetargetMatrices;
    this.getNativeSceneState = getNativeSceneState;
    this.phoneBook = null;
    this.gachaMachines = [];
  }

  clear() {
    this.phoneBook = null;
    this.gachaMachines = [];
  }

  restore() {
    this.restorePhoneBook();
    for (const machine of this.gachaMachines) {
      machine.lowDetailRoot?.setEnabled(true);
      machine.highDetailRoot?.setEnabled(false);
    }
  }

  restorePhoneBook() {
    if (!this.phoneBook) return;
    const { closedRoot, openedRoot, closedTransform } = this.phoneBook;
    restoreRootTransform(closedRoot, closedTransform);
    closedRoot?.setEnabled(true);
    if (openedRoot && !openedRoot.isDisposed()) openedRoot.setEnabled(false);
    this.phoneBook.activeState = null;
  }

  nativeSceneComposition() {
    if (!this.phoneBook) {
      return { objects: [], attachmentTargets: [], resources: [] };
    }
    const nativePosition = (root) => {
      const position = root.getAbsolutePosition?.() || root.position;
      return [
        Math.fround(-position.x),
        Math.fround(position.y),
        Math.fround(position.z),
      ];
    };
    return phoneBookNativeSceneComposition({
      closedPosition: nativePosition(this.phoneBook.closedRoot),
      openedPosition: nativePosition(this.phoneBook.openedRoot),
      resourceReady: (
        !this.phoneBook.openedRoot.isDisposed?.()
        && this.phoneBook.openedRoot.getScene?.() === this.scene
      ),
    });
  }

  update(frame, nextFrame, amount) {
    this.updatePhoneBook(frame, nextFrame, amount);
    const activeMachineTag = activeGachaMachineTag(this.getActiveEmote());
    for (const machine of this.gachaMachines) {
      const active = machine.definition.machineTag === activeMachineTag;
      machine.lowDetailRoot.setEnabled(!active);
      machine.highDetailRoot.setEnabled(active);
    }
  }

  updatePhoneBook(frame, nextFrame, amount) {
    const activeEmote = this.getActiveEmote();
    if (
      !this.phoneBook
      || activeEmote?.emote?.id !== "dobuitaPhoneBook"
      || activeEmote.context?.inspectable?.root !== this.phoneBook.closedRoot
    ) return;
    const nativeSceneState = this.getNativeSceneState();
    const propState = phoneBookNativeAttachmentState(
      objectTag => nativeSceneState?.readObjectFixoRecord(objectTag),
    ) || phoneBookPropState(this.getAnimationState());
    if (!propState) {
      this.restorePhoneBook();
      return;
    }
    const attachment = DOBUITA_PHONE_BOOK_ATTACHMENTS[propState];
    const parent = interpolateAffineMatrix(
      frame.poseMatrices[attachment.runtimeMatrixIndex],
      nextFrame.poseMatrices[attachment.runtimeMatrixIndex],
      amount,
    );
    const correction = this.getRetargetMatrices().get(attachment.renderKey);
    const parentForCharacter = correction
      ? Mt5Loader.rowMultiply(parent, correction)
      : parent;
    const activeRoot = propState === "closed"
      ? this.phoneBook.closedRoot
      : this.phoneBook.openedRoot;
    const inactiveRoot = propState === "closed"
      ? this.phoneBook.openedRoot
      : this.phoneBook.closedRoot;
    inactiveRoot.setEnabled(false);
    activeRoot.setEnabled(true);
    this.setRootFromSourceMatrix(
      activeRoot,
      attachedSourceMatrix(parentForCharacter, attachment),
    );
    this.phoneBook.activeState = propState;
  }

  setRootFromSourceMatrix(root, sourceMatrix) {
    const matrix = BABYLON.Matrix.FromArray(sourceMatrix);
    const scaling = BABYLON.Vector3.One();
    const rotation = BABYLON.Quaternion.Identity();
    const translation = BABYLON.Vector3.Zero();
    if (!matrix.decompose(scaling, rotation, translation)) {
      throw new Error("Could not decompose the native FIXO attachment matrix.");
    }
    root.parent = this.modelOffset;
    root.position.copyFrom(translation);
    root.rotation.set(0, 0, 0);
    root.rotationQuaternion = rotation;
    root.scaling.copyFrom(scaling);
    root.computeWorldMatrix(true);
  }

  async prepare(placedRoots) {
    await this.preparePhoneBook(placedRoots);
    await this.prepareGachaMachines(placedRoots);
  }

  async preparePhoneBook(placedRoots) {
    const closedRoot = placedRoots.find(
      (root) => root._runtimePlacementRecord?.runtime?.objectTag === "TBK1",
    );
    if (!closedRoot) {
      this.phoneBook = null;
      return;
    }
    const assetFile = "DENS502G.CHRM";
    const modelUrl = this.bundledModels[`play/assets/dobuita/${assetFile}`];
    if (!modelUrl) throw new Error(`Missing bundled Dobuita asset ${assetFile}.`);
    const [modelBuffer, texturePack] = await Promise.all([
      this.fetchArrayBuffer(modelUrl),
      getTexturePack(closedRoot._filename),
    ]);
    const loader = new Mt5Loader(this.scene);
    configureMt5TexturePack(loader, texturePack);
    const [openedRoot] = await loader.load(modelBuffer, texturePack);
    if (!openedRoot) {
      throw new Error(`${assetFile} did not produce an opened telephone book.`);
    }
    openedRoot.name = `${openedRoot.name}_D000_TBK3`;
    openedRoot._filename = "S1_D000_AUTH_DENS502G.MT5";
    openedRoot.setEnabled(false);
    this.state.currentMeshes.push(openedRoot);
    this.phoneBook = {
      closedRoot,
      openedRoot,
      closedTransform: captureRootTransform(closedRoot),
      activeState: null,
    };
  }

  async prepareGachaMachines(placedRoots) {
    const available = DOBUITA_GACHA_MACHINES.map((definition) => ({
      definition,
      lowDetailRoot: placedRoots.find((root) => (
        root._runtimePlacementRecord?.runtime?.objectTag
          === definition.machineTag
      )),
    })).filter((machine) => machine.lowDetailRoot);
    if (available.length === 0) {
      this.gachaMachines = [];
      return;
    }
    if (available.length !== DOBUITA_GACHA_MACHINES.length) {
      throw new Error("Dobuita has an incomplete native gacha-machine pair.");
    }
    this.gachaMachines = await Promise.all(available.map(async (machine) => {
      const { definition, lowDetailRoot } = machine;
      const [modelBuffer, texturePack] = await Promise.all([
        fetchAsset(definition.highDetailModel).then(
          (response) => response.arrayBuffer(),
        ),
        getTexturePack(lowDetailRoot._filename),
      ]);
      const loader = new Mt5Loader(this.scene);
      configureMt5TexturePack(loader, texturePack);
      const [highDetailRoot] = await loader.load(modelBuffer, texturePack);
      if (!highDetailRoot) {
        throw new Error(
          `${definition.highDetailModel} did not produce a gacha machine.`,
        );
      }
      highDetailRoot.name = (
        `${highDetailRoot.name}_${definition.machineTag}_interaction`
      );
      highDetailRoot._filename = definition.highDetailModel;
      restoreRootTransform(
        highDetailRoot,
        captureRootTransform(lowDetailRoot),
      );
      highDetailRoot.setEnabled(false);
      this.state.currentMeshes.push(highDetailRoot);
      return { ...machine, highDetailRoot };
    }));
  }
}
