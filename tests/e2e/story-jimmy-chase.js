import {expect} from "@playwright/test";

// Continue an actually earned Chai save. Only approach positioning is bounded;
// all challenges, cinematics and settlement use the normal client/server path.
export async function verifyJimmyChase(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),capture="story.s1.jimmy-chase.completed",clue="notebook.s1.jimmy-mad-angels";
  expect(initial.character.storyFlags["story.s1.chai-arcade.completed"]).toBe(true);
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
    await page.waitForFunction(()=>{const l=window.storyProbe.lifecycle;return l.worldRuntime.ready&&!l.worldRuntime.switching;},null,{timeout:90_000});
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await noErrors();
  };
  const scene=async id=>{await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-${id}`||window.storyProbe.sceneErrors.length,id,{timeout:90_000});await noErrors();};
  const unchanged=async()=>{
    const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);expect(s.character.storyFlags[clue]).not.toBe(true);
    return s;
  };
  const reload=async()=>{
    await page.reload();await page.keyboard.press("Enter");
    await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
    await page.locator(".character-slot-button:not(.empty)").first().click();
    await page.locator("button").filter({hasText:/^Enter World$/}).click();
    await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);
  };
  if(!initial.character.storyFlags[capture]){
    await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("dobuita"));await idle();
    const approach=async()=>{
      await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([71.55,0,83]),0,{persist:false});c.setFirstPerson(true);c.cameraYaw=0;c.cameraPitch=0;c.updateCamera(1);});
      await page.waitForTimeout(300);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
      try{await page.waitForFunction(()=>window.storyProbe.regions.controller.status==="options"||window.storyProbe.sceneErrors.length,null,{timeout:20_000});}
      finally{await page.keyboard.up("KeyW");}await noErrors();
    };
    await approach();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
    expect((await unchanged()).character.storyFlags[capture]).not.toBe(true);
    await approach();await page.getByRole("button",{name:"Knock at Asia Travel",exact:true}).click();await scene("jimmy-knock");
    await page.waitForTimeout(5000);await page.screenshot({path:testInfo.outputPath("jimmy-original-door-opening.png")});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-jimmy-opening-cancel"));await idle();
    expect((await unchanged()).character.storyFlags[capture]).not.toBe(true);
    await approach();await page.getByRole("button",{name:"Knock at Asia Travel",exact:true}).click();await scene("jimmy-knock");await page.keyboard.press("KeyX");
    const prompt=async(button,beat)=>{
      await page.waitForFunction(({button,beat})=>{
        const p=window.storyProbe.regions.controller.active?.challengePrompt,s=window.storyProbe.authoredScene?.active?.scene;
        return p?.ready&&p.button===button&&s?.id===`s1.d000.jimmy-chase.beat-${String(beat).padStart(2,"0")}`||window.storyProbe.sceneErrors.length;
      },{button,beat},{timeout:60_000});await noErrors();
    };
    await prompt("Left",1);await page.keyboard.press("ArrowRight");await scene("jimmy-escaped");
    await page.waitForTimeout(3500);await page.screenshot({path:testInfo.outputPath("jimmy-original-escape.png")});
    expect((await unchanged()).character.storyFlags[capture]).not.toBe(true);
    await page.keyboard.press("KeyX");await page.getByRole("button",{name:"Try again",exact:true}).click();await scene("jimmy-knock");await page.keyboard.press("KeyX");
    const buttons=["Left","Right","Left","Right","Left","Right","A","Left","Left","Right","Left","Right","A"];
    const finishChase=async screenshots=>{
      const positions=[];
      for(let i=0;i<buttons.length;i++){
        await prompt(buttons[i],i+1);
        const visual=await page.evaluate(()=>{
          const r=window.storyProbe.authoredScene,a=r.actors.activeActor("JIMY");
          return{position:r.actors.activeActor("AKIR").root.getAbsolutePosition().asArray(),jimmyEnabled:a.root.isEnabled(),jimmyMeshes:a.root.getChildMeshes().filter(m=>m.isEnabled()&&m.isVisible).length};
        });
        expect(visual.jimmyEnabled).toBe(true);expect(visual.jimmyMeshes).toBeGreaterThan(0);positions.push(visual.position);
        // Capture before answering, but don't let screenshot I/O consume the
        // two-second window on later beats.
        if(screenshots&&[0,5,11].includes(i))await page.screenshot({path:testInfo.outputPath(`jimmy-running-beat-${i+1}.png`)});
        await page.keyboard.press(buttons[i]==="A"?"Enter":`Arrow${buttons[i]}`);
      }
      expect(Math.hypot(positions[0][0]-positions.at(-1)[0],positions[0][2]-positions.at(-1)[2])).toBeGreaterThan(50);
      await scene("jimmy-caught");
    };
    await finishChase(true);await page.waitForTimeout(7000);await page.screenshot({path:testInfo.outputPath("jimmy-original-van-capture.png")});
    expect((await unchanged()).character.storyFlags[capture]).not.toBe(true);
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-jimmy-capture-cancel"));await idle();
    expect((await unchanged()).character.storyFlags[capture]).not.toBe(true);
    await approach();await page.getByRole("button",{name:"Knock at Asia Travel",exact:true}).click();await scene("jimmy-knock");await page.keyboard.press("KeyX");
    await finishChase(false);await page.keyboard.press("KeyX");
  }
  await scene("jimmy-interrogation");
  await expect.poll(async()=>(await saved()).character.storyFlags[capture]).toBe(true);
  expect((await unchanged()).character.worldId).toBe("daza");
  await page.waitForTimeout(9000);await page.screenshot({path:testInfo.outputPath("jimmy-original-interrogation.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-jimmy-interrogation-cancel"));await idle();await unchanged();
  await reload();await scene("jimmy-interrogation");await page.waitForTimeout(25_000);
  await page.screenshot({path:testInfo.outputPath("jimmy-mad-angels-original-dialogue.png")});await unchanged();
  await page.keyboard.press("KeyX");await idle();
  const final=await saved();expect(final.character.storyFlags[clue]).toBe(true);expect(final.character.storyFlags["story.s1.jimmy-interrogation.completed"]).toBe(true);
  expect(final.character.yen).toBe(initial.character.yen);expect(final.inventory).toEqual(initial.inventory);
  await page.locator("button").filter({hasText:/^Notebook$/}).click();
  for(let i=0;i<130&&await page.locator("#journal-next").isEnabled();i++)await page.locator("#journal-next").click();
  await expect(page.locator("#journal-page-copy")).toContainText("get a job at New Yokosuka Harbor");await page.screenshot({path:testInfo.outputPath("jimmy-earned-harbor-job-notebook.png")});
  await page.locator("#journal-close").click();await reload();await idle();
  expect((await saved()).character.storyFlags[clue]).toBe(true);expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-jimmy-interrogation"))).toBe(false);
}
