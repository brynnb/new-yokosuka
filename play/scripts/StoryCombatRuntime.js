import catalog from "../data/story-combat.json" with { type: "json" };
import { CombatInput } from "../combat/CombatInput.js";
import { PLAYER_COMBAT_CONFIG } from "../characters/PlayerMotionLibrary.js";

// Presentation/input only. Health, movement limits, hits and victory come from
// server snapshots. Reuse the same cinematic actor and named-motion adapters.
export class StoryCombatRuntime {
  constructor({actors,motionRuntime,getController,getBinding,capturePlayerState,restorePlayerState,onIntent,target=window,now=()=>performance.now()}) {
    Object.assign(this,{actors,motionRuntime,getController,getBinding,capturePlayerState,restorePlayerState,onIntent,target,now});
    this.active=null;
  }
  async show(view,transaction) {
    if(this.active) {
      if(this.active.transaction!==transaction || this.active.token!==view.token)throw new Error("Combat ownership changed without cleanup");
      this.active.view=view;this.active.receivedAt=this.now();return true;
    }
    const definition=catalog.encounters.find(def=>def.id===view.id);
    if(!definition || definition.area!==transaction.area)throw new Error(`No combat presentation ${view.id} in ${transaction.area}`);
    if(view.actors.length!==definition.actors.length || view.actors.some(actor=>!definition.actors.some(def=>def.tag===actor.tag)))throw new Error("Combat cast does not match the reviewed catalog");
    const owner={transaction,definition,view,token:view.token,controller:new AbortController(),snapshot:this.capturePlayerState(),
      actorsBegun:false,input:null,receivedAt:this.now(),poll:0,sequence:view.sequence,poses:new Map(),queuedAction:"",guard:false};
    this.active=owner;
    const {signal}=owner.controller;
    try {
      await this.actors.prepare(definition.actors.map(actor=>actor.tag),{signal});signal.throwIfAborted();
      const selections=[
        // Practice's stance/guard/reaction contract comes from M_FGT1, not
        // MOTION. The original banks were audited by exact sequence name.
        {bank:"fight",name:PLAYER_COMBAT_CONFIG.stance},{bank:"fight",name:PLAYER_COMBAT_CONFIG.guard},
        {bank:"free",name:"AKI_AKI_WALK_LP"},{bank:"fight",name:PLAYER_COMBAT_CONFIG.reactions.hit},
        {bank:"fight",name:PLAYER_COMBAT_CONFIG.reactions.defeated},
        ...definition.actions.flatMap(action=>[{bank:"free",name:action.playerAnimation},{bank:"fight",name:action.enemyAnimation}]),
      ];
      await this.motionRuntime.loadNamedSelections(selections);signal.throwIfAborted();
      if(this.active!==owner)return false;
      this.actors.begin(owner,definition.actors.map(actor=>actor.tag));owner.actorsBegun=true;
      const controller=this.getController();controller.setFirstPerson(false);
      controller.cameraDistance=Math.max(4,controller.cameraDistance);controller.cameraPitch=.24;
      owner.input=new CombatInput({target:this.target,enableToggle:false,getBindings:()=>({
        controls:this.getBinding("cancel"),hand:this.getBinding("combatHand"),leg:this.getBinding("combatLeg"),
        throw:this.getBinding("combatThrow"),guard:this.getBinding("combatGuard"),run:this.getBinding("run"),
        up:this.getBinding("moveForward"),down:this.getBinding("moveBackward"),left:this.getBinding("moveLeft"),right:this.getBinding("moveRight"),
      })});
      if(!this.update(transaction,0))throw new Error("Combat cast could not render");
      controller.updateCamera(1);
      this.onIntent("combat_ready",owner.token,null);return true;
    } catch(error) {if(this.active===owner)this.finish(transaction);throw error;}
  }
  action(command) {if(this.active?.view.ready)this.active.queuedAction=command;}
  setGuard(guard) {if(this.active)this.active.guard=guard;}
  update(transaction,deltaSeconds) {
    const owner=this.active;if(!owner || owner.transaction!==transaction || !owner.actorsBegun)return true;
    const age=Math.max(0,(this.now()-owner.receivedAt)/1000),alpha=deltaSeconds===0?1:1-Math.exp(-20*deltaSeconds);
    for(const view of owner.view.actors) {
      let pose=owner.poses.get(view.tag);if(!pose){pose={x:view.x,y:view.y,z:view.z,yaw:view.yaw};owner.poses.set(view.tag,pose);}
      pose.x+=(view.x-pose.x)*alpha;pose.y+=(view.y-pose.y)*alpha;pose.z+=(view.z-pose.z)*alpha;
      pose.yaw+=Math.atan2(Math.sin(view.yaw-pose.yaw),Math.cos(view.yaw-pose.yaw))*alpha;
      if(!this.actors.applyTransform(owner,view.tag,{x:-pose.x,y:pose.y,z:pose.z,rotationX:0,rotationY:180-pose.yaw*180/Math.PI,rotationZ:0}))return false;
      const action=owner.definition.actions.find(action=>action.input===view.pose);
      const selection=action?{bank:view.tag==="AKIR"?"free":"fight",name:view.tag==="AKIR"?action.playerAnimation:action.enemyAnimation,loop:false}
        :{bank:view.moving?"free":"fight",name:view.pose==="defeated"?PLAYER_COMBAT_CONFIG.reactions.defeated:view.pose==="hit"?PLAYER_COMBAT_CONFIG.reactions.hit:
          view.pose==="guard"?PLAYER_COMBAT_CONFIG.guard:view.moving?"AKI_AKI_WALK_LP":PLAYER_COMBAT_CONFIG.stance,loop:!["hit","defeated"].includes(view.pose)};
      if(!this.motionRuntime.applyNamed(this.actors.activeActor(view.tag)?.model,selection,view.poseMs/1000+age))return false;
    }
    const controller=this.getController();controller.updateCamera(Math.max(.01,deltaSeconds));
    if(!owner.view.ready)return true;
    owner.poll+=deltaSeconds;
    if(owner.poll<.1)return true;
    const bindings=owner.input.getBindings(),held=owner.input.held;
    const forward=Number(held.has(bindings.up))-Number(held.has(bindings.down));
    const side=Number(held.has(bindings.right))-Number(held.has(bindings.left));
    const yaw=controller.cameraYaw;
    const commands=owner.input.consumeCommands();
    const action=owner.queuedAction || [...commands].reverse().find(cmd=>["hand","leg","throw"].includes(cmd)) || "";
    const intent={sequence:owner.sequence+1,moveX:-Math.sin(yaw)*forward+Math.cos(yaw)*side,
      moveZ:-Math.cos(yaw)*forward-Math.sin(yaw)*side,guard:owner.guard||owner.input.guarding,sprint:held.has(bindings.run),action};
    const magnitude=Math.hypot(intent.moveX,intent.moveZ);if(magnitude>1){intent.moveX/=magnitude;intent.moveZ/=magnitude;}
    if(this.onIntent("combat_input",owner.token,intent)) {owner.sequence++;owner.poll=0;owner.queuedAction="";}
    else if(action)owner.queuedAction=action;
    return true;
  }
  finish(transaction) {
    const owner=this.active;if(!owner || owner.transaction!==transaction)return false;
    this.active=null;owner.controller.abort(new DOMException("Combat presentation released","AbortError"));owner.input?.dispose();
    try {if(owner.actorsBegun)this.actors.end(owner,"stopped");}
    finally{this.restorePlayerState(owner.snapshot);}
    return true;
  }
}
