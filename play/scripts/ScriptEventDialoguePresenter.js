import { createGameAudio } from "../audio/MediaElementAudio.js";
import storyChallenges from "../data/story-challenges.json" with { type: "json" };

const CHALLENGE_KEYS = Object.freeze({A:"Enter",B:"Shift",Left:"ArrowLeft",Right:"ArrowRight",Up:"ArrowUp",Down:"ArrowDown"});
if(storyChallenges.buttonCodes.some(code=>!CHALLENGE_KEYS[code]))throw new Error("Unmapped story challenge button");
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
    onCombatAction = () => {},
    onCombatGuard = () => {},
    onNavigationUse=()=>{},onNavigationHide=()=>{},onNavigationDirection=()=>{},
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
    this.onCombatAction=onCombatAction;this.onCombatGuard=onCombatGuard;
    Object.assign(this,{onNavigationUse,onNavigationHide,onNavigationDirection});
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
  showCombat(view) {
    this.releaseAudio();this.active=true;
    this.dom.root.setAttribute("data-presentation","combat");
    this.dom.speaker.textContent=view.label.toUpperCase();
    this.dom.root.hidden=false;this.dom.root.setAttribute("aria-hidden","false");
    this.dom.japaneseText.hidden=true;this.onActiveChanged(true);
    const player=view.actors.find(actor=>actor.tag==="AKIR");
    const remaining=view.actors.filter(actor=>actor.tag!=="AKIR"&&actor.health>0).length;
    this.dom.sourceText.textContent=view.ready
      ? `${view.practice?`Practice · ${Math.ceil(view.remainingMs/1000)} seconds remaining`:`Health: ${player.health}/${player.maxHealth} · Opponents: ${remaining}`}\nUse your movement/combat controls or the buttons below. Cancel to leave.`
      : view.practice?"Preparing practice...":"Preparing the fight...";
    if(this.combatToken===view.token)return true;
    this.clearOptions();this.combatToken=view.token;
    const current=()=>this.active&&this.combatToken===view.token;
    for(const [label,action]of [["Punch","hand"],["Kick","leg"],["Throw","throw"]]) {
      const button=this.dom.options.ownerDocument.createElement("button");button.type="button";button.className="dialogue-option";button.textContent=label;
      button.addEventListener("click",()=>{
        if(!current())return;
        this.onCombatAction(action);this.dom.options.ownerDocument.querySelector?.("#renderCanvas")?.focus();
      });
      this.dom.options.append(button);
    }
    const guard=this.dom.options.ownerDocument.createElement("button");guard.type="button";guard.className="dialogue-option";guard.textContent="Guard (hold)";
    guard.addEventListener("pointerdown",event=>{if(current()){guard.setPointerCapture?.(event.pointerId);this.onCombatGuard(true);}});
    for(const name of ["pointerup","pointercancel","lostpointercapture"])guard.addEventListener(name,()=>{if(current())this.onCombatGuard(false);});
    this.dom.options.append(guard);this.dom.options.hidden=false;return true;
  }

  showNavigation(prompt){
    this.releaseAudio();this.active=true;this.dom.root.setAttribute("data-presentation","combat");
    this.dom.root.hidden=false;this.dom.root.setAttribute("aria-hidden","false");this.dom.speaker.textContent=prompt.label;
    const v=prompt.navigation;this.dom.sourceText.textContent=prompt.ready?`${Math.ceil(v.remainingMs/1000)}s · Alert ${Math.round(v.alert*100)}%\n${v.canUse?'Warehouse No.8 — use the door':v.canHide?'Cover nearby — hold Hide to crouch':'Avoid patrols; hide near walls and corners'}`:"Preparing patrols…";
    this.dom.japaneseText.hidden=true;this.onActiveChanged(true);
    if(this.navigationToken===prompt.token){this.navigationUseButton.disabled=!prompt.ready||!v.canUse;return true;}
    this.clearOptions();this.navigationToken=prompt.token;
    const current=()=>this.active&&this.navigationToken===prompt.token,document=this.dom.options.ownerDocument;
    const focusWorld=()=>document.querySelector?.("#renderCanvas")?.focus();
    const hold=(label,down,up)=>{const b=document.createElement("button");b.type="button";b.className="dialogue-option";b.textContent=label;b.addEventListener("pointerdown",e=>{if(current()){b.setPointerCapture?.(e.pointerId);down();}});for(const type of ["pointerup","pointercancel","lostpointercapture"])b.addEventListener(type,()=>{if(current()){up();focusWorld();}});this.dom.options.append(b);};
    for(const [label,x,z]of [["↑",0,1],["←",-1,0],["↓",0,-1],["→",1,0]])hold(label,()=>this.onNavigationDirection(x,z),()=>this.onNavigationDirection(0,0));
    hold("Hide (hold)",()=>this.onNavigationHide(true),()=>this.onNavigationHide(false));
    const use=document.createElement("button");use.type="button";use.className="dialogue-option";use.textContent="Enter door";use.disabled=!prompt.ready||!v.canUse;use.addEventListener("click",()=>{if(current()){this.onNavigationUse();focusWorld();}});this.dom.options.append(use);this.navigationUseButton=use;this.dom.options.hidden=false;return true;
  }

  showDelivery(prompt){
    this.releaseAudio();this.active=true;this.clearOptions();
    this.dom.root.setAttribute("data-presentation","combat");this.dom.root.hidden=false;this.dom.root.setAttribute("aria-hidden","false");
    this.dom.speaker.textContent=prompt.label;
    const view=prompt.delivery;
    this.dom.sourceText.textContent=prompt.ready?`${view.delivered} / ${view.required} crates delivered · ${Math.ceil(view.remainingMs/1000)}s\n${view.cargoId?'Lift a crate, carry it to the green area, then lower the forks and leave it upright.':'Return to the starting position for the next crate.'}`:"Preparing your forklift and crates…";
    this.dom.japaneseText.hidden=true;this.dom.options.hidden=true;this.onActiveChanged(true);return true;
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
    const definition=storyChallenges.challenges.find(challenge=>challenge.id===prompt.id);
    if(!Number.isSafeInteger(prompt.index)||!Number.isSafeInteger(prompt.count)||prompt.count<1
      ||prompt.index<0||prompt.index>=prompt.count||!definition||prompt.count!==definition.buttons.length
      ||prompt.ready&&prompt.button!==definition.buttons[prompt.index])throw new Error("Invalid challenge prompt");
    const requestId=++this.requestId;
    const current=()=>this.active&&requestId===this.requestId;
    this.active=true;
    this.dom.root.hidden=false;this.dom.root.setAttribute("aria-hidden","false");
    this.dom.speaker.textContent=prompt.label;
    this.dom.sourceText.textContent=prompt.ready ? `Press ${prompt.button} (${CHALLENGE_KEYS[prompt.button]}) · ${prompt.index+1} / ${prompt.count}` : "Get ready…";
    this.dom.japaneseText.hidden=true;
    this.onActiveChanged(true);
    if(!prompt.ready){queueMicrotask(()=>{if(current())this.onChallengeResponse("challenge_ready",prompt.token);});return true;}
    const document=this.dom.options.ownerDocument;
    for(const buttonCode of new Set(definition.buttons)) {
      const button=document.createElement("button");button.type="button";button.className="dialogue-option";
      button.textContent=`${buttonCode} · ${CHALLENGE_KEYS[buttonCode]}`;button.dataset.challengeButton=buttonCode;
      button.addEventListener("click",()=>{if(current())this.onChallengeResponse("challenge_input",prompt.token,buttonCode);});
      this.dom.options.append(button);
    }
    this.dom.options.hidden=false;
    this.challengeKeyHandler=event=>{
      const code=storyChallenges.buttonCodes.find(code=>CHALLENGE_KEYS[code]===event.key);
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
    this.combatToken=null;this.onCombatGuard?.(false);
    this.navigationToken=null;this.onNavigationHide(false);this.onNavigationDirection(0,0);
    this.dom.root.setAttribute("data-presentation","dialogue");
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
