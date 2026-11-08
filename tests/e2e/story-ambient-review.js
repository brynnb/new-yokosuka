import { expect } from "@playwright/test";

// Rendered diagnostic only: clock/mode overrides are browser-local, and event
// admission is suspended so they cannot advance the isolated saved story.
export async function reviewStoryAmbient(page, testInfo, character) {
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before=await saved();
  await page.evaluate(async()=>{
    const { SceneStandardMaterial }=await import("/src/rendering/SceneStandardMaterial.js");
    const p=window.storyProbe,l=p.lifecycle,c=p.clock;
    const dispatchers=[p.regions,p.automatic].map(owner=>[owner,owner.update]);
    for(const [owner] of dispatchers)owner.update=()=>false;
    const mode=c.getPlayMode,debugHour=c.debugHour;
    p.ambientReview={restore(){this.releaseStage?.();c.getPlayMode=mode;c.setDebugHour(debugHour);for(const [owner,update] of dispatchers)owner.update=update;l.worldEnvironment.synchronize();}};
    l.resetPlayer(l.vectorFromArray([25,0,69]),Math.PI,{persist:false});
    l.getController().setFirstPerson(false);
    c.setDebugHour(8);l.worldEnvironment.synchronize();
    const actorMaterials=new Set(l.actorRoot.getChildMeshes().map(mesh=>mesh.material).filter(Boolean));
    const defaultMaterial=m=>m instanceof SceneStandardMaterial&&m.ambientColor.equalsFloats(0,0,0);
    p.ambientReview.actor=[...actorMaterials].filter(defaultMaterial);
    p.ambientReview.world=l.scene.materials.filter(m=>m.name.startsWith("prepared_")&&defaultMaterial(m));
  });
  const sample=()=>page.evaluate(()=>{
    const p=window.storyProbe,scene=p.lifecycle.scene,review=p.ambientReview;
    const contribution=m=>m.ambientColor.r*scene.ambientColor.r;
    return {actor:review.actor.map(contribution),world:review.world.map(contribution)};
  });
  const expectFill=async expected=>{
    await expect.poll(async()=>{
      const result=await sample();
      return result.actor.length>0&&result.world.length>0
        && [...result.actor,...result.world].every(value=>Math.abs(value-expected)<.001);
    },{timeout:15_000}).toBe(true);
  };
  try {
    await expectFill(0);await page.screenshot({path:testInfo.outputPath("ambient-story-day.png")});
    await page.evaluate(()=>{const p=window.storyProbe;p.clock.setDebugHour(19);p.lifecycle.worldEnvironment.synchronize();});
    await expectFill(.16);await page.screenshot({path:testInfo.outputPath("ambient-story-night.png")});
    await page.evaluate(()=>{const p=window.storyProbe;p.ambientReview.releaseStage=p.lifecycle.worldEnvironment.acquireIsolatedStage();});
    await expectFill(0);
    await page.evaluate(()=>window.storyProbe.ambientReview.releaseStage());
    await expectFill(.16);
    await page.evaluate(()=>{const p=window.storyProbe;p.clock.getPlayMode=()=>"free_roam";p.lifecycle.worldEnvironment.synchronize();});
    await expectFill(0);await page.screenshot({path:testInfo.outputPath("ambient-free-roam-night.png")});
  } finally { await page.evaluate(()=>window.storyProbe.ambientReview.restore()); }
  const after=await saved();
  expect(after.character.storyFlags).toEqual(before.character.storyFlags);
  expect(after.character.yen).toBe(before.character.yen);
  expect(after.inventory).toEqual(before.inventory);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
}
