import {
  nativeDialogueCommandReceiver,
  nativeDialogueParticipantFacingTarget,
  nativeDialogueParticipantTableRoute,
} from "./NativeDialoguePresentation.js";
import {
  createNativeDialoguePresentationTimeline,
} from "./NativeDialoguePresentationTimeline.js";
import {
  createNativeDialogueSession,
} from "./NativeDialogueSession.js";

function defaultNow() {
  return performance.now();
}

function nativeCommandDispatch(command, group) {
  const commandWord = command?.commandWord;
  return {
    command,
    actor: group?.actor ?? null,
    receiver: command?.nativeReceiver ?? null,
    facingTarget: nativeDialogueParticipantFacingTarget(
      commandWord,
      group?.actor,
    ),
    participantRoute: nativeDialogueParticipantTableRoute(
      commandWord,
      group?.participants,
    ),
  };
}

const MAX_INTERNAL_TRANSITIONS_PER_PUMP = 64;

export class NativeDialogueInteractionRuntime {
  constructor({
    sessionFactory = createNativeDialogueSession,
    timelineFactory = createNativeDialoguePresentationTimeline,
    now = defaultNow,
    onStarted = () => {},
    onMessageStart = () => {},
    onMessageEnd = () => {},
    onNativeCommand = () => {},
    onInternalStateTransition = () => {},
    onEvent = () => {},
    onUnresolved = () => {},
    onComplete = () => {},
    onStopped = () => {},
  } = {}) {
    this.sessionFactory = sessionFactory;
    this.timelineFactory = timelineFactory;
    this.now = now;
    this.callbacks = {
      onStarted,
      onMessageStart,
      onMessageEnd,
      onNativeCommand,
      onInternalStateTransition,
      onEvent,
      onUnresolved,
      onComplete,
      onStopped,
    };
    this.runId = 0;
    this.session = null;
    this.group = null;
    this.timeline = null;
    this.groupStartMilliseconds = null;
    this.waitingEvent = null;
    this.status = "idle";
    this.pending = Promise.resolve();
  }

  start(options) {
    this.stop("superseded");
    const runId = this.runId;
    const session = this.sessionFactory(options);
    const started = session.start();
    if (started.status !== "started") {
      this.status = started.status;
      this.callbacks.onUnresolved(started);
      return Promise.resolve(started);
    }
    this.session = session;
    this.status = "running";
    this.callbacks.onStarted(started, options);
    return this.schedulePump(runId);
  }

  schedulePump(runId = this.runId) {
    this.pending = this.pending.then(
      () => this.pump(runId),
      () => this.pump(runId),
    );
    return this.pending;
  }

  async pump(runId) {
    if (
      runId !== this.runId
      || !this.session
      || this.timeline
      || this.waitingEvent
    ) {
      return null;
    }
    for (
      let transitionCount = 0;
      transitionCount < MAX_INTERNAL_TRANSITIONS_PER_PUMP;
      transitionCount += 1
    ) {
      const result = await this.session.next();
      if (runId !== this.runId || !this.session) return null;
      if (result.status === "messageGroup") {
        this.beginMessageGroup(result, runId);
        return result;
      }
      if (result.status === "event") {
        if (result.event?.kind === "state5") {
          this.callbacks.onInternalStateTransition(result.event, result);
          continue;
        }
        if (result.event?.kind === "invokeAndYield") {
          const commandWord = result.event.encodedOperand;
          const command = {
            kind: "nativeCommand",
            commandWord,
            recordOffset: result.event.recordOffset,
            nativeTimeSeconds: null,
            nativeReceiver: nativeDialogueCommandReceiver(commandWord),
          };
          const actor = this.session.descriptor ?? null;
          this.callbacks.onNativeCommand(nativeCommandDispatch(command, {
            actor,
            participants: actor?.participantFourccs,
          }));
          this.callbacks.onInternalStateTransition(result.event, result);
          continue;
        }
        this.status = "event";
        this.waitingEvent = result;
        this.callbacks.onEvent(result.event, result);
        return result;
      }
      if (result.status === "complete") {
        this.finish(result);
        return result;
      }
      this.status = "unresolved";
      this.callbacks.onUnresolved(result);
      return result;
    }
    const unresolved = {
      status: "unresolved",
      actorCode: this.session?.actorCode ?? null,
      reasons: [
        `interaction:internalTransitionLimit:${MAX_INTERNAL_TRANSITIONS_PER_PUMP}`,
      ],
    };
    this.status = "unresolved";
    this.callbacks.onUnresolved(unresolved);
    return unresolved;
  }

  beginMessageGroup(group, runId) {
    this.group = group;
    this.groupStartMilliseconds = this.now();
    this.timeline = this.timelineFactory(group.presentation, {
      onMessageStart: (message, command) => {
        if (runId !== this.runId) return;
        this.callbacks.onMessageStart(message, {
          command,
          group,
        });
      },
      onMessageEnd: (message, detail) => {
        if (runId !== this.runId) return;
        this.callbacks.onMessageEnd(message, {
          ...detail,
          group,
        });
      },
      onNativeCommand: (command) => {
        if (runId !== this.runId) return;
        this.callbacks.onNativeCommand(
          nativeCommandDispatch(command, group),
        );
      },
      onComplete: (detail) => {
        if (runId !== this.runId) return;
        this.timeline = null;
        this.group = null;
        this.groupStartMilliseconds = null;
        this.callbacks.onComplete({
          kind: "messageGroup",
          ...detail,
        });
        this.schedulePump(runId);
      },
    });
    this.timeline.start(0);
  }

  update(nowMilliseconds = this.now()) {
    if (!this.timeline || this.groupStartMilliseconds === null) return false;
    const elapsedSeconds = Math.max(
      0,
      (nowMilliseconds - this.groupStartMilliseconds) / 1000,
    );
    return this.timeline.update(elapsedSeconds);
  }

  advance(nowMilliseconds = this.now()) {
    const timeline = this.timeline;
    if (!timeline || this.groupStartMilliseconds === null) return false;
    const advanced = timeline.advance();
    if (
      this.timeline === timeline
      && this.groupStartMilliseconds !== null
    ) {
      this.groupStartMilliseconds = (
        nowMilliseconds - timeline.elapsedSeconds * 1000
      );
    }
    return advanced;
  }

  resumeEvent() {
    if (!this.waitingEvent || !this.session) return Promise.resolve(null);
    const runId = this.runId;
    this.waitingEvent = null;
    this.status = "running";
    return this.schedulePump(runId);
  }

  finish(result) {
    const session = this.session;
    this.session = null;
    this.group = null;
    this.timeline = null;
    this.groupStartMilliseconds = null;
    this.waitingEvent = null;
    this.status = "complete";
    this.callbacks.onComplete({
      kind: "session",
      result,
      session,
    });
  }

  stop(reason = "stopped") {
    const wasActive = Boolean(
      this.session
      || this.timeline
      || this.waitingEvent,
    );
    this.runId += 1;
    this.session = null;
    this.group = null;
    this.timeline = null;
    this.groupStartMilliseconds = null;
    this.waitingEvent = null;
    this.status = "idle";
    if (wasActive) this.callbacks.onStopped({ reason });
    return wasActive;
  }
}

export function createNativeDialogueInteractionRuntime(options) {
  return new NativeDialogueInteractionRuntime(options);
}
