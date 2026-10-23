import { expect } from "@playwright/test";

// Native presentation review, not a claim of earned Story trigger coverage.
export async function reviewTattooIntroduction(page, testInfo, character) {
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before=await saved();
  await page.evaluate(async()=>window.storyProbe.lifecycle.travelToWorld("tatq"));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.ready);
  const prior=await page.evaluate(()=>{
    const p=window.storyProbe,c=p.lifecycle.getController();
    return {position:c.collider.position.asArray(),firstPerson:c.firstPerson,avatar:p.lifecycle.playerRuntime.activeCharacterId};
  });
  for(const cancel of [true,false]) {
    await page.evaluate(()=>{
      const p=window.storyProbe,presentation=p.regions.controller.presentation;
      const r=p.tattooReview={done:false,error:null,frame:0,voices:new Set(),objects:{},poses:{},mouths:{}};
      let next=0;
      r.observer=p.lifecycle.scene.onAfterRenderObservable.add(()=>{
        if(performance.now()<next)return;next=performance.now()+100;
        const runtime=p.director.activeCutscene?.packageRuntime;
        if(!runtime)return;
        r.frame=runtime.activityRuntime.active?.currentFrame||r.frame;
        for(const a of runtime.audio.active?.elements||[])if(a.kind==="voice"&&!a.audio.paused&&a.audio.currentTime>0)r.voices.add(a.cue.speakerId);
        for(const tag of ["AKIR","HORS","TONY","SMTH"]){
          const actor=runtime.actors.activeActor(tag);
          if(actor) (r.poses[tag]||=new Set()).add(JSON.stringify(actor.root.position.asArray()));
        }
        for(const [tag,face]of runtime.presentation.faces?.active?.faces||[]){
          if(face.voiceCue?.positionSeconds>0)(r.mouths[tag]||=new Set()).add(JSON.stringify(Array.from(face.mouth.current)));
        }
        for(const [tag,object]of runtime.sceneObjects?.objects||[])r.objects[tag]=object.root.getChildMeshes().some(m=>m.isEnabled());
      });
      presentation.begin({area:"TATQ"});
      void presentation.execute({name:"start_activity",arguments:[{type:"string",isStatic:true,value:"s1.tatq.charlie-introduction.scene"}]})
        .then(()=>{presentation.commit();r.done=true;},error=>{presentation.rollback("tattoo-review-error");if(!r.cancelling)r.error=error.message;r.done=true;});
    });
    try {
      for(const frame of cancel?[480]:[200,480,900,1200,1650]){
        await page.waitForFunction(frame=>{const r=window.storyProbe.tattooReview;return r.frame>=frame||r.error||r.done;},frame,{timeout:90_000});
        expect(await page.evaluate(()=>window.storyProbe.tattooReview.error)).toBeNull();
        await page.screenshot({path:testInfo.outputPath(`tattoo-${cancel?"cancel":"full"}-${frame}.png`)});
      }
      if(cancel)await page.evaluate(()=>{const p=window.storyProbe;p.tattooReview.cancelling=true;p.regions.controller.presentation.rollback("tattoo-review-cancel");});
      await page.waitForFunction(()=>{const p=window.storyProbe;return p.tattooReview.done&&!p.director.active&&p.lifecycle.worldRuntime.ready&&!p.lifecycle.getController().movementLocked;},null,{timeout:90_000});
      const result=await page.evaluate(()=>{const r=window.storyProbe.tattooReview;return {error:r.error,frame:r.frame,voices:[...r.voices],objects:r.objects,poses:Object.fromEntries(Object.entries(r.poses).map(([k,v])=>[k,v.size])),mouths:Object.fromEntries(Object.entries(r.mouths).map(([k,v])=>[k,v.size]))};});
      console.info("TATQ native review",JSON.stringify(result));
      expect(result.error).toBeNull();
      if(!cancel){
        expect(result.voices.sort()).toEqual(["AKIR","HORS","SMTH","TONY"]);
        expect(result.poses.AKIR).toBeGreaterThan(5);
        expect(result.poses.TONY).toBeGreaterThan(5);
      }
    } finally {
      await page.evaluate(()=>{const p=window.storyProbe;p.lifecycle.scene.onAfterRenderObservable.remove(p.tattooReview.observer);p.regions.controller.presentation.rollback("tattoo-review-cleanup");});
    }
    const restored=await page.evaluate(()=>{const p=window.storyProbe,c=p.lifecycle.getController();return {position:c.collider.position.asArray(),firstPerson:c.firstPerson,avatar:p.lifecycle.playerRuntime.activeCharacterId,leases:p.lifecycle.scheduledActors.activityActorOwners.size};});
    expect(restored.leases).toBe(0);expect(restored.firstPerson).toBe(prior.firstPerson);expect(restored.avatar).toBe(prior.avatar);
    restored.position.forEach((v,i)=>expect(v).toBeCloseTo(prior.position[i],3));
    const after=await saved();expect(after.character.storyFlags).toEqual(before.character.storyFlags);expect(after.inventory).toEqual(before.inventory);expect(after.character.yen).toBe(before.character.yen);
  }
}
