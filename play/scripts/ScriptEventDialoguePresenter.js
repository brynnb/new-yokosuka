import { createGameAudio } from "../audio/MediaElementAudio.js";
import {
  createNativeDialogueVoiceManifest,
} from "../dialogue/NativeDialogueVoiceManifest.js";
import {
  NATIVE_DIALOGUE_SPEAKER_LABELS,
  isRyoDialogueSpeaker,
  nativeDialogueSpeakerLabel,
} from "../dialogue/NativeDialogueSpeaker.js";
import {
  nativeDialogueActorDescriptor,
} from "../dialogue/NativeDialogueActor.js";

function metadataValue(metadata, prefix) {
  const entry = (metadata || []).find(value => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : "";
}

export function expandYarnSubstitutions(text, substitutions = []) {
  return String(text).replace(/\{(\d+)\}/g, (marker, rawIndex) => {
    const index = Number(rawIndex);
    return index < substitutions.length ? String(substitutions[index]) : marker;
  });
}

function defaultSpeakerResolver(speakerCode) {
  const descriptor = nativeDialogueActorDescriptor(speakerCode);
  if (!descriptor && !NATIVE_DIALOGUE_SPEAKER_LABELS[speakerCode]) return null;
  return {
    label: nativeDialogueSpeakerLabel({
      speakerId: speakerCode,
      nativeParticipantCode: speakerCode,
    }),
    style: isRyoDialogueSpeaker(speakerCode) ? "ryo" : "other",
  };
}

function dialogueText(text) {
  if (typeof text !== "string") {
    throw new Error("script line has no compiled display text");
  }
  const separator = text.indexOf(":");
  if (separator < 1) {
    throw new Error("script line must use Yarn character dialogue syntax");
  }
  return text.slice(separator + 1).trimStart().replaceAll("[br/]", "\n");
}

export function scriptEventLinePresentation(
  line,
  resolveSpeaker = defaultSpeakerResolver,
  substitutions = [],
) {
  const speakerCode = metadataValue(line?.metadata, "speaker:").toUpperCase();
  if (!speakerCode) throw new Error("script line has no authored speaker ID");
  const speaker = resolveSpeaker(speakerCode);
  if (!speaker) {
    throw new Error(`script line has unknown speaker ${speakerCode}`);
  }
  const voiceId = metadataValue(line?.metadata, "voice:").toUpperCase();
  return {
    speakerCode,
    speakerLabel: speaker.label,
    speakerStyle: speaker.style,
    voiceId: voiceId || null,
    text: dialogueText(expandYarnSubstitutions(line.text, substitutions)),
  };
}

function optionPresentation(option) {
  if (!Number.isSafeInteger(option?.id)) {
    throw new Error("script option has an invalid runtime ID");
  }
  if (typeof option?.line?.text !== "string") {
    throw new Error(`script option ${option.id} has no compiled display text`);
  }
  return {
    id: option.id,
    isAvailable: option.isAvailable === true,
    text: expandYarnSubstitutions(
      option.line.text,
      option.substitutions,
    ).replaceAll("[br/]", "\n"),
  };
}

function defaultAudioFactory(url) {
  return createGameAudio(url);
}

export class ScriptEventDialoguePresenter {
  constructor({
    root,
    speaker,
    sourceText,
    japaneseText,
    options,
    voiceManifest = createNativeDialogueVoiceManifest(),
    resolveSpeaker = defaultSpeakerResolver,
    audioFactory = defaultAudioFactory,
    audioSettings = null,
    onAdvance = () => {},
    onSelect = () => {},
    onChallengeResponse = () => {},
    onActiveChanged = () => {},
  } = {}) {
    this.dom = { root, speaker, sourceText, japaneseText, options };
    if (Object.values(this.dom).some(value => !value)) {
      throw new TypeError("script dialogue presenter requires dialogue DOM nodes");
    }
    this.voiceManifest = voiceManifest;
    this.resolveSpeaker = resolveSpeaker;
    this.audioFactory = audioFactory;
    this.audioSettings = audioSettings;
    this.onAdvance = onAdvance;
    this.onSelect = onSelect;
    this.onChallengeResponse = onChallengeResponse;
    this.onActiveChanged = onActiveChanged;
    this.audio = null;
    this.active = false;
    this.requestId = 0;
    this.hide();
  }

  show(line, event = {}) {
    const detail = scriptEventLinePresentation(
      line,
      this.resolveSpeaker,
      event.substitutions,
    );
    this.releaseAudio();
    this.clearOptions();
    const requestId = ++this.requestId;
    this.active = true;
    this.dom.speaker.textContent = detail.speakerLabel;
    this.dom.speaker.setAttribute("data-dialogue-speaker", detail.speakerStyle);
    this.dom.sourceText.textContent = detail.text;
    this.dom.japaneseText.textContent = "";
    this.dom.japaneseText.hidden = true;
    this.dom.root.hidden = false;
    this.dom.root.setAttribute("aria-hidden", "false");
    this.onActiveChanged(true);
    // Subtitles are ready now. Optional voice loading must not hold the
    // controller's ordered reply queue: Space can finish the conversation
    // before a voice lookup or play() promise settles. requestId still guards
    // late audio against line changes, cancellation and world teardown.
    if (detail.voiceId) {
      void this.playVoice(detail, requestId).catch(error => {
        if (this.active && requestId === this.requestId) {
          console.warn(`Could not play script voice ${detail.voiceId}:`, error);
        }
      });
    }
    return true;
  }

  async playVoice(detail, requestId) {
    let url;
    try {
      url = await this.voiceManifest.urlFor(detail.voiceId);
    } catch (error) {
      if (this.active && requestId === this.requestId) {
        console.warn(`Could not resolve script voice ${detail.voiceId}:`, error);
      }
      return true;
    }
    if (!url || !this.active || requestId !== this.requestId) return true;
    const audio = this.audioFactory(url);
    this.audio = audio;
    this.audioSettings?.attach?.(audio);
    audio.addEventListener?.("ended", () => {
      if (this.active && this.audio === audio) this.onAdvance();
    }, { once: true });
    try {
      await audio.play?.();
    } catch (error) {
      if (this.audio === audio) {
        console.warn(`Could not play script voice ${detail.voiceId}:`, error);
      }
    }
    return true;
  }

  showOptions(options) {
    if (!Array.isArray(options) || options.length === 0) {
      throw new Error("script event has no presented options");
    }
    const presented = options.map(optionPresentation);
    if (!presented.some(option => option.isAvailable)) {
      throw new Error("script event has no available options");
    }
    if (new Set(presented.map(option => option.id)).size !== presented.length) {
      throw new Error("script event has duplicate option IDs");
    }
    this.releaseAudio();
    this.requestId += 1;
    this.clearOptions();
    this.active = true;
    this.dom.speaker.textContent = "Your response";
    this.dom.speaker.setAttribute("data-dialogue-speaker", "ryo");
    this.dom.sourceText.textContent = "";
    this.dom.japaneseText.textContent = "";
    this.dom.japaneseText.hidden = true;
    const document = this.dom.options.ownerDocument;
    for (const option of presented) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dialogue-option";
      button.textContent = option.text;
      button.disabled = !option.isAvailable;
      button.addEventListener("click", () => this.onSelect(option.id));
      this.dom.options.append(button);
    }
    this.dom.options.hidden = false;
    this.dom.root.hidden = false;
    this.dom.root.setAttribute("aria-hidden", "false");
    this.onActiveChanged(true);
    this.dom.options.querySelector("button:not(:disabled)")?.focus();
    return true;
  }

  showChallenge(prompt) {
    this.hide();
    if(!Number.isSafeInteger(prompt.index)||!Number.isSafeInteger(prompt.count)||prompt.count<1
      ||prompt.index<0||prompt.index>=prompt.count||prompt.ready&&!['A','B'].includes(prompt.button))throw new Error("Invalid challenge prompt");
    const requestId=++this.requestId;
    const current=()=>this.active&&requestId===this.requestId;
    this.active=true;
    this.dom.root.hidden=false;this.dom.root.setAttribute("aria-hidden","false");
    this.dom.speaker.textContent=prompt.label;
    this.dom.sourceText.textContent=prompt.ready ? `Press ${prompt.button} (${prompt.button==='A'?'Enter':'Shift'}) · ${prompt.index+1} / ${prompt.count}` : "Get ready…";
    this.dom.japaneseText.hidden=true;
    this.onActiveChanged(true);
    if(!prompt.ready){queueMicrotask(()=>{if(current())this.onChallengeResponse("challenge_ready",prompt.token);});return true;}
    const document=this.dom.options.ownerDocument;
    for(const buttonCode of ['A','B']) {
      const button=document.createElement("button");button.type="button";button.className="dialogue-option";
      button.textContent=`${buttonCode} · ${buttonCode==='A'?'Enter':'Shift'}`;button.dataset.challengeButton=buttonCode;
      button.addEventListener("click",()=>{if(current())this.onChallengeResponse("challenge_input",prompt.token,buttonCode);});
      this.dom.options.append(button);
    }
    this.dom.options.hidden=false;
    this.challengeKeyHandler=event=>{
      const code=event.key==='Enter'?'A':event.key==='Shift'?'B':null;
      if(!code||event.repeat||!current())return;
      event.preventDefault();event.stopImmediatePropagation();this.onChallengeResponse("challenge_input",prompt.token,code);
    };
    // The challenge owns these keys before ordinary document-level shortcuts
    // such as Enter-to-chat. Release this capture with the prompt's lifetime.
    this.challengeKeyTarget=document.defaultView || document;
    this.challengeKeyTarget.addEventListener("keydown",this.challengeKeyHandler,true);
    const remaining=prompt.deadlineMs-prompt.serverTimeMs;
    if(!Number.isFinite(remaining)||remaining<0)throw new Error("Invalid challenge deadline");
    this.challengeTimer=setTimeout(()=>{if(current())this.onChallengeResponse("challenge_poll",prompt.token);},remaining+100);
    return true;
  }

  hide() {
    clearTimeout(this.challengeTimer);this.challengeTimer=null;
    if(this.challengeKeyHandler)this.challengeKeyTarget.removeEventListener("keydown",this.challengeKeyHandler,true);
    this.challengeKeyHandler=null;
    this.challengeKeyTarget=null;
    const wasActive = this.active;
    this.active = false;
    this.requestId += 1;
    this.releaseAudio();
    this.clearOptions();
    this.dom.root.hidden = true;
    this.dom.root.setAttribute("aria-hidden", "true");
    if (wasActive) this.onActiveChanged(false);
    return wasActive;
  }

  releaseAudio() {
    if (!this.audio) return;
    this.audioSettings?.detach?.(this.audio);
    this.audio.pause?.();
    this.audio.removeAttribute?.("src");
    this.audio.load?.();
    this.audio = null;
  }

  clearOptions() {
    this.dom.options.replaceChildren();
    this.dom.options.hidden = true;
  }

  dispose() {
    this.hide();
  }
}

export function createScriptEventDialoguePresenter(options) {
  return new ScriptEventDialoguePresenter(options);
}
