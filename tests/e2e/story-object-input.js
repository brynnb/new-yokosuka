import {expect} from "@playwright/test";

export async function openStoryRoomDoor(page,{tag,position}) {
  await page.evaluate(({tag,position})=>{
    const l=window.storyProbe.lifecycle,d=l.doorInteractions.entries.find(d=>d.objectTag===tag);
    if(!d)throw Error(`Missing physical room door ${tag}`);
    l.resetPlayer(l.vectorFromArray(position),0,{persist:false});
    const b=d.root.getHierarchyBoundingVectors(true),p=b.min.add(b.max).scale(.5),c=l.getController();
    c.setFirstPerson(true);c.cameraYaw=Math.atan2(position[0]-p.x,position[2]-p.z);
    c.cameraPitch=Math.atan2(position[1]+c.options.firstPersonHeadHeight-p.y,Math.hypot(p.x-position[0],p.z-position[2]));c.updateCamera(1);
  },{tag,position});
  await page.waitForTimeout(500);
  const point=await page.evaluate(tag=>{
    const l=window.storyProbe.lifecycle,d=l.doorInteractions.entries.find(d=>d.objectTag===tag),b=d.root.getHierarchyBoundingVectors(true),p=b.min.add(b.max).scale(.5);
    const canvas=l.engine.getRenderingCanvas(),r=canvas.getBoundingClientRect(),camera=l.scene.activeCamera,vp=camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
    const s=p.constructor.Project(p,vp.constructor.Identity(),vp,camera.viewport.toGlobal(l.engine.getRenderWidth(),l.engine.getRenderHeight()));
    const x=s.x*r.width/l.engine.getRenderWidth(),y=s.y*r.height/l.engine.getRenderHeight();
    const pick=l.scene.pick(x,y,m=>Object.keys(m.metadata||{}).some(k=>k.startsWith("interactive")),false,camera);
    return{x:r.x+x,y:r.y+y,state:d.state,picked:pick?.pickedMesh?.metadata?.interactiveDoor?.objectTag,
      threshold:d.collisionBindCenter?.asArray(),type:d.type};
  },tag);
  console.info("Room door pick",{tag,...point});
  if(point.state==="closed"){expect(point.picked).toBe(tag);await page.mouse.click(point.x,point.y);}
  await page.waitForFunction(tag=>window.storyProbe.lifecycle.doorInteractions.entries.find(d=>d.objectTag===tag)?.state==="open",tag);
  const gapCenter=await page.evaluate(tag=>{
    const l=window.storyProbe.lifecycle,d=l.doorInteractions.entries.find(d=>d.objectTag===tag),p=d.collisionBindCenter;
    if(d.type!=="sliding"||!p)return null;
    for(const m of l.scene.meshes){
      if(!m.metadata?.nativeCollisionDoorMoved)continue;
      for(const [a,b] of m.metadata.nativeCollisionSegments||[]){
        const dx=b[0]-a[0],dz=b[1]-a[1],len2=dx*dx+dz*dz,t=((p.x-a[0])*dx+(p.z-a[1])*dz)/len2;
        if(t<0||t>1||Math.hypot(p.x-a[0]-t*dx,p.z-a[1]-t*dz)>.12)continue;
        // A translated leaf opens a gap at its trailing endpoint. Its closed
        // center may still overlap the stacked leaf by more than Ryo's radius.
        const v=m.position,tip=a[0]*v.x+a[1]*v.z<b[0]*v.x+b[1]*v.z?a:b;
        return[tip[0]+v.x/2,0,tip[1]+v.z/2];
      }
    }
    throw Error(`No moved native boundary for room door ${tag}`);
  },tag);
  return {...point,gapCenter};
}

export async function useStoryInspectable(page,{world,tag,position,expectedChoice='Call 0468-61-5647'}) {
  await page.evaluate(async({world,tag,position})=>{
    const life=window.storyProbe.lifecycle;
    if(life.worldRuntime.activeWorld.id!==world)await life.travelToWorld(world);
    life.resetPlayer(life.vectorFromArray(position),0,{persist:false});
    const target=life.scene.meshes.map(mesh=>mesh.metadata?.interactiveInspectable || mesh.metadata?.interactiveMapTransition)
      .find(value=>value?.objectTag===tag || value?.transition?.source.objectTag===tag);
    if(!target)throw Error(`Missing physical story object ${world}/${tag}`);
    const bounds=target.root.getHierarchyBoundingVectors(true),center=bounds.min.add(bounds.max).scale(.5),controller=life.getController();
    controller.setFirstPerson(true);controller.cameraYaw=Math.atan2(position[0]-center.x,position[2]-center.z);
    controller.cameraPitch=Math.atan2(position[1]+controller.options.firstPersonHeadHeight-center.y,Math.hypot(center.x-position[0],center.z-position[2]));
    controller.updateCamera(1);
  },{world,tag,position});
  await page.waitForTimeout(500);
  const point=await page.evaluate(tag=>{
    const life=window.storyProbe.lifecycle,root=life.scene.meshes.map(mesh=>mesh.metadata?.interactiveInspectable || mesh.metadata?.interactiveMapTransition)
      .find(value=>value?.objectTag===tag || value?.transition?.source.objectTag===tag).root;
    const bounds=root.getHierarchyBoundingVectors(true),center=bounds.min.add(bounds.max).scale(.5),canvas=life.engine.getRenderingCanvas(),rect=canvas.getBoundingClientRect();
    const camera=life.scene.activeCamera,viewProjection=camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
    const candidates=[center],meshes=root.getChildMeshes().filter(m=>m.getTotalVertices()>0);
    // Hollow props need a point on a real surface, not the empty center of
    // their bounding box. Project actual triangle centers and validate the pick.
    for(const mesh of meshes){
      const positions=mesh.getVerticesData('position'),indices=mesh.getIndices();
      if(!positions||!indices)continue;
      for(let i=0;i<indices.length;i+=3){
        const p=[0,0,0];for(let j=0;j<3;j++)for(let axis=0;axis<3;axis++)p[axis]+=positions[indices[i+j]*3+axis]/3;
        candidates.push(center.constructor.TransformCoordinates(new center.constructor(...p),mesh.getWorldMatrix()));
      }
    }
    for(const candidate of candidates){
      const screen=center.constructor.Project(candidate,viewProjection.constructor.Identity(),viewProjection,camera.viewport.toGlobal(life.engine.getRenderWidth(),life.engine.getRenderHeight()));
      const x=rect.x+screen.x*rect.width/life.engine.getRenderWidth(),y=rect.y+screen.y*rect.height/life.engine.getRenderHeight();
      if(screen.z<0||screen.z>1||x<280||x>1025||y<0||y>720)continue;
      // Babylon accepts canvas CSS coordinates, not internal render pixels.
      // Adaptive resolution can change that ratio between two interactions.
      const pick=life.scene.pick(x-rect.x,y-rect.y,mesh=>!!(mesh.metadata?.interactiveInspectable||mesh.metadata?.interactiveMapTransition),false,camera);
      const selected=pick?.pickedMesh?.metadata;
      if(selected?.interactiveInspectable?.objectTag===tag||selected?.interactiveMapTransition?.transition.source.objectTag===tag)return{x,y,tag};
    }
    return{tag:null,center:center.asArray(),camera:camera.position.asArray(),meshes:meshes.map(m=>({name:m.name,pickable:m.isPickable,enabled:m.isEnabled(),visible:m.isVisible}))};
  },tag);
  console.info('Story object pick',point);
  expect(point.tag).toBe(tag);await page.mouse.click(point.x,point.y);
  if(expectedChoice)await expect(page.getByRole('button',{name:expectedChoice,exact:true})).toBeVisible();
}
