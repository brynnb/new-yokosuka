import {expect} from "@playwright/test";

// Presentation-only inspection of the production staging. It does not run
// the Yarn event or pay wages, and uses the renderer's normal frame clock.
async function beginSalaryReview(page){
  await page.evaluate(()=>{
    const p=window.storyProbe,presentation=p.regions.controller.presentation;
    Object.defineProperty(p.regions.controller,"ownsPlayerPresentation",{configurable:true,get:()=>presentation.ownsPlayerPresentation});
    presentation.begin({area:"MFSY"});
    const review=p.salaryReview={error:null,done:false,roots:p.lifecycle.sceneState.currentMeshes
      .filter(r=>!r.metadata?.scheduledActorInstanceId).map(r=>[r,r.isEnabled()])};
    let previous=performance.now();
    const tick=now=>{
      if(p.salaryReview!==review)return;
      p.authoredScene.update(presentation.transaction,Math.max(0,(now-previous)/1000));
      previous=now;p.salaryReview.frame=requestAnimationFrame(tick);
    };
    p.salaryReview.frame=requestAnimationFrame(tick);
    const sequence=presentation.catalog.sequence("s1.mfsy.payday.start");
    void presentation.adapters.playSequence(sequence,presentation.transaction)
      .then(()=>{if(p.salaryReview===review)review.done=true;})
      .catch(error=>{if(p.salaryReview===review)review.error=String(error);});
  });
}

async function endSalaryReview(page){
  await page.evaluate(()=>{
    const p=window.storyProbe,prop=p.authoredScene.active?.objects?.objects.get("KYUF")?.root;
    cancelAnimationFrame(p.salaryReview?.frame);
    p.regions.controller.presentation.rollback("salary-review-finished");
    p.salaryReviewRestored=p.salaryReview.roots.every(([root,enabled])=>root.isDisposed?.()||root.isEnabled()===enabled);
    p.salaryReviewPropDisposed=!!prop?.isDisposed();
    delete p.salaryReview;delete p.regions.controller.ownsPlayerPresentation;
  });
  expect(await page.evaluate(()=>window.storyProbe.salaryReviewRestored)).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.salaryReviewPropDisposed)).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}

export async function reviewSalaryPresentation(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before=await saved();
  await beginSalaryReview(page);
  await page.waitForFunction(()=>window.storyProbe.salaryReview.error||window.storyProbe.authoredScene.active?.elapsed>=7,null,{timeout:90_000});
  expect(await page.evaluate(()=>window.storyProbe.salaryReview.error)).toBeNull();
  expect(await page.evaluate(()=>window.storyProbe.authoredScene.active.objects.objects.get("KYUF").root.isEnabled())).toBe(true);
  await endSalaryReview(page); // Cancel while Yada is holding the envelope.
  await beginSalaryReview(page);
  try{
    await page.waitForFunction(()=>window.storyProbe.salaryReview.error||
      (window.storyProbe.authoredScene.active?.actorsBegun&&window.storyProbe.authoredScene.active?.cameraBegun),null,{timeout:90_000});
    expect(await page.evaluate(()=>window.storyProbe.salaryReview.error)).toBeNull();
    expect(await page.evaluate(()=>window.storyProbe.salaryReview.roots.every(([root])=>!root.isEnabled()))).toBe(true);
    for(const seconds of [1,5,7,9,11,13,16,23]){
      await page.waitForFunction(t=>window.storyProbe.salaryReview.error||window.storyProbe.authoredScene.active?.elapsed>=t,seconds,{timeout:40_000});
      expect(await page.evaluate(()=>window.storyProbe.salaryReview.error)).toBeNull();
      const prop=await page.evaluate(()=>{
        const objects=window.storyProbe.authoredScene.active.objects,record=objects.objects.get("KYUF");
        const binding=objects.active.bindings.filter(c=>c.actorTag==="KYUF"&&c.frame<=objects.active.frame).at(-1);
        return {visible:record.root.isEnabled(),parent:binding?.parentActorTag||null,
          meshes:record.root.getChildMeshes().length};
      });
      expect(prop.meshes).toBeGreaterThan(0);
      if(seconds===5||seconds===13)expect(prop.visible).toBe(false);
      if(seconds===7)expect(prop).toMatchObject({visible:true,parent:"TMRA"});
      if(seconds===9)expect(prop.visible).toBe(true);
      if(seconds===11)expect(prop).toMatchObject({visible:true,parent:"AKIR"});
      await page.screenshot({path:testInfo.outputPath(`salary-review-${seconds}s.png`)});
    }
    await page.waitForFunction(()=>window.storyProbe.salaryReview.done||window.storyProbe.salaryReview.error,null,{timeout:40_000});
    expect(await page.evaluate(()=>window.storyProbe.salaryReview.error)).toBeNull();
  }finally{
    await endSalaryReview(page);
  }
  const after=await saved();
  expect(after.character.storyFlags).toEqual(before.character.storyFlags);
  expect(after.character.yen).toBe(before.character.yen);
  expect(after.inventory).toEqual(before.inventory);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
}
