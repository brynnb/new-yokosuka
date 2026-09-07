import {
  nativeDialogueActorDescriptor,
} from "./NativeDialogueActor.js";
import {
  loadNativeDialogueMessagesByVoiceId,
} from "./NativeDialogueBody.js";
import {
  buildNativeDialoguePresentationProgram,
  nativeDialoguePresentationMessage,
} from "./NativeDialoguePresentation.js";
import {
  nativeScriptedDialogueMessages,
  nativeScriptedDialogueResource,
} from "./NativeScriptedDialogueCatalog.js";

function exactVoiceIds(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const voiceIds = values.map(value => String(value || ""));
  return voiceIds.every(value => /^[A-Z]{1,2}\d{4}[A-Z]\d{3}$/.test(value))
    ? voiceIds
    : null;
}

export class NativeScriptedDialogueSession {
  constructor({
    actorCode,
    voiceIds,
    source = null,
  }) {
    this.actorCode = String(actorCode || "").toUpperCase();
    this.voiceIds = exactVoiceIds(voiceIds);
    this.source = source;
    this.descriptor = null;
    this.resource = null;
    this.started = false;
    this.presented = false;
  }

  start() {
    if (this.started) {
      return {
        status: "unresolved",
        actorCode: this.actorCode,
        reasons: ["scriptedSession:alreadyStarted"],
      };
    }
    this.resource = nativeScriptedDialogueResource(
      this.actorCode,
      this.voiceIds,
    );
    this.descriptor = (
      this.resource?.actor
      || nativeDialogueActorDescriptor(this.actorCode)
    );
    if (!this.descriptor) {
      return { status: "missing", actorCode: this.actorCode };
    }
    if (!this.voiceIds) {
      return {
        status: "unresolved",
        actorCode: this.actorCode,
        reasons: ["scriptedSession:voiceIds"],
      };
    }
    this.started = true;
    return {
      status: "started",
      kind: "scripted",
      actorCode: this.actorCode,
      actor: this.descriptor,
      voiceIds: [...this.voiceIds],
      source: this.source,
    };
  }

  async next() {
    if (!this.started) {
      return {
        status: "unresolved",
        actorCode: this.actorCode,
        reasons: ["scriptedSession:notStarted"],
      };
    }
    if (this.presented) {
      return {
        status: "complete",
        kind: "scripted",
        actorCode: this.actorCode,
        source: this.source,
      };
    }
    const resource = this.resource
      ? {
          messages: nativeScriptedDialogueMessages(this.resource),
          participantFourccs: this.resource.participants,
        }
      : await loadNativeDialogueMessagesByVoiceId(
          this.actorCode,
          this.voiceIds,
        );
    if (!resource) {
      return {
        status: "unresolved",
        actorCode: this.actorCode,
        reasons: [`scriptedSession:messages:${this.actorCode}`],
      };
    }
    const messages = resource.messages.map(message => (
      nativeDialoguePresentationMessage(
        message,
        resource.participantFourccs,
      )
    ));
    this.presented = true;
    return {
      status: "messageGroup",
      kind: "scripted",
      actorCode: this.actorCode,
      actor: this.descriptor,
      messages,
      presentation: buildNativeDialoguePresentationProgram(
        messages.map(() => ({ kind: "message" })),
        messages,
      ),
      participants: resource.participantFourccs,
      source: this.source,
    };
  }
}

export function createNativeScriptedDialogueSession(options) {
  return new NativeScriptedDialogueSession(options);
}
