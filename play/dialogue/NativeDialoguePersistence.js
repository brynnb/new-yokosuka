import {
  createNativeDialogueSnapshot,
  NATIVE_DIALOGUE_SNAPSHOT_SCHEMA,
} from "./NativeDialogueSnapshot.js";
import { NATIVE_DIALOGUE_DYNAMIC_PROGRESS_INDEX_COUNT } from "./NativeDialogueProgressIndex.js";

function savedSnapshot(value) {
  // Receipts must be complete server snapshots. The permissive constructor is
  // also used for local preview defaults and must not fabricate missing saves.
  if (value?.schema !== NATIVE_DIALOGUE_SNAPSHOT_SCHEMA
    || !Number.isSafeInteger(value.revision) || value.revision < 0
    || ![2, 3, 4].every(bank => typeof value.state?.banks?.[bank] === "string")
    || typeof value.progress !== "string"
    || value.progress === ""
    || !Array.isArray(value.progressIndices?.dynamicIdentities)
    || value.progressIndices.dynamicIdentities.length !== NATIVE_DIALOGUE_DYNAMIC_PROGRESS_INDEX_COUNT
    || !Number.isInteger(value.progressIndices?.dynamicCursor)
    || !Array.isArray(value.random?.history)
    || value.random.history.length !== 3
    || !value.random.history.every(entry => entry === null || Number.isInteger(entry))
    || !value.gameState?.actorBytes
    || typeof value.gameState.actorBytes !== "object"
    || Array.isArray(value.gameState.actorBytes)
    || !Object.values(value.gameState.actorBytes).every(Number.isInteger)
    || typeof value.gameState.scriptBits !== "string"
    || value.gameState.scriptBits === ""
    || typeof value.gameState.sceneParameters !== "string"
    || value.gameState.sceneParameters === "") {
    throw new Error("server supplied an incomplete native dialogue snapshot");
  }
  return createNativeDialogueSnapshot(value).toJSON();
}

export class NativeDialoguePersistence {
  constructor({
    saveSnapshot,
    onSaved = () => {},
    onConflict = () => {},
    onError = () => {},
  }) {
    if (typeof saveSnapshot !== "function") {
      throw new TypeError("saveSnapshot is required");
    }
    this.saveSnapshot = saveSnapshot;
    this.onSaved = onSaved;
    this.onConflict = onConflict;
    this.onError = onError;
    this.snapshot = null;
    this.committedSnapshot = null;
    this.generation = 0;
    this.savedGeneration = 0;
    this.pending = Promise.resolve();
    this.sandbox = null;
    this.epoch = 0;
    this.serverEvent = null;
  }

  hydrate(snapshot) {
    this.epoch += 1;
    this.serverEvent = null;
    this.snapshot = createNativeDialogueSnapshot(snapshot);
    this.committedSnapshot = this.snapshot.toJSON();
    this.generation = 0;
    this.savedGeneration = 0;
    this.pending = Promise.resolve();
    this.sandbox = null;
    return this.snapshot;
  }

  clear() {
    this.epoch += 1;
    this.serverEvent = null;
    this.snapshot = null;
    this.committedSnapshot = null;
    this.generation = 0;
    this.savedGeneration = 0;
    this.pending = Promise.resolve();
    this.sandbox = null;
  }

  sessionOptions() {
    return this.snapshot?.sessionOptions() ?? null;
  }

  // Flush previous native work before the server pins its input, then isolate
  // presentation-only mutations until cleanup. The release closure is fenced
  // to this session so a late cancellation cannot replace a new character save.
  async beginServerEvent({ signal } = {}) {
    signal?.throwIfAborted();
    if (!this.snapshot || this.sandbox || this.serverEvent) {
      throw new Error("native dialogue state is unavailable for a server event");
    }
    const owner = { epoch: this.epoch, ready: false, receipt: null };
    this.serverEvent = owner;
    const abort = () => {
      if (this.serverEvent === owner) this.serverEvent = null;
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      await this.save();
      signal?.throwIfAborted();
      if (this.epoch !== owner.epoch || this.serverEvent !== owner) {
        throw new DOMException("dialogue session changed", "AbortError");
      }
      owner.baseline = this.captureWorkingState();
      owner.ready = true;
    } catch (error) {
      if (this.serverEvent === owner) this.serverEvent = null;
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
    return () => {
      if (this.serverEvent !== owner || this.epoch !== owner.epoch) return false;
      // Presentation cleanup must run before this release: activity cleanup can
      // restore its captured local snapshot, but cannot undo a committed receipt.
      this.hydrate(owner.receipt ?? owner.baseline);
      return true;
    };
  }

  acceptServerSnapshot(value) {
    if (!this.snapshot) return false; // Disconnected/unselected sessions rehydrate on welcome.
    const incoming = savedSnapshot(value);
    const owner = this.serverEvent;
    const current = owner?.receipt ?? this.committedSnapshot;
    if (current && incoming.revision < current.revision) return false;
    if (current && incoming.revision === current.revision) {
      if (JSON.stringify(incoming) !== JSON.stringify(current)) {
        throw new Error("server changed native dialogue without advancing its revision");
      }
      return false;
    }
    if (owner?.ready) owner.receipt = incoming;
    else this.hydrate(incoming);
    return true;
  }

  gameplayState() {
    return this.snapshot?.gameplayState() ?? null;
  }

  captureWorkingState() {
    return this.snapshot?.toJSON() ?? null;
  }

  restoreWorkingState(snapshot) {
    if (snapshot === null) {
      this.snapshot = null;
      return null;
    }
    this.snapshot = createNativeDialogueSnapshot(snapshot);
    return this.snapshot;
  }

  beginSandbox() {
    if (this.sandbox) {
      throw new Error("native dialogue sandbox is already active");
    }
    this.sandbox = {
      snapshot: this.captureWorkingState(),
      generation: this.generation,
      savedGeneration: this.savedGeneration,
    };
    return this.snapshot;
  }

  endSandbox() {
    if (!this.sandbox) return false;
    const baseline = this.sandbox;
    this.sandbox = null;
    this.restoreWorkingState(baseline.snapshot);
    this.generation = baseline.generation;
    this.savedGeneration = baseline.savedGeneration;
    return true;
  }

  rollback() {
    if (!this.committedSnapshot) return null;
    this.snapshot = createNativeDialogueSnapshot(this.committedSnapshot);
    this.generation = this.savedGeneration;
    return this.snapshot;
  }

  markDirty() {
    if (!this.snapshot) return false;
    if (
      this.committedSnapshot
      && JSON.stringify(this.snapshot.toJSON())
        === JSON.stringify(this.committedSnapshot)
    ) {
      return false;
    }
    this.generation += 1;
    return true;
  }

  save() {
    if (this.serverEvent?.ready) return this.pending;
    if (!this.snapshot || this.savedGeneration >= this.generation) {
      return this.pending;
    }
    const epoch = this.epoch;
    this.pending = this.pending.then(
      () => this.#saveNext(epoch),
      () => this.#saveNext(epoch),
    );
    return this.pending;
  }

  async #saveNext(epoch) {
    if (epoch !== this.epoch || !this.snapshot || this.savedGeneration >= this.generation) {
      return this.snapshot;
    }
    const savingGeneration = this.generation;
    const sent = this.snapshot.toJSON();
    let response;
    try {
      response = await this.saveSnapshot(sent);
    } catch (error) {
      if (epoch !== this.epoch) return this.snapshot;
      throw error;
    }
    if (epoch !== this.epoch) return this.snapshot;
    this.snapshot.acceptSavedSnapshot(response);
    // Working objects may have changed while the request was in flight. Only
    // the acknowledged payload is a rollback baseline, never those later edits.
    this.committedSnapshot = { ...sent, revision: this.snapshot.revision };
    this.savedGeneration = savingGeneration;
    this.onSaved(this.snapshot);
    if (this.savedGeneration < this.generation) {
      return this.#saveNext(epoch);
    }
    return this.snapshot;
  }

  persistMutation() {
    if (this.sandbox || this.serverEvent) return Promise.resolve(this.snapshot);
    if (!this.markDirty()) return Promise.resolve(this.snapshot);
    const epoch = this.epoch;
    return this.save().catch((error) => {
      if (epoch !== this.epoch) return this.snapshot;
      if (error?.status === 409 && error.dialogueState) {
        const snapshot = this.hydrate(error.dialogueState);
        this.onConflict(snapshot, error);
        return snapshot;
      }
      this.onError(error);
      throw error;
    });
  }
}

export function createNativeDialoguePersistence(options) {
  return new NativeDialoguePersistence(options);
}
