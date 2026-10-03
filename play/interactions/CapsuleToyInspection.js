import * as BABYLON from '@babylonjs/core';
import { CHARACTER_BY_ID } from '../config/characters.js';
import { ScriptEventDialoguePresenter } from '../scripts/ScriptEventDialoguePresenter.js';
import { runtimeAssetUrl } from '../../src/RuntimeAssets.js';
import { gachaMachineTagForInspectable } from '../../src/DobuitaGachaInteraction.js';
import { CapsuleInspectionControls } from './CapsuleInspectionControls.js';
import { loadCapsuleToy, rotateCapsuleToy } from './CapsuleToyModel.js';

const CAMERA_FIELDS = ['cameraYaw', 'cameraPitch', 'cameraDistance', 'thirdPersonCameraDistance', 'firstPerson'];

// Original E1066.AFS reactions. The browser uses a deterministic new/duplicate
// reaction; the full native reaction decision tree is not yet reconstructed.
export function capsuleReaction(purchase) {
  const quantity = purchase.inventory?.find(item => item.key === purchase.itemKey)?.quantity;
  return quantity > 1
    ? {id: 'E1066A019', text: 'This again?'}
    : {id: 'E1066A022', text: 'This is cool!'};
}

// A temporary first-person presentation owns its own camera and Ryo hand rig.
// It never replaces the player's chosen avatar or changes its skeleton/state.
export class CapsuleToyInspection {
  constructor({scene, dom, getController, getCharacterRoot, getCharacterRuntime, getAnimation,
    audioSettings, getBinding}) {
    Object.assign(this, {scene, dom, getController, getCharacterRoot, getCharacterRuntime, getAnimation, getBinding});
    this.session = null;
    this.controls = new CapsuleInspectionControls({dom, canvas: dom.canvas, getBinding,
      onClose: () => this.close(), onRotate: (yaw, pitch) => this.rotate(yaw, pitch)});
    this.presenter = new ScriptEventDialoguePresenter({root: dom.dialogueOverlay,
      speaker: dom.dialogueSpeaker, sourceText: dom.dialogueSource,
      japaneseText: dom.dialogueJapanese, options: dom.dialogueOptions,
      audioSettings, voiceManifest: {urlFor: async id => runtimeAssetUrl(`public/audio/capsule/${id}.m4a`)}});
  }

  begin(signal, inspectable) {
    if (!gachaMachineTagForInspectable(inspectable)) return;
    this.close();
    const controller = this.getController();
    const session = {signal, controller, camera: this.scene.activeCamera,
      view: Object.fromEntries(CAMERA_FIELDS.map(key => [key, controller[key]])), resources: [], active: false};
    this.session = session;
    session.abort = () => this.close();
    signal.addEventListener('abort', session.abort, {once: true});
  }

  prepare(purchase) {
    const session = this.session;
    if (!session) return;
    // Show the buying gesture even when the player approached in first person
    // (that view hides the avatar and its held props). close() restores the
    // exact saved view after the inspection, including first-person mode.
    if (session.controller.firstPerson) session.controller.setFirstPerson(false);
    // Start while the purchase clip runs; observe rejection immediately even
    // when the clip is subsequently cancelled before show() can await it.
    session.loading = this.load(session, purchase);
    session.loading.catch(() => {});
  }

  check(session) {
    session.signal.throwIfAborted();
    if (this.session !== session) throw new DOMException('Inspection closed', 'AbortError');
  }

  async load(session, purchase) {
    if (!/^G_ITEM_[A-Z0-9]+\.MT5$/.test(purchase.itemModel || '')) {
      throw new Error('The server did not provide a valid toy model.');
    }
    const retain = root => {
      root.setEnabled(false);
      try { this.check(session); } catch (error) { root.dispose(false, true); throw error; }
      session.resources.push(root);
      for (const mesh of root.getChildMeshes(false)) {
        mesh.isPickable = false;
        mesh.checkCollisions = false;
      }
      return root;
    };
    const runtime = this.getCharacterRuntime();
    const armLoad = runtime.createModel({...CHARACTER_BY_ID.get('ryo'), outdoorFootwear: null}).then(model => {
      retain(model.root);
      return model;
    });
    const toyLoad = loadCapsuleToy(this.scene, purchase.itemModel, session.signal).then(retain);
    const [arm, toy] = await Promise.all([armLoad, toyLoad]);
    this.check(session);
    session.arm = arm;
    session.toy = toy;
    // Source M_GACH retrieval pose; hold it for inspection rather than inventing
    // a new skeletal animation. Camera framing below is browser-authored.
    const pose = this.getAnimation().clipPoseAt('dobuitaGacha:loop', 450);
    const routed = new Map([...runtime.renderMatrixByKey].map(([key, index]) => [key, pose[index]]));
    runtime.isolateRenderKeys(arm.root, [5, 6, -0x41]);
    runtime.applyHumanoidAnimationPose(arm.loader, arm.root, routed, pose);
    const hand = arm.root._mt5Nodes.find(n => (n.flag << 16 >> 16) === -0x41);
    const matrix = arm.root._mt5CharacterWorldMatrices?.get(hand?.addr);
    if (!matrix) throw new Error('Ryo inspection hand pose is unavailable.');
    session.handMatrix = BABYLON.Matrix.FromArray(matrix);
    const forearm = arm.root._mt5Nodes.find(n => (n.flag << 16 >> 16) === 5);
    session.forearmMatrix = BABYLON.Matrix.FromArray(arm.root._mt5CharacterWorldMatrices.get(forearm.addr));
    return session;
  }

  async show(purchase) {
    const session = this.session;
    if (!session) return;
    this.controls.open(purchase.itemName);
    this.presenter.show({text: 'AKIR: Opening capsule…', metadata: ['speaker:AKIR']});
    session.closed = new Promise(resolve => { session.resolve = resolve; });
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Loading timed out. Try opening Collection.')), 20000); });
    try {
      await Promise.race([session.loading, timeout, session.closed.then(() => { throw new DOMException('Inspection closed', 'AbortError'); })]);
      this.check(session);
      this.stage(session);
      const reaction = capsuleReaction(purchase);
      this.presenter.show({text: `AKIR: ${reaction.text}`, metadata: ['speaker:AKIR', `voice:${reaction.id}`]});
      await session.closed;
    } finally { clearTimeout(timer); if (this.session === session) this.close(); }
  }

  stage(session) {
    const {arm, toy, handMatrix} = session;
    const anchor = new BABYLON.TransformNode('capsule-inspection-arm', this.scene);
    session.resources.push(anchor);
    arm.root.parent = anchor;
    const content = arm.root._mt5CharacterContentRoot || arm.root;
    // Place each original model's base in the palm; the collection models have
    // different pivots and heights. Bounds supply a common, size-aware grip.
    const bounds = toy.getHierarchyBoundingVectors(true);
    const center = bounds.min.add(bounds.max).scale(0.5);
    const yaw = session.controller.actorRoot.rotation.y;
    arm.root.computeWorldMatrix(true);
    const modelWorld = content.computeWorldMatrix(true);
    const localPalm = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(0.09, 0.02, 0),
      handMatrix.multiply(modelWorld));
    const localElbow = BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.Zero(),
      session.forearmMatrix.multiply(modelWorld));
    // The world retrieval pose reaches down into the machine. Present that
    // original hand/forearm from below for the first-person reveal. Keep this
    // framing transform separate from the collectible's upright model axes.
    const viewAxis = new BABYLON.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new BABYLON.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    anchor.rotationQuaternion = BABYLON.Quaternion.Identity();
    BABYLON.Quaternion.FromUnitVectorsToRef(localElbow.subtract(localPalm).normalize(),
      viewAxis.scale(0.9).add(right.scale(0.55)).add(new BABYLON.Vector3(0, -0.6, 0)).normalize(),
      anchor.rotationQuaternion);
    const palm = session.controller.actorRoot.position.add(new BABYLON.Vector3(0, 1.22, 0));
    anchor.position.copyFrom(palm.subtract(BABYLON.Vector3.TransformNormal(localPalm,
      BABYLON.Matrix.FromQuaternionToRef(anchor.rotationQuaternion, BABYLON.Matrix.Identity()))));
    toy.parent = null;
    toy.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(yaw + Math.PI, 0, 0);
    const pivot = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(center.x, bounds.min.y, center.z),
      BABYLON.Matrix.RotationY(yaw + Math.PI));
    toy.position.copyFrom(palm.subtract(pivot));
    arm.root.setEnabled(true);
    toy.setEnabled(true);
    toy.computeWorldMatrix(true);
    const visibleBounds = toy.getHierarchyBoundingVectors(true);
    const target = visibleBounds.min.add(visibleBounds.max).scale(0.5);
    const rotationPivot = new BABYLON.TransformNode('capsule-inspection-toy-pivot', this.scene);
    rotationPivot.position.copyFrom(target);
    rotationPivot.rotationQuaternion = BABYLON.Quaternion.Identity();
    toy.setParent(rotationPivot);
    session.rotationPivot = rotationPivot;
    session.resources.push(rotationPivot);
    const size = Math.max(0.12, visibleBounds.max.subtract(visibleBounds.min).length());
    const distance = Math.max(0.32, size * 1.8);
    const eye = target.add(new BABYLON.Vector3(-Math.sin(yaw) * distance, distance * 0.7, -Math.cos(yaw) * distance));
    const camera = new BABYLON.FreeCamera('capsule-inspection', eye, this.scene);
    camera.inputs.clear();
    camera.minZ = 0.01;
    camera.fov = 0.75;
    camera.setTarget(target);
    session.inspectionCamera = camera;
    this.scene.activeCamera = camera;
    session.character = this.getCharacterRoot();
    session.characterEnabled = session.character?.isEnabled();
    session.active = true;
    this.update();
  }

  rotate(yaw, pitch) {
    const session = this.session;
    if (!session?.active) return;
    rotateCapsuleToy(session.rotationPivot, session.inspectionCamera, yaw, pitch);
  }

  update(deltaSeconds = 0) {
    if (!this.session?.active) return;
    this.session.character?.setEnabled(false);
    this.controls.update(deltaSeconds);
  }

  close() {
    const session = this.session;
    if (!session) return;
    this.session = null;
    session.signal.removeEventListener('abort', session.abort);
    this.controls.close();
    this.presenter.hide();
    if (session.inspectionCamera) {
      if (this.scene.activeCamera === session.inspectionCamera) this.scene.activeCamera = session.camera;
      session.inspectionCamera.dispose();
    }
    if (session.character && !session.character.isDisposed()) session.character.setEnabled(session.characterEnabled);
    for (const root of session.resources) if (!root.isDisposed()) root.dispose(false, true);
    if (this.getController() === session.controller) {
      Object.assign(session.controller, session.view);
      session.controller.updateCamera(1);
    }
    session.resolve?.();
  }
}
