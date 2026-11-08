import {expect} from "@playwright/test";

// Presentation-only review of source models and the authored development
// timing. This does not select a Story outcome or alter saved progression.
export async function reviewNozomiPhotoPlanes(page,testInfo,character) {
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before=await saved();
  await page.evaluate(async()=>{
    const p=window.storyProbe;
    p.photoReview={done:false,error:null,cancelling:false,dispatchers:[p.regions,p.automatic].map(o=>[o,o.update])};
    for(const [owner] of p.photoReview.dispatchers)owner.update=()=>false;
    await p.lifecycle.travelToWorld("mfsy");
    const c=p.lifecycle.getController();
    p.photoReview.previous={position:c.collider.position.asArray(),firstPerson:c.firstPerson,avatar:p.lifecycle.playerRuntime.activeCharacterId};
    Object.defineProperty(p.regions.controller,"ownsPlayerPresentation",{configurable:true,get:()=>p.regions.controller.presentation.ownsPlayerPresentation});
    const presenter=p.regions.controller.presentation;
    presenter.begin({area:"MFSY"});
    void presenter.execute({name:"start_activity",arguments:[{type:"string",isStatic:true,value:"s1.mfsy.nozomi-photo-intro.scene"}]})
      .then(()=>{presenter.commit();p.photoReview.done=true;},error=>{
        presenter.rollback("photo-plane-review-error");
        if(!p.photoReview.cancelling)p.photoReview.error=error.message;
        p.photoReview.done=true;
      });
  });
  try {
    for(const [frame,expected] of [[750,[1,1]],[810,[.5,1]],[870,[0,.5]],[930,[0,0]]]) {
      await page.waitForFunction(frame=>{
        const p=window.storyProbe;
        return p.photoReview.error||p.photoReview.done||(p.director?.activeCutscene?.packageRuntime?.activityRuntime.active?.currentFrame>=frame);
      },frame,{timeout:90_000});
      const state=await page.evaluate(()=>{
        const p=window.storyProbe,r=p.director?.activeCutscene?.packageRuntime;
        if(!r)throw Error(p.photoReview.error||"Photo scene ended before inspection");
        // Standalone Story activities have no interactive pause transport.
        // Freeze only this diagnostic's frame advancement while comparing
        // the same accepted frame with each model visible and hidden.
        r.playback.update=()=>true;
        return {frame:r.activityRuntime.active.currentFrame, objects:["BLC0","BLC1"].map(tag=>{
          const root=r.sceneObjects.objects.get(tag)?.root,meshes=root?.getChildMeshes()||[];
          const paired=r.sceneObjects.objects.get(tag==="BLC0"?"PHT1":"PHT2")?.root;
          return {tag,meshes:meshes.length,position:root?.getAbsolutePosition().asArray(),pairedPosition:paired?.getAbsolutePosition().asArray(),
            visibility:meshes.find(m=>m.material)?.visibility,active:meshes.some(m=>m.isEnabled()&&p.lifecycle.scene.isActiveMesh(m)),
            materials:meshes.map(m=>({name:m.material?.name,alpha:m.material?.alpha}))};
        })};
      });
      console.info("Photo plane inspection:",JSON.stringify(state));
      expect(state.frame).toBeGreaterThanOrEqual(frame);
      for(const [i,object] of state.objects.entries()){
        expect(object.meshes).toBeGreaterThan(0);
        const distance=Math.hypot(...object.position.map((v,i)=>v-object.pairedPosition[i]));
        expect(distance).toBeLessThan(.002);
        expect(object.visibility).toBeCloseTo(expected[i],1);
      }
      // Babylon passes the whole Scene to observers. Resolve without it so
      // Playwright never tries to serialize that enormous cyclic object graph.
      await page.evaluate(()=>new Promise(resolve=>window.storyProbe.lifecycle.scene.onAfterRenderObservable.addOnce(()=>resolve())));
      await page.screenshot({path:testInfo.outputPath(`photo-development-${frame}.png`)});
      await page.evaluate(()=>{
        const r=window.storyProbe.director.activeCutscene.packageRuntime;
        delete r.playback.update;
      });
    }
  } finally {
    await page.evaluate(()=>{
      const p=window.storyProbe;p.photoReview.cancelling=true;
      if(p.director.activeCutscene?.packageRuntime?.playback)delete p.director.activeCutscene.packageRuntime.playback.update;
      p.regions.controller.presentation.rollback("photo-plane-review");
    });
    await page.waitForFunction(()=>window.storyProbe.photoReview.done&&!window.storyProbe.director.active,null,{timeout:60_000});
    await page.evaluate(()=>{
      const p=window.storyProbe;
      delete p.regions.controller.ownsPlayerPresentation;
      for(const [owner,update] of p.photoReview.dispatchers)owner.update=update;
    });
  }
  const restored=await page.evaluate(()=>{
    const p=window.storyProbe,c=p.lifecycle.getController();
    return {position:c.collider.position.asArray(),firstPerson:c.firstPerson,avatar:p.lifecycle.playerRuntime.activeCharacterId,
      locked:c.movementLocked,leases:p.lifecycle.scheduledActors.activityActorOwners.size,previous:p.photoReview.previous};
  });
  expect(restored.locked).toBe(false);expect(restored.leases).toBe(0);
  expect(restored.firstPerson).toBe(restored.previous.firstPerson);expect(restored.avatar).toBe(restored.previous.avatar);
  restored.position.forEach((v,i)=>expect(v).toBeCloseTo(restored.previous.position[i],3));
  const after=await saved();
  expect(after.character.storyFlags).toEqual(before.character.storyFlags);
  expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);
}

// Connected checkpoint: walk through the actual trigger, cancel, retry and
// choose a photo. The server, not the presentation, owns every saved effect.
export async function verifyNozomiPhotoProgression(page,testInfo,character) {
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before=await saved();
  expect(before.character.storyFlags["story.s1.workday-three-morning.completed"]).toBe(true);
  expect(before.character.storyFlags["story.s1.nozomi-photos.completed"]).not.toBe(true);
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("mfsy"));
  const approach=async()=>{
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
    await page.evaluate(()=>{
      const l=window.storyProbe.lifecycle,c=l.getController();
      l.resetPlayer(l.vectorFromArray([45.7,0,45]),Math.PI,{persist:false});
      c.setFirstPerson(true);c.cameraYaw=Math.PI;c.cameraPitch=0;c.updateCamera(1);
    });
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try { await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-nozomi-photo-intro",null,{timeout:75_000}); }
    finally { await page.keyboard.up("KeyW"); }
    await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.runtime?.playback?.active?.frame>=20,null,{timeout:60_000});
  };
  await approach();
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("photo-development-cancel"));
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  expect((await saved()).character.storyFlags["story.s1.nozomi-photos.completed"]).not.toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await approach();
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.runtime?.playback?.active?.frame>=810,null,{timeout:120_000});
  const opacity=await page.evaluate(()=>{
    const runtime=window.storyProbe.director.activeCutscene.packageRuntime;
    return ["BLC0","BLC1"].map(tag=>runtime.sceneObjects.objects.get(tag).root.getChildMeshes().find(mesh=>mesh.material).visibility);
  });
  expect(opacity[0]).toBeGreaterThan(0);expect(opacity[0]).toBeLessThan(1);expect(opacity[1]).toBe(1);
  await page.screenshot({path:testInfo.outputPath("photo-development-connected.png")});
  await page.keyboard.press("KeyX");
  await page.getByRole("button",{name:"Keep the photo standing apart",exact:true}).click({timeout:60_000});
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-nozomi-photo-ending",null,{timeout:60_000});
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.runtime?.playback?.active?.frame>=20,null,{timeout:60_000});
  await page.keyboard.press("KeyX");
  await expect.poll(async()=>(await saved()).character.storyFlags["story.s1.nozomi-photos.completed"],{timeout:60_000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  const after=await saved();
  expect(after.character.storyFlags["story.s1.nozomi-photo.apart"]).toBe(true);
  expect(after.character.storyFlags["story.s1.nozomi-photo.together"]).not.toBe(true);
  expect(after.character.storyFlags["notebook.s1.nozomi-photos"]).toBe(true);
  expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
}
