import { parseAuthCamera } from "../../src/AuthCamera.js";
import { parseAuthMovement } from "../../src/AuthMovement.js";
import {
  parseAuthSequence,
  resolveAuthMotions,
} from "../../src/AuthSequence.js";
import { parseAuthStrings } from "../../src/AuthStrings.js";
import { MotnLoader } from "../../src/MotnLoader.js";
import { NativeAseqAudioCatalog } from "./NativeAseqAudioCatalog.js";
import {
  enrichNativeAseqActivityFrames,
  validateNativeAseqActivityMetadata,
} from "./NativeAseqActivityCommands.js";

const MANIFEST_SCHEMA = "new-yokosuka-aseq-activity-pack-v1";

function requireInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${label} must be an integer of at least ${minimum}`);
  }
  return value;
}

function requireText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new TypeError(`${label} is required`);
  return text;
}

function bindingKey(slot, primaryPointer, secondaryPointer) {
  return `${slot}:${primaryPointer}:${secondaryPointer}`;
}

function embeddedBindingKey(slot, activityId) {
  return `embedded:${slot}:${activityId}`;
}

function byteView(input, label) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError(`${label} loader result must be binary data`);
}

function outputByPath(manifest) {
  const outputs = new Map();
  for (const output of manifest.outputs || []) {
    const path = requireText(output?.path, "activity asset path");
    const byteLength = requireInteger(
      output?.byteLength,
      `activity asset ${path} byte length`,
    );
    const sha256 = requireText(output?.sha256, `activity asset ${path} SHA-256`);
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new Error(`activity asset ${path} has an invalid SHA-256`);
    }
    if (outputs.has(path)) throw new Error(`duplicate activity asset ${path}`);
    outputs.set(path, Object.freeze({ path, byteLength, sha256 }));
  }
  return outputs;
}

async function sha256Hex(bytes) {
  if (typeof globalThis.crypto?.subtle?.digest !== "function") {
    throw new Error("AUTH activity SHA-256 verifier is unavailable");
  }
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", bytes),
  );
  return [...digest].map(value => value.toString(16).padStart(2, "0")).join("");
}

export class NativeAseqActivityCatalog {
  constructor(manifest) {
    if (manifest?.schema !== MANIFEST_SCHEMA) {
      throw new Error(`unsupported AUTH activity manifest ${manifest?.schema || "<missing>"}`);
    }
    this.outputs = outputByPath(manifest);
    this.presentationMetadata = validateNativeAseqActivityMetadata(manifest);
    this.motionBanks = new Map();
    for (const record of manifest.motionBanks || []) {
      const bank = requireInteger(record?.bank, "AUTH motion bank");
      const path = requireText(record?.path, `AUTH motion bank ${bank} path`);
      const output = this.outputs.get(path);
      if (
        !output
        || output.byteLength !== record.byteLength
        || output.sha256 !== record.sha256
      ) {
        throw new Error(`AUTH motion bank ${bank} is not an exact manifest output`);
      }
      if (this.motionBanks.has(bank)) throw new Error(`duplicate AUTH motion bank ${bank}`);
      this.motionBanks.set(bank, output);
    }

    this.activities = new Map();
    for (const record of manifest.activities || []) {
      const slot = requireInteger(record?.slot, "AUTH activity slot");
      const activityId = requireText(record?.activityId, "AUTH activity ID");
      const embedded = record?.binding?.kind === "map-embedded-slot";
      const primaryPointer = embedded ? null : requireInteger(
        record?.primaryPointer,
        "AUTH activity primary pointer",
      );
      const secondaryPointer = embedded ? null : requireInteger(
        record?.secondaryPointer,
        "AUTH activity secondary pointer",
      );
      const archiveMember = requireText(
        record?.archiveMember,
        `AUTH activity ${activityId} archive member`,
      );
      const assetPath = [...this.outputs.keys()].find(
        path => path.endsWith(`/${archiveMember}`),
      );
      if (
        !assetPath
        || this.outputs.get(assetPath).byteLength !== record.byteLength
        || this.outputs.get(assetPath).sha256 !== record.sha256
      ) {
        throw new Error(`AUTH activity ${activityId} has no exact manifest output`);
      }
      const key = embedded
        ? embeddedBindingKey(slot, activityId)
        : bindingKey(slot, primaryPointer, secondaryPointer);
      if (this.activities.has(key)) throw new Error(`duplicate AUTH activity binding ${key}`);
      this.activities.set(key, Object.freeze({
        ...record,
        slot,
        primaryPointer,
        secondaryPointer,
        activityId,
        archiveMember,
        assetPath,
      }));
    }
    if (this.activities.size === 0) throw new Error("AUTH activity manifest is empty");
  }

  resolve({ slot, binding } = {}) {
    const selectedSlot = requireInteger(slot, "AUTH activity slot");
    const key = binding?.kind === "map-embedded-slot"
      ? embeddedBindingKey(
          selectedSlot,
          requireText(binding?.activityId, "embedded AUTH activity ID"),
        )
      : bindingKey(
          selectedSlot,
          requireInteger(binding?.primaryPointer, "AUTH activity primary pointer"),
          requireInteger(binding?.secondaryPointer, "AUTH activity secondary pointer"),
        );
    const activity = this.activities.get(key);
    if (!activity) throw new Error(`AUTH activity binding ${key} is not catalogued`);
    return activity;
  }

  has({ slot, binding } = {}) {
    if (
      binding?.kind === "map-embedded-slot"
      && Number.isSafeInteger(slot)
      && slot >= 0
      && typeof binding.activityId === "string"
    ) {
      return this.activities.has(embeddedBindingKey(slot, binding.activityId));
    }
    if (
      !Number.isSafeInteger(slot)
      || slot < 0
      || !Number.isSafeInteger(binding?.primaryPointer)
      || binding.primaryPointer < 0
      || !Number.isSafeInteger(binding?.secondaryPointer)
      || binding.secondaryPointer < 0
    ) return false;
    return this.activities.has(bindingKey(
      slot,
      binding.primaryPointer,
      binding.secondaryPointer,
    ));
  }

  embeddedBindings() {
    return Object.freeze([...this.activities.values()]
      .filter(activity => activity.binding?.kind === "map-embedded-slot")
      .map(activity => Object.freeze({
        slot: activity.slot,
        activityId: activity.activityId,
      })));
  }

  selectionsForProgram(program, entryFunction = program?.entryFunction) {
    if (!program || !Array.isArray(program.functions)) {
      throw new TypeError("AUTH preparation requires a resolved native program");
    }
    const selected = new Map();
    const add = selection => {
      const record = this.resolve(selection);
      selected.set(record.activityId, selection);
    };
    if (program.preview) {
      const selections = program.preview.activities
        || (program.preview.activity ? [program.preview.activity] : []);
      for (const selection of selections) add(selection);
    } else {
      // Follow both sides of branches and all child/direct calls. Preparation
      // must cover every possible shot from this entry, not just the first
      // frame's path, but unrelated entries in the same room are not required.
      const functions = new Map(program.functions.map(fn => [fn.id, fn]));
      const pending = [entryFunction];
      const visited = new Set();
      const actions = [];
      while (pending.length > 0) {
        const functionId = pending.pop();
        if (visited.has(functionId)) continue;
        visited.add(functionId);
        const fn = functions.get(functionId);
        if (!fn) throw new Error(`AUTH program ${program.id} function ${functionId} is unavailable`);
        for (const action of fn.blocks.flatMap(block => block.actions || [])) {
          actions.push(action);
          if (action.kind === "directCall" || action.kind === "childCoroutineLaunch") {
            const targets = action.targetFileOffsets || [action.targetFileOffset];
            for (const target of targets) pending.push(target);
          }
        }
      }
      const calls = new Set(actions.map(action => action.callFileOffset));
      for (const binding of program.operation013eStaticBindings || []) {
        if (binding.callFileOffsets?.some(offset => calls.has(offset))) {
          add({ slot: binding.slot, binding });
        }
      }
      const embedded = [...this.activities.values()].filter(
        record => record.binding?.kind === "map-embedded-slot",
      );
      const exactEmbeddedSlots = new Set();
      for (const owner of program.authResourceSelection?.ownerCalls || []) {
        if (!calls.has(owner.callFileOffset)) continue;
        const record = embedded.find(value => value.slot === owner.slot
          && value.sha256 === owner.resource?.sha256);
        if (!record) throw new Error(`AUTH program ${program.id} embedded slot ${owner.slot} is unavailable`);
        add({ slot: record.slot, binding: { kind: "map-embedded-slot", activityId: record.activityId } });
        exactEmbeddedSlots.add(record.slot);
      }
      for (const action of actions) {
        if (action.operationId !== 0x0050) continue;
        const slot = action.arguments?.[0];
        // Negative 0x0050 modes poll/cancel rather than select an activity.
        if (slot?.kind === "constant" && (slot.value | 0) < 0) continue;
        if (slot?.kind !== "constant") {
          // Merely having some reachable slot installs does not establish the
          // complete range of a dynamic selector. Require producer evidence
          // before claiming every possible activity has been prepared.
          throw new Error(`AUTH program ${program.id} has unresolved activity dependencies at ${action.callFileOffset}`);
        }
        if (exactEmbeddedSlots.has(slot.value)) continue;
        const records = embedded.filter(record => record.slot === slot.value);
        if (records.length > 1) {
          throw new Error(`AUTH program ${program.id} embedded slot ${slot.value} has no exact resource selection`);
        }
        for (const record of records) {
          add({ slot: record.slot, binding: { kind: "map-embedded-slot", activityId: record.activityId } });
        }
        if (!records.length && ![...selected.values()].some(value => value.slot === slot.value)) {
          throw new Error(`AUTH program ${program.id} slot ${slot.value} has no reachable resource binding`);
        }
      }
    }
    if (selected.size === 0) {
      throw new Error(`AUTH program ${program.id} selects no packaged activities`);
    }
    return [...selected.values()];
  }
}

function resolveCommand(command, prepared, motionByOffset, audioCatalog) {
  if (command.name === "camera") {
    const camera = prepared.camera.cameras[command.cameraIndex];
    if (!camera) throw new Error(`AUTH camera ${command.cameraIndex} is unavailable`);
    return Object.freeze({ ...command, camera });
  }
  if (command.name === "move") {
    const movement = prepared.movement.actors[command.movementIndex];
    if (!movement || movement.tag !== command.actorTag) {
      throw new Error(`AUTH movement ${command.movementIndex} does not match ${command.actorTag}`);
    }
    return Object.freeze({ ...command, movement });
  }
  if (command.name === "motion") {
    const motion = motionByOffset.get(command.recordOffset);
    if (
      !motion?.motionValid
      || !motion.motionName
      || !motion.sequence
    ) {
      throw new Error(`AUTH motion at 0x${command.recordOffset.toString(16)} is unavailable`);
    }
    return Object.freeze({ ...command, motion });
  }
  if (command.name === "voice" || command.name === "sound") {
    const stringValue = prepared.strings.strings[command.stringIndex];
    if (typeof stringValue !== "string") {
      throw new Error(`AUTH ${command.name} string ${command.stringIndex} is unavailable`);
    }
    if (command.name === "sound" && command.stop === true) {
      return Object.freeze({
        ...command,
        stringValue,
        audio: Object.freeze({ kind: "sound", silent: true, stop: true }),
      });
    }
    if (!audioCatalog) throw new Error("AUTH activity audio catalog is unavailable");
    return Object.freeze({
      ...command,
      stringValue,
      audio: audioCatalog.resolve(command, stringValue),
    });
  }
  return command;
}

function audioCatalogsBySlot(records) {
  const catalogs = new Map();
  for (const record of records || []) {
    const slot = requireInteger(record?.activitySlot, "AUTH audio activity slot");
    if (catalogs.has(slot)) {
      throw new Error(`duplicate AUTH audio manifest for activity slot ${slot}`);
    }
    catalogs.set(slot, new NativeAseqAudioCatalog(record?.manifest));
  }
  return catalogs;
}

function presentationDetail(prepared) {
  const { record } = prepared;
  // AUTH timelines are one-based in the retail data. Frame 1 establishes the
  // first camera and actor state that the Dreamcast presents; exposing our
  // synthetic frame 0 briefly reveals the gameplay camera and bind poses.
  // Prime only visual track selection here. The normal frame-1 advance still
  // consumes audio, FACE/HAND cues, and every other authored command once.
  const primedFrames = prepared.frames
    .filter(frame => frame.frame === 1)
    .map(frame => Object.freeze({
      ...frame,
      commands: Object.freeze(frame.commands
        .filter(command => (
          command.name === "camera"
          || command.name === "move"
          || command.name === "motion"
        ))
        .map(command => Object.freeze({
          ...command,
          presentationPrime: true,
        }))),
    }))
    .filter(frame => frame.commands.length > 0);
  return {
    activityId: record.activityId,
    slot: record.slot,
    durationFrames: record.durationFrames,
    actors: prepared.sequence.actors,
    initialFrames: prepared.frames.filter(frame => frame.frame === 0),
    primedFrames,
    prepared,
  };
}

export class NativeAseqActivityRuntime {
  constructor({
    manifest,
    audioManifest,
    audioManifests = [],
    loadAsset,
    presentation,
    onActivityPreparing = null,
    onActivityStarted = null,
    onActivityAdvanced = null,
    onActivityStopped = null,
  } = {}) {
    if (typeof loadAsset !== "function") {
      throw new TypeError("AUTH activity runtime requires an asset loader");
    }
    if (
      typeof presentation?.beginActivity !== "function"
      || typeof presentation?.advanceActivity !== "function"
      || typeof presentation?.endActivity !== "function"
    ) {
      throw new TypeError("AUTH activity runtime requires complete presentation ownership");
    }
    this.catalog = new NativeAseqActivityCatalog(manifest);
    this.audioCatalog = audioManifest
      ? new NativeAseqAudioCatalog(audioManifest)
      : null;
    this.audioCatalogs = audioCatalogsBySlot(audioManifests);
    this.loadAsset = loadAsset;
    this.presentation = presentation;
    this.onActivityPreparing = onActivityPreparing;
    this.onActivityStarted = onActivityStarted;
    this.onActivityAdvanced = onActivityAdvanced;
    this.onActivityStopped = onActivityStopped;
    this.prepared = new Map();
    this.presentationPrepared = new Map();
    this.active = null;
    this.lastUpdateError = null;
  }

  async loadExact(output, { signal } = {}) {
    signal?.throwIfAborted();
    const bytes = byteView(await this.loadAsset(output.path, { signal }), output.path);
    signal?.throwIfAborted();
    if (bytes.byteLength !== output.byteLength) {
      throw new Error(`${output.path} byte length changed`);
    }
    if (await sha256Hex(bytes) !== output.sha256) {
      throw new Error(`${output.path} SHA-256 changed`);
    }
    signal?.throwIfAborted();
    return bytes;
  }

  async prepare(record, { signal } = {}) {
    signal?.throwIfAborted();
    if (!this.prepared.has(record.activityId)) {
      this.prepared.set(record.activityId, this.prepareUncached(record, { signal }));
    }
    const pending = this.prepared.get(record.activityId);
    try {
      const prepared = await pending;
      signal?.throwIfAborted();
      return prepared;
    } catch (error) {
      if (this.prepared.get(record.activityId) === pending) {
        this.prepared.delete(record.activityId);
      }
      throw error;
    }
  }

  async prepareUncached(record, { signal } = {}) {
    const authOutput = this.catalog.outputs.get(record.assetPath);
    const auth = await this.loadExact(authOutput, { signal });
    const sequence = parseAuthSequence(auth);
    const movement = parseAuthMovement(auth);
    const camera = parseAuthCamera(auth);
    const strings = parseAuthStrings(auth);
    if (
      sequence.durationFrames !== record.durationFrames
      || sequence.frames.length !== record.frameCount
      || JSON.stringify(sequence.actors) !== JSON.stringify(record.actors)
    ) {
      throw new Error(`AUTH activity ${record.activityId} differs from its manifest`);
    }

    const motionPackages = new Map();
    for (const bank of new Set(sequence.motions.map(command => command.motionBank))) {
      const output = this.catalog.motionBanks.get(bank);
      if (!output) throw new Error(`AUTH activity motion bank ${bank} is not catalogued`);
      const indices = sequence.motions
        .filter(command => command.motionBank === bank)
        .map(command => command.sequenceIndex);
      motionPackages.set(bank, MotnLoader.parse(await this.loadExact(output, { signal }), {
        sequenceIndices: [...new Set(indices)],
      }));
    }
    const motions = resolveAuthMotions(sequence, motionPackages);
    const motionByOffset = new Map(motions.map(motion => [motion.recordOffset, motion]));
    if (motions.some(motion => !motion.motionValid || !motion.motionName)) {
      throw new Error(`AUTH activity ${record.activityId} has unresolved motion data`);
    }

    const audioCatalog = this.audioCatalogs.get(record.slot) || this.audioCatalog;
    const base = { record, sequence, movement, camera, strings, motionPackages, motions };
    const parsedFrames = sequence.frames.map(frame => Object.freeze({
      frame: frame.frame,
      commands: Object.freeze(frame.commands.map(
        command => resolveCommand(
          command,
          base,
          motionByOffset,
          audioCatalog,
        ),
      )),
    }));
    const frames = enrichNativeAseqActivityFrames({
      record,
      sequence,
      frames: parsedFrames,
      metadata: this.catalog.presentationMetadata,
    });
    return Object.freeze({ ...base, frames: Object.freeze(frames) });
  }

  async preparePresentation(prepared, { signal } = {}) {
    signal?.throwIfAborted();
    // Face/hand assets are cached per AUTH, but resident bodies are scoped to
    // the current world visit. Recheck them even on a cached activity replay.
    if (this.presentation.prepareActors) {
      const accepted = await this.presentation.prepareActors(presentationDetail(prepared), { signal });
      signal?.throwIfAborted();
      if (accepted !== true) throw new Error(`AUTH activity ${prepared.record.activityId} actor preparation was rejected`);
    }
    if (typeof this.presentation.prepare !== "function") return true;
    const { activityId } = prepared.record;
    if (!this.presentationPrepared.has(activityId)) {
      this.presentationPrepared.set(activityId, Promise.resolve().then(async () => {
        signal?.throwIfAborted();
        const accepted = await this.presentation.prepare(
          presentationDetail(prepared),
        );
        signal?.throwIfAborted();
        if (accepted !== true) {
          throw new Error(`AUTH activity ${activityId} preparation was rejected`);
        }
        return true;
      }));
    }
    const pending = this.presentationPrepared.get(activityId);
    try {
      const result = await pending;
      signal?.throwIfAborted();
      return result;
    } catch (error) {
      if (this.presentationPrepared.get(activityId) === pending) {
        this.presentationPrepared.delete(activityId);
      }
      throw error;
    }
  }

  async prepareActivities(selections, { signal } = {}) {
    // Prewarm the complete selected sequence before its first frame. A package
    // can contain unrelated scenes whose unavailable assets must not block it.
    const preparedActivities = [];
    const records = new Map(selections.map(selection => {
      const record = this.catalog.resolve(selection);
      return [record.activityId, record];
    }));
    for (const record of records.values()) {
      preparedActivities.push(await this.prepare(record, { signal }));
    }
    for (const prepared of preparedActivities) {
      await this.preparePresentation(prepared, { signal });
    }
    signal?.throwIfAborted();
    return true;
  }

  async prepareAllActivities(options) {
    // Explicit whole-package diagnostics only; normal playback selects its
    // program's dependencies instead of warming every scene in the archive.
    return this.prepareActivities([...this.catalog.activities.values()].map(record => ({
      slot: record.slot,
      binding: record.binding?.kind === "map-embedded-slot"
        ? { kind: "map-embedded-slot", activityId: record.activityId }
        : { primaryPointer: record.primaryPointer, secondaryPointer: record.secondaryPointer },
    })), options);
  }

  async startActivity({ slot, binding } = {}, { signal } = {}) {
    signal?.throwIfAborted();
    if (this.active) throw new Error("an AUTH activity is already active");
    this.lastUpdateError = null;
    const record = this.catalog.resolve({ slot, binding });
    const prepared = await this.prepare(record, { signal });
    const detail = presentationDetail(prepared);
    const activityPrepared = await this.onActivityPreparing?.(record);
    signal?.throwIfAborted();
    if (activityPrepared !== undefined && activityPrepared !== true) {
      throw new Error(`AUTH activity ${record.activityId} preparation was rejected`);
    }
    await this.preparePresentation(prepared, { signal });
    signal?.throwIfAborted();
    const owner = await this.presentation.beginActivity(detail);
    if (owner === null || owner === undefined || owner === false) {
      throw new Error(`AUTH activity ${record.activityId} presentation was rejected`);
    }
    try {
      signal?.throwIfAborted();
      const activityStarted = await this.onActivityStarted?.(record);
      signal?.throwIfAborted();
      if (activityStarted !== undefined && activityStarted !== true) {
        throw new Error(`AUTH activity ${record.activityId} start was rejected`);
      }
    } catch (error) {
      await this.presentation.endActivity({
        owner,
        reason: "activity-start-failed",
        activityId: record.activityId,
        currentFrame: 0,
        error,
      });
      throw error;
    }
    this.active = { record, prepared, owner, currentFrame: 0 };
    return {
      activityId: record.activityId,
      slot: record.slot,
      binding: record.binding?.kind === "map-embedded-slot"
        ? Object.freeze({
            kind: "map-embedded-slot",
            activityId: record.activityId,
          })
        : Object.freeze({
            primaryPointer: record.primaryPointer,
            secondaryPointer: record.secondaryPointer,
          }),
      durationFrames: record.durationFrames,
    };
  }

  acceptsActivity(detail) {
    return this.catalog.has(detail);
  }

  embeddedBindings() {
    return this.catalog.embeddedBindings();
  }

  updateActivity(update) {
    const active = this.active;
    if (
      !active
      || update?.activityId !== active.record.activityId
      || update?.slot !== active.record.slot
      || update?.previousFrame !== active.currentFrame
      || update?.currentFrame !== active.currentFrame + 1
      || update?.durationFrames !== active.record.durationFrames
    ) {
      this.lastUpdateError = new Error(
        `AUTH activity update mismatch: expected ${active?.record.activityId || "none"}`
        + ` slot ${active?.record.slot ?? "none"} frame ${active?.currentFrame ?? "none"}`
        + `/${active?.record.durationFrames ?? "none"}, received`
        + ` ${update?.activityId || "none"} slot ${update?.slot ?? "none"}`
        + ` ${update?.previousFrame ?? "none"}->${update?.currentFrame ?? "none"}`
        + `/${update?.durationFrames ?? "none"}`,
      );
      return false;
    }
    const frames = active.prepared.frames.filter(
      frame => frame.frame === update.currentFrame,
    );
    try {
      const accepted = this.presentation.advanceActivity({
        ...update,
        owner: active.owner,
        frames,
        prepared: active.prepared,
      });
      if (accepted !== true || accepted?.then) {
        throw new Error("AUTH activity presentation rejected a frame");
      }
      const activityAdvanced = this.onActivityAdvanced?.(
        active.record,
        update.currentFrame,
      );
      if (
        activityAdvanced !== undefined
        && (activityAdvanced !== true || activityAdvanced?.then)
      ) {
        throw new Error("AUTH activity advanced hook rejected a frame");
      }
      active.currentFrame = update.currentFrame;
      this.lastUpdateError = null;
      return true;
    } catch (error) {
      this.lastUpdateError = error;
      try {
        this.presentation.endActivity({
          owner: active.owner,
          reason: "presentation-failed",
          activityId: active.record.activityId,
          currentFrame: active.currentFrame,
          error,
        });
      } finally {
        this.active = null;
      }
      return false;
    }
  }

  stopActivity({ reason, activity } = {}) {
    const active = this.active;
    if (!active) return true;
    if (activity?.activityId !== active.record.activityId) return false;
    const accepted = this.presentation.endActivity({
      owner: active.owner,
      reason,
      activityId: active.record.activityId,
      currentFrame: active.currentFrame,
    });
    if (accepted !== true || accepted?.then) return false;
    try {
      const activityStopped = this.onActivityStopped?.(active.record, reason);
      if (
        activityStopped !== undefined
        && (activityStopped !== true || activityStopped?.then)
      ) {
        this.lastUpdateError = new Error(
          "AUTH activity stopped hook rejected cleanup",
        );
        return false;
      }
      this.lastUpdateError = null;
      return true;
    } catch (error) {
      this.lastUpdateError = error;
      return false;
    } finally {
      this.active = null;
    }
  }

  rollbackActivity(reason = "transaction-rollback") {
    const active = this.active;
    if (!active) return true;
    return this.stopActivity({
      reason,
      activity: { activityId: active.record.activityId },
    });
  }
}

export function createNativeAseqActivityRuntime(options) {
  return new NativeAseqActivityRuntime(options);
}
