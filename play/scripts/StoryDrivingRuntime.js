import catalog from "../data/story-driving.json" with {type:"json"};
import motorcycle from "../assets/sakuragaoka/nozomi-motorcycle/manifest.json" with {type:"json"};
import {CombatInput} from "../combat/CombatInput.js";
import {renderServerStoryActors} from "./ServerStoryActorPresentation.js";

const riding={bank:"motorcycle",name:"AKI_AKI_MOTORBIKE_1",loop:false,elapsedSeconds:0};
const actorView=view=>({...view,actors:[view.actor]});

// Camera, input and original-model presentation only. The leased server event
// owns physics, original-road support, time, ordered gates and the outcome.
export class StoryDrivingRuntime {
  constructor({actors,motionRuntime,getController,getBinding,capturePlayerState,restorePlayerState,createSceneObjects,onIntent,target=window,now=()=>performance.now()}){
    Object.assign(this,{actors,motionRuntime,getController,getBinding,capturePlayerState,restorePlayerState,createSceneObjects,onIntent,target,now});this.active=null;
  }
  async show(prompt,transaction){
    if(this.active){
      const o=this.active;if(o.transaction!==transaction||o.token!==prompt.token)throw Error("Driving ownership changed without cleanup");
      o.view=actorView(prompt.driving);o.ready=prompt.ready;o.receivedAt=this.now();return true;
    }
    const definition=catalog.challenges.find(d=>d.id===prompt.id);
    if(!definition||definition.area!==transaction.area||prompt.driving?.worldId!==definition.worldId||prompt.driving.actor?.tag!=="AKIR")throw Error("Invalid driving area/actor");
    const o={transaction,definition,token:prompt.token,view:actorView(prompt.driving),ready:prompt.ready,controller:new AbortController(),snapshot:this.capturePlayerState(),poses:new Map(),sequence:prompt.driving.sequence,poll:0,receivedAt:this.now(),virtual:{}};
    this.active=o;const {signal}=o.controller;
    try{
      await this.actors.prepare(["AKIR"],{signal});signal.throwIfAborted();
      await this.motionRuntime.loadNamedSelections([riding]);signal.throwIfAborted();
      o.objects=this.createSceneObjects({BIKE:motorcycle.sceneObjects.BIKE},signal);o.loadingObjects=true;
      try{await o.objects.load([]);}finally{o.loadingObjects=false;}
      signal.throwIfAborted();if(this.active!==o)return false;
      this.actors.begin(o,["AKIR"]);o.actorsBegun=true;
      o.objects.begin(o,["BIKE"]);o.objectsBegun=true;
      const c=this.getController();c.setFirstPerson(false);c.cameraDistance=6;c.cameraPitch=.18;
      o.input=new CombatInput({target:this.target,enableToggle:false,getBindings:()=>({controls:this.getBinding("cancel"),up:this.getBinding("moveForward"),down:this.getBinding("moveBackward"),left:this.getBinding("moveLeft"),right:this.getBinding("moveRight")})});
      if(!this.update(transaction,0))throw Error("Motorcycle/rider could not render");c.updateCamera(1);
      this.onIntent("challenge_ready",o.token);return true;
    }catch(error){if(this.active===o)this.finish(transaction);else if(o.clearLateObjects)o.objects?.clear();throw error;}
  }
  control(name,value){if(this.active&&["throttle","brake","left","right"].includes(name))this.active.virtual[name]=Boolean(value);}
  update(transaction,deltaSeconds){
    const o=this.active;if(!o||o.transaction!==transaction||!o.actorsBegun)return true;
    if(!renderServerStoryActors({owner:o,actors:this.actors,motionRuntime:this.motionRuntime,deltaSeconds,age:0,selectMotion:()=>riding}))return false;
    const pose=o.poses.get("AKIR"),rotationY=180-pose.yaw*180/Math.PI;
    // Both the shared actor presenter and scene-object adapter accept native
    // X. Server movement snapshots use browser X; convert exactly once here.
    if(!o.objects.applyTransform(o,"BIKE",{x:-pose.x,y:pose.y,z:pose.z,rotationX:0,rotationY,rotationZ:0}))return false;
    const c=this.getController();c.cameraYaw=pose.yaw+Math.PI;c.updateCamera(Math.max(.01,deltaSeconds));
    if(!o.ready)return true;o.poll+=deltaSeconds;if(o.poll<.1)return true;
    const b=o.input.getBindings(),held=o.input.held,v=o.virtual;
    const intent={sequence:o.sequence+1,throttle:Number(held.has(b.up)||v.throttle===true),brake:Number(held.has(b.down)||v.brake===true),steering:Number(held.has(b.right)||v.right===true)-Number(held.has(b.left)||v.left===true)};
    if(this.onIntent("challenge_move",o.token,intent)){o.sequence++;o.poll=0;}return true;
  }
  finish(transaction){
    const o=this.active;if(!o||o.transaction!==transaction)return false;this.active=null;o.clearLateObjects=o.loadingObjects===true;
    o.controller.abort(new DOMException("Driving released","AbortError"));const errors=[];
    for(const cleanup of [()=>o.input?.dispose(),()=>{if(o.objectsBegun)o.objects.end(o,"stopped");o.objects?.clear();},()=>{if(o.actorsBegun)return this.actors.end(o,"stopped");},()=>this.restorePlayerState(o.snapshot)]){
      try{if(cleanup()===false)throw Error("Driving cleanup rejected");}catch(error){errors.push(error);}
    }
    if(errors.length)throw new AggregateError(errors,"Driving cleanup failed");return true;
  }
}
