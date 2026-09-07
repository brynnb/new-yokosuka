import {
  createNativeDialogueSnapshot,
} from "./NativeDialogueSnapshot.js";

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
  }

  hydrate(snapshot) {
    this.snapshot = createNativeDialogueSnapshot(snapshot);
    this.committedSnapshot = this.snapshot.toJSON();
    this.generation = 0;
    this.savedGeneration = 0;
    this.pending = Promise.resolve();
    this.sandbox = null;
    return this.snapshot;
  }

  clear() {
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
    if (!this.snapshot || this.savedGeneration >= this.generation) {
      return this.pending;
    }
    this.pending = this.pending.then(
      () => this.#saveNext(),
      () => this.#saveNext(),
    );
    return this.pending;
  }

  async #saveNext() {
    if (!this.snapshot || this.savedGeneration >= this.generation) {
      return this.snapshot;
    }
    const savingGeneration = this.generation;
    const response = await this.saveSnapshot(this.snapshot.toJSON());
    this.snapshot.acceptSavedSnapshot(response);
    this.committedSnapshot = this.snapshot.toJSON();
    this.savedGeneration = savingGeneration;
    this.onSaved(this.snapshot);
    if (this.savedGeneration < this.generation) {
      return this.#saveNext();
    }
    return this.snapshot;
  }

  persistMutation() {
    if (this.sandbox) return Promise.resolve(this.snapshot);
    if (!this.markDirty()) return Promise.resolve(this.snapshot);
    return this.save().catch((error) => {
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
