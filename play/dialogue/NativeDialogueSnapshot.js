import {
  createNativeDialogueProgressIndexAllocator,
} from "./NativeDialogueProgressIndex.js";
import {
  createNativeDialogueProgressState,
} from "./NativeDialogueProgressState.js";
import {
  createNativeDialogueRandomState,
} from "./NativeDialogueRandomState.js";
import {
  createNativeDialogueState,
} from "./NativeDialogueState.js";
import {
  createNativeActorByteState,
} from "../events/NativeActorByteState.js";
import {
  createNativePersistentScriptBitState,
} from "../events/NativePersistentScriptBitState.js";
import { createNativeOperation01c7State } from "../events/NativeOperation01c7Runtime.js";

export const NATIVE_DIALOGUE_SNAPSHOT_SCHEMA =
  "new-yokosuka-native-dialogue-snapshot-v5";

const FREE_ROAM_STORY_BANKS = Object.freeze({
  2: Object.freeze([0xec, ...new Array(127).fill(0)]),
  3: Object.freeze([0xb5, 0x66, 0, 0, 0xde, 0x03, 0, 0]),
  4: Object.freeze(new Array(32).fill(0)),
});

function encodeBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(value, label) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a base64 string`);
  }
  try {
    if (typeof Buffer !== "undefined") {
      const bytes = Uint8Array.from(Buffer.from(value, "base64"));
      if (encodeBase64(bytes) !== value) throw new Error("not canonical");
      return bytes;
    }
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => (
      character.charCodeAt(0)
    ));
    if (encodeBase64(bytes) !== value) throw new Error("not canonical");
    return bytes;
  } catch {
    throw new RangeError(`${label} is not canonical base64`);
  }
}

function requireRevision(value) {
  const revision = Number(value ?? 0);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError(`Invalid native dialogue revision ${value}`);
  }
  return revision;
}

export class NativeDialogueSnapshot {
  constructor(snapshot = null) {
    const source = snapshot ?? {};
    if (
      source.schema !== undefined
      && source.schema !== NATIVE_DIALOGUE_SNAPSHOT_SCHEMA
    ) {
      throw new RangeError(
        `Unsupported native dialogue snapshot schema ${source.schema}`,
      );
    }
    if (snapshot !== null && !source.gameState) {
      throw new TypeError("Native dialogue snapshot gameState is required");
    }
    this.revision = requireRevision(source.revision);
    this.dialogueState = createNativeDialogueState(
      source.state
        ? {
          banks: Object.fromEntries(
            Object.entries(source.state.banks ?? {}).map(([bank, value]) => [
              bank,
              decodeBase64(value, `Native dialogue story bank ${bank}`),
            ]),
          ),
        }
        : { banks: FREE_ROAM_STORY_BANKS },
    );
    this.progressState = createNativeDialogueProgressState(source.progress
      ? { bytes: decodeBase64(source.progress, "Native dialogue progress") }
      : undefined);
    this.progressAllocator = createNativeDialogueProgressIndexAllocator(
      source.progressIndices,
    );
    this.randomState = createNativeDialogueRandomState(source.random);
    this.actorByteState = createNativeActorByteState(source.gameState);
    this.persistentScriptBitState = createNativePersistentScriptBitState(
      source.gameState?.scriptBits
        ? { bytes: decodeBase64(
          source.gameState.scriptBits,
          "Native persistent script bits",
        ) }
        : undefined,
    );
    this.operation01c7State = createNativeOperation01c7State();
    // Only a local preview without a supplied snapshot starts from cold zeros.
    // Stored-version upgrades belong on the server, never in this wire decoder.
    this.operation01c7State.configureParameterBytes(source.gameState
      ? decodeBase64(source.gameState.sceneParameters, "Native scene parameters")
      : new Uint8Array(32));
    // A network snapshot is not a native save-load request. In particular do
    // not fabricate a 48-byte actor/clock restore record or mark it loaded.
    this.operation01c7State.resetLoadStatus();
  }

  sessionOptions() {
    return {
      dialogueState: this.dialogueState,
      progressState: this.progressState,
      progressAllocator: this.progressAllocator,
      randomState: this.randomState,
    };
  }

  gameplayState() {
    return {
      dialogueState: this.dialogueState,
      actorByteState: this.actorByteState,
      persistentScriptBitState: this.persistentScriptBitState,
      operation01c7State: this.operation01c7State,
    };
  }

  toJSON() {
    const state = this.dialogueState.toJSON();
    const progress = this.progressState.toJSON();
    const progressIndices = this.progressAllocator.toJSON();
    const random = this.randomState.toJSON();
    return {
      schema: NATIVE_DIALOGUE_SNAPSHOT_SCHEMA,
      revision: this.revision,
      state: {
        banks: Object.fromEntries(
          Object.entries(state.banks).map(([bank, bytes]) => [
            bank,
            encodeBase64(Uint8Array.from(bytes)),
          ]),
        ),
      },
      progress: encodeBase64(Uint8Array.from(progress.bytes)),
      progressIndices: {
        dynamicCursor: progressIndices.dynamicCursor,
        dynamicIdentities: progressIndices.dynamicIdentities,
      },
      random: { history: random.history },
      gameState: {
        actorBytes: this.actorByteState.toJSON().actorBytes,
        scriptBits: encodeBase64(Uint8Array.from(
          this.persistentScriptBitState.toJSON().bytes,
        )),
        sceneParameters: encodeBase64(Uint8Array.from(
          this.operation01c7State.readParameterBytes(),
        )),
      },
    };
  }

  acceptSavedSnapshot(snapshot) {
    const saved = new NativeDialogueSnapshot(snapshot);
    if (saved.revision !== this.revision + 1) {
      throw new RangeError(
        `Native dialogue save advanced from ${this.revision} `
        + `to unexpected revision ${saved.revision}`,
      );
    }
    this.revision = saved.revision;
    return this;
  }
}

export function createNativeDialogueSnapshot(snapshot) {
  return new NativeDialogueSnapshot(snapshot);
}
