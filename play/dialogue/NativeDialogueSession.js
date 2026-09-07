import {
  nativeDialogueActorDescriptor,
  resolveNativeDialogueActorProgressIndex,
} from "./NativeDialogueActor.js";
import {
  createNativeDialogueBodyState,
  loadNativeDialogueMessages,
  stepNativeDialogueBody,
} from "./NativeDialogueBody.js";
import {
  createNativeDialogueProgressIndexAllocator,
} from "./NativeDialogueProgressIndex.js";
import {
  createNativeDialogueProgressState,
} from "./NativeDialogueProgressState.js";
import {
  buildNativeDialoguePresentationProgram,
  nativeDialoguePresentationMessage,
} from "./NativeDialoguePresentation.js";
import {
  createNativeDialogueRandomState,
} from "./NativeDialogueRandomState.js";
import {
  selectNativeDialogueEntry,
  nativeDialogueSelectorResource,
} from "./NativeDialogueSelector.js";
import {
  createNativeDialogueState,
} from "./NativeDialogueState.js";
import {
  createNativeScriptedDialogueSession,
} from "./NativeScriptedDialogueSession.js";

function uniqueReasons(...groups) {
  return [...new Set(groups.flat().filter(Boolean))];
}

export class NativeDialogueSession {
  constructor({
    actorCode,
    context = {},
    dialogueState = createNativeDialogueState(),
    progressState = createNativeDialogueProgressState(),
    progressAllocator = createNativeDialogueProgressIndexAllocator(),
    randomState = createNativeDialogueRandomState(),
    randomFloat = Math.random,
  }) {
    this.actorCode = String(actorCode || "").toUpperCase();
    this.context = context;
    this.dialogueState = dialogueState;
    this.progressState = progressState;
    this.progressAllocator = progressAllocator;
    this.randomState = randomState;
    this.randomFloat = randomFloat;
    this.descriptor = null;
    this.progressIndex = null;
    this.selection = null;
    this.bodyState = null;
    this.started = false;
  }

  runtimeContext() {
    const selector = nativeDialogueSelectorResource(this.actorCode);
    const routingBaseOffset = selector?.resource.recordRoutingOffset ?? 0;
    return {
      ...this.context,
      ...this.dialogueState.predicateContext(),
      ...this.progressState.bodyContext(
        this.progressIndex,
        routingBaseOffset,
      ),
      currentActorCode: this.actorCode,
      chooseNativeDialogueRandomBlock: ({ count }) => (
        this.randomState.choose(count, this.randomFloat)
      ),
    };
  }

  start() {
    if (this.started) return {
      status: "unresolved",
      actorCode: this.actorCode,
      reasons: ["session:alreadyStarted"],
    };
    this.descriptor = nativeDialogueActorDescriptor(this.actorCode);
    if (!this.descriptor) {
      return { status: "missing", actorCode: this.actorCode };
    }
    this.progressIndex = resolveNativeDialogueActorProgressIndex(
      this.actorCode,
      this.progressAllocator,
    );
    if (!Number.isInteger(this.progressIndex)) {
      return {
        status: "unresolved",
        actorCode: this.actorCode,
        reasons: ["session:progressIndex"],
      };
    }
    this.selection = selectNativeDialogueEntry(
      this.actorCode,
      this.runtimeContext(),
    );
    if (this.selection.status !== "selected") return this.selection;

    const source = nativeDialogueSelectorResource(this.actorCode);
    const relativeBodyOffset = (
      this.selection.bodyOffset - source.resource.recordRoutingOffset
    );
    this.progressState.beginSelection(
      this.progressIndex,
      relativeBodyOffset,
    );
    this.bodyState = createNativeDialogueBodyState(this.selection);
    this.started = true;
    return {
      status: "started",
      actorCode: this.actorCode,
      actor: this.descriptor,
      progressIndex: this.progressIndex,
      selection: this.selection,
    };
  }

  async next() {
    if (!this.started || !this.bodyState) {
      return {
        status: "unresolved",
        actorCode: this.actorCode,
        reasons: ["session:notStarted"],
      };
    }
    this.randomState.beginMessageConstruction();
    const result = stepNativeDialogueBody(
      this.bodyState,
      this.runtimeContext(),
    );
    this.bodyState = result.state;
    if (result.status !== "messageGroup") return result;

    const resource = await loadNativeDialogueMessages(
      this.actorCode,
      result.messageIndexes,
    );
    if (!resource) {
      return {
        status: "unresolved",
        actorCode: this.actorCode,
        state: this.bodyState,
        reasons: uniqueReasons(
          result.reasons,
          `session:messages:${this.actorCode}`,
        ),
      };
    }
    const messages = resource.messages.map(message => (
      nativeDialoguePresentationMessage(
        message,
        resource.participantFourccs,
      )
    ));
    return {
      ...result,
      actor: this.descriptor,
      messages,
      presentation: buildNativeDialoguePresentationProgram(
        result.presentationTokens,
        messages,
      ),
      participants: resource.participantFourccs,
    };
  }
}

export function createNativeDialogueSession(options) {
  if (options?.kind === "scripted") {
    return createNativeScriptedDialogueSession(options);
  }
  return new NativeDialogueSession(options);
}
