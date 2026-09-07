import { Mt5Loader } from "../../src/Mt5Loader.js";
import { parseTmnmMotion, sampleTmnmSequence } from "../../src/TmnmMotion.js";

function nodeLocalMatrix(node, pose) {
  // TMNM stores the complete native local transform for every animated node,
  // not deltas from the CHRM bind pose. Reuse the source-transform routine so
  // its scale → X → Y → Z → translation order remains exact.
  return Mt5Loader.sourceTransformMatrix({
    ...node,
    scl: { x: pose.sx, y: pose.sy, z: pose.sz },
    rot: { x: pose.rx, y: pose.ry, z: pose.rz },
    pos: { x: pose.tx, y: pose.ty, z: pose.tz },
  });
}

function nodeWorldMatrices(nodes, poses) {
  if (nodes.length !== poses.length) {
    throw new Error("TMNM pose does not match its character node hierarchy");
  }
  const byAddress = new Map(nodes.map(node => [node.addr, node]));
  const poseByAddress = new Map(nodes.map((node, index) => [node.addr, poses[index]]));
  const world = new Map();
  const resolve = (node) => {
    if (world.has(node.addr)) return world.get(node.addr);
    const local = nodeLocalMatrix(node, poseByAddress.get(node.addr));
    const parent = byAddress.get(node.parentAddr);
    const matrix = parent
      ? Mt5Loader.rowMultiply(local, resolve(parent))
      : local;
    world.set(node.addr, matrix);
    return matrix;
  };
  for (const node of nodes) resolve(node);
  return world;
}

/** Applies exact node-oriented TMNM motion without entering the humanoid rig. */
export class NativeTmnmMotionPresentation {
  constructor({ actors, definition, loadAsset } = {}) {
    if (!actors || !definition || typeof loadAsset !== "function") {
      throw new TypeError("TMNM presentation dependencies are incomplete");
    }
    this.actors = actors;
    this.definition = definition;
    this.loadAsset = loadAsset;
    this.motion = null;
    this.active = null;
    this.programOwner = null;
    this.programRigActors = new Set();
    this.selectedSequenceIndex = definition.initialSequenceIndex;
    this.selectedSequenceElapsed = 0;
  }

  async prepare() {
    if (!this.motion) this.motion = parseTmnmMotion(await this.loadAsset(this.definition.path));
    return true;
  }

  begin(owner, actorTags) {
    if (this.active) return false;
    if (!actorTags.includes(this.definition.actorTag)) {
      this.active = { owner, actor: null, nodes: [], snapshots: [], sequence: null, frame: 0 };
      return true;
    }
    const actor = this.actors.activeActor(this.definition.actorTag);
    const nodes = actor?.model?.renderRoot?._mt5Nodes;
    if (!actor || !Array.isArray(nodes) || !this.motion) return false;
    this.active = {
      owner,
      actor,
      nodes,
      sequence: this.motion.sequences[this.selectedSequenceIndex],
      frame: 0,
      sequenceStartFrame: -this.selectedSequenceElapsed,
    };
    return Boolean(this.active.sequence);
  }

  beginProgram(owner) {
    if (this.programOwner || this.active) return false;
    this.programOwner = owner;
    this.programRigActors.clear();
    this.selectedSequenceIndex = this.definition.initialSequenceIndex;
    this.selectedSequenceElapsed = 0;
    return true;
  }

  applyResource(owner, { objectTag, resourceId } = {}) {
    if (this.programOwner !== owner) return false;
    if (String(objectTag || "").toUpperCase() !== this.definition.actorTag) {
      return false;
    }
    const sequenceIndex = this.definition.resourceIds.indexOf(resourceId);
    if (sequenceIndex < 0 || !this.motion?.sequences?.[sequenceIndex]) {
      return false;
    }
    const modelCode = this.definition.modelCodesBySequenceIndex?.[sequenceIndex];
    if (
      modelCode
      && !this.actors.selectProgramActorVariant?.(
        owner,
        this.definition.actorTag,
        modelCode,
      )
    ) {
      return false;
    }
    this.selectedSequenceIndex = sequenceIndex;
    this.selectedSequenceElapsed = 0;
    if (this.active?.actor) {
      this.active.actor = this.actors.activeActor(this.definition.actorTag);
      this.active.nodes = this.active.actor?.model?.renderRoot?._mt5Nodes || [];
    }
    return this.active?.actor
      ? this.select(this.active.owner, sequenceIndex, this.active.frame)
      : true;
  }

  endProgram(owner) {
    if (this.programOwner !== owner || this.active) return false;
    for (const actor of this.programRigActors) {
      actor.model?.loader?.applyCharacterRigWorldMatrices(
        actor.model.renderRoot,
        null,
      );
    }
    this.programRigActors.clear();
    this.programOwner = null;
    this.selectedSequenceIndex = this.definition.initialSequenceIndex;
    this.selectedSequenceElapsed = 0;
    return true;
  }

  select(owner, sequenceIndex, frame = 0) {
    if (this.active?.owner !== owner) return false;
    const sequence = this.motion.sequences[sequenceIndex];
    if (!sequence || sequence.nodeCount !== this.active.nodes.length) return false;
    this.active.sequence = sequence;
    this.active.sequenceStartFrame = frame;
    this.selectedSequenceIndex = sequenceIndex;
    this.selectedSequenceElapsed = 0;
    return this.apply(owner, frame);
  }

  apply(owner, frame) {
    const active = this.active;
    if (active?.owner !== owner) return false;
    if (!active.actor) return true;
    if (!active.sequence) return false;
    active.frame = frame;
    const elapsed = Math.max(0, frame - active.sequenceStartFrame);
    const sequenceFrame = active.sequence.playbackKind === "loop"
      && active.sequence.durationFrames > 0
      ? elapsed % active.sequence.durationFrames
      : Math.min(active.sequence.durationFrames, elapsed);
    const poses = sampleTmnmSequence(this.motion, active.sequence, sequenceFrame);
    if (poses.length !== active.nodes.length) return false;
    // Archive-local actors use the shared GPU character rig. Updating each
    // source node's Babylon transform has no effect on the already-skinned
    // merged meshes; install the authored absolute world matrices into the
    // rig instead.
    const applied = active.actor.model.loader.applyCharacterRigResolvedWorldMatrices(
      active.actor.model.renderRoot,
      nodeWorldMatrices(active.nodes, poses),
    ) === true;
    if (applied && this.programOwner) this.programRigActors.add(active.actor);
    return applied;
  }

  end(owner, reason = "stopped") {
    if (this.active?.owner !== owner) return false;
    if (this.active.actor && this.active.sequence) {
      this.selectedSequenceElapsed = Math.max(
        0,
        this.active.frame - this.active.sequenceStartFrame,
      );
    }
    const preserve = Boolean(
      this.programOwner && (reason === "complete" || reason === "replaced"),
    );
    if (!preserve) {
      this.active.actor?.model?.loader?.applyCharacterRigWorldMatrices(
        this.active.actor.model.renderRoot,
        null,
      );
    }
    this.active = null;
    return true;
  }

  reset() {
    if (this.active || this.programOwner) return false;
    this.programRigActors.clear();
    this.selectedSequenceIndex = this.definition.initialSequenceIndex;
    this.selectedSequenceElapsed = 0;
    return true;
  }
}

export function createNativeTmnmMotionPresentation(options) {
  return new NativeTmnmMotionPresentation(options);
}
