import { createNativeAseqFacialPresentation } from "../events/NativeAseqFacialPresentation.js";
import { nativeFacialAssetForBody } from "../cutscenes/NativeCutsceneFacialAssets.js";

/** Voice-owned adapter for conversations; deformation stays in the shared renderer. */
export class NativeVoiceFacialPresentation {
  constructor({ scene, getActor, catalog, loadAsset, speakWithStagedFace, createPresentation = createNativeAseqFacialPresentation }) {
    Object.assign(this, { scene, getActor, catalog, loadAsset, speakWithStagedFace, createPresentation });
    this.cache = new Map();
    this.active = null;
  }

  async start(message, audio) {
    this.stop();
    const tag = message.speakerCode;
    const actor = this.getActor(tag);
    if (!message.lipSync || !actor?.model) return false; // Includes off-stage telephone voices.
    const model = actor.model;
    const releaseStagedVoice=this.speakWithStagedFace?.(tag,model,message.lipSync,audio);
    if(releaseStagedVoice){
      this.active={releaseStagedVoice};
      return true;
    }
    const definition = nativeFacialAssetForBody(tag, model.modelCode, this.catalog);
    const key = `${tag}:${model.modelCode || "embedded"}`;
    let faces = this.cache.get(key);
    if (!faces) {
      faces = this.createPresentation({
        scene: this.scene,
        actors: { activeActor: code => this.getActor(code), componentWorldPosition: () => null },
        definitions: definition ? { [tag]: definition } : {},
        loadAsset: this.loadAsset,
      });
      this.cache.set(key, faces);
    }
    const owner = { tag, model, faces, audio, ready: false, elapsed: 0,
      cue: { command: { audio: { lipSync: message.lipSync } }, positionSeconds: 0 } };
    this.active = owner;
    try {
      await faces.prepare({ actors: [tag] });
      // A skipped line, replaced body or world change must never acquire a
      // surface after the dialogue which requested it has gone away.
      if (this.active !== owner) return false;
      if (this.getActor(tag)?.model !== model) { this.stop(); return false; }
      faces.begin(owner, [tag]);
      owner.ready = true;
      this.update(0);
      return true;
    } catch (error) {
      if (this.active !== owner) return false;
      this.stop();
      throw error;
    }
  }

  update(deltaSeconds) {
    const owner = this.active;
    if (!owner?.ready) return false;
    if (this.getActor(owner.tag)?.model !== owner.model) { this.stop(); return false; }
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return false;
    owner.elapsed += Math.min(deltaSeconds, 0.25);
    owner.cue.positionSeconds = Math.max(0, owner.audio.currentTime || 0);
    return owner.faces.apply(owner, {
      frame: Math.floor(owner.elapsed * 30),
      voiceCues: new Map([[owner.tag, owner.cue]]),
    });
  }

  stop() {
    const owner = this.active;
    this.active = null;
    owner?.releaseStagedVoice?.();
    if (owner?.ready) {
      owner.faces.end(owner);
      owner.faces.reset();
    }
  }

  clear() {
    this.stop();
    for (const faces of this.cache.values()) faces.clear();
    this.cache.clear();
  }
}
