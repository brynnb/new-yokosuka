// A scene tableau belongs to an existing Yarn presentation transaction. It
// borrows the shared cinematic actors/camera; it never saves story state or
// interprets a challenge. This is intentionally authored, not decoded AUTH.
import { updateNativeCharacterSecondaryMotion } from "../characters/NativeCharacterSecondaryMotion.js";

export class AuthoredSceneStagingRuntime {
  constructor({ actors, camera, motionRuntime, capturePlayerState, restorePlayerState, createAttachedObjects }) {
    this.actors = actors;
    this.camera = camera;
    this.motionRuntime = motionRuntime;
    this.capturePlayerState = capturePlayerState;
    this.restorePlayerState = restorePlayerState;
    this.createAttachedObjects = createAttachedObjects;
    this.active = null;
  }

  async play(sequence, transaction) {
    if (sequence.kind === "scene-staging-finish") {
      if (this.active?.transaction !== transaction || this.active.scene.id !== sequence.scene.id) return false;
      return this.release(transaction);
    }
    if (sequence.kind !== "scene-staging-start" || this.active) return false;
    const scene = sequence.scene;
    if (scene.area !== transaction.area) return false;
    if(scene.durationSeconds!=null&&(!Number.isFinite(scene.durationSeconds)||scene.durationSeconds<=0||scene.durationSeconds>120))throw new Error(`Invalid staged duration ${scene.id}`);
    if (!Array.isArray(scene.actors) || scene.actors.length === 0
      || new Set(scene.actors.map(actor => actor.tag)).size !== scene.actors.length
      || scene.actors.some(actor => !/^[A-Z0-9_]{4}$/.test(actor.tag)
        || (actor.presented !== undefined && typeof actor.presented !== "boolean")
        || !actor.motion?.bank || !actor.motion?.name
        || (actor.pose && ["x", "y", "z", "rotationX", "rotationY", "rotationZ"].some(key => !Number.isFinite(actor.pose[key]))))
      || ["positionX", "positionY", "positionZ", "targetX", "targetY", "targetZ", "roll", "perspective"].some(key => !Number.isFinite(scene.camera?.[key]))) {
      throw new Error(`Invalid authored scene staging ${scene.id}`);
    }
    if (scene.waitForMotions != null && typeof scene.waitForMotions !== "boolean") {
      throw new Error(`Invalid motion timing option ${scene.id}`);
    }
    if (scene.waitForMotions && (scene.durationSeconds != null || scene.actors.some(actor => actor.motion.loop !== false))) {
      throw new Error(`Timed scene requires non-looping motions: ${scene.id}`);
    }
    const owner = { transaction, scene, controller: new AbortController(), elapsed: 0,
      actorsBegun: false, cameraBegun: false, snapshot: this.capturePlayerState() };
    this.active = owner;
    const { signal } = owner.controller;
    try {
      await this.actors.prepare(scene.actors.map(actor => actor.tag), { signal });
      signal.throwIfAborted();
      await this.motionRuntime.loadNamedSelections(scene.actors.map(actor => actor.motion));
      signal.throwIfAborted();
      owner.durationSeconds = scene.waitForMotions
        ? Math.max(...scene.actors.map(actor => this.motionRuntime.namedDurationSeconds(actor.motion)))
        : scene.durationSeconds;
      if (scene.waitForMotions && (!Number.isFinite(owner.durationSeconds) || owner.durationSeconds <= 0 || owner.durationSeconds > 120)) {
        throw new Error(`Invalid loaded scene duration ${scene.id}`);
      }
      if(scene.attachedObjects){
        if(!this.createAttachedObjects)throw new Error(`No authored prop loader for ${scene.id}`);
        owner.objects=this.createAttachedObjects(scene.attachedObjects,tag=>this.actors.activeActor(tag),signal);
        owner.loadingProps=true;
        try{await owner.objects.load([]);}finally{owner.loadingProps=false;}
        signal.throwIfAborted();
      }
      if (this.active !== owner) return false;
      this.actors.begin(owner, scene.actors.map(actor => actor.tag));
      owner.actorsBegun = true;
      this.camera.begin(owner);
      owner.cameraBegun = true;
      for (const actor of scene.actors) {
        if (actor.pose && !this.actors.applyTransform(owner, actor.tag, actor.pose)) throw new Error(`Cannot stage actor ${actor.tag}`);
        // Borrow out-of-shot residents too: hiding an owned root suppresses
        // their ambient copy without moving it away or leaving a global flag.
        if(actor.presented===false)this.actors.activeActor(actor.tag).root.setEnabled(false);
      }
      owner.objects?.beginActivity({activityId:scene.id,actors:scene.actors.map(a=>a.tag)});
      if (!this.update(transaction, 0)) throw new Error(`Cannot present scene ${scene.id}`);
      if(owner.durationSeconds)await new Promise((resolve,reject)=>{owner.resolve=resolve;owner.reject=reject;});
      return true;
    } catch (error) {
      if (this.active === owner) this.release(transaction);
      else if(owner.clearLateProps)owner.objects?.clear(); // Release a late loader, never a newer scene.
      throw error;
    }
  }

  update(transaction, deltaSeconds) {
    const owner = this.active;
    if (!owner || owner.transaction !== transaction || !owner.actorsBegun) return true;
    owner.elapsed += Math.max(0, deltaSeconds);
    for (const actor of owner.scene.actors) {
      const model = this.actors.activeActor(actor.tag)?.model;
      if (!this.motionRuntime.applyNamed(model, actor.motion, owner.elapsed)) return false;
      // Gameplay skips its post-pose pass while a story presentation owns the
      // actor. Reuse that pass here, or acquired cloth stays at the old pose.
      updateNativeCharacterSecondaryMotion(model, deltaSeconds);
    }
    if(owner.objects?.update(Math.floor(owner.elapsed*30))===false)return false;
    if(!this.camera.apply(owner, owner.scene.camera))return false;
    if(owner.resolve&&owner.elapsed>=owner.durationSeconds){owner.resolve(true);owner.resolve=null;}
    return true;
  }

  release(transaction) {
    const owner = this.active;
    if (!owner || owner.transaction !== transaction) return false;
    this.active = null;
    owner.clearLateProps=owner.loadingProps===true;
    owner.controller.abort(new DOMException("Story scene released", "AbortError"));
    owner.reject?.(owner.controller.signal.reason);
    // Attempt every cleanup even when one adapter fails. The controller will
    // cancel instead of acknowledging an incomplete restoration.
    const errors = [];
    for (const [enabled, cleanup] of [
      [!!owner.objects,()=>owner.objects.clear()],
      [owner.cameraBegun, () => this.camera.end(owner)],
      [owner.actorsBegun, () => this.actors.end(owner, "stopped")],
      [true, () => this.restorePlayerState(owner.snapshot)],
    ]) if (enabled) {
      try { if (cleanup() === false) throw new Error("Story scene cleanup rejected"); }
      catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Story scene cleanup failed");
    return true;
  }

  cancel(transaction) { return this.release(transaction); }
}
