import {expect} from "@playwright/test";

export async function verifyChickenRace(page,testInfo,character){
  await page.setViewportSize({width:1920,height:1080});
  await page.evaluate(()=>{window.chickenOutcomeVoices=new Set();const original=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){if(/E1070[A-C]\d{3}\.m4a/.test(this.src))this.addEventListener("playing",()=>window.chickenOutcomeVoices.add(this.src.split("/").at(-1).split("?")[0]),{once:true});return original.apply(this,args);};});
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.chicken-race.completed";
  expect(initial.character.storyFlags["story.s1.forklift-training.completed"]).toBe(true);
  expect(initial.character.storyFlags["notebook.s1.first-workday"]).toBe(true);
  expect(initial.character.storyFlags[done]).not.toBe(true);
  await page.locator("button").filter({hasText:/^Notebook$/}).click();
  for(let i=0;i<130&&await page.locator("#journal-next").isEnabled();i++)await page.locator("#journal-next").click();
  await expect(page.locator("#journal-page-copy")).toContainText("Finished forklift practice with Mark.");
  await page.screenshot({path:testInfo.outputPath("forklift-training-earned-notebook.png")});
  await page.locator("#journal-close").click();
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorSuppressions.size)).toBe(0);await noErrors();};
  const unchanged=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);expect(s.character.storyFlags[done]).not.toBe(true);};
  const pose=()=>page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();return{position:l.capturePlayerReturnState().position,firstPerson:c.firstPerson,cameraYaw:c.cameraYaw,cameraPitch:c.cameraPitch,cameraDistance:c.cameraDistance};});
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("mfsy"));
  await page.waitForFunction(()=>["idle","options"].includes(window.storyProbe.regions.controller.status));
  if(await page.evaluate(()=>window.storyProbe.regions.controller.status==="options"))await page.getByRole("button",{name:"Leave it for now",exact:true}).click();
  await idle();
  const approach=async(expected=true)=>{
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([1.7,0,95]),0,{persist:false});c.setFirstPerson(true);c.cameraYaw=0;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(200);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{if(expected)await page.waitForFunction(()=>window.storyProbe.regions.controller.status==="options"||window.storyProbe.sceneErrors.length,null,{timeout:15_000});else await page.waitForTimeout(1600);}finally{await page.keyboard.up("KeyW");}await noErrors();
  };
  const scene=async()=>{await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-chicken-race-intro"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});await noErrors();};
  const ready=async()=>{await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.id==="s1.mfsy.chicken-race"&&window.storyProbe.regions.controller.active.challengePrompt.ready||window.storyProbe.sceneErrors.length,null,{timeout:70_000});await noErrors();};
  const race=async(outcome,{reviewMotion=false}={})=>{for(const [index,button]of ["A","Down","Left","Right"].entries()){
    await page.waitForFunction(index=>window.storyProbe.regions.controller.dialogue.qte?.active?.index===index,index);
    if(reviewMotion){await page.waitForTimeout(700);if(index===2)await page.screenshot({path:testInfo.outputPath("chicken-race-moving-midcourse.png")});}
    if((outcome==="draw"&&index<3)||outcome==="loss")await page.keyboard.press("KeyJ");
    else await page.locator(`[data-challenge-button="${button}"]`).click();
  }await page.getByText(outcome==="draw"?"Hmf! You made it.":"I won!",{exact:true}).waitFor();};
  const caption=async()=>{await page.keyboard.press("Space");};
  const cancel=async()=>{await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-chicken-cancel"));await idle();await unchanged();};
  if(new Date(initial.character.storyTimeMs).getUTCHours()<19){await approach(false);await idle();await unchanged();}
  await page.evaluate(()=>{const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray([1.7,0,95]),0,{persist:true});});
  if(new Date(initial.character.storyTimeMs).getUTCHours()<19||new Date(initial.character.storyTimeMs).getUTCHours()>=23){
    await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until 7 p.m.",exact:true}).click();await page.getByRole("button",{name:"Wait until 7 p.m.",exact:true}).click();await idle();
  }
  const requested=process.env.NEW_YOKOSUKA_CHICKEN_RESULT||"success";
  if(requested!=="success"){
    if(!["draw","loss"].includes(requested))throw Error(`Unknown chicken race test outcome ${requested}`);
    await approach();await page.getByRole("button",{name:"Help the old man",exact:true}).click();await scene();await page.keyboard.press("KeyX");await ready();
    await race(requested);await page.screenshot({path:testInfo.outputPath(`chicken-race-${requested}.png`)});
    const first=requested==="draw"?"E1070B017.m4a":"E1070B021.m4a";
    // The same audio instrumentation tracks all E1070 result recordings.
    await expect.poll(()=>page.evaluate(id=>window.chickenOutcomeVoices.has(id),first),{timeout:10_000}).toBe(true);
    for(let i=0;i<10&&!(await saved()).character.storyFlags[done];i++){await page.waitForTimeout(250);await caption();}
    await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:30_000}).toBe(true);await idle();
    const result=await saved();expect(result.character.storyFlags[`story.s1.chicken-race.${requested}`]).toBe(true);
    expect(result.character.storyFlags[`notebook.s1.chicken-race.${requested}`]).toBe(true);expect(result.character.storyFlags["notebook.s1.chicken-race"]).not.toBe(true);
    expect(result.character.yen).toBe(initial.character.yen);expect(result.inventory).toEqual(initial.inventory);
    await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
    const reloaded=await saved();expect(reloaded.character.storyFlags[`story.s1.chicken-race.${requested}`]).toBe(true);expect(reloaded.character.storyFlags[`notebook.s1.chicken-race.${requested}`]).toBe(true);
    await page.locator("button").filter({hasText:/^Notebook$/}).click();
    for(let i=0;i<130&&await page.locator("#journal-next").isEnabled();i++)await page.locator("#journal-next").click();
    await expect(page.locator("#journal-page-copy")).toContainText(requested==="draw"?"race was a draw":"I lost their chicken race");return;
  }
  await approach();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();await unchanged();
  await approach();await page.getByRole("button",{name:"Help the old man",exact:true}).click();await scene();
  await page.waitForTimeout(18_000);await page.screenshot({path:testInfo.outputPath("chicken-race-original-introduction.png")});await cancel();
  await approach();await page.getByRole("button",{name:"Help the old man",exact:true}).click();await scene();
  // Let the original introduction finish naturally once. It cannot win the QTE.
  await ready();await unchanged();await page.screenshot({path:testInfo.outputPath("chicken-race-original-bikes-and-riders.png")});
  const riding=()=>page.evaluate(()=>{
    const s=window.storyProbe.authoredScene.active;
    const point=root=>root.getAbsolutePosition().asArray();
    return {player:point(s.actors.activeActor("AKIR").root),rider:point(s.actors.activeActor("BIKB").root),
      bike:point(s.sceneObjects.objects.get("BIK1").root),opponentBike:point(s.sceneObjects.objects.get("BIK2").root)};
  });
  const first=await riding();await page.waitForTimeout(500);const moved=await riding();
  for(const key of ["player","rider","bike","opponentBike"]){
    expect(Math.hypot(moved[key][0]-first[key][0],moved[key][2]-first[key][2]),`${key} should move during the prompt`).toBeGreaterThan(.5);
  }
  for(const [actor,bike] of [["player","bike"],["rider","opponentBike"]]){
    expect(Math.hypot(moved[actor][0]-moved[bike][0],moved[actor][2]-moved[bike][2]),`${actor} should stay with the bike`).toBeLessThan(.1);
  }
  await page.screenshot({path:testInfo.outputPath("chicken-race-moving-bikes.png")});
  // Misses no longer end the race: cancel a draw and a loss before settlement.
  await race("draw");await cancel();
  await approach();await page.getByRole("button",{name:"Help the old man",exact:true}).click();await scene();await page.keyboard.press("KeyX");await ready();
  await race("loss");await cancel();
  await approach();await page.getByRole("button",{name:"Help the old man",exact:true}).click();await scene();await page.keyboard.press("KeyX");await ready();
  await race("success");await cancel();
  await approach();const before=await pose();await page.getByRole("button",{name:"Help the old man",exact:true}).click();await scene();await page.keyboard.press("KeyX");await ready();
  await race("success",{reviewMotion:true});await page.screenshot({path:testInfo.outputPath("chicken-race-original-voiced-aftermath.png")});
  await expect.poll(()=>page.evaluate(()=>window.chickenOutcomeVoices.has("E1070A007.m4a")),{timeout:10_000}).toBe(true);
  await caption();await page.getByText(/Don't either of you two ever/).waitFor();await expect.poll(()=>page.evaluate(()=>window.chickenOutcomeVoices.has("E1070A008.m4a")),{timeout:10_000}).toBe(true);
  await caption();await page.getByText(/Bastard/).waitFor();await expect.poll(()=>page.evaluate(()=>window.chickenOutcomeVoices.has("E1070B016.m4a")),{timeout:10_000}).toBe(true);
  await caption();await idle();
  const final=await saved();expect(final.character.storyFlags[done]).toBe(true);expect(final.character.storyFlags["notebook.s1.chicken-race"]).toBe(true);
  expect(final.character.yen).toBe(initial.character.yen);expect(final.inventory).toEqual(initial.inventory);
  const after=await pose();expect(Math.hypot(...after.position.map((v,i)=>v-before.position[i]))).toBeLessThan(.1);
  expect(after.firstPerson).toBe(before.firstPerson);expect(after.cameraYaw).toBeCloseTo(before.cameraYaw,3);expect(after.cameraPitch).toBeCloseTo(before.cameraPitch,3);
  await page.screenshot({path:testInfo.outputPath("chicken-race-earned-return.png")});
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();
  expect((await saved()).character.storyFlags[done]).toBe(true);expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-chicken-race-intro"))).toBe(false);
}
