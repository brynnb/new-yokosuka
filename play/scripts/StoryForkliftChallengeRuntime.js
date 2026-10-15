import {MeshBuilder,StandardMaterial,Color3,Ray,Vector3} from "@babylonjs/core";

// The normal forklift assembly owns movement, cargo physics and networking.
// This adapter only leases the player's controls/camera and shows the goal;
// the server's accepted cargo observations decide the outcome.
export class StoryForkliftChallengeRuntime {
  constructor({scene,getForklifts,getController,capturePlayerState,restorePlayerState,acquireMovementLock,onIntent,now=()=>performance.now()}){
    Object.assign(this,{scene,getForklifts,getController,capturePlayerState,restorePlayerState,acquireMovementLock,onIntent,now});this.active=null;
  }
  async show(prompt,transaction){
    const view=prompt.delivery||prompt.race;
    if(!view)throw Error("Forklift challenge has no vehicle view");
    let owner=this.active;
    if(owner){
      if(owner.transaction!==transaction||owner.token!==prompt.token)throw Error("Delivery ownership changed without cleanup");
      owner.prompt=prompt;
    }else{
      owner={transaction,token:prompt.token,prompt,controller:new AbortController(),snapshot:this.capturePlayerState(),poll:0,entered:false};this.active=owner;
      if(prompt.delivery){
      owner.marker=MeshBuilder.CreateBox("story-delivery-destination",{width:view.dropMax[0]-view.dropMin[0],height:.035,depth:view.dropMax[2]-view.dropMin[2]},this.scene);
      const x=(view.dropMin[0]+view.dropMax[0])/2,z=(view.dropMin[2]+view.dropMax[2])/2;
      const floor=this.scene.pickWithRay(new Ray(new Vector3(x,view.dropMax[1]+5,z),Vector3.Down(),20),mesh=>mesh.isEnabled()&&mesh.metadata?.terrain===true);
      if(!floor?.pickedPoint){this.finish(transaction);throw Error("Delivery destination has no walkable terrain");}
      owner.marker.position.set(x,floor.pickedPoint.y+.04,z);owner.marker.isPickable=false;
      owner.material=new StandardMaterial("story-delivery-destination",this.scene);owner.material.diffuseColor=new Color3(.1,.7,.25);owner.material.emissiveColor=new Color3(.05,.35,.1);owner.material.alpha=.6;owner.marker.material=owner.material;
      }
    }
    if(prompt.race)this.getForklifts().mode.race.setObservedRace(view);
    if(!prompt.ready){this.onIntent("challenge_ready",owner.token);return true;}
    if(owner.entered)return true;
    const start=this.now(),assembly=this.getForklifts(),signal=owner.controller.signal;
    try{
      while(!assembly.fleet.has(view.vehicleId)||(prompt.delivery&&!assembly.cargo.physics?.entries.has(view.cargoId))){
        signal.throwIfAborted();if(this.now()-start>30_000)throw Error("Challenge vehicle or crate did not load within 30 seconds");
        await new Promise(resolve=>setTimeout(resolve,25));
      }
      signal.throwIfAborted();
      if(this.active!==owner)return false;
      const entry=assembly.fleet.get(view.vehicleId);
      if(!assembly.mode.enter(entry))throw Error("Assigned delivery forklift could not be entered");
      transaction.releaseMovementLock();transaction.releaseMovementLock=()=>{};
      owner.releasedMovement=true;
      owner.entered=true;this.getController().setFirstPerson(false);this.getController().updateCamera(1);
      if(prompt.race)assembly.mode.race.setObservedRace(view);
      return true;
    }catch(error){if(this.active===owner)this.finish(transaction);throw error;}
  }
  update(transaction,deltaSeconds){
    const o=this.active;if(!o||o.transaction!==transaction||!o.entered)return true;
    o.poll+=deltaSeconds;if(o.poll>=.2&&this.onIntent("challenge_poll",o.token))o.poll=0;return true;
  }
  finish(transaction){
    const o=this.active;if(!o||o.transaction!==transaction)return false;this.active=null;
    o.controller.abort(new DOMException("Delivery released","AbortError"));
    const errors=[];
    const view=o.prompt.delivery||o.prompt.race;
    for(const cleanup of [()=>{const m=this.getForklifts().mode;if(m.driving&&m.activeId===view.vehicleId)m.exit();},()=>{if(o.prompt.race)this.getForklifts().mode.race.clearObservedRace();},()=>o.marker?.dispose(),()=>o.material?.dispose(),()=>this.restorePlayerState(o.snapshot)]){
      try{cleanup();}catch(error){errors.push(error);}
    }
    if(o.releasedMovement)transaction.releaseMovementLock=this.acquireMovementLock();
    if(errors.length)throw new AggregateError(errors,"Delivery cleanup failed");return true;
  }
}
