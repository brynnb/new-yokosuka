import {
  isRyoDialogueSpeaker,
  nativeDialogueDisplayText,
  nativeDialogueSpeakerLabel,
} from "../dialogue/NativeDialogueSpeaker.js";

export class NativeAseqDialoguePresentation {
  constructor({
    root,
    speaker,
    sourceText,
    japaneseText,
    options,
    speakerNameForId = () => null,
  } = {}) {
    this.dom = { root, speaker, sourceText, japaneseText, options };
    if (Object.values(this.dom).some(value => !value)) {
      throw new TypeError("AUTH dialogue presentation requires dialogue DOM nodes");
    }
    if (typeof speakerNameForId !== "function") {
      throw new TypeError("AUTH dialogue speaker-name resolver must be a function");
    }
    this.speakerNameForId = speakerNameForId;
    this.active = null;
    this.hide();
  }

  begin(owner) {
    if (this.active) throw new Error("AUTH dialogue is already owned");
    this.active = { owner, command: null };
    this.hide();
    return true;
  }

  play(owner, command) {
    if (this.active?.owner !== owner || command?.audio?.kind !== "voice") {
      return false;
    }
    const message = command.audio;
    this.active.command = command;
    this.clearOptions();
    const text = nativeDialogueDisplayText(message);
    if (!text) {
      this.hide();
      return true;
    }
    const packageSpeakerName = this.speakerNameForId(message.speakerId);
    this.dom.speaker.textContent = nativeDialogueSpeakerLabel({
      ...message,
      speakerName: packageSpeakerName ?? message.speakerName,
    });
    this.dom.speaker.setAttribute(
      "data-dialogue-speaker",
      isRyoDialogueSpeaker(message) ? "ryo" : "other",
    );
    this.dom.sourceText.textContent = text;
    this.dom.japaneseText.textContent = "";
    this.dom.japaneseText.hidden = true;
    this.dom.root.hidden = false;
    this.dom.root.setAttribute("aria-hidden", "false");
    return true;
  }

  endVoice(owner, command) {
    if (this.active?.owner !== owner) return false;
    if (this.active.command !== command) return true;
    this.active.command = null;
    this.hide();
    return true;
  }

  end(owner) {
    if (this.active?.owner !== owner) return false;
    this.active = null;
    this.hide();
    return true;
  }

  hide() {
    this.dom.root.hidden = true;
    this.dom.root.setAttribute("aria-hidden", "true");
  }

  clearOptions() {
    this.dom.options.replaceChildren();
    this.dom.options.hidden = true;
  }
}

export function createNativeAseqDialoguePresentation(options) {
  return new NativeAseqDialoguePresentation(options);
}
