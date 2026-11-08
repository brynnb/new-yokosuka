import {expect} from "@playwright/test";

// Presentation-only inspection of the production staging. It does not run
// the Yarn event or pay wages, and uses the renderer's normal frame clock.
export async function reviewSalaryPresentation(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before=await saved();
  await page.evaluate(()=>{
    const p=window.storyProbe,presentation=p.regions.controller.presentation;
    Object.defineProperty(p.regions.controller,"ownsPlayerPresentation",{configurable:true,get:()=>presentation.ownsPlayerPresentation});
    presentation.begin({area:"MFSY"});
    p.salaryReview={error:null,done:false,roots:p.lifecycle.sceneState.currentMeshes
      .filter(r=>!r.metadata?.scheduledActorInstanceId).map(r=>[r,r.isEnabled()])};
    let previous=performance.now();
    const tick=now=>{
      if(!p.salaryReview)return;
      p.authoredScene.update(presentation.transaction,Math.max(0,(now-previous)/1000));
      previous=now;p.salaryReview.frame=requestAnimationFrame(tick);
    };
    p.salaryReview.frame=requestAnimationFrame(tick);
    const sequence=presentation.catalog.sequence("s1.mfsy.payday.start");
    void presentation.adapters.playSequence(sequence,presentation.transaction)
      .then(()=>{if(p.salaryReview)p.salaryReview.done=true;})
      .catch(error=>{if(p.salaryReview)p.salaryReview.error=String(error);});
  });
  try{
    await page.waitForFunction(()=>window.storyProbe.salaryReview.error||
      (window.storyProbe.authoredScene.active?.actorsBegun&&window.storyProbe.authoredScene.active?.cameraBegun),null,{timeout:90_000});
    expect(await page.evaluate(()=>window.storyProbe.salaryReview.error)).toBeNull();
    expect(await page.evaluate(()=>window.storyProbe.salaryReview.roots.every(([root])=>!root.isEnabled()))).toBe(true);
    for(const seconds of [1,8,16,23]){
      await page.waitForFunction(t=>window.storyProbe.salaryReview.error||window.storyProbe.authoredScene.active?.elapsed>=t,seconds,{timeout:40_000});
      expect(await page.evaluate(()=>window.storyProbe.salaryReview.error)).toBeNull();
      await page.screenshot({path:testInfo.outputPath(`salary-review-${seconds}s.png`)});
    }
    await page.waitForFunction(()=>window.storyProbe.salaryReview.done||window.storyProbe.salaryReview.error,null,{timeout:40_000});
    expect(await page.evaluate(()=>window.storyProbe.salaryReview.error)).toBeNull();
  }finally{
    await page.evaluate(()=>{
      const p=window.storyProbe;cancelAnimationFrame(p.salaryReview?.frame);
      p.regions.controller.presentation.rollback("salary-review-finished");
      p.salaryReview.restored=p.salaryReview.roots.every(([root,enabled])=>root.isDisposed?.()||root.isEnabled()===enabled);
      p.salaryReviewRestored=p.salaryReview.restored;
      delete p.salaryReview;delete p.regions.controller.ownsPlayerPresentation;
    });
  }
  const after=await saved();
  expect(after.character.storyFlags).toEqual(before.character.storyFlags);
  expect(after.character.yen).toBe(before.character.yen);
  expect(after.inventory).toEqual(before.inventory);
  expect(await page.evaluate(()=>window.storyProbe.salaryReviewRestored)).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}
