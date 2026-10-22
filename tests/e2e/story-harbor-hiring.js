import {expect} from "@playwright/test";

// Continue an earned Jimmy save. Dates advance only through the player's wait
// menu; walking into the real regions and scene acknowledgements earn progress.
export async function verifyHarborHiring(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved();expect(initial.character.storyFlags["story.s1.jimmy-interrogation.completed"]).toBe(true);
  const flag=id=>`story.s1.${id}.completed`;
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
    await page.waitForFunction(()=>{const l=window.storyProbe.lifecycle;return l.worldRuntime.ready&&!l.worldRuntime.switching;},null,{timeout:90_000});
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await noErrors();
  };
  const scene=async id=>{await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-${id}`||window.storyProbe.sceneErrors.length,id,{timeout:90_000});await noErrors();};
  const economy=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);return s;};
  const wait=async label=>{await page.locator("#story-wait-button").click();await page.getByRole("option",{name:label,exact:true}).click();await page.getByRole("button",{name:label,exact:true}).click();await idle();};
  const approach=async(position,yaw=0,expected=true)=>{
    await page.evaluate(({position,yaw})=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray(position),yaw,{persist:false});c.setFirstPerson(true);c.cameraYaw=yaw;c.cameraPitch=0;c.updateCamera(1);},{position,yaw});
    await page.waitForTimeout(300);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{
      if(expected)await page.waitForFunction(()=>["presenting","options"].includes(window.storyProbe.regions.controller.status)||window.storyProbe.director?.activeCutscene||window.storyProbe.sceneErrors.length,null,{timeout:20_000});
      else await page.waitForTimeout(1200);
    }finally{await page.keyboard.up("KeyW");}await noErrors();
  };
  const cancel=async()=>{await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-harbor-hiring-cancel"));await idle();};
  const reload=async()=>{
    await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
    await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
    await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();
  };
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("mfsy"));await idle();
  if(!(await saved()).character.storyFlags[flag("goro-job-lead")]){
    const hour=new Date((await saved()).character.storyTimeMs).getUTCHours();
    if(hour>=20||hour<8)await wait("Wait until tomorrow morning");
    await approach([-28,0,112]);await scene("goro-job-lead");await page.waitForTimeout(8000);
    await page.screenshot({path:testInfo.outputPath("goro-original-job-referral.png")});await cancel();
    expect((await economy()).character.storyFlags[flag("goro-job-lead")]).not.toBe(true);
    await approach([-28,0,112]);await scene("goro-job-lead");await page.keyboard.press("KeyX");await idle();
    expect((await economy()).character.storyFlags[flag("goro-job-lead")]).toBe(true);
    await approach([-31,0,91],0,false);await idle();
    expect((await economy()).character.storyFlags[flag("goro-job-appointment")]).not.toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-goro-job-appointment"))).toBe(false);
  }
  if(!(await saved()).character.storyFlags[flag("goro-job-appointment")]){
    await wait("Wait until tomorrow morning");await wait("Wait until 1 p.m.");
    await approach([-31,0,91]);await scene("goro-job-appointment");await page.waitForTimeout(20_000);
    await page.screenshot({path:testInfo.outputPath("goro-mai-original-appointment.png")});await cancel();
    expect((await economy()).character.storyFlags[flag("goro-job-appointment")]).not.toBe(true);
    await approach([-31,0,91]);await scene("goro-job-appointment");await page.keyboard.press("KeyX");await idle();
    expect((await economy()).character.storyFlags[flag("goro-job-appointment")]).toBe(true);
  }
  if(!(await saved()).character.storyFlags[flag("harbor-job-hiring")]){
    await wait("Wait until 2 p.m.");await approach([25,0,67],Math.PI);
    await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
    expect((await economy()).character.storyFlags[flag("harbor-job-hiring")]).not.toBe(true);
    await approach([25,0,67],Math.PI);await page.getByRole("button",{name:"Meet Yada about the job",exact:true}).click();
    await scene("yada-job-interview");await page.waitForTimeout(9000);await page.screenshot({path:testInfo.outputPath("yada-original-office-interview.png")});
    await page.keyboard.press("KeyX");await scene("mark-job-introduction");await page.waitForTimeout(23_000);
    await page.screenshot({path:testInfo.outputPath("mark-original-forklift-introduction.png")});await cancel();
    expect((await economy()).character.storyFlags[flag("harbor-job-hiring")]).not.toBe(true);
    // A cancelled second film must not save hiring; reload retries the pair.
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray([25,0,67]),0,{persist:true});});
    await page.waitForTimeout(1000);await reload();await approach([25,0,67],Math.PI);
    await page.getByRole("button",{name:"Meet Yada about the job",exact:true}).click();await scene("yada-job-interview");await page.keyboard.press("KeyX");
    await scene("mark-job-introduction");await page.waitForTimeout(43_000);
    await page.screenshot({path:testInfo.outputPath("mark-original-training-introduction.png")});
    await page.waitForFunction(()=>!window.storyProbe.director?.activeCutscene,null,{timeout:40_000});await idle();
  }
  const final=await economy();expect(final.character.storyFlags[flag("harbor-job-hiring")]).toBe(true);expect(final.character.storyFlags["notebook.s1.harbor-job-training"]).toBe(true);
  expect(Object.keys(final.character.storyFlags).filter(k=>/training.*completed|workday.*completed/.test(k))).toEqual([]);
  await page.locator("button").filter({hasText:/^Notebook$/}).click();
  for(let i=0;i<130&&await page.locator("#journal-next").isEnabled();i++)await page.locator("#journal-next").click();
  await expect(page.locator("#journal-page-copy")).toContainText("Mr. Yada hired me");await page.screenshot({path:testInfo.outputPath("harbor-hired-notebook.png")});
  await page.locator("#journal-close").click();await reload();await economy();
  expect((await saved()).character.storyFlags[flag("harbor-job-hiring")]).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.starts.some(id=>id.includes("job-")))).toBe(false);
}
