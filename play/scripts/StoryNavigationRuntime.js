import catalog from "../data/story-navigation.json" with {type:"json"};
import {CombatInput} from "../combat/CombatInput.js";
import {renderServerStoryActors} from "./ServerStoryActorPresentation.js";

// Intent and presentation only. The server owns walls, patrols, detection and
// door-use success; a local position or completed animation cannot win.
export class StoryNavigationRuntime{
  constructor({actors,motionRuntime,getController,getBinding,capturePlayerState,restorePlayerState,createAttachedObjects,onIntent,target=window,now=()=>performance.now()}){
    Object.assign(this,{actors,motionRuntime,getController,getBinding,capturePlayerState,restorePlayerState,createAttachedObjects,onIntent,target,now});this.active=null;
  }
  async show(prompt,transaction){
    const view=prompt.navigation;
    if(this.active){if(this.active.transaction!==transaction||this.active.token!==prompt.token)throw Error("Navigation ownership changed without cleanup");this.active.view=view;this.active.ready=prompt.ready;this.active.receivedAt=this.now();return true;}
    const definition=catalog.challenges.find(d=>d.id===prompt.id);
    if(!definition||definition.area!==transaction.area||view.actors.length!==definition.guards.length+1||view.actors.some(a=>a.tag!=="AKIR"&&!definition.guards.some(g=>g.tag===a.tag)))throw Error("Invalid navigation cast/area");
    const owner={transaction,definition,view,ready:prompt.ready,token:prompt.token,controller:new AbortController(),snapshot:this.capturePlayerState(),poses:new Map(),actorsBegun:false,receivedAt:this.now(),sequence:view.sequence,poll:0,use:false,hide:false,virtual:[0,0]};this.active=owner;
    const {signal}=owner.controller;
    try{
      await this.actors.prepare(view.actors.map(a=>a.tag),{signal});signal.throwIfAborted();
      await this.motionRuntime.loadNamedSelections([{bank:"free",name:"AKI_AKI_WALK_LP"},{bank:"free",name:"AKI_AKI_STAND_LP"},{bank:"oldDistrict",name:"AKI_UZUKUMARU_BOX_0153"}]);signal.throwIfAborted();
      if(definition.attachedObjects){
        if(!this.createAttachedObjects)throw Error(`No navigation prop loader for ${definition.id}`);
        owner.objects=this.createAttachedObjects(definition.attachedObjects,tag=>this.actors.activeActor(tag),signal);
        owner.loadingProps=true;
        try{await owner.objects.load([]);}finally{owner.loadingProps=false;}
        signal.throwIfAborted();
      }
      if(this.active!==owner)return false;
      this.actors.begin(owner,view.actors.map(a=>a.tag));owner.actorsBegun=true;
      owner.objects?.beginActivity({activityId:definition.id,actors:view.actors.map(a=>a.tag)});
      const c=this.getController();c.setFirstPerson(false);c.cameraDistance=Math.max(4,c.cameraDistance);c.cameraPitch=.24;
      c.cameraYaw=Math.atan2(-(definition.goal[0]-definition.player[0]),-(definition.goal[2]-definition.player[2]));
      owner.input=new CombatInput({target:this.target,enableToggle:false,getBindings:()=>({controls:this.getBinding("cancel"),hand:this.getBinding("storyUse"),guard:this.getBinding("storyHide"),run:this.getBinding("run"),up:this.getBinding("moveForward"),down:this.getBinding("moveBackward"),left:this.getBinding("moveLeft"),right:this.getBinding("moveRight")})});
      if(!this.update(transaction,0))throw Error("Navigation actors could not render");c.updateCamera(1);
      this.onIntent("challenge_ready",owner.token);return true;
    }catch(error){if(this.active===owner)this.finish(transaction);else if(owner.clearLateProps)owner.objects?.clear();throw error;}
  }
  use(){if(this.active)this.active.use=true;}
  hide(value){if(this.active)this.active.hide=value;}
  direction(x,z){if(this.active)this.active.virtual=[x,z];}
  update(transaction,deltaSeconds){
    const o=this.active;if(!o||o.transaction!==transaction||!o.actorsBegun)return true;
    const age=Math.max(0,(this.now()-o.receivedAt)/1000);
    if(!renderServerStoryActors({owner:o,actors:this.actors,motionRuntime:this.motionRuntime,deltaSeconds,age,selectMotion:a=>a.hiding?{bank:"oldDistrict",name:"AKI_UZUKUMARU_BOX_0153",loop:false,elapsedSeconds:8.5}:{bank:"free",name:a.moving?"AKI_AKI_WALK_LP":"AKI_AKI_STAND_LP",loop:true}}))return false;
    if(o.objects?.update(0)===false)return false;
    const c=this.getController();c.updateCamera(Math.max(.01,deltaSeconds));if(!o.ready)return true;
    o.poll+=deltaSeconds;if(o.poll<.1)return true;
    const b=o.input.getBindings(),held=o.input.held,forward=Number(held.has(b.up))-Number(held.has(b.down))+o.virtual[1],side=Number(held.has(b.right))-Number(held.has(b.left))+o.virtual[0],yaw=c.cameraYaw;
    const commands=o.input.consumeCommands();if(commands.includes("hand"))o.use=true;
    const intent={sequence:o.sequence+1,moveX:-Math.sin(yaw)*forward+Math.cos(yaw)*side,moveZ:-Math.cos(yaw)*forward-Math.sin(yaw)*side,hide:o.hide||o.input.guarding,sprint:held.has(b.run),use:o.use};
    const magnitude=Math.hypot(intent.moveX,intent.moveZ);if(magnitude>1){intent.moveX/=magnitude;intent.moveZ/=magnitude;}
    if(this.onIntent("challenge_move",o.token,intent)){o.sequence++;o.poll=0;o.use=false;}
    return true;
  }
  finish(transaction){
    const o=this.active;if(!o||o.transaction!==transaction)return false;this.active=null;o.clearLateProps=o.loadingProps===true;
    o.controller.abort(new DOMException("Navigation released","AbortError"));
    const errors=[];
    for(const cleanup of [()=>o.input?.dispose(),()=>o.objects?.clear(),()=>{if(o.actorsBegun)return this.actors.end(o,"stopped");},()=>this.restorePlayerState(o.snapshot)]){
      try{if(cleanup()===false)throw Error("Navigation cleanup rejected");}catch(error){errors.push(error);}
    }
    if(errors.length)throw new AggregateError(errors,"Navigation cleanup failed");return true;
  }
}
