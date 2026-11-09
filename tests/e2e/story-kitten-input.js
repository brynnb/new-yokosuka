import {expect} from "@playwright/test";

// Pick a triangle on the actual rendered kitten. The shortcut positions the
// isolated test character but does not invoke the interaction directly.
export async function clickStoryKitten(page,position){
  const point=await page.evaluate(async pos=>{
    const {Ray}=await import('/node_modules/@babylonjs/core/Culling/ray.js');
    const l=window.storyProbe.lifecycle,root=l.sceneState.currentMeshes.find(m=>m.metadata?.runtimeObject?.objectTag==="CATM");
    if(!root)throw Error("Missing kitten placement");
    const c=l.getController(),b=root.getHierarchyBoundingVectors(true),center=b.min.add(b.max).scale(.5);
    const isCat=m=>{for(let n=m;n;n=n.parent)if(n===root)return true;return false;};
    const candidatesAt=[[pos[0],pos[2]]];for(const d of [1.4,2,2.6,3.2])for(let n=0;n<24;n++){const a=n*Math.PI/12;candidatesAt.push([center.x+Math.sin(a)*d,center.z+Math.cos(a)*d]);}
    let approach=null;
    for(const [x,z] of candidatesAt){
      const p=c.recoveryCandidateAt(x,z,pos[1],{constrainHeight:false});if(!p||Math.abs(p.y-pos[1])>1.2)continue;
      const eye=p.clone();eye.y+=c.options.firstPersonHeadHeight;const delta=center.subtract(eye),distance=delta.length();
      const blocked=l.scene.pickWithRay(new Ray(eye,delta.scale(1/distance),Math.max(0,distance-.2)),m=>m.isEnabled()&&m.isVisible&&m.isPickable&&!isCat(m)&&!m.isDescendantOf(c.actorRoot));
      if(!blocked?.hit){approach=p;break;}
    }
    if(!approach)throw Error(`No supported visible kitten approach near ${pos}`);
    l.resetPlayer(approach,0,{persist:false});c.setFirstPerson(true);c.cameraYaw=Math.atan2(approach.x-center.x,approach.z-center.z);c.cameraPitch=Math.atan2(approach.y+c.options.firstPersonHeadHeight-center.y,Math.hypot(center.x-approach.x,center.z-approach.z));c.updateCamera(1);
    const canvas=l.engine.getRenderingCanvas(),rect=canvas.getBoundingClientRect(),camera=l.scene.activeCamera,vp=camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
    const meshes=root.getChildMeshes().filter(m=>m.getTotalVertices()>0),candidates=[center];
    for(const m of meshes){const v=m.getVerticesData("position"),idx=m.getIndices();if(!v||!idx)continue;for(let i=0;i<idx.length;i+=3){const p=[0,0,0];for(let j=0;j<3;j++)for(let a=0;a<3;a++)p[a]+=v[idx[i+j]*3+a]/3;candidates.push(center.constructor.TransformCoordinates(new center.constructor(...p),m.getWorldMatrix()));}}
    for(const p of candidates){const s=center.constructor.Project(p,vp.constructor.Identity(),vp,camera.viewport.toGlobal(l.engine.getRenderWidth(),l.engine.getRenderHeight())),x=s.x*rect.width/l.engine.getRenderWidth(),y=s.y*rect.height/l.engine.getRenderHeight();if(s.z<0||s.z>1||x<280||x>1025||y<0||y>720)continue;const pick=l.scene.pick(x,y,m=>isCat(m)||Object.keys(m.metadata||{}).some(k=>k.startsWith("interactive")),false,camera);if(pick?.hit&&isCat(pick.pickedMesh))return{x:rect.x+x,y:rect.y+y};}
    throw Error(`No kitten surface from ${pos}`);
  },position);
  expect(point).toBeTruthy();
  // Allow normal presence to reach the isolated server after repositioning.
  await page.waitForTimeout(1200);await page.mouse.click(point.x,point.y);
}
