import {expect} from "@playwright/test";

// Start at the genuinely earned rescue. Every scene acknowledgement, time and
// destination crosses the real server; no future progress is injected.
export async function verifyNozomiHome(page,testInfo,character,{musicResponses}){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),flag=id=>`story.s1.${id}.completed`;
  // Each admitted attempt pauses the live personal clock. Derive the next
  // occurrence from that attempt, not the earlier persisted checkpoint.
  const nextDateAt=(clock,hour,minute)=>{
    expect(Number.isFinite(clock?.gameTimeMs),"active attempt has an authoritative personal clock").toBe(true);
    expect(clock.paused,"the successful attempt holds the personal clock").toBe(true);
    const start=new Date(clock.gameTimeMs),target=new Date(clock.gameTimeMs);
    target.setUTCHours(hour,minute,0,0);
    if(target.getTime()<=start.getTime())target.setUTCDate(target.getUTCDate()+1);
    return target.toISOString().slice(0,10);
  };
  expect(initial.character.storyFlags[flag("nozomi-rescue")]).toBe(true);
  const errors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const economy=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);expect(s.character.storyFlags["story.s1.final-battle.completed"]).not.toBe(true);await errors();return s;};
  const reload=async()=>{
    await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
    await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
    await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);
  };
  const choose=async name=>{await page.getByRole("button",{name,exact:true}).click({timeout:90_000});await errors();};
  const slot=async n=>{await page.waitForFunction(n=>window.storyProbe.homeActivities?.some(a=>a.slot===n)||window.storyProbe.sceneErrors.length,n,{timeout:150_000});await errors();};
  if(!initial.character.storyFlags[flag("nozomi-home")]){
  if((await saved()).character.worldId!=="nbik-home"){
    console.info("Nozomi home: decline admission, reload, confirmed original road arrival");
    await choose("Leave it for now");expect((await economy()).character.storyFlags[flag("nozomi-home")]).not.toBe(true);
    await reload();await choose("Take Nozomi home");
  }
  await slot(0);
  const riders = await page.evaluate(() => {
    const actors = window.storyProbe.director.activeCutscene.packageRuntime.packageActors;
    window.rideHomeRoots = ["AKIR","HRSK"].map(tag => actors.records.get(tag)?.root);
    return [["AKIR","YKB_M"],["HRSK","NZM_M"]].map(([tag, model]) => {
      const root = actors.records.get(tag)?.root;
      return {
        original: !!root && actors.variantRecords.get(tag)?.get(model)?.root === root,
        drawable: !!root && root.isEnabled() && root.getChildMeshes(false).some(m =>
          m.isEnabled() && m.isVisible && m.getTotalVertices() > 0),
      };
    });
  });
  expect(riders).toEqual([{original:true,drawable:true},{original:true,drawable:true}]);
  await page.waitForTimeout(3000);await page.screenshot({path:testInfo.outputPath("nozomi-home-original-conversation.png")});
  console.info("Nozomi home: cancel original program, saved cinematic-world reload/retry");
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("ride-home-cancel"));
  expect((await economy()).character.storyFlags[flag("nozomi-home")]).not.toBe(true);
  await expect.poll(() => page.evaluate(() => window.rideHomeRoots.every(root => root.isDisposed() || !root.isEnabled()))).toBe(true);
  await reload();await slot(0);
  const expectedHomeDate=nextDateAt((await economy()).worldState,5,56);
  const skip=process.env.NEW_YOKOSUKA_NOZOMI_HOME_SKIP_E2E==="true";
  if(skip){
    console.info("Nozomi home: supported explicit program skip");await page.keyboard.press("KeyX");
  }else{
  console.info("Nozomi home: natural23-clip sequence and original CD audio");
  // Observe the actual model-owned surface immediately after the renderer
  // applies the captured native coordinate, even when a display refresh spans
  // several AUTH frames. The original checkpoint fixes this reference sample.
  await page.evaluate(() => {
    const activity = window.storyProbe.director.activeCutscene.packageRuntime.activityRuntime;
    const cloth = activity.presentation.cloth;
    const apply = cloth.apply;
    cloth.apply = function(owner, detail) {
      const result = apply.call(this, owner, detail);
      if (detail?.frame !== 180 || window.rideSkirtFrame) return result;
      const state = this.active?.states.find(value => value.capturedActivitySlot === 4);
      if (!state) return result;
      const group = state.groups.find(value => value.group.controlType === -70);
      const sample = state.capturedTrack.frameAt(4, 180);
      const meshes = group.outputs.flatMap(output => output.meshes);
      const edge = (positions, a, b) => Math.hypot(...[0,1,2].map(axis =>
        positions[a * 3 + axis] - positions[b * 3 + axis]));
      let maximumEdge = 0, maximumStretch = 0, triangleCount = 0;
      for (const {mesh,positions:rest} of meshes) {
        const indices = mesh.getIndices(), current = mesh.getVerticesData("position");
        triangleCount += indices.length / 3;
        for (let i = 0; i < indices.length; i += 3) {
          for (let j = 0; j < 3; j++) {
            const a = indices[i + j], b = indices[i + ((j + 1) % 3)];
            const length = edge(current, a, b), initial = edge(rest, a, b);
            maximumEdge = Math.max(maximumEdge, length);
            if (initial > .02) maximumStretch = Math.max(maximumStretch, length / initial);
          }
        }
      }
      window.rideSkirtFrame = {slot:4, frame:180, ownerMode:state.runtimeMode,
        trackFrames:state.capturedTrack.frameCount, triangleCount, maximumEdge, maximumStretch,
        nativeFirstControl:Array.from(sample.slice(0,6), value => Math.round(value * 8192))};
      return result;
    };
  });
  await slot(1);
  await expect.poll(()=>page.evaluate(()=>{const m=window.storyMusic?.director,a=m?.current?.audio;return m?.current?.trackId==="nozomi-home"&&!a.paused&&a.currentTime>1&&a.volume>0;}),{timeout:15_000}).toBe(true);
  await slot(4);
  await page.waitForFunction(() => window.rideSkirtFrame, null, {timeout:40000});
  const garment = await page.evaluate(() => window.rideSkirtFrame);
  expect(garment).toMatchObject({slot:4,frame:180,ownerMode:7,trackFrames:4406,
    nativeFirstControl:[815,-634,-667,3807,2685,-6739]});
  expect(garment.triangleCount).toBeGreaterThan(0);
  expect(Number.isFinite(garment.maximumStretch) && garment.maximumStretch > 0).toBe(true);
  console.info("NBIK original skirt frame", JSON.stringify(garment));
  await testInfo.attach("nozomi-home-native-skirt", {body:JSON.stringify(garment,null,2),contentType:"application/json"});
  await page.screenshot({path:testInfo.outputPath("nozomi-home-original-paired-riding.png")});
  await slot(19);await page.waitForTimeout(1000);await page.screenshot({path:testInfo.outputPath("nozomi-home-original-embrace.png")});
  }
  await expect.poll(async()=>(await saved()).character.storyFlags[flag("nozomi-home")],{timeout:100_000}).toBe(true);
  if(!skip)expect(await page.evaluate(()=>window.storyProbe.homeActivities.map(a=>a.slot))).toEqual(Array.from({length:23},(_,i)=>i));
  const home=await economy();expect(home.character.worldId).toBe("interior");expect(home.character.storyFlags["notebook.s1.nozomi-home"]).toBe(true);
  const date=new Date(home.character.storyTimeMs);expect(date.getUTCHours()).toBe(5);expect(date.getUTCMinutes()).toBe(56);
  expect(date.toISOString().slice(0,10)).toBe(expectedHomeDate);
  if(!skip){const responses=musicResponses.filter(r=>r.url.includes("nozomi-home-cdda05"));expect(responses.some(r=>r.status===200||r.status===206),JSON.stringify(responses)).toBe(true);}
  }
  console.info("Nozomi home: separate bedside stay/reload/sleep and next07:30 save");
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="interior"&&window.storyProbe.lifecycle.worldRuntime.ready);
  await page.waitForTimeout(2000);
  console.info("Bedside state",JSON.stringify(await page.evaluate(()=>{const p=window.storyProbe,r=p.regions,c=r.getCharacter();return{frame:p.lastRegionFrame,status:r.controller.status,inside:[...r.inside],character:{id:c.id,mode:c.playMode,opening:c.openingCompleted,home:c.storyFlags?.["story.s1.nozomi-home.completed"],rest:c.storyFlags?.["story.s1.final-morning.completed"]}};})));
  await choose("Stay awake");expect((await economy()).character.storyFlags[flag("final-morning")]).not.toBe(true);
  await reload();expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-nozomi-home"))).toBe(false);
  await expect(page.getByRole("button",{name:"Sleep until 7:30 a.m.",exact:true})).toBeVisible({timeout:90_000});
  const expectedMorningDate=nextDateAt((await economy()).worldState,7,30);
  await choose("Sleep until 7:30 a.m.");
  await expect.poll(async()=>(await saved()).character.storyFlags[flag("final-morning")]).toBe(true);
  const wake=await economy(),morning=new Date(wake.character.storyTimeMs);expect(wake.character.worldId).toBe("interior");expect(morning.getUTCHours()).toBe(7);expect(morning.getUTCMinutes()).toBeGreaterThanOrEqual(30);expect(morning.getUTCMinutes()).toBeLessThan(32);expect(morning.toISOString().slice(0,10)).toBe(expectedMorningDate);
  await reload();await page.waitForTimeout(2500);await economy();
  expect(await page.evaluate(()=>window.storyProbe.starts)).toEqual([]);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(wake.character.avatarId).toBe("ryo");
  const gameplayBody = await page.evaluate(() => window.storyProbe.lifecycle.getController().actorRoot.getChildMeshes(false)
    .some(m => m.isEnabled() && m.isVisible && m.getTotalVertices() > 0));
  expect(gameplayBody).toBe(true);
  await page.screenshot({path:testInfo.outputPath("nozomi-home-saved-final-morning.png")});
}
