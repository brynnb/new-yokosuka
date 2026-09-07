import { createGameAudio } from "../audio/MediaElementAudio.js";
import {
  createNativeDialogueInteractionRuntime,
} from "./NativeDialogueInteractionRuntime.js";
import {
  isRyoDialogueSpeaker,
  nativeDialogueDisplayText,
  nativeDialogueSpeakerLabel,
} from "./NativeDialogueSpeaker.js";
import {
  createNativeDialogueVoiceManifest,
} from "./NativeDialogueVoiceManifest.js";

function defaultAudioFactory(url) {
  return createGameAudio(url);
}

export class NativeDialogueOverlayRuntime {
  constructor({
    root,
    speaker,
    sourceText,
    japaneseText,
    voiceManifest = createNativeDialogueVoiceManifest(),
    audioFactory = defaultAudioFactory,
    audioSettings = null,
    interactionFactory = createNativeDialogueInteractionRuntime,
    interactionOptions = {},
    onMovementLockChanged = () => {},
    onActiveChanged = () => {},
    onStarted = () => {},
    onMessageStart = () => {},
    onMessageEnd = () => {},
    onNativeCommand = () => {},
    onEvent = () => {},
    onUnresolved = () => {},
    onComplete = () => {},
    onStopped = () => {},
  }) {
    this.dom = { root, speaker, sourceText, japaneseText };
    this.voiceManifest = voiceManifest;
    this.audioFactory = audioFactory;
    this.audioSettings = audioSettings;
    this.onMovementLockChanged = onMovementLockChanged;
    this.onActiveChanged = onActiveChanged;
    this.callbacks = { onEvent, onUnresolved, onComplete };
    this.audio = null;
    this.message = null;
    this.voiceRequestId = 0;
    this.active = false;
    this.movementLocked = false;
    this.interaction = interactionFactory({
      ...interactionOptions,
      onStarted: (started, options) => {
        this.begin();
        onStarted(started, options);
      },
      onMessageStart: (message, detail) => {
        onMessageStart(message, detail);
        this.showMessage(message, detail);
      },
      onMessageEnd: (message, detail) => {
        this.hideMessage(message);
        onMessageEnd(message, detail);
      },
      onNativeCommand,
      onEvent: (event, result) => onEvent(event, result),
      onUnresolved: (result) => {
        this.end();
        onUnresolved(result);
      },
      onComplete: (detail) => {
        if (detail.kind === "session") this.end();
        onComplete(detail);
      },
      onStopped: (detail) => {
        this.end();
        onStopped(detail);
      },
    });
    this.hideOverlay();
  }

  start(options) {
    return this.interaction.start(options);
  }

  begin() {
    this.active = true;
    this.setMovementLocked(true);
    this.onActiveChanged(true);
  }

  async showMessage(message, detail = {}) {
    this.message = message;
    const ryo = isRyoDialogueSpeaker(message);
    this.dom.speaker.textContent = nativeDialogueSpeakerLabel(message);
    this.dom.speaker.setAttribute(
      "data-dialogue-speaker",
      ryo ? "ryo" : "other",
    );
    this.dom.sourceText.textContent = nativeDialogueDisplayText(message);
    this.dom.japaneseText.textContent = "";
    this.dom.japaneseText.hidden = true;
    this.dom.root.hidden = false;
    this.dom.root.setAttribute("aria-hidden", "false");
    this.releaseAudio();
    const requestId = ++this.voiceRequestId;
    let url;
    try {
      url = await this.voiceManifest?.urlFor?.(message?.voiceId);
    } catch (error) {
      console.warn("Could not load native dialogue voice manifest:", error);
      return;
    }
    if (
      !url
      || requestId !== this.voiceRequestId
      || this.message !== message
    ) {
      return;
    }
    const audio = this.audioFactory(url);
    this.audio = audio;
    this.audioSettings?.attach?.(audio);
    audio.addEventListener?.("ended", () => {
      if (
        this.active
        && this.audio === audio
        && this.message === message
      ) {
        this.advance();
      }
    }, { once: true });
    try {
      await audio.play?.();
    } catch (error) {
      if (this.audio === audio) {
        console.warn(`Could not play dialogue ${message.voiceId}:`, error);
      }
    } finally {
      this.prefetchFollowingMessages(message, detail);
    }
  }

  prefetchFollowingMessages(message, detail) {
    const commands = detail?.group?.presentation?.commands || [];
    const currentIndex = commands.findIndex(
      (command) => command?.kind === "message"
        && command?.message === message,
    );
    const followingVoiceIds = commands
      .slice(currentIndex >= 0 ? currentIndex + 1 : 0)
      .filter((command) => command?.kind === "message")
      .map((command) => command?.message?.voiceId)
      .filter(Boolean);
    if (!followingVoiceIds.length) return;
    void this.voiceManifest?.prefetch?.(followingVoiceIds).catch((error) => {
      console.warn("Could not prefetch native dialogue voices:", error);
    });
  }

  hideMessage(message) {
    if (this.message !== message) return;
    this.message = null;
    this.voiceRequestId += 1;
    this.releaseAudio();
    this.hideOverlay();
  }

  update(nowMilliseconds) {
    return this.interaction.update(nowMilliseconds);
  }

  advance() {
    return this.interaction.advance();
  }

  resumeEvent() {
    return this.interaction.resumeEvent();
  }

  stop(reason = "stopped") {
    const stopped = this.interaction.stop(reason);
    this.end();
    return stopped;
  }

  end() {
    const wasActive = this.active;
    this.active = false;
    this.message = null;
    this.voiceRequestId += 1;
    this.releaseAudio();
    this.hideOverlay();
    this.setMovementLocked(false);
    if (wasActive) this.onActiveChanged(false);
  }

  hideOverlay() {
    this.dom.root.hidden = true;
    this.dom.root.setAttribute("aria-hidden", "true");
  }

  releaseAudio() {
    if (!this.audio) return;
    this.audioSettings?.detach?.(this.audio);
    this.audio.pause?.();
    this.audio.removeAttribute?.("src");
    this.audio.load?.();
    this.audio = null;
  }

  setMovementLocked(locked) {
    if (this.movementLocked === locked) return;
    this.movementLocked = locked;
    this.onMovementLockChanged(locked);
  }

  dispose() {
    this.stop("disposed");
  }
}

export function createNativeDialogueOverlayRuntime(options) {
  return new NativeDialogueOverlayRuntime(options);
}
