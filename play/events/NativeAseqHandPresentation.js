import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import {
  deformNativeHandVertices,
  nativeHandPoseTarget,
  nativeHandAttachmentMatrix,
  NATIVE_HAND_BONE_COUNT,
  parseNativeHandRig,
  stepNativeHandPoseTransition,
} from "../../src/NativeHandRig.js";
import {
  replaceBoundAttachmentSurface,
  restoreDetailedSurface,
} from "../../src/NativeSurfaceOwnership.js";
import { bindBodyAttachmentParentVertices, applyBodyAttachmentSeam } from "../../src/NativeAttachmentSeam.js";
import {
  createNativeMhndPoseState,
  initializeNativeMhndPoseState,
  NATIVE_MHND_BODY_CHANNELS,
  nativeMhndTargetWords,
  resetNativeMhndPoseState,
  signedNativeMhndWord,
  startNativeMhndPoseTransition,
  stepNativeMhndPoseTransition,
} from "../../src/NativeMhndPose.js";

const FIXED_TURN_TO_RADIANS = Math.PI * 2 / 0x10000;

function fixedTurnWord(radians) {
  return signedNativeMhndWord(Math.round(radians / FIXED_TURN_TO_RADIANS));
}

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

function integrateBodyHandSurface({
  actorModel,
  bodyNode,
  detailedSide,
  actorTag,
  sideName,
}) {
  const seamBindings = new Map();
  const boundExternalParentVertexCount = bindBodyAttachmentParentVertices({
    bodyModelRoot: actorModel.renderRoot,
    bodyAttachmentNode: bodyNode,
    bodyLoader: actorModel.loader,
    detailedAttachmentNode: detailedSide.primaryNode,
    detailedLoader: detailedSide.loader,
    seamBindings,
  });
  if (!boundExternalParentVertexCount) {
    throw new Error(`AUTH HAND ${sideName} for ${actorTag} has no authored wrist seam`);
  }
  // Signed source indices close the wrist on the existing animated body
  // vertices. The detailed shell owns the whole old hand, not a guessed cut
  // plane leaving coarse palm triangles protruding through the new grip.
  return { ...replaceBoundAttachmentSurface(actorModel.renderRoot, bodyNode),
    boundExternalParentVertexCount, seamBindings };
}

function configureDetailedHandMaterials(root) {
  const materials = new Set(
    (root?.getChildMeshes?.(false) || [])
      .map(mesh => mesh.material)
      .filter(Boolean),
  );
  for (const material of materials) {
    material.backFaceCulling = true;
    material.sideOrientation = BABYLON.Material.ClockWiseSideOrientation;
    material.twoSidedLighting = false;
    material.separateCullingPass = false;
  }
}

function handMatrix(actorModel, bodyNode, bodyRenderKey, sideFlag) {
  if (actorModel?.latestControllerFamily) {
    // Native HAND consumer 0x0c0de682 asks MOMT for type 12/18. The body
    // hand node also includes MHND's low-detail wrist rotation; reusing it
    // rotates the detailed grip away from a FIXO prop on the same wrist.
    const controlId = sideFlag === 1 ? 12 : 18;
    const controls = actorModel.latestControllerFamily.nodes.filter(node => node.type === controlId);
    const matrix = controls.length === 1 ? actorModel.latestControllerMatrices?.[controls[0].index] : null;
    if (!matrix || matrix.length !== 16) throw new Error(`Detailed HAND wrist controller ${controlId} is unavailable`);
    return matrix;
  }
  // An unanimated model has no MOMT pose yet; use its authored bind pose.
  const renderRoot = actorModel?.renderRoot;
  const matrices = renderRoot?._mt5CharacterWorldMatrices
    || renderRoot?._mt5CharacterGpuRig?.worldMatrices;
  return matrices?.get(bodyNode.addr)
    || actorModel?.latestRetargetedRoutes?.get(bodyRenderKey)
    || actorModel?.loader?.sourceWorldMatrixForNode?.(bodyNode)
    || null;
}

function bodyHandNodes(renderRoot, rootNode) {
  const nodes = renderRoot?._mt5Nodes || [];
  const descendants = new Set([rootNode.addr]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (!descendants.has(node.addr) && descendants.has(node.parentAddr)) {
        descendants.add(node.addr);
        changed = true;
      }
    }
  }
  return nodes.filter(node => descendants.has(node.addr));
}

function bodyMhndSourceWords(renderRoot, channel) {
  const words = new Int32Array(10);
  const assigned = new Set();
  for (const control of channel.controls) {
    const node = renderNode(renderRoot, control.renderKey);
    if (!node) continue;
    for (const axis of ["rx", "ry", "rz"]) {
      const wordIndex = control[axis];
      if (!Number.isInteger(wordIndex) || assigned.has(wordIndex)) continue;
      words[wordIndex] = fixedTurnWord(node.rot[axis.slice(1)]);
      assigned.add(wordIndex);
    }
  }
  return words;
}

function applyBodyMhndPose(hand, { advancePose }) {
  const actorModel = hand.actor.model;
  const renderRoot = actorModel.renderRoot;
  const allNodesByAddress = new Map(
    (renderRoot?._mt5Nodes || []).map(node => [node.addr, node]),
  );
  const currentMatrices = renderRoot?._mt5CharacterWorldMatrices
    || renderRoot?._mt5CharacterGpuRig?.worldMatrices;
  const routes = new Map(actorModel.latestRetargetedRoutes || []);
  let engaged = false;

  for (const activeSide of Object.values(hand.sides)) {
    const state = activeSide.bodyPose;
    if (!state.engaged) continue;
    engaged = true;
    if (advancePose) stepNativeMhndPoseTransition(state);

    const nodes = activeSide.bodyNodes;
    const nodeByAddress = new Map(nodes.map(node => [node.addr, node]));
    const controlled = new Map(activeSide.bodyChannel.controls.map(
      control => [control.renderKey, control],
    ));
    const worldByAddress = new Map();
    const worldFor = (node) => {
      if (worldByAddress.has(node.addr)) return worldByAddress.get(node.addr);
      const parent = nodeByAddress.get(node.parentAddr);
      const sourceParent = allNodesByAddress.get(node.parentAddr);
      const parentWorld = parent
        ? worldFor(parent)
        : currentMatrices?.get(node.parentAddr)
          || (
            sourceParent
              ? routes.get(signedRenderKey(sourceParent))
                || actorModel.loader.sourceWorldMatrixForNode?.(sourceParent)
              : null
          )
          || null;
      if (!parentWorld) return null;
      const control = controlled.get(signedRenderKey(node));
      const rotations = {
        rx: node.rot.x,
        ry: node.rot.y,
        rz: node.rot.z,
      };
      if (control) {
        for (const axis of ["rx", "ry", "rz"]) {
          if (Number.isInteger(control[axis])) {
            rotations[axis] = signedNativeMhndWord(
              state.current[control[axis]],
            ) * FIXED_TURN_TO_RADIANS;
          }
        }
      }
      const local = control
        ? Mt5Loader.sourceTransformMatrix(node, rotations, {
            applyMode: "absolute",
          })
        : Mt5Loader.sourceTransformMatrix(node);
      const world = Mt5Loader.rowMultiply(local, parentWorld);
      worldByAddress.set(node.addr, world);
      routes.set(signedRenderKey(node), world);
      return world;
    };
    for (const node of nodes) worldFor(node);
  }

  if (!engaged) return true;
  actorModel.loader.applyCharacterRigWorldMatrices(renderRoot, routes);
  return true;
}

function sourceVertices(buffer, primaryNode, actorTag, sideName, vertexCount) {
  const offset = primaryNode?.model?.vertexAddr;
  const count = primaryNode?.model?.nbVertex;
  if (
    count !== vertexCount
    || !Number.isInteger(offset)
    || offset < 0
    || offset + count * 24 > buffer.byteLength
  ) throw new Error(`${actorTag} ${sideName} HAND vertex source is invalid`);
  const view = new DataView(buffer);
  return Float32Array.from({ length: count * 6 }, (_, index) => (
    view.getFloat32(offset + index * 4, true)
  ));
}

function deformationMeshes(primaryNode, actorTag, sideName) {
  const meshes = (primaryNode?.mesh?.getChildMeshes?.(false) || []).filter(
    mesh => (
      mesh._mt5SourceVertexIndices?.length === mesh.getTotalVertices()
      && mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind)
      && mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind)
    ),
  );
  if (meshes.length === 0) {
    throw new Error(`${actorTag} ${sideName} HAND has no deformable meshes`);
  }
  return meshes.map((mesh) => {
    const positions = Float32Array.from(
      mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind),
    );
    const normals = Float32Array.from(
      mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind),
    );
    mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, positions, true);
    mesh.setVerticesData(BABYLON.VertexBuffer.NormalKind, normals, true);
    return {
      mesh,
      sourceVertexIndices: Uint16Array.from(mesh._mt5SourceVertexIndices),
      positions,
      normals,
    };
  });
}

function poseState() {
  return {
    current: new Int32Array(NATIVE_HAND_BONE_COUNT * 3),
    target: new Int32Array(NATIVE_HAND_BONE_COUNT * 3),
    remainingNativeTicks: 0,
    active: false,
    dirty: true,
  };
}

function deformSide(side, rig) {
  const deformed = deformNativeHandVertices(
    rig,
    side.sourceVertices,
    side.pose.current,
    side.sideFlag,
  );
  for (const record of side.deformationMeshes) {
    record.sourceVertexIndices.forEach((sourceIndex, vertexIndex) => {
      if (record.mesh._mt5ExternalParentVertexOffsets?.[vertexIndex] < 0) {
        const offset = vertexIndex * 3;
        record.positions.set(record.mesh._mt5SourcePositions.slice(offset, offset + 3), offset);
        record.normals.set(record.mesh._mt5SourceNormals.slice(offset, offset + 3), offset);
        return;
      }
      const sourceOffset = sourceIndex * 6;
      const outputOffset = vertexIndex * 3;
      record.positions[outputOffset] = deformed[sourceOffset];
      record.positions[outputOffset + 1] = deformed[sourceOffset + 1];
      record.positions[outputOffset + 2] = deformed[sourceOffset + 2];
      record.normals[outputOffset] = deformed[sourceOffset + 3];
      record.normals[outputOffset + 1] = deformed[sourceOffset + 4];
      record.normals[outputOffset + 2] = deformed[sourceOffset + 5];
    });
    record.mesh.updateVerticesData(
      BABYLON.VertexBuffer.PositionKind,
      record.positions,
    );
    record.mesh.updateVerticesData(
      BABYLON.VertexBuffer.NormalKind,
      record.normals,
    );
    record.mesh.refreshBoundingInfo();
  }
  side.pose.dirty = false;
}

export class NativeAseqHandPresentation {
  constructor({ scene, actors, definitions, loadAsset } = {}) {
    if (
      !scene
      || typeof actors?.activeActor !== "function"
      || !definitions
      || typeof loadAsset !== "function"
    ) {
      throw new TypeError("AUTH hand presentation requires scene, actors, data, and assets");
    }
    this.scene = scene;
    this.actors = actors;
    this.definitions = new Map(Object.entries(definitions).map(
      ([actorTag, definition]) => [String(actorTag).toUpperCase(), definition],
    ));
    this.loadAsset = loadAsset;
    this.entries = new Map();
    this.pending = new Map();
    this.active = null;
  }

  async prepare({ actors: actorTags } = {}) {
    const requested = [...new Set((actorTags || []).map(
      value => String(value || "").toUpperCase(),
    ))].filter(actorTag => this.definitions.has(actorTag));
    // Successful entries remain owned by the reusable cache. Wait for all
    // actors before exposing failure so none can repopulate it after rollback.
    const results = await Promise.allSettled(requested.map(
      actorTag => this.#prepareActor(actorTag),
    ));
    const failed = results.find(result => result.status === "rejected");
    if (failed) throw failed.reason;
    return true;
  }

  begin(owner, actorTags) {
    if (this.active) throw new Error("AUTH hands are already owned");
    const hands = new Map();
    try {
      for (const value of actorTags) {
        const actorTag = String(value || "").toUpperCase();
        const entry = this.entries.get(actorTag);
        if (this.definitions.has(actorTag) && !entry) {
          throw new Error(`AUTH HAND assets for ${actorTag} were not prepared`);
        }
        if (!entry) continue;
        const actor = this.actors.activeActor(actorTag);
        const actorModel = actor?.model;
        const actualModelCode = actorModel?.modelCode
          || actorModel?.renderRoot?.metadata?.scheduledActorModelCode
          || null;
        if (actualModelCode && actualModelCode !== entry.definition.bodyModelCode) {
          throw new Error(
            `AUTH HAND ${entry.definition.handCode} does not match ${actualModelCode}`,
          );
        }
        if (!actorModel?.renderRoot || !actorModel?.loader) {
          throw new Error(`AUTH HAND attachment for ${actorTag} is unavailable`);
        }
        const activeSides = {};
        const hand = { actor, entry, sides: activeSides };
        hands.set(actorTag, hand);
        for (const sideName of ["left", "right"]) {
          const bodyRenderKey = entry.definition.bodyHandRenderKeys[sideName];
          const bodyNode = renderNode(actorModel.renderRoot, bodyRenderKey, {
            requireModel: true,
          });
          const side = entry[sideName];
          if (!bodyNode?.mesh || (entry.definition.mode !== "body-only"
            && (!side?.root || !side.primaryNode))) {
            throw new Error(
              `AUTH HAND ${sideName} attachment for ${actorTag} is unavailable`,
            );
          }
          const bodyChannel = NATIVE_MHND_BODY_CHANNELS[sideName];
          const bodyPose = entry.bodyPoses[sideName];
          if (!bodyPose.engaged) {
            initializeNativeMhndPoseState(
              bodyPose,
              bodyMhndSourceWords(actorModel.renderRoot, bodyChannel),
            );
          }
          activeSides[sideName] = {
            bodyNode,
            bodyRenderKey,
            bodyNodes: bodyHandNodes(actorModel.renderRoot, bodyNode),
            bodyChannel,
            bodyPose,
            bodySurface: null,
            detailedActive: false,
            side,
            actorTag,
            sideName,
          };
          if (!side.root) continue;
          side.root.parent = actorModel.renderRoot;
          side.root.position.set(0, 0, 0);
          side.root.rotationQuaternion = null;
          side.root.rotation.set(0, 0, 0);
          side.root.scaling.set(1, 1, 1);
          side.root.setEnabled(false);
          if (side.detailedRequested) {
            this.#activateDetailed(hand, activeSides[sideName]);
          }
        }
      }
      this.active = { owner, hands };
      if (!this.apply(owner, { advancePose: false })) {
        throw new Error("AUTH HAND initial pose could not be applied");
      }
      return true;
    } catch (error) {
      for (const hand of hands.values()) this.#releaseHand(hand);
      this.active = null;
      throw error;
    }
  }

  apply(owner, { advancePose = true } = {}) {
    if (this.active?.owner !== owner) return false;
    for (const hand of this.active.hands.values()) {
      if (!applyBodyMhndPose(hand, { advancePose })) return false;
      for (const activeSide of Object.values(hand.sides)) {
        if (!activeSide.detailedActive) continue;
        if (
          advancePose
          && stepNativeHandPoseTransition(activeSide.side.pose)
        ) {
          activeSide.side.pose.dirty = true;
        }
        if (activeSide.side.pose.dirty) {
          deformSide(activeSide.side, hand.entry.rig);
        }
        const attachment = handMatrix(
          hand.actor.model,
          activeSide.bodyNode,
          activeSide.bodyRenderKey,
          activeSide.side.sideFlag,
        );
        if (!attachment) return false;
        const matrix = nativeHandAttachmentMatrix(attachment, activeSide.side.componentRotationRaw || [0, 0, 0]);
        activeSide.side.loader.applyCharacterRigWorldMatrices(
          activeSide.side.root,
          new Map([[activeSide.side.rootRenderKey, matrix]]),
        );
        // As with FACE, borrowed wrist vertices follow the body's actual skin
        // weights after both rigs have their current matrices, even while the
        // finger pose itself is unchanged.
        for (const record of activeSide.side.deformationMeshes) {
          applyBodyAttachmentSeam(activeSide.bodySurface, record.mesh, record.positions);
          record.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, record.positions);
        }
      }
    }
    return true;
  }

  play(owner, command) {
    if (this.active?.owner !== owner) return false;
    const hand = this.active.hands.get(String(command.actorTag || "").toUpperCase());
    if (!hand) return false;
    if (command.name === "hand-component") {
      const side = hand.sides?.[command.side]?.side;
      if (!side?.root || ![0x15, 0x2a].includes(command.componentMask)
        || command.rotationRaw?.length !== 3 || !command.rotationRaw.every(Number.isInteger)) return false;
      const previous = side.componentRotationRaw || [0, 0, 0];
      // 00eb writes separate controller words. A later 005e finger pose must
      // not clear them, and this write alone does not acquire the hand surface.
      side.componentRotationRaw = command.rotationRaw.map((word, index) =>
        command.componentMask === 0x15 ? word | 0 : (previous[index] + word) | 0);
      return true;
    }
    if (command.name === "detailed-hand-default") {
      if (!Array.isArray(command.sides) || command.sides.length < 1) return false;
      for (const sideName of command.sides) {
        const activeSide = hand.sides?.[sideName];
        if (!activeSide) return false;
        activeSide.side.detailedRequested = true;
        if (!activeSide.detailedActive) this.#activateDetailed(hand, activeSide);
      }
      return true;
    }
    if (!Number.isInteger(command.durationNativeTicks)) return false;
    if (command.name === "body-hand-pose") {
      if (
        !Number.isInteger(command.channel)
        || command.channel < 0
        || command.channel > 2
        || !Number.isInteger(command.targetIndex)
      ) return false;
      const selectedSides = command.channel === 2
        ? ["right", "left"]
        : [command.channel === 0 ? "right" : "left"];
      for (const sideName of selectedSides) {
        const activeSide = hand.sides[sideName];
        const target = nativeMhndTargetWords(
          command.targetIndex,
          activeSide.bodyChannel.subcontrollerIndex,
        );
        if (!target || !startNativeMhndPoseTransition(
          activeSide.bodyPose,
          target,
          command.durationNativeTicks,
        )) return false;
        // Only a source-proven reset + MHND handoff relinquishes the detailed
        // surface. An ordinary MHND update can coexist with detailed hands.
        if (command.releaseDetailed === true) {
          activeSide.side.componentRotationRaw = [0, 0, 0];
          activeSide.side.detailedRequested = false;
          this.#deactivateDetailed(activeSide);
        }
      }
      return true;
    }
    if (command.name === "hand-pose") {
      const activeSide = hand.sides?.[command.side];
      if (!activeSide) return false;
      if (!activeSide.detailedActive) this.#activateDetailed(hand, activeSide);
      const side = activeSide.side;
      side.detailedRequested = true;
      side.pose.target = nativeHandPoseTarget(command.vectors);
      side.pose.remainingNativeTicks = command.durationNativeTicks;
      side.pose.active = true;
      return true;
    }
    return false;
  }

  reset() {
    if (this.active) return false;
    for (const entry of this.entries.values()) {
      for (const side of [entry.left, entry.right]) {
        side.pose.current.fill(0);
        side.pose.target.fill(0);
        side.pose.remainingNativeTicks = 0;
        side.pose.active = false;
        side.pose.dirty = true;
        side.detailedRequested = false;
        side.componentRotationRaw = [0, 0, 0];
      }
      for (const bodyPose of Object.values(entry.bodyPoses)) {
        resetNativeMhndPoseState(bodyPose);
      }
    }
    return true;
  }

  end(owner) {
    if (this.active?.owner !== owner) return false;
    for (const hand of this.active.hands.values()) this.#releaseHand(hand);
    this.active = null;
    return true;
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
    // MHND animates the actor's own fingers. Requiring a separate detailed
    // resource for these commands wrongly excludes body-only actors.
    if (definition.mode === "body-only") return {
      actorTag, definition,
      left: { root: null, pose: poseState(), detailedRequested: false },
      right: { root: null, pose: poseState(), detailedRequested: false },
      bodyPoses: { left: createNativeMhndPoseState(), right: createNativeMhndPoseState() },
    };
    const [leftBuffer, rightBuffer, rigBuffer, textureBuffer] = await Promise.all([
      verifiedAsset(this.loadAsset, definition.left.model, `${actorTag} left HAND model`),
      verifiedAsset(this.loadAsset, definition.right.model, `${actorTag} right HAND model`),
      verifiedAsset(this.loadAsset, definition.rig, `${actorTag} HM rig`),
      // Archive-local CHRM hands keep their textures in the package PKF;
      // global MT5 hands embed them. Both use the same attachment renderer.
      definition.texturePack
        ? verifiedAsset(this.loadAsset, definition.texturePack, `${actorTag} HAND textures`)
        : null,
    ]);
    let rig;
    try {
      rig = parseNativeHandRig(rigBuffer, definition.rig);
    } catch (error) {
      throw new Error(`${actorTag} HM rig differs from its generated layout`, {
        cause: error,
      });
    }
    const loadSide = async (sideName, buffer) => {
      const sideDefinition = definition[sideName];
      const loader = new Mt5Loader(this.scene, {
        backFaceCulling: false,
        mirrorCharacterX: true,
        nativeTwiddledRectUV: true,
        textureAddressMode: "clamp",
        characterRigMode: "gpu",
        orientTriangleWindingToNormals: true,
        materialSideOrientation: null,
      });
      const suffix = sideName === "left" ? "TL" : "TR";
      const [root] = await loader.load(buffer, textureBuffer, {
        sourceFilename: `${definition.handCode}_${suffix}.MT5`,
      });
      if (!root) throw new Error(`${actorTag} ${sideName} HAND model did not render`);
      try {
        configureDetailedHandMaterials(root);
        const primaryNode = renderNode(root, sideDefinition.rootRenderKey, {
          requireModel: true,
        });
        if (primaryNode?.model?.nbVertex !== rig.vertexCount) {
          throw new Error(`${actorTag} ${sideName} HAND has an unexpected vertex count`);
        }
        root.name = `native_hand_${actorTag}_${sideName}`;
        root.setEnabled(false);
        for (const node of root.getDescendants(false)) {
          node.isPickable = false;
          node.checkCollisions = false;
          node.metadata = { ...(node.metadata || {}), cameraBlocker: false };
        }
        return {
          definition: sideDefinition,
          loader,
          root,
          primaryNode,
          rootRenderKey: sideDefinition.rootRenderKey,
          sourceVertices: sourceVertices(
            buffer,
            primaryNode,
            actorTag,
            sideName,
            rig.vertexCount,
          ),
          deformationMeshes: deformationMeshes(primaryNode, actorTag, sideName),
          sideFlag: sideName === "left" ? 1 : 2,
          pose: poseState(),
          detailedRequested: false,
        };
      } catch (error) {
        root.dispose(false, true);
        throw error;
      }
    };
    // Publish the pair atomically. A failed side disposes its own root, but
    // its successful sibling has not entered the cache yet and must also be
    // released. Settle both loads first so rollback cannot race a late root.
    const sides = await Promise.allSettled([
      loadSide("left", leftBuffer),
      loadSide("right", rightBuffer),
    ]);
    const failed = sides.find(side => side.status === "rejected");
    if (failed) {
      for (const side of sides) {
        if (side.status === "fulfilled") side.value.root.dispose(false, true);
      }
      throw failed.reason;
    }
    const [left, right] = sides.map(side => side.value);
    return {
      actorTag,
      definition,
      rig,
      left,
      right,
      bodyPoses: {
        left: createNativeMhndPoseState(),
        right: createNativeMhndPoseState(),
      },
    };
  }

  #activateDetailed(hand, activeSide) {
    if (activeSide.detailedActive) return;
    const side = activeSide.side;
    if (!side.root) throw new Error(`AUTH detailed HAND assets for ${activeSide.actorTag} are unavailable`);
    side.root.setEnabled(true);
    try {
      activeSide.bodySurface = integrateBodyHandSurface({
        actorModel: hand.actor.model,
        bodyNode: activeSide.bodyNode,
        detailedSide: side,
        actorTag: activeSide.actorTag,
        sideName: activeSide.sideName,
      });
      activeSide.detailedActive = true;
      side.pose.dirty = true;
    } catch (error) {
      side.root.setEnabled(false);
      restoreDetailedSurface(activeSide.bodySurface);
      activeSide.bodySurface = null;
      throw error;
    }
  }

  #releaseHand(hand) {
    for (const activeSide of Object.values(hand.sides)) {
      this.#deactivateDetailed(activeSide);
      if (activeSide.side.root) activeSide.side.root.parent = null;
    }
  }

  #deactivateDetailed(activeSide) {
    activeSide.side.root?.setEnabled(false);
    restoreDetailedSurface(activeSide.bodySurface);
    activeSide.bodySurface?.seamBindings.clear();
    activeSide.bodySurface = null;
    activeSide.detailedActive = false;
  }
}

export function createNativeAseqHandPresentation(options) {
  return new NativeAseqHandPresentation(options);
}
