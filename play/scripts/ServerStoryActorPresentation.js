import {updateNativeCharacterSecondaryMotion} from "../characters/NativeCharacterSecondaryMotion.js";

// Combat and navigation render the same server-owned actor poses. Keep native
// coordinate conversion, interpolation and secondary motion in one place.
export function renderServerStoryActors({owner,actors,motionRuntime,deltaSeconds,age,selectMotion}){
  const alpha=deltaSeconds===0?1:1-Math.exp(-20*deltaSeconds);
  for(const view of owner.view.actors){
    if(view.inactive===true){
      const actor=actors.activeActor(view.tag);if(!actor?.root)throw Error(`Inactive server actor ${view.tag} has no owned root`);
      actor.root.setEnabled(false);(owner.hiddenActors||=new Set()).add(view.tag);owner.poses.delete(view.tag);continue;
    }
    if(owner.hiddenActors?.delete(view.tag))actors.activeActor(view.tag).root.setEnabled(true);
    let pose=owner.poses.get(view.tag);
    // A reinforcement can reuse the same render slot, but never interpolate
    // from the preceding defeated fighter's position or animation lifetime.
    if(!pose||(pose.spawnRevision||0)!==(view.spawnRevision||0)){pose={x:view.x,y:view.y,z:view.z,yaw:view.yaw,spawnRevision:view.spawnRevision||0};owner.poses.set(view.tag,pose);}
    pose.x+=(view.x-pose.x)*alpha;pose.y+=(view.y-pose.y)*alpha;pose.z+=(view.z-pose.z)*alpha;
    pose.yaw+=Math.atan2(Math.sin(view.yaw-pose.yaw),Math.cos(view.yaw-pose.yaw))*alpha;
    if(!actors.applyTransform(owner,view.tag,{x:-pose.x,y:pose.y,z:pose.z,rotationX:0,rotationY:180-pose.yaw*180/Math.PI,rotationZ:0}))return false;
    const model=actors.activeActor(view.tag)?.model;
    if(!motionRuntime.applyNamed(model,selectMotion(view),view.poseMs/1000+age))return false;
    updateNativeCharacterSecondaryMotion(model,deltaSeconds);
  }
  return true;
}
