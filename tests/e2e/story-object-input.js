import {expect} from "@playwright/test";

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

