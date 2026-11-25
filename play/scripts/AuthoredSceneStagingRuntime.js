// A scene tableau belongs to an existing Yarn presentation transaction. It
// borrows the shared cinematic actors/camera; it never saves story state or
// interprets a challenge. This is intentionally authored, not decoded AUTH.
import {applyNativeActorLookPresentation,restoreNativeActorLookPresentation} from "../characters/NativeActorLookPresentation.js";
import { updateNativeCharacterSecondaryMotion } from "../characters/NativeCharacterSecondaryMotion.js";
import {StagedCameraPool} from "./StagedCameraPool.js";
import {applyStoryObjectTransforms} from "./StoryObjectPresentation.js";
import {evaluateAuthActor} from "../../src/AuthMovement.js";
import {evaluateAuthCamera} from "../../src/AuthCamera.js";
import {acquireResidentStageIsolation} from "../events/ResidentStageIsolation.js";
import { JOMO_TELEPHONE_RECEIVER } from "./TelephoneReceiverBindings.js";

const POSE_FIELDS=["x","y","z","rotationX","rotationY","rotationZ"];
const CAMERA_FIELDS=["positionX","positionY","positionZ","targetX","targetY","targetZ","roll","perspective"];
function validateTrack(track,fields,duration,label){
  if(!track)return;
  if(!Number.isFinite(duration)||!track.channels||Object.keys(track.channels).length!==fields.length)throw Error(`Invalid staged track ${label}`);
  for(const key of fields){
    const curve=track.channels[key];
    const error=()=>new Error(`Invalid staged track ${label}.${key}`);
    if(!Array.isArray(curve?.times)||curve.times.length<2||!Array.isArray(curve.values))throw error();
    const {times,values,tangents,interpolation}=curve;
    const linear=interpolation==="linear";
    if(times.length!==values.length || ![...times,...values].every(Number.isFinite)
      || times[0]!==0 || times.at(-1)!==duration)throw error();
    if(!linear && (!Array.isArray(tangents) || tangents.length!==times.length || !tangents.every(Number.isFinite)))throw error();
    // Matching time keys encode instantaneous source placement writes.
    if(times.some((time,index)=>index>0 && (linear ? time<times[index-1] : time<=times[index-1])))throw error();
  }
}

// A native camera or approach can start at the live frame. Keep its captured
// keys on this lease so cancellation and a second entry get independent tracks.
function seedStartingKeys(track, values) {
  const channels = {...track.channels};
  for (const [key,value] of Object.entries(values)) {
    const curve = channels[key];
    if (!curve || !Number.isFinite(value)) throw Error("Invalid starting key " + key);
    channels[key] = {...curve, values:[value,...curve.values.slice(1)]};
  }
  return {channels};
}

export class AuthoredSceneStagingRuntime {
  constructor({ actors, camera, screenFade, updateGameplayCamera, motionRuntime, capturePlayerState, restorePlayerState, createAttachedObjects, createSceneObjects, createActorSet, createFaces, createTelephoneReceiver, dialogueAudio, currentMeshes, acquireEnvironmentIsolation, acquireActorIsolation }) {
    this.actors = actors;
    this.camera = camera;
    this.screenFade = screenFade;
    this.updateGameplayCamera = updateGameplayCamera;
    this.motionRuntime = motionRuntime;
    this.capturePlayerState = capturePlayerState;
    this.restorePlayerState = restorePlayerState;
    this.createAttachedObjects = createAttachedObjects;
    this.createSceneObjects = createSceneObjects;
    this.createActorSet = createActorSet;
    this.createFaces = createFaces;
    this.createTelephoneReceiver = createTelephoneReceiver;
    this.dialogueAudio = dialogueAudio;
    this.cameraPools = new StagedCameraPool();
    this.currentMeshes = currentMeshes;
    this.acquireEnvironmentIsolation = acquireEnvironmentIsolation;
    this.acquireActorIsolation = acquireActorIsolation;
    this.active = null;
  }

  async play(sequence, transaction) {
    if (sequence.kind === "scene-staging-finish" || sequence.kind === "scene-staging-dialogue-cue") {
      const owner = this.active;
      if (!owner || owner.transaction !== transaction || owner.scene.id !== sequence.scene.id) return false;
      // Dialogue can end before the original reaction, camera cut or prop handover.
      const dialogueCue = sequence.kind === "scene-staging-dialogue-cue";
      const end = dialogueCue ? (sequence.atSeconds ?? owner.scene.dialogueCueSeconds) : owner.scene.playThroughFinish ? owner.durationSeconds : 0;
      if (dialogueCue && (!Number.isFinite(end) || end < 0)) return false;
      if (owner.elapsed + 1e-8 < end) {
        if (owner.resolve) return false;
        owner.resolveAt = end;
        await new Promise((resolve, reject) => { owner.resolve = resolve; owner.reject = reject; });
      }
      if (this.active !== owner) return false;
      if (dialogueCue) return true;
      const exit = owner.scene.screenFades?.beforeTravel;
      if (!exit) {
        if (!owner.scene.finishAtPlayerPose) return this.release(transaction);
        // The real player stays staged until the server commits. A cancel or
        // disconnected terminal acknowledgement still restores the entry pose.
        owner.awaitingCommit = true;
        return true;
      }
      try {
        await this.playScreenFade(owner,exit);
        owner.controller.signal.throwIfAborted();
        this.screenFade.handoff(transaction);
        return this.release(transaction,true);
      } catch (error) {
        this.cancel(transaction);
        throw error;
      }
    }
    const continuing=sequence.kind==="scene-staging-transition";
    if ((!continuing&&sequence.kind!=="scene-staging-start")||(!continuing&&this.active)) return false;
    const scene = sequence.scene;
    if (scene.area !== transaction.area) return false;
    if(scene.durationSeconds!=null&&(!Number.isFinite(scene.durationSeconds)||scene.durationSeconds<=0||scene.durationSeconds>120))throw new Error(`Invalid staged duration ${scene.id}`);
    if (!Array.isArray(scene.actors) || scene.actors.length === 0
      || new Set(scene.actors.map(actor => actor.tag)).size !== scene.actors.length
      || scene.actors.some(actor => !/^[A-Z0-9_]{4}$/.test(actor.tag)
        || (actor.presented !== undefined && typeof actor.presented !== "boolean")
        || !actor.motion?.bank || !actor.motion?.name
        || (actor.motionAtSeconds != null && (!Number.isFinite(actor.motionAtSeconds)
          || actor.motionAtSeconds < 0 || !(actor.motionAtSeconds <= scene.durationSeconds)))
        || (actor.playbackRate != null && (!Number.isFinite(actor.playbackRate) || actor.playbackRate < 0))
        || (actor.continueMotion && (!continuing || actor.motionStartSeconds != null))
        || (actor.movementFromPlayer && (actor.tag !== "AKIR" || !actor.movement || !actor.pose || continuing))
        || (actor.baseMotion != null && (!actor.baseMotion.bank || !actor.baseMotion.name))
        || (actor.motionStartSeconds != null && (!Number.isFinite(actor.motionStartSeconds) || actor.motionStartSeconds < 0))
        || (actor.pose && ["x", "y", "z", "rotationX", "rotationY", "rotationZ"].some(key => !Number.isFinite(actor.pose[key]))))
      || (scene.continueCamera ? (!continuing || scene.camera || scene.cameraTrack || scene.cameraPool || scene.useGameplayCamera) : scene.useGameplayCamera ? !this.updateGameplayCamera || scene.camera || scene.cameraTrack || scene.cameraPool
        : ["positionX", "positionY", "positionZ", "targetX", "targetY", "targetZ", "roll", "perspective"].some(key => !Number.isFinite(scene.camera?.[key])))) {
      throw new Error(`Invalid authored scene staging ${scene.id}`);
    }
    if (scene.waitForMotions != null && typeof scene.waitForMotions !== "boolean") {
      throw new Error(`Invalid motion timing option ${scene.id}`);
    }
    // Some interactive scenes keep moving while the player answers prompts.
    // Their lease remains active until the normal finish/cancel transaction.
    if (scene.waitForMotionCompletion != null
      && (typeof scene.waitForMotionCompletion !== "boolean"
        || (scene.waitForMotionCompletion === false && scene.durationSeconds == null && !scene.waitForMotions))) {
      throw new Error(`Invalid motion completion option ${scene.id}`);
    }
    if (scene.dialogueCueSeconds != null && (!Number.isFinite(scene.dialogueCueSeconds)
      || !(scene.dialogueCueSeconds > 0 && scene.dialogueCueSeconds < scene.durationSeconds))) {
      throw new Error(`Invalid staged dialogue time for ${scene.id}`);
    }
    if (scene.playThroughFinish != null && (typeof scene.playThroughFinish !== "boolean" || !scene.durationSeconds)) {
      throw new Error(`Invalid finish duration for ${scene.id}`);
    }
    if (scene.dialogueCues && (!Array.isArray(scene.dialogueCues) || scene.dialogueCues.some((cue,i)=>
      !/^[A-Z0-9]+$/.test(cue.voiceId) || !Number.isFinite(cue.atSeconds) || !(cue.atSeconds >= 0 && cue.atSeconds < scene.durationSeconds)
      || (i && cue.atSeconds <= scene.dialogueCues[i-1].atSeconds))
      || new Set(scene.dialogueCues.map(cue=>cue.voiceId)).size !== scene.dialogueCues.length)) throw Error(`Invalid staged dialogue cues ${scene.id}`);
    if (scene.voiceCue && (!/^public\/audio\/world\/[a-z0-9-]+\/[A-Z0-9]+\.wav$/.test(scene.voiceCue.asset)
      || !this.dialogueAudio || !Number.isFinite(scene.voiceCue.atSeconds)
      || scene.voiceCue.atSeconds < 0 || !(scene.voiceCue.atSeconds < scene.voiceCue.dialogueAtSeconds)
      || !(scene.voiceCue.dialogueAtSeconds <= scene.durationSeconds))) throw Error(`Invalid staged voice cue ${scene.id}`);
    if (scene.soundCues && (!Array.isArray(scene.soundCues) || !this.dialogueAudio || scene.soundCues.some((cue, index) =>
      !/^public\/audio\/world\/[a-z0-9-]+\/[A-Z0-9]+\.wav$/.test(cue.asset)
      || !Number.isFinite(cue.atSeconds) || cue.atSeconds < 0 || !(cue.atSeconds < scene.durationSeconds)
      || (index && cue.atSeconds < scene.soundCues[index-1].atSeconds)))) throw Error(`Invalid staged sound cues ${scene.id}`);
    if(scene.isolateResidentWorld!=null&&typeof scene.isolateResidentWorld!=="boolean")throw Error(`Invalid stage isolation ${scene.id}`);
    if(scene.isolateScheduledActors!=null&&typeof scene.isolateScheduledActors!=="boolean")throw Error(`Invalid actor isolation ${scene.id}`);
    if(scene.telephoneReceiver!=null && scene.telephoneReceiver!=="JOMO_TEL_")throw Error(`Invalid telephone receiver ${scene.id}`);
    if (scene.waitForMotions && (scene.durationSeconds != null || scene.actors.some(actor => actor.motion.loop !== false))) {
      throw new Error(`Timed scene requires non-looping motions: ${scene.id}`);
    }
    for(const actor of scene.actors){
      if(actor.presented!=null&&typeof actor.presented!=="boolean")throw Error(`Invalid staged visibility ${scene.id}/${actor.tag}`);
      if (actor.motionCues && (!Array.isArray(actor.motionCues) || actor.motionCues.some((cue, index) =>
        !cue.motion?.bank || !cue.motion?.name || !Number.isFinite(cue.atSeconds) || cue.atSeconds < 0
        || !(cue.atSeconds < scene.durationSeconds) || (cue.startSeconds != null && (!Number.isFinite(cue.startSeconds) || cue.startSeconds < 0))
        || (cue.playbackRate != null && (!Number.isFinite(cue.playbackRate) || cue.playbackRate <= 0))
        || (index && cue.atSeconds <= actor.motionCues[index-1].atSeconds)))) throw Error(`Invalid staged motion cues ${scene.id}/${actor.tag}`);
      validateTrack(actor.movement,POSE_FIELDS,scene.durationSeconds,`${scene.id}/${actor.tag}`);
      if(actor.endMotion&&(!Number.isFinite(scene.durationSeconds)||!actor.endMotion.bank||!actor.endMotion.name))throw Error(`Invalid staged end motion ${scene.id}/${actor.tag}`);
    }
    if (scene.cameraFromCurrent && (!scene.cameraTrack || scene.continueCamera
      || !Array.isArray(scene.cameraFromCurrent) || !scene.cameraFromCurrent.length
      || scene.cameraFromCurrent.some(field => !CAMERA_FIELDS.includes(field)))) {
      throw Error(`Invalid live camera keys for ${scene.id}`);
    }
    validateTrack(scene.cameraTrack,CAMERA_FIELDS,scene.durationSeconds,`${scene.id}/camera`);
    if (scene.cameraPool) {
      const pool=scene.cameraPool;
      if (!pool.id || typeof pool.advance!=="boolean" || !Array.isArray(pool.angles) || pool.angles.length<2
        || new Set(pool.angles.map(angle=>angle.cameraNumber)).size!==pool.angles.length) throw Error(`Invalid staged camera pool ${scene.id}`);
      for (const angle of pool.angles) {
        if (!Number.isInteger(angle.cameraNumber) || CAMERA_FIELDS.some(key=>!Number.isFinite(angle.camera?.[key]))) throw Error(`Invalid staged camera angle ${scene.id}`);
        validateTrack(angle.cameraTrack,CAMERA_FIELDS,scene.durationSeconds,`${scene.id}/camera/${angle.cameraNumber}`);
      }
    }
    if(scene.sceneObjectTracks){
      if(!scene.sceneObjects||Array.isArray(scene.sceneObjectTracks)||typeof scene.sceneObjectTracks!=="object"
        ||Object.keys(scene.sceneObjectTracks).length===0)throw Error(`Invalid staged object tracks ${scene.id}`);
      for(const [tag,track] of Object.entries(scene.sceneObjectTracks)){
        if(!/^[A-Z0-9_]{4}$/.test(tag)||!Object.hasOwn(scene.sceneObjects,tag)||!track)throw Error(`Unknown staged object ${scene.id}/${tag}`);
        validateTrack(track,POSE_FIELDS,scene.durationSeconds,`${scene.id}/${tag}`);
      }
    }
    // A continuous scene may retain exactly the same props, never replace
    // models under an existing lease. Only their native-coordinate curves vary.
    if(continuing&&(!this.active||this.active.transaction!==transaction||!scene.continuationGroup
      ||scene.continuationGroup!==this.active.scene.continuationGroup
      ||JSON.stringify(scene.actors.map(a=>a.tag))!==JSON.stringify(this.active.scene.actors.map(a=>a.tag))
      ||JSON.stringify(scene.packageActors)!==JSON.stringify(this.active.scene.packageActors)
      ||JSON.stringify(scene.facialAssets)!==JSON.stringify(this.active.scene.facialAssets)
      ||JSON.stringify(scene.sceneObjects)!==JSON.stringify(this.active.scene.sceneObjects)
      ||Boolean(scene.isolateResidentWorld)!==Boolean(this.active.scene.isolateResidentWorld)
      ||Boolean(scene.isolateScheduledActors)!==Boolean(this.active.scene.isolateScheduledActors)
      ||scene.telephoneReceiver!==this.active.scene.telephoneReceiver
      ||JSON.stringify(Object.keys(scene.sceneObjectTracks||{}))!==JSON.stringify(Object.keys(this.active.scene.sceneObjectTracks||{}))
      ||scene.attachedObjects||scene.objectTransforms||this.active.objects||this.active.restoreObjects))return false;
    const owner = continuing?this.active:{ transaction, scene, controller: new AbortController(), elapsed: 0, actors:this.actors,
      actorsBegun: false, cameraBegun: false, snapshot: this.capturePlayerState() };
    this.active = owner;
    const { signal } = owner.controller;
    try {
      if (scene.screenFades && !this.screenFade) throw new Error("Story screen fade requires a foreground presentation");
      if (scene.screenFades?.beforeReposition) {
        await this.playScreenFade(owner,scene.screenFades.beforeReposition);
        signal.throwIfAborted();
      }
      if(!continuing&&scene.packageActors){
        if(!this.createActorSet)throw Error(`No package actor loader for ${scene.id}`);
        owner.actorSet=this.createActorSet(scene.packageActors,signal);
        owner.loadingActorSet=true;
        try{await owner.actorSet.load();}finally{owner.loadingActorSet=false;}
        signal.throwIfAborted();
        owner.actors=owner.actorSet.actors;
      }
      if(!continuing)await owner.actors.prepare(scene.actors.map(actor => actor.tag), { signal });
      signal.throwIfAborted();
      await this.motionRuntime.loadNamedSelections(scene.actors.flatMap(actor => [actor.motion,...(actor.baseMotion?[actor.baseMotion]:[]),...(actor.motionCues || []).map(cue=>cue.motion),...(actor.endMotion?[actor.endMotion]:[])]));
      signal.throwIfAborted();
      if(!continuing && scene.facialAssets){
        const tags=Object.keys(scene.facialAssets);
        if(!this.createFaces || !tags.length || tags.some(tag=>!scene.actors.some(actor=>actor.tag===tag)))
          throw Error(`Invalid staged face binding for ${scene.id}`);
        owner.faces=this.createFaces(scene.facialAssets,owner.actors,signal);
        await owner.faces.prepare({actors:tags});
        signal.throwIfAborted();
      }
      if(this.active!==owner)return false;
      for (const audio of owner.soundCueAudio || []) this.dialogueAudio.stopOneShot(audio);
      owner.soundCueAudio = [];
      owner.nextSoundCue = 0;
      owner.scene=scene;owner.elapsed=0;owner.voiceCuePlayed=false;
      if (!scene.continueCamera) {
        owner.shot = scene.cameraPool ? this.cameraPools.select(scene.cameraPool,transaction) : scene;
        owner.cameraElapsed = 0;
        if (scene.cameraFromCurrent) {
          const current = continuing ? owner.lastCameraPose : this.camera.currentPose();
          const initial = Object.fromEntries(scene.cameraFromCurrent.map(key=>[key,current[key]]));
          owner.shot = {...owner.shot,cameraTrack:seedStartingKeys(owner.shot.cameraTrack,initial)};
        }
      }
      owner.movement = new Map();
      owner.startOffsets = new Map();
      for (const actor of scene.actors) {
        if (actor.movementFromPlayer) {
          const [x,y,z] = owner.snapshot.position;
          const heading = Math.atan2(actor.pose.x + x, actor.pose.z - z) * 180 / Math.PI;
          // Keep interpolation on the short arc when the approach crosses north.
          const turn = ((heading - actor.pose.rotationY + 540) % 360) - 180;
          const initial = {x: -x, y, z, rotationY: actor.pose.rotationY + turn};
          owner.movement.set(actor.tag, seedStartingKeys(actor.movement, initial));
        }
        if (actor.continueMotion) {
          const last = owner.lastSamples?.get(actor.tag);
          if (!last || last.motion.bank!==actor.motion.bank || last.motion.name!==actor.motion.name) throw Error("Unavailable continued motion " + actor.tag);
          owner.startOffsets.set(actor.tag,last.elapsed);
        }
      }
      owner.lastSamples = scene.continuationGroup ? new Map(scene.actors.map(actor=>[actor.tag,{}])) : null;
      owner.durationSeconds = scene.waitForMotions
        ? Math.max(...scene.actors.map(actor => this.motionRuntime.namedDurationSeconds(actor.motion)))
        : scene.durationSeconds;
      if (scene.waitForMotions && (!Number.isFinite(owner.durationSeconds) || owner.durationSeconds <= 0 || owner.durationSeconds > 120)) {
        throw new Error(`Invalid loaded scene duration ${scene.id}`);
      }
      if(scene.sceneObjects&&!continuing){
        if(!this.createSceneObjects)throw Error(`No scene-object loader for ${scene.id}`);
        owner.sceneObjects=this.createSceneObjects(scene.sceneObjects,signal);
        owner.loadingProps=true;
        try{await owner.sceneObjects.load([]);}finally{owner.loadingProps=false;}
        signal.throwIfAborted();
        if(this.active!==owner)return false;
        owner.sceneObjects.prepareActivity({activityId:scene.id,nativeSceneObjectStates:Object.keys(scene.sceneObjects).map(actorTag=>({actorTag,presented:true}))});
        if(scene.sceneObjectTracks)owner.sceneObjects.begin(owner,Object.keys(scene.sceneObjectTracks));
      }
      if(scene.attachedObjects){
        if(!this.createAttachedObjects)throw new Error(`No authored prop loader for ${scene.id}`);
        owner.objects=this.createAttachedObjects(scene.attachedObjects,tag=>owner.actors.activeActor(tag),signal);
        owner.loadingProps=true;
        try{await owner.objects.load([]);}finally{owner.loadingProps=false;}
        signal.throwIfAborted();
      }
      if (this.active !== owner) return false;
      if(!continuing&&(scene.isolateResidentWorld||scene.isolateScheduledActors)){
        if(!this.acquireActorIsolation||(scene.isolateResidentWorld&&(!this.currentMeshes||!this.acquireEnvironmentIsolation)))throw Error(`No stage isolation provider for ${scene.id}`);
        if(scene.isolateResidentWorld)owner.releaseEnvironment=this.acquireEnvironmentIsolation();
        // Archive-owned actors also acquire a scheduled-actor suppression
        // lease for this scene owner. Isolation covers the complementary cast,
        // so it needs its own lease identity to coexist and release separately.
        owner.releaseActors=this.acquireActorIsolation({},[...scene.actors.map(actor=>actor.tag),...Object.keys(scene.packageActors||{})]);
        if(scene.isolateResidentWorld)owner.residentIsolation=acquireResidentStageIsolation(this.currentMeshes());
      }
      if (scene.objectTransforms) {
        if (!this.currentMeshes) throw Error(`No world object provider for ${scene.id}`);
        owner.restoreObjects = applyStoryObjectTransforms(this.currentMeshes(), scene.objectTransforms);
      }
      if(!continuing){
        owner.actors.begin(owner, scene.actors.map(actor => actor.tag));
        owner.actorsBegun = true;
        if(owner.faces){
          owner.faces.begin(owner,Object.keys(scene.facialAssets));
          owner.faceSeconds=0;
          owner.faceVoices=new Map();
        }
        this.camera.begin(owner);
        owner.cameraBegun = true;
        if(scene.telephoneReceiver){
          if(!this.createTelephoneReceiver)throw Error(`No telephone receiver provider for ${scene.id}`);
          owner.telephoneReceiver=this.createTelephoneReceiver(tag=>owner.actors.activeActor(tag));
        }
      }
      for (const actor of scene.actors) {
        if (actor.pose && !owner.actors.applyTransform(owner, actor.tag, actor.pose)) throw new Error(`Cannot stage actor ${actor.tag}`);
        // Borrow out-of-shot residents too: hiding an owned root suppresses
        // their ambient copy without moving it away or leaving a global flag.
        // A retained scene lease may bring the next attacker into view. Only
        // explicit visibility cues override the actor's captured state.
        if(actor.presented!=null)owner.actors.activeActor(actor.tag).root.setEnabled(actor.presented);
      }
      owner.objects?.beginActivity({activityId:scene.id,actors:scene.actors.map(a=>a.tag)});
      for (const command of scene.faceCommands ?? []) {
        if (!Object.hasOwn(scene.facialAssets ?? {}, command.actorTag) || !owner.faces?.play(owner, command)) {
          throw new Error(`Cannot apply ${command.name} to ${command.actorTag} in ${scene.id}`);
        }
      }
      if (!this.update(transaction, 0)) throw new Error(`Cannot present scene ${scene.id}`);
      if (scene.screenFades?.afterReposition) {
        await this.playScreenFade(owner,scene.screenFades.afterReposition);
        signal.throwIfAborted();
      }
      owner.resolveAt = scene.waitForMotionCompletion !== false ? owner.durationSeconds : scene.voiceCue?.dialogueAtSeconds;
      if(owner.resolveAt)await new Promise((resolve,reject)=>{owner.resolve=resolve;owner.reject=reject;});
      return true;
    } catch (error) {
      if (this.active === owner) this.release(transaction);
      else {
        if(owner.clearLateProps){owner.objects?.clear();owner.sceneObjects?.clear();}
        if(owner.clearLateActorSet)owner.actorSet?.clear();
      } // Release a late loader, never a newer scene.
      throw error;
    }
  }

  playScreenFade(owner,cue) {
    return this.screenFade.play(owner.transaction,cue,owner.controller.signal);
  }

  speakWithStagedFace(tag, model, lipSync, audio) {
    const owner=this.active;
    if(!owner?.faceVoices || !Object.hasOwn(owner.scene.facialAssets,tag)
      || owner.actors.activeActor(tag)?.model!==model)return null;
    const cue={command:{audio:{lipSync}}, get positionSeconds(){return Math.max(0,audio.currentTime||0);}};
    owner.faceVoices.set(tag,cue);
    return ()=>{
      if(owner.faceVoices.get(tag)===cue)owner.faceVoices.delete(tag);
    };
  }

  update(transaction, deltaSeconds) {
    const owner = this.active;
    if (!owner || owner.transaction !== transaction) return true;
    this.screenFade?.update(transaction,deltaSeconds);
    if (!owner.actorsBegun) return true;
    owner.elapsed += Math.max(0, deltaSeconds);
    owner.cameraElapsed += Math.max(0, deltaSeconds);
    for (const actor of owner.scene.actors) {
      // Some directors hold the current gameplay pose before requesting their first motion.
      if (owner.elapsed + 1e-8 < (actor.motionAtSeconds ?? 0)) continue;
      const model = owner.actors.activeActor(actor.tag)?.model;
      const movement = owner.movement.get(actor.tag) ?? actor.movement;
      if(movement&&!owner.actors.applyTransform(owner,actor.tag,evaluateAuthActor(movement,owner.elapsed)))return false;
      const ended=actor.endMotion&&owner.elapsed>=owner.durationSeconds;
      const cue = actor.motionCues?.findLast(cue => cue.atSeconds <= owner.elapsed);
      const activeMotion = ended ? actor.endMotion : cue?.motion ?? actor.motion;
      const clipStart = ended ? owner.durationSeconds : cue?.atSeconds ?? actor.motionAtSeconds ?? 0;
      const startSeconds = owner.startOffsets.get(actor.tag) ?? actor.motionStartSeconds ?? 0;
      const offset = ended ? 0 : cue ? cue.startSeconds ?? 0 : startSeconds;
      // A carried prop can hold the upper body while the native walk drives the legs.
      const layers = !ended && !cue && actor.baseMotion
        ? {baseSelection:actor.baseMotion, baseProvidesTimeline:true} : undefined;
      const rate = ended ? 1 : cue?.playbackRate ?? actor.playbackRate ?? 1;
      const elapsed = (owner.elapsed - clipStart) * rate + offset;
      if (owner.lastSamples) {
        const sample=owner.lastSamples.get(actor.tag);
        sample.motion=activeMotion;
        sample.elapsed=elapsed;
      }
      if (!this.motionRuntime.applyNamed(model, activeMotion, elapsed, layers)) return false;
      // Gameplay skips its post-pose pass while a story presentation owns the
      // actor. Reuse that pass here, or acquired cloth stays at the old pose.
      updateNativeCharacterSecondaryMotion(model, deltaSeconds);
      if (actor.lookAt) {
        owner.looks ??= new Map();
        if (!owner.looks.has(model)) owner.looks.set(model,{});
        applyNativeActorLookPresentation(model,actor.lookAt,owner.looks.get(model));
      }
    }
    for(const [tag,track] of Object.entries(owner.scene.sceneObjectTracks||{})){
      if(!owner.sceneObjects?.applyTransform(owner,tag,evaluateAuthActor(track,owner.elapsed)))return false;
    }
    if(owner.telephoneReceiver){
      if(!owner.receiverAttached){
        if(!owner.telephoneReceiver.attach(JOMO_TELEPHONE_RECEIVER,owner))return false;
        owner.receiverAttached=true;
      }else if(!owner.telephoneReceiver.update(JOMO_TELEPHONE_RECEIVER,owner))return false;
    }
    if(owner.objects?.update(Math.floor(owner.elapsed*30))===false)return false;
    if(owner.faces){
      owner.faceSeconds+=Math.max(0,deltaSeconds);
      if(!owner.faces.apply(owner,{frame:Math.floor(owner.faceSeconds*30),voiceCues:owner.faceVoices}))return false;
    }
    if(owner.scene.useGameplayCamera)this.updateGameplayCamera(deltaSeconds, owner.elapsed === 0);
    else {
      const pose = owner.shot.cameraTrack ? evaluateAuthCamera(owner.shot.cameraTrack,owner.cameraElapsed) : owner.shot.camera;
      if (!this.camera.apply(owner,pose)) return false;
      owner.lastCameraPose = pose;
    }
    const sounds = owner.scene.soundCues || [];
    while (owner.nextSoundCue < sounds.length && sounds[owner.nextSoundCue].atSeconds <= owner.elapsed) {
      const sound = sounds[owner.nextSoundCue++];
      if (owner.elapsed >= owner.durationSeconds) continue;
      const audio = this.dialogueAudio.playOneShot(sound.asset);
      if (audio) owner.soundCueAudio.push(audio);
    }
    const cue = owner.scene.voiceCue;
    if (cue && !owner.voiceCuePlayed && owner.elapsed >= cue.atSeconds) {
      owner.voiceCuePlayed = true;
      if (owner.elapsed < cue.dialogueAtSeconds) owner.voiceAudio = this.dialogueAudio.playOneShot(cue.asset);
    }
    if(owner.resolve&&owner.elapsed+1e-8>=owner.resolveAt){owner.resolve(true);owner.resolve=null;}
    return true;
  }

  commitPlayerPose(transaction) {
    const owner = this.active;
    if (!owner?.awaitingCommit || owner.transaction !== transaction) return false;
    const current = this.capturePlayerState();
    // Staged MT5 actors use a quaternion; their Euler fields are cleared.
    const q = owner.actors.activeActor("AKIR")?.root?.rotationQuaternion;
    const yaw = q
      ? Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.x * q.x + q.y * q.y))
      : current.yaw;
    return this.release(transaction, false, {...owner.snapshot, position: current.position, yaw});
  }

  release(transaction, keepTravelCover = false, returnPose = this.active?.snapshot) {
    const owner = this.active;
    if (!owner || owner.transaction !== transaction) return false;
    this.active = null;
    owner.clearLateProps=owner.loadingProps===true;
    owner.clearLateActorSet=owner.loadingActorSet===true;
    owner.controller.abort(new DOMException("Story scene released", "AbortError"));
    owner.reject?.(owner.controller.signal.reason);
    // Attempt every cleanup even when one adapter fails. The controller will
    // cancel instead of acknowledging an incomplete restoration.
    const errors = [];
    for (const [enabled, cleanup] of [
      ...[...(owner.looks || [])].map(([model,state]) => [true, () => restoreNativeActorLookPresentation(model,state)]),
      [!keepTravelCover && !!this.screenFade, () => this.screenFade.cancel(transaction)],
      ...(owner.soundCueAudio || []).map(audio => [true, () => this.dialogueAudio.stopOneShot(audio)]),
      [!!owner.voiceAudio, () => this.dialogueAudio.stopOneShot(owner.voiceAudio)],
      [!!owner.restoreObjects, () => owner.restoreObjects()],
      [!!owner.objects,()=>owner.objects.clear()],
      [!!owner.sceneObjects,()=>owner.sceneObjects.clear()],
      [!!owner.receiverAttached,()=>owner.telephoneReceiver.detach(JOMO_TELEPHONE_RECEIVER,owner)],
      [!!owner.residentIsolation,()=>owner.residentIsolation.restore()],
      [owner.cameraBegun, () => this.camera.end(owner)],
      [!!owner.faces, () => owner.faces.clear()],
      [owner.actorsBegun, () => owner.actors.end(owner, "stopped")],
      [!!owner.releaseActors,()=>owner.releaseActors()],
      [!!owner.actorSet, () => owner.actorSet.clear()],
      [!!owner.releaseEnvironment,()=>owner.releaseEnvironment()],
      [true, () => this.restorePlayerState(errors.length ? owner.snapshot : returnPose)],
    ]) if (enabled) {
      try { if (cleanup() === false) throw new Error("Story scene cleanup rejected"); }
      catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Story scene cleanup failed");
    return true;
  }

  cancel(transaction) {
    if (this.active?.transaction === transaction) return this.release(transaction);
    this.screenFade?.cancel(transaction);
    return false;
  }
}
