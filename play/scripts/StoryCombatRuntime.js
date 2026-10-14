import catalog from "../data/story-combat.json" with { type: "json" };
import { CombatInput } from "../combat/CombatInput.js";
import { PLAYER_COMBAT_CONFIG } from "../characters/PlayerMotionLibrary.js";
import {renderServerStoryActors} from "./ServerStoryActorPresentation.js";

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
      // The approach camera can put the opponent under a sidebar or behind
      // the player. Frame the nearest opponent at acquisition; subsequent
      // orbiting remains player-controlled, and finish restores the snapshot.
      const player=view.actors.find(actor=>actor.tag==="AKIR");
      const nearest=view.actors.filter(actor=>actor.tag!=="AKIR").reduce((best,actor)=>
        !best||Math.hypot(actor.x-player.x,actor.z-player.z)<Math.hypot(best.x-player.x,best.z-player.z)?actor:best,null);
      if(nearest)controller.cameraYaw=Math.atan2(player.x-nearest.x,player.z-nearest.z);
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
    const age=Math.max(0,(this.now()-owner.receivedAt)/1000);
    if(!renderServerStoryActors({owner,actors:this.actors,motionRuntime:this.motionRuntime,deltaSeconds,age,selectMotion:view=>{
      const action=owner.definition.actions.find(action=>action.input===view.pose);
      // A guarded step or a hit during movement retains the movement flag in
      // the authoritative snapshot. Select the bank by animation, not that
      // independent flag: guard/reaction clips belong to M_FGT1, not MOTION.
      const walking=view.moving&&!["guard","hit","defeated"].includes(view.pose);
      return action?{bank:view.tag==="AKIR"?"free":"fight",name:view.tag==="AKIR"?action.playerAnimation:action.enemyAnimation,loop:false}
        :{bank:walking?"free":"fight",name:view.pose==="defeated"?PLAYER_COMBAT_CONFIG.reactions.defeated:view.pose==="hit"?PLAYER_COMBAT_CONFIG.reactions.hit:
          view.pose==="guard"?PLAYER_COMBAT_CONFIG.guard:walking?"AKI_AKI_WALK_LP":PLAYER_COMBAT_CONFIG.stance,loop:!["hit","defeated"].includes(view.pose)};
    }}))return false;
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
