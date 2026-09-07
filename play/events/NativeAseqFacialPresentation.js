import * as BABYLON from "@babylonjs/core";
import { parseFaceTable } from "../../src/FaceTable.js";
import {
  integrateBodyFaceSurface,
  restoreBodyFaceSurface,
} from "../../src/FaceSurfaceIntegration.js";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import { configureMt5TexturePack } from "../assets/configureMt5TexturePack.js";
import {
  advanceNativeFaceEyeAngles,
  nativeFaceEyeTargetAngles,
} from "../../src/NativeFaceGaze.js";
import { NativeLipSyncCuePlayer } from "../../src/NativeLipSync.js";
import {
  evaluateNativeTalkVertices,
  nativeTalkActorPoses,
  neutralNativeTalkActorPoses,
  NativeTalkDeltaTransition,
  parseNativeTalkPoseAsset,
} from "../../src/NativeTalkPoses.js";

const BLINK_INTERVALS = Object.freeze([60, 70, 80, 90]);
const BLINK_CLOSE_FRAMES = 2;
const BLINK_OPEN_FRAMES = 4;

function binary(input, label) {
  if (input instanceof ArrayBuffer) return input;
  if (ArrayBuffer.isView(input)) {
    return input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength,
    );
  }
  throw new TypeError(`${label} must be binary data`);
}

async function sha256Hex(value) {
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", value),
  );
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function verifiedAsset(loadAsset, record, label) {
  const value = binary(await loadAsset(record.path), label);
  if (
    value.byteLength !== record.byteLength
    || await sha256Hex(value) !== record.sha256
  ) {
    throw new Error(`${label} differs from its generated inventory`);
  }
  return value;
}

function signedRenderKey(node) {
  const low16 = node.flag & 0xffff;
  return low16 >= 0x8000 ? low16 - 0x10000 : low16;
}

function renderNode(root, renderKey, { requireModel = false } = {}) {
  const candidates = (root?._mt5Nodes || []).filter((node) => (
    signedRenderKey(node) === renderKey
    && (!requireModel || node.model)
  ));
  return candidates.find(node => node.parentAddr && node.model)
    || candidates.find(node => node.model)
    || candidates[0]
    || null;
}

function primaryMeshes(primaryNode) {
  const meshes = primaryNode?.mesh?.getChildren?.().filter((child) => (
    child instanceof BABYLON.Mesh
    && child._mt5NodeAddress === primaryNode.addr
    && child._mt5SourcePositions
    && child._mt5SourceVertexIndices
  )) || [];
  if (meshes.length === 0) throw new Error("FACE model has no primary mesh");
  return meshes;
}

function bodyFaceMatrix(actorModel, bodyNode) {
  const renderRoot = actorModel?.renderRoot;
  const matrices = renderRoot?._mt5CharacterWorldMatrices
    || renderRoot?._mt5CharacterGpuRig?.worldMatrices;
  return matrices?.get(bodyNode.addr)
    || actorModel?.loader?.sourceWorldMatrixForNode?.(bodyNode)
    || null;
}

function actorSeed(actorTag) {
  let seed = 0x811c9dc5;
  for (const character of actorTag) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 0x01000193) >>> 0;
  }
  return seed || 1;
}

function nextBlinkInterval(face) {
  // The executable selects exactly one of 60/70/80/90 30 Hz ticks. Preserve
  // that authored distribution with a stable per-actor stream so cutscene
  // replay and tests remain deterministic.
  let value = face.blinkSeed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  face.blinkSeed = value >>> 0 || 1;
  return BLINK_INTERVALS[face.blinkSeed & 3];
}

function createPoseState(entry, actorTag) {
  const state = {
    poseBase: 0,
    expressionSelector: 0,
    upperSelector: 0,
    mouth: new NativeTalkDeltaTransition(entry.poses.mouthPoses[0]),
    upper: new NativeTalkDeltaTransition(entry.poses.upperPoses[0]),
    blinkSeed: actorSeed(actorTag),
    blinkFramesRemaining: 0,
    blinkPhase: "waiting",
    controllerMode: 0,
    controllerParameter: 0,
    controllerDrivenClose: false,
    gazeTargetWorld: null,
    gazePendingTarget: null,
    gazeTicksRemaining: 0,
    eyeAngles: entry.eyeNodes.map(() => ({
      vertical: 0,
      horizontal: 0,
    })),
  };
  state.blinkFramesRemaining = nextBlinkInterval(state);
  return state;
}

function setMeshPositionsUpdatable(mesh) {
  const kind = BABYLON.VertexBuffer.PositionKind;
  if (!mesh.getVertexBuffer(kind)?.isUpdatable?.()) {
    mesh.setVerticesData(kind, mesh.getVerticesData(kind), true);
  }
}

function configureDetailedFaceMaterials(root) {
  const materials = new Set(
    (root?.getChildMeshes?.(false) || [])
      .map(mesh => mesh.material)
      .filter(Boolean),
  );
  for (const material of materials) {
    // Detailed FACE resources are exterior surfaces. Rendering their reverse
    // sides exposes eye and facial atlas sheets through the back of the head.
    // Character X mirroring reverses winding, hence the established clockwise
    // character-material convention used by the ordinary character runtime.
    material.backFaceCulling = true;
    material.sideOrientation = BABYLON.Material.ClockWiseSideOrientation;
    material.twoSidedLighting = false;
    material.separateCullingPass = false;
  }
}

export class NativeAseqFacialPresentation {
  constructor({ scene, actors, definitions, loadAsset } = {}) {
    if (
      !scene
      || typeof actors?.activeActor !== "function"
      || typeof actors?.componentWorldPosition !== "function"
      || !definitions
      || typeof loadAsset !== "function"
    ) {
      throw new TypeError("AUTH facial presentation requires scene, actors, data, and assets");
    }
    this.scene = scene;
    this.actors = actors;
    this.definitions = new Map(Object.entries(definitions).map(
      ([actorTag, definition]) => [String(actorTag).toUpperCase(), definition],
    ));
    this.loadAsset = loadAsset;
    this.entries = new Map();
    this.pending = new Map();
    this.poseAssets = new Map();
    this.poseStates = new Map();
    this.active = null;
    this.program = null;
  }

  async prepare({ actors: actorTags } = {}) {
    const requested = [...new Set((actorTags || []).map(
      value => String(value || "").toUpperCase(),
    ))].filter(actorTag => this.definitions.has(actorTag));
    await Promise.all(requested.map(actorTag => this.#prepareActor(actorTag)));
    return true;
  }

  begin(owner, actorTags) {
    if (this.active) throw new Error("AUTH faces are already owned");
    const faces = new Map();
    try {
      for (const value of actorTags) {
        const actorTag = String(value || "").toUpperCase();
        const entry = this.entries.get(actorTag);
        if (this.definitions.has(actorTag) && !entry) {
          throw new Error(`AUTH FACE asset for ${actorTag} was not prepared`);
        }
        if (!entry) continue;
        const face = this.program
          ? this.program.faces.get(actorTag)
          : this.#acquireFace(actorTag, entry);
        if (!face) {
          throw new Error(`AUTH FACE program ownership for ${actorTag} is unavailable`);
        }
        entry.root.setEnabled(true);
        faces.set(actorTag, face);
      }
      this.active = { owner, faces, lastFrame: 0 };
      for (const face of faces.values()) this.#applyVertices(face);
      return true;
    } catch (error) {
      if (!this.program) {
        for (const face of faces.values()) this.#releaseFace(face, {
          preservePose: true,
        });
      }
      throw error;
    }
  }

  beginProgram(owner, actorTags) {
    if (this.program || this.active) return false;
    const faces = new Map();
    try {
      for (const value of actorTags || []) {
        const actorTag = String(value || "").toUpperCase();
        const entry = this.entries.get(actorTag);
        if (this.definitions.has(actorTag) && !entry) {
          throw new Error(`AUTH FACE asset for ${actorTag} was not prepared`);
        }
        if (!entry || faces.has(actorTag)) continue;
        const face = this.#acquireFace(actorTag, entry);
        face.entry.root.setEnabled(false);
        faces.set(actorTag, face);
      }
      this.program = { owner, faces };
      return true;
    } catch (error) {
      for (const face of faces.values()) this.#releaseFace(face);
      throw error;
    }
  }

  endProgram(owner) {
    if (this.program?.owner !== owner || this.active) return false;
    for (const face of this.program.faces.values()) this.#releaseFace(face);
    this.program = null;
    return true;
  }

  reset() {
    if (this.active || this.program) return false;
    this.poseStates.clear();
    return true;
  }

  play(owner, command) {
    if (
      this.active?.owner !== owner
      || !["voice", "face-clip", "face-gaze", "face-controller"].includes(command?.name)
    ) return false;
    if (command.name === "face-controller") {
      const actorTag = String(command.actorTag || "").toUpperCase();
      const face = this.active.faces.get(actorTag);
      const entry = face?.entry || this.entries.get(actorTag);
      if (!entry) {
        if (this.definitions.has(actorTag)) {
          throw new Error(`AUTH FACE asset for ${actorTag} was not prepared`);
        }
        return true;
      }
      if (
        !Number.isInteger(command.mode)
        || command.mode < 0
        || command.mode > 0xff
        || !Number.isInteger(command.intervalNativeTicks)
        || command.intervalNativeTicks < 0
        || command.intervalNativeTicks > 0xffff
        || !Number.isInteger(command.parameter)
        || command.parameter < 0
        || command.parameter > 0xff
      ) throw new Error(`AUTH FACE controller for ${actorTag} is invalid`);
      const state = face || this.poseStates.get(actorTag)
        || createPoseState(entry, actorTag);
      const duration = command.mode === 0
        ? 3
        : Math.max(1, command.intervalNativeTicks);
      state.controllerMode = command.mode;
      state.controllerParameter = command.parameter;
      // Native modes one and two are the authored close/open controller pair.
      // Other modes retain their exact controller state without guessing a
      // mesh-space effect that has not been recovered.
      if (command.mode === 1 || command.mode === 2) {
        state.upperSelector = command.mode === 1 ? 1 : 0;
        state.upper.transition(
          entry.poses.upperPoses[state.poseBase + state.upperSelector],
          duration,
        );
        state.blinkPhase = command.mode === 1 ? "closing" : "opening";
        state.blinkFramesRemaining = duration;
        state.controllerDrivenClose = command.mode === 1;
      } else if (command.mode === 0) {
        state.blinkPhase = "waiting";
        state.blinkFramesRemaining = nextBlinkInterval(state);
        state.controllerDrivenClose = false;
      }
      if (!face) this.poseStates.set(actorTag, state);
      return true;
    }
    if (command.name === "face-gaze") {
      const actorTag = String(command.actorTag || "").toUpperCase();
      const face = this.active.faces.get(actorTag);
      const entry = face?.entry || this.entries.get(actorTag);
      if (!entry) {
        if (this.definitions.has(actorTag)) {
          throw new Error(`AUTH FACE asset for ${actorTag} was not prepared`);
        }
        return true;
      }
      if (
        (command.mode !== 0 && command.mode !== 2)
        || !Number.isInteger(command.durationNativeTicks)
        || command.durationNativeTicks < 1
      ) throw new Error(`AUTH FACE gaze for ${actorTag} is invalid`);
      const state = face || this.poseStates.get(actorTag)
        || createPoseState(entry, actorTag);
      state.gazeTargetWorld = command.mode === 0
        ? null
        : state.gazeTargetWorld;
      state.gazePendingTarget = command.mode === 0 ? null : command.target;
      state.gazeTicksRemaining = command.durationNativeTicks;
      if (!face) this.poseStates.set(actorTag, state);
      return true;
    }
    if (command.name === "face-clip") {
      const actorTag = String(command.actorTag || "").toUpperCase();
      const face = this.active.faces.get(actorTag);
      const entry = face?.entry || this.entries.get(actorTag);
      if (!entry) {
        if (this.definitions.has(actorTag)) {
          throw new Error(`AUTH FACE asset for ${actorTag} was not prepared`);
        }
        return true;
      }
      const state = face || this.poseStates.get(actorTag)
        || createPoseState(entry, actorTag);
      const poseBase = command.clipGroup * 6;
      const upperPose = poseBase + state.upperSelector;
      const expressionPose = poseBase + command.selector;
      if (
        !Number.isInteger(command.clipGroup)
        || command.clipGroup < 0
        || !Number.isInteger(command.selector)
        || command.selector < 0
        || !Number.isInteger(command.durationNativeTicks)
        || command.durationNativeTicks < 1
        || !entry.poses.upperPoses[upperPose]
        || !entry.poses.mouthPoses[expressionPose]
      ) throw new Error(`AUTH FACE clip for ${actorTag} is invalid`);
      state.poseBase = poseBase;
      state.expressionSelector = command.selector;
      state.upper.transition(
        entry.poses.upperPoses[upperPose],
        command.durationNativeTicks,
      );
      state.mouth.transition(
        entry.poses.mouthPoses[expressionPose],
        command.durationNativeTicks,
      );
      if (!face) this.poseStates.set(actorTag, state);
      return true;
    }
    const speakerId = String(
      command.audio?.speakerId || command.speakerId || command.actorTag || "",
    ).toUpperCase();
    const face = this.active.faces.get(speakerId);
    // Some opening voices belong to actors without a proven detailed FACE
    // resource. Audio remains valid and is deliberately not redirected to a
    // different character.
    if (!face || !command.audio?.lipSync) return true;
    if (!face.lipSync.start(command.audio.lipSync)) return true;
    const state = face.lipSync.snapshot();
    face.cueIndex = state.cueIndex;
    face.prefetched = state.prefetched;
    face.mouth.transition(
      face.entry.poses.mouthPoses[face.poseBase + state.pose],
      state.transitionTicksRemaining,
    );
    return true;
  }

  apply(owner, { frame } = {}) {
    if (this.active?.owner !== owner) return false;
    const targetFrame = frame ?? this.active.lastFrame;
    if (
      !Number.isInteger(targetFrame)
      || targetFrame < this.active.lastFrame
    ) return false;
    while (this.active.lastFrame < targetFrame) {
      this.active.lastFrame += 1;
      for (const face of this.active.faces.values()) this.#advanceFace(face);
      for (const [actorTag, state] of this.poseStates) {
        const entry = this.entries.get(actorTag);
        if (entry) this.#advanceDormantFace(state, entry.poses);
      }
    }
    for (const face of this.active.faces.values()) {
      const matrix = bodyFaceMatrix(face.actor.model, face.bodyNode);
      if (!matrix) return false;
      const routedMatrices = new Map([
        [face.entry.definition.faceRootRenderKey, matrix],
      ]);
      this.#applyEyeGaze(face, matrix, routedMatrices);
      face.entry.loader.applyCharacterRigWorldMatrices(
        face.entry.root,
        routedMatrices,
      );
      this.#applyVertices(face);
    }
    return true;
  }

  end(owner) {
    if (this.active?.owner !== owner) return false;
    if (this.program) {
      for (const face of this.active.faces.values()) {
        face.lipSync.stop();
        face.cueIndex = -1;
        face.prefetched = false;
        face.entry.root.setEnabled(false);
      }
    } else {
      for (const face of this.active.faces.values()) this.#releaseFace(face);
    }
    this.active = null;
    return true;
  }

  #acquireFace(actorTag, entry) {
    const actor = this.actors.activeActor(actorTag);
    const actorModel = actor?.model;
    const actualModelCode = actorModel?.modelCode
      || actorModel?.renderRoot?.metadata?.scheduledActorModelCode
      || null;
    if (actualModelCode && actualModelCode !== entry.definition.bodyModelCode) {
      throw new Error(
        `AUTH FACE ${entry.definition.faceCode} does not match ${actualModelCode}`,
      );
    }
    const bodyNode = renderNode(
      actorModel?.renderRoot,
      entry.definition.attachmentRenderKey,
      { requireModel: true },
    );
    if (!actorModel?.renderRoot || !actorModel?.loader || !bodyNode?.mesh) {
      throw new Error(`AUTH FACE attachment for ${actorTag} is unavailable`);
    }
    const retained = this.poseStates.get(actorTag)
      || createPoseState(entry, actorTag);
    this.poseStates.delete(actorTag);
    const face = {
      actorTag,
      entry,
      actor,
      bodyNode,
      surfaceIntegration: null,
      lipSync: new NativeLipSyncCuePlayer(),
      cueIndex: -1,
      prefetched: false,
      ...retained,
    };
    entry.root.parent = actorModel.renderRoot;
    entry.root.position.set(0, 0, 0);
    entry.root.rotationQuaternion = null;
    entry.root.rotation.set(0, 0, 0);
    entry.root.scaling.set(1, 1, 1);
    entry.root.setEnabled(true);
    face.surfaceIntegration = integrateBodyFaceSurface({
      bodyModelRoot: actorModel.renderRoot,
      bodyFaceNode: bodyNode,
      bodyLoader: actorModel.loader,
      faceRoot: entry.root,
      faceAttachmentNode: entry.primaryNode,
      faceEyeNodes: entry.eyeNodes,
      faceLoader: entry.loader,
    });
    return face;
  }

  async #prepareActor(actorTag) {
    if (this.entries.has(actorTag)) return this.entries.get(actorTag);
    if (this.pending.has(actorTag)) return this.pending.get(actorTag);
    const pending = this.#loadActor(actorTag);
    this.pending.set(actorTag, pending);
    try {
      const entry = await pending;
      this.entries.set(actorTag, entry);
      return entry;
    } finally {
      this.pending.delete(actorTag);
    }
  }

  async #loadActor(actorTag) {
    const definition = this.definitions.get(actorTag);
    const neutralFallback = definition.poses?.kind === "neutral-fallback";
    const [modelBuffer, tableBuffer, poseAsset, texturePack] = await Promise.all([
      verifiedAsset(this.loadAsset, definition.model, `${actorTag} FACE model`),
      verifiedAsset(this.loadAsset, definition.table, `${actorTag} FTBL`),
      neutralFallback ? null : this.#loadPoseAsset(definition.poses),
      definition.texturePack
        ? verifiedAsset(
            this.loadAsset,
            definition.texturePack,
            `${actorTag} FACE texture pack`,
          )
        : null,
    ]);
    const loader = new Mt5Loader(this.scene, {
      backFaceCulling: false,
      mirrorCharacterX: true,
      nativeTwiddledRectUV: true,
      textureAddressMode: "clamp",
      characterRigMode: "gpu",
      orientTriangleWindingToNormals: true,
      materialSideOrientation: null,
    });
    if (texturePack) configureMt5TexturePack(loader, texturePack);
    const [root] = await loader.load(modelBuffer, texturePack, {
      sourceFilename: `${definition.faceCode}_F.MT5`,
    });
    if (!root) throw new Error(`${actorTag} FACE model did not render`);
    try {
      configureDetailedFaceMaterials(root);
      const primaryNode = renderNode(root, definition.faceRootRenderKey, {
        requireModel: true,
      });
      const vertexCount = primaryNode?.model?.nbVertex;
      if (!primaryNode || !Number.isInteger(vertexCount)) {
        throw new Error(`${actorTag} FACE primary node is unavailable`);
      }
      const eyeNodes = (definition.eyeRenderKeys || []).map(renderKey => (
        renderNode(root, renderKey, { requireModel: true })
      ));
      if (
        eyeNodes.length === 0
        || eyeNodes.some(node => !node)
      ) throw new Error(`${actorTag} FACE eye nodes are unavailable`);
      const table = parseFaceTable(tableBuffer, { vertexCount });
      const poses = neutralFallback
        ? neutralNativeTalkActorPoses({
            actorTag: definition.poses.actorTag,
            faceCode: definition.faceCode,
            tableSha256: definition.table.sha256,
          })
        : nativeTalkActorPoses(
            poseAsset,
            definition.poses.actorTag,
            definition.table.sha256,
          );
      const sourcePositions = new Float32Array(vertexCount * 3);
      for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
        const source = loader.globalVertices[
          primaryNode.model.vertexBase + vertexIndex
        ]?.sourcePos;
        if (!source) throw new Error(`${actorTag} FACE vertex ${vertexIndex} is unavailable`);
        sourcePositions.set(source, vertexIndex * 3);
      }
      root.name = `native_face_${actorTag}`;
      root.setEnabled(false);
      for (const node of root.getDescendants(false)) {
        node.isPickable = false;
        node.checkCollisions = false;
        node.metadata = { ...(node.metadata || {}), cameraBlocker: false };
      }
      const meshes = primaryMeshes(primaryNode);
      for (const mesh of meshes) setMeshPositionsUpdatable(mesh);
      return {
        actorTag,
        definition,
        loader,
        root,
        primaryNode,
        primaryVertexBase: primaryNode.model.vertexBase,
        primaryMeshes: meshes,
        eyeNodes,
        table,
        poses,
        sourcePositions,
      };
    } catch (error) {
      root.dispose(false, true);
      throw error;
    }
  }

  async #loadPoseAsset(record) {
    const key = `${record.path}:${record.sha256}:${record.byteLength}`;
    if (this.poseAssets.has(key)) return this.poseAssets.get(key);
    const pending = verifiedAsset(
      this.loadAsset,
      record,
      "AUTH TALK poses",
    ).then(parseNativeTalkPoseAsset);
    this.poseAssets.set(key, pending);
    try {
      return await pending;
    } catch (error) {
      this.poseAssets.delete(key);
      throw error;
    }
  }

  #releaseFace(face, { preservePose = true } = {}) {
    if (preservePose) {
      this.poseStates.set(face.actorTag, {
        poseBase: face.poseBase,
        expressionSelector: face.expressionSelector,
        upperSelector: face.upperSelector,
        mouth: face.mouth,
        upper: face.upper,
        blinkSeed: face.blinkSeed,
        blinkFramesRemaining: face.blinkFramesRemaining,
        blinkPhase: face.blinkPhase,
        controllerMode: face.controllerMode,
        controllerParameter: face.controllerParameter,
        controllerDrivenClose: face.controllerDrivenClose,
        gazeTargetWorld: face.gazeTargetWorld,
        gazePendingTarget: face.gazePendingTarget,
        gazeTicksRemaining: face.gazeTicksRemaining,
        eyeAngles: face.eyeAngles,
      });
    }
    face.lipSync.stop();
    restoreBodyFaceSurface(face.surfaceIntegration);
    face.entry.root.setEnabled(false);
    face.entry.root.parent = null;
  }

  #advanceFace(face) {
    face.mouth.advanceTick();
    const state = face.lipSync.advance(1);
    if (
      state.cueIndex !== face.cueIndex
      || state.prefetched !== face.prefetched
    ) {
      face.cueIndex = state.cueIndex;
      face.prefetched = state.prefetched;
      face.mouth.transition(
        face.entry.poses.mouthPoses[face.poseBase + state.pose],
        state.transitionTicksRemaining,
      );
    }

    face.upper.advanceTick();
    if (face.upper.ticksRemaining === 0 && !face.controllerDrivenClose) {
      if (face.blinkPhase === "closing") {
        face.blinkPhase = "opening";
        face.upperSelector = 0;
        face.upper.transition(
          face.entry.poses.upperPoses[face.poseBase],
          BLINK_OPEN_FRAMES,
        );
      } else if (face.blinkPhase === "opening") {
        face.blinkPhase = "waiting";
        face.blinkFramesRemaining = nextBlinkInterval(face);
      }
    }
    if (face.blinkPhase === "waiting") {
      face.blinkFramesRemaining -= 1;
      if (face.blinkFramesRemaining <= 0) {
        face.blinkPhase = "closing";
        face.upperSelector = 1;
        face.upper.transition(
          face.entry.poses.upperPoses[face.poseBase + 1],
          BLINK_CLOSE_FRAMES,
        );
      }
    }
  }

  #advanceDormantFace(state, poses) {
    state.mouth.advanceTick();
    state.upper.advanceTick();
    if (state.upper.ticksRemaining === 0 && !state.controllerDrivenClose) {
      if (state.blinkPhase === "closing") {
        state.blinkPhase = "opening";
        state.upperSelector = 0;
        state.upper.transition(
          poses.upperPoses[state.poseBase],
          BLINK_OPEN_FRAMES,
        );
      } else if (state.blinkPhase === "opening") {
        state.blinkPhase = "waiting";
        state.blinkFramesRemaining = nextBlinkInterval(state);
      }
    }
    if (state.blinkPhase === "waiting") {
      state.blinkFramesRemaining -= 1;
      if (state.blinkFramesRemaining <= 0) {
        state.blinkPhase = "closing";
        state.upperSelector = 1;
        state.upper.transition(
          poses.upperPoses[state.poseBase + 1],
          BLINK_CLOSE_FRAMES,
        );
      }
    }
  }

  #resolveGazeTargetWorld(target) {
    if (
      target?.kind === "world-point"
      && Array.isArray(target.position)
      && target.position.length === 3
      && target.position.every(Number.isFinite)
    ) {
      // AUTH/world script coordinates use the native scene X convention;
      // NativeAseqBabylonActors reflects that component when placing actors.
      return [-target.position[0], target.position[1], target.position[2]];
    }
    if (
      target?.kind !== "actor-component"
      || typeof target.actorTag !== "string"
      || !Number.isInteger(target.selector)
      || target.selector < -1
      || target.selector > 127
      || !Array.isArray(target.offset)
      || target.offset.length !== 3
      || !target.offset.every(Number.isFinite)
    ) throw new Error("AUTH FACE gaze target is invalid");
    const position = this.actors.componentWorldPosition(
      target.actorTag,
      target.selector,
    );
    if (!Array.isArray(position) || position.length !== 3) {
      const component = target.selector === -1 ? "" : `:${target.selector}`;
      throw new Error(
        `AUTH FACE gaze target ${target.actorTag}${component} is unavailable`,
      );
    }
    const world = BABYLON.Vector3.FromArray(position);
    world.addInPlace(new BABYLON.Vector3(
      -target.offset[0],
      target.offset[1],
      target.offset[2],
    ));
    return world.asArray();
  }

  #applyEyeGaze(face, faceMatrix, routedMatrices) {
    if (face.gazePendingTarget) {
      // AUTH body motion is applied immediately before FACE presentation.
      // Resolve actor-component requests here so operation 0x0019 observes
      // the target controller matrix from the same authored frame.
      face.gazeTargetWorld = this.#resolveGazeTargetWorld(
        face.gazePendingTarget,
      );
      face.gazePendingTarget = null;
    }
    let targetSource = null;
    if (face.gazeTargetWorld) {
      const contentRoot = face.entry.loader.characterContentRoot(face.entry.root);
      contentRoot.computeWorldMatrix?.(true);
      const inverseContentWorld = contentRoot.getWorldMatrix().clone();
      inverseContentWorld.invert();
      const actorSource = BABYLON.Vector3.TransformCoordinates(
        BABYLON.Vector3.FromArray(face.gazeTargetWorld),
        inverseContentWorld,
      );
      const inverseFace = BABYLON.Matrix.FromArray(faceMatrix);
      inverseFace.invert();
      targetSource = BABYLON.Vector3.TransformCoordinates(
        actorSource,
        inverseFace,
      ).asArray();
    }

    const limits = face.entry.table.eyeAngleLimits.radians;
    let nextTicksRemaining = face.gazeTicksRemaining;
    for (const [index, eyeNode] of face.entry.eyeNodes.entries()) {
      const desired = targetSource
        ? nativeFaceEyeTargetAngles({
            target: targetSource,
            eyeOrigin: [eyeNode.pos.x, eyeNode.pos.y, eyeNode.pos.z],
            verticalLimits: limits.vertical,
            horizontalLimits: limits.eyes[index],
          })
        : { vertical: 0, horizontal: 0 };
      const next = advanceNativeFaceEyeAngles(
        face.eyeAngles[index],
        desired,
        face.gazeTicksRemaining,
      );
      face.eyeAngles[index] = {
        vertical: next.vertical,
        horizontal: next.horizontal,
      };
      nextTicksRemaining = next.ticksRemaining;
      const gazeRotation = Mt5Loader.rowMultiply(
        Mt5Loader.rowRotationY(next.vertical),
        Mt5Loader.rowRotationZ(next.horizontal),
      );
      const local = Mt5Loader.rowMultiply(
        gazeRotation,
        Mt5Loader.sourceTransformMatrix(eyeNode),
      );
      routedMatrices.set(
        signedRenderKey(eyeNode),
        Mt5Loader.rowMultiply(local, faceMatrix),
      );
    }
    face.gazeTicksRemaining = nextTicksRemaining;
  }

  #applyVertices(face) {
    const positions = evaluateNativeTalkVertices({
      sourcePositions: face.entry.sourcePositions,
      vertexContributions: face.entry.table.vertexContributions,
      upperDeltas: face.upper.current,
      mouthDeltas: face.mouth.current,
    });
    const vertexBase = face.entry.primaryVertexBase;
    for (const mesh of face.entry.primaryMeshes) {
      const output = Float32Array.from(mesh.getVerticesData(
        BABYLON.VertexBuffer.PositionKind,
      ));
      for (let index = 0; index < mesh._mt5SourceVertexIndices.length; index += 1) {
        // Signed root-strip indices belong to the body attachment seam, not
        // the FACE table. They were rebound when the two surfaces met and
        // must continue following the shared head bone instead of being
        // mistaken for morphable FACE vertex zero.
        if (mesh._mt5ExternalParentVertexOffsets?.[index] < 0) continue;
        const localIndex = mesh._mt5SourceVertexIndices[index] - vertexBase;
        if (localIndex < 0 || localIndex >= face.entry.table.vertexCount) continue;
        const sourceOffset = localIndex * 3;
        const outputOffset = index * 3;
        // GPU character-rig creation bakes every mesh back into native source
        // coordinates before skinning. Keep deformed FACE vertices in that
        // same space; mirrorCharacterX is applied once by the shared content
        // root. Negating X here reflects only the deformable primary shell to
        // the back of the head while its separately skinned eye nodes remain
        // correctly on the front.
        output[outputOffset] = positions[sourceOffset];
        output[outputOffset + 1] = positions[sourceOffset + 1];
        output[outputOffset + 2] = positions[sourceOffset + 2];
      }
      mesh.updateVerticesData(
        BABYLON.VertexBuffer.PositionKind,
        output,
        false,
        false,
      );
    }
  }
}

export function createNativeAseqFacialPresentation(options) {
  return new NativeAseqFacialPresentation(options);
}
