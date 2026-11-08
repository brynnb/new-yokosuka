import {expect} from "@playwright/test";

// Seed only the earlier Jimmy milestone in a disposable character. The lead
// and next-day appointment below are earned through real world triggers.
export async function verifyGoroLeadNatural(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const lead="story.s1.goro-job-lead.completed",note="notebook.s1.harbor-job-promise",appointment="story.s1.goro-job-appointment.completed";
  const initial=await saved();
  const resumeAppointment=process.env.NEW_YOKOSUKA_GORO_NEXT_ONLY_E2E==="true";
  expect(initial.character.storyFlags["story.s1.jimmy-interrogation.completed"]).toBe(true);
  expect(!!initial.character.storyFlags[lead]).toBe(resumeAppointment);
  const idle=async()=>{
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:60_000}).toBe("idle");
    await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.ready&&!window.storyProbe.lifecycle.getController().movementLocked,null,{timeout:90_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  };
  if(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)!=="mfsy"){
    await idle();await page.locator("#travel-button").click();
    await page.getByRole("option",{name:"New Yokosuka Harbor",exact:true}).click();
    await page.waitForFunction(()=>{const w=window.storyProbe.lifecycle.worldRuntime;return w.activeWorld.id==="mfsy"&&w.ready&&!w.switching;},null,{timeout:120_000});
    await expect(page.locator("#loading")).toBeHidden({timeout:120_000});await idle();
  }
  const walk=async(position,expectedId,timeout=60_000)=>{
    await idle();
    const previous=await page.evaluate(position=>{
      const l=window.storyProbe.lifecycle,c=l.getController();
      l.resetPlayer(l.vectorFromArray(position),0,{persist:false});c.setFirstPerson(true);c.cameraYaw=0;c.cameraPitch=0;c.updateCamera(1);
      return {firstPerson:c.firstPerson,yaw:c.cameraYaw,pitch:c.cameraPitch,distance:c.cameraDistance};
    },position);
    // Let any completed Story time transition finish handing back its
    // arrival snapshot before issuing a physical approach.
    await page.waitForTimeout(500);
    const actual=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());
    expect(actual[0]).toBeCloseTo(position[0],2);expect(actual[2]).toBeCloseTo(position[2],2);
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-${id}`||window.storyProbe.sceneErrors.length,expectedId,{timeout});}
    finally{await page.keyboard.up("KeyW");}
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
    return previous;
  };
  const parkForReload=async()=>{
    await page.evaluate(()=>{
      const l=window.storyProbe.lifecycle;
      l.resetPlayer(l.vectorFromArray([-15,0,110]),0,{persist:true});
      l.multiplayerRuntime.publishPresence(true);
    });
    await expect.poll(async()=>Math.abs((await saved()).character.x+15),{timeout:30_000}).toBeLessThan(0.1);
  };
  const wait=async label=>{
    await page.locator("#story-wait-button").click();await page.getByRole("option",{name:label,exact:true}).click();await page.getByRole("button",{name:label,exact:true}).click();await idle();
  };
  const checkSameDayAndAdvance=async()=>{
    // The lead can finish after 1 p.m.; waiting for a past time is invalid.
    const hour=new Date((await saved()).character.storyTimeMs).getUTCHours();
    if(hour<12)await wait("Wait until 1 p.m.");
    else expect(hour,"same-day appointment check must be before 5 p.m.").toBeLessThan(17);
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-31,0,91]),0,{persist:false});c.setFirstPerson(true);c.cameraYaw=0;c.updateCamera(1);});
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");await page.waitForTimeout(1500);await page.keyboard.up("KeyW");await idle();
    expect((await saved()).character.storyFlags[appointment]).not.toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-goro-job-appointment"))).toBe(false);
    // Leave the region before the day changes, so the wait does not trigger it.
    await page.evaluate(()=>window.storyProbe.lifecycle.resetPlayer(window.storyProbe.lifecycle.vectorFromArray([-15,0,110]),0,{persist:false}));
    await page.waitForTimeout(500);
    for(const label of ["Wait until tomorrow morning","Wait until 1 p.m."])await wait(label);
  };
  if(resumeAppointment){
    expect(initial.character.storyFlags[note]).toBe(true);expect(initial.character.storyFlags[appointment]).not.toBe(true);
    if(process.env.NEW_YOKOSUKA_GORO_RESUME_SAME_DAY_E2E==="true")await checkSameDayAndAdvance();
    await walk([-31,0,91],"goro-job-appointment");
    await page.waitForFunction(()=>window.storyProbe.director.activeCutscene.packageRuntime.activityRuntime.active.currentFrame>=30,null,{timeout:60_000});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("goro-appointment-natural-review"));await idle();
    const after=await saved();expect(after.character.storyFlags[lead]).toBe(true);expect(after.character.storyFlags[note]).toBe(true);
    expect(after.character.storyFlags[appointment]).not.toBe(true);expect(after.character.yen).toBe(initial.character.yen);expect(after.inventory).toEqual(initial.inventory);
    await parkForReload();
    return;
  }
  await page.evaluate(()=>{
    const p=window.storyProbe,scene=p.lifecycle.scene;
    p.goroLeadReview={voices:new Set(),frames:0};
    p.goroLeadReview.observer=scene.onAfterRenderObservable.add(()=>{
      const r=p.director?.activeCutscene;
      if(r?.cutscene.id!=="story-s1-goro-job-lead")return;
      p.goroLeadReview.frames++;
      for(const voice of r.packageRuntime?.audio?.active?.elements||[])
        if(voice.kind==="voice"&&!voice.audio.paused&&voice.audio.currentTime>0)p.goroLeadReview.voices.add(voice.command.audio.voiceId);
    });
  });
  try{
    await walk([-28,0,112],"goro-job-lead");
    await page.waitForFunction(()=>window.storyProbe.director.activeCutscene.packageRuntime.activityRuntime.active.currentFrame>=100,null,{timeout:60_000});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("goro-lead-natural-review"));await idle();
    expect((await saved()).character.storyFlags[lead]).not.toBe(true);
    const view=await walk([-28,0,112],"goro-job-lead");
    for(const frame of [100,700,1400,2100]){
      await page.waitForFunction(frame=>window.storyProbe.director?.activeCutscene?.packageRuntime?.activityRuntime?.active?.currentFrame>=frame,frame,{timeout:120_000});
      await page.screenshot({path:testInfo.outputPath(`goro-lead-natural-${frame}.png`)});
    }
    await expect.poll(async()=>(await saved()).character.storyFlags[lead],{timeout:120_000}).toBe(true);await idle();
    const completed=await saved();
    expect(completed.character.storyFlags[note]).toBe(true);
    expect(completed.character.storyFlags[appointment]).not.toBe(true);
    expect(completed.character.yen).toBe(initial.character.yen);expect(completed.inventory).toEqual(initial.inventory);
    const restored=await page.evaluate(()=>{const c=window.storyProbe.lifecycle.getController();return{firstPerson:c.firstPerson,yaw:c.cameraYaw,pitch:c.cameraPitch,distance:c.cameraDistance};});
    expect(restored.firstPerson).toBe(view.firstPerson);
    for(const key of ["yaw","pitch","distance"])expect(restored[key]).toBeCloseTo(view[key],4);
    const observed=await page.evaluate(()=>({frames:window.storyProbe.goroLeadReview.frames,voices:[...window.storyProbe.goroLeadReview.voices]}));
    expect(observed.frames).toBeGreaterThan(20);expect(observed.voices.length).toBe(23);
    await checkSameDayAndAdvance();
    await walk([-31,0,91],"goro-job-appointment");
    await page.waitForFunction(()=>window.storyProbe.director.activeCutscene.packageRuntime.activityRuntime.active.currentFrame>=30,null,{timeout:60_000});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("goro-appointment-natural-review"));await idle();
    const after=await saved();expect(after.character.storyFlags[lead]).toBe(true);expect(after.character.storyFlags[note]).toBe(true);
    expect(after.character.storyFlags[appointment]).not.toBe(true);expect(after.character.yen).toBe(initial.character.yen);expect(after.inventory).toEqual(initial.inventory);
    await parkForReload();
  }finally{
    await page.evaluate(()=>{const p=window.storyProbe;if(p.goroLeadReview?.observer)p.lifecycle.scene.onAfterRenderObservable.remove(p.goroLeadReview.observer);});
  }
}

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
    await page.waitForTimeout(500);
    const at=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());
    expect(at[0]).toBeCloseTo(position[0],2);expect(at[2]).toBeCloseTo(position[2],2);
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
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
    if(process.env.NEW_YOKOSUKA_APPOINTMENT_READY_E2E==="true"){
      const hour=new Date((await saved()).character.storyTimeMs).getUTCHours();
      expect(hour,"resumed appointment must be during its daytime window").toBeGreaterThanOrEqual(12);
      expect(hour,"resumed appointment must be during its daytime window").toBeLessThan(17);
    }else{
      await wait("Wait until tomorrow morning");await wait("Wait until 1 p.m.");
    }
    await approach([-31,0,91]);await scene("goro-job-appointment");await page.waitForTimeout(20_000);
    await page.screenshot({path:testInfo.outputPath("goro-mai-original-appointment.png")});await cancel();
    expect((await economy()).character.storyFlags[flag("goro-job-appointment")]).not.toBe(true);
    await approach([-31,0,91]);await scene("goro-job-appointment");
    if(process.env.NEW_YOKOSUKA_GORO_APPOINTMENT_NATURAL_E2E==="true"){
      await page.waitForFunction(()=>!window.storyProbe.director?.activeCutscene||window.storyProbe.sceneErrors.length,null,{timeout:120_000});
    }else await page.keyboard.press("KeyX");
    await idle();
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
