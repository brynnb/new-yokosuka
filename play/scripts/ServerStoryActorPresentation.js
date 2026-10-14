import {updateNativeCharacterSecondaryMotion} from "../characters/NativeCharacterSecondaryMotion.js";

// Combat and navigation render the same server-owned actor poses. Keep native
// coordinate conversion, interpolation and secondary motion in one place.
export function renderServerStoryActors({owner,actors,motionRuntime,deltaSeconds,age,selectMotion}){
  const alpha=deltaSeconds===0?1:1-Math.exp(-20*deltaSeconds);
  for(const view of owner.view.actors){
    let pose=owner.poses.get(view.tag);
    if(!pose){pose={x:view.x,y:view.y,z:view.z,yaw:view.yaw};owner.poses.set(view.tag,pose);}
    pose.x+=(view.x-pose.x)*alpha;pose.y+=(view.y-pose.y)*alpha;pose.z+=(view.z-pose.z)*alpha;
    pose.yaw+=Math.atan2(Math.sin(view.yaw-pose.yaw),Math.cos(view.yaw-pose.yaw))*alpha;
    if(!actors.applyTransform(owner,view.tag,{x:-pose.x,y:pose.y,z:pose.z,rotationX:0,rotationY:180-pose.yaw*180/Math.PI,rotationZ:0}))return false;
    const model=actors.activeActor(view.tag)?.model;
    if(!motionRuntime.applyNamed(model,selectMotion(view),view.poseMs/1000+age))return false;
    updateNativeCharacterSecondaryMotion(model,deltaSeconds);
  }
  return true;
}
