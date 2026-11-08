import {expect} from "@playwright/test";

// Isolated visual review: no server choice or progress is sent.
export async function reviewKittenChoice(page,testInfo,character){
  expect(character.storyFlags["story.s1.first-kitten.completed"]).toBe(true);
  const before=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
  await page.evaluate(async()=>{
    const p=window.storyProbe,life=p.lifecycle;
    await life.travelToWorld("yamanose");
    life.resetPlayer(life.vectorFromArray([36,2.6,45.3]),Math.PI,{persist:false});
    const c=life.getController();
    p.choiceReview={position:c.collider.position.asArray(),firstPerson:c.firstPerson,
      worldRoots:life.sceneState.currentMeshes.filter(root=>["CATM","BOX1"].includes(root.metadata?.runtimeObject?.objectTag))
        .map(root=>({root,enabled:root.isEnabled(false)}))};
    Object.defineProperty(p.regions.controller,"ownsPlayerPresentation",{configurable:true,get:()=>p.regions.controller.presentation.ownsPlayerPresentation});
    const presentation=p.regions.controller.presentation;
    presentation.begin({area:"JU00"});
    await presentation.execute({name:"play_sequence",arguments:[{type:"string",isStatic:true,value:"s1.ju00.first-kitten.choice.start"}]});
  });
  try{
    await page.waitForFunction(()=>{
      const p=window.storyProbe,cat=p.authoredScene.active?.actors.activeActor("CATM");
      return cat?.model.renderMeshes.some(mesh=>mesh.isEnabled()&&p.lifecycle.scene.isActiveMesh(mesh));
    },null,{timeout:20_000});
    const staged=await page.evaluate(()=>{
      const p=window.storyProbe,owner=p.authoredScene.active,cat=owner?.actors.activeActor("CATM");
      return {id:owner?.scene.id,catEnabled:cat?.root.isEnabled(),catVisible:cat?.model.renderMeshes.some(mesh=>mesh.isEnabled()&&p.lifecycle.scene.isActiveMesh(mesh)),
        box:owner?.sceneObjects?.objects.get("NBOX")?.root.isEnabled(),worldCats:owner?.actorSet?owner.actorSet.actors.packageActors.worldRoots.length:0,
        hiddenWorld:p.choiceReview.worldRoots.every(entry=>!entry.root.isEnabled(false))};
    });
    console.info("Kitten choice review:",JSON.stringify(staged));
    expect(staged.id).toBe("s1.ju00.first-kitten.choice");expect(staged.catEnabled).toBe(true);expect(staged.catVisible).toBe(true);expect(staged.box).toBe(true);
    expect(staged.worldCats).toBeGreaterThan(0);expect(staged.hiddenWorld).toBe(true);
    await page.screenshot({path:testInfo.outputPath("kitten-choice-tableau.png")});
  }finally{
    await page.evaluate(()=>{const p=window.storyProbe;p.regions.controller.presentation.rollback("kitten-choice-review");delete p.regions.controller.ownsPlayerPresentation;});
  }
  const restored=await page.evaluate(()=>{const p=window.storyProbe,c=p.lifecycle.getController(),before=p.choiceReview;return {position:c.collider.position.asArray(),firstPerson:c.firstPerson,locked:c.movementLocked,leases:p.lifecycle.scheduledActors.activityActorOwners.size,before:{position:before.position,firstPerson:before.firstPerson},worldRestored:before.worldRoots.every(entry=>entry.root.isEnabled(false)===entry.enabled)};});
  expect(restored.locked).toBe(false);expect(restored.leases).toBe(0);expect(restored.firstPerson).toBe(restored.before.firstPerson);
  expect(restored.worldRestored).toBe(true);
  restored.position.forEach((value,index)=>expect(value).toBeCloseTo(restored.before.position[index],4));
  const after=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
  expect(after.storyFlags).toEqual(before.storyFlags);expect(after.yen).toBe(before.yen);
}

// Exercises the real area trigger, choice and server settlement from a seeded
// dojo checkpoint. Skipping the intro is intentional, not a full-playthrough claim.
export async function verifyKittenChoice(page,testInfo,character,food){
  expect(character.storyFlags["story.s1.first-dojo.completed"]).toBe(true);
  const approach=async()=>{
    await page.evaluate(async()=>{
      const p=window.storyProbe;await p.lifecycle.travelToWorld("yamanose");
      p.lifecycle.resetPlayer(p.lifecycle.vectorFromArray([36,2.6,45.3]),Math.PI,{persist:false});
    });
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-first-kitten-introduction",null,{timeout:60_000});}
    finally{await page.keyboard.up("KeyW");}
    await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.runtime?.playback?.active?.frame>=15,null,{timeout:60_000});
    if(process.env.NEW_YOKOSUKA_KITTEN_MUSIC_E2E==="true"){
      await page.waitForFunction(()=>{
        const current=window.storyMusic?.director.current;
        return current?.trackId==="bgm051"&&!current.audio.paused&&current.audio.currentTime>.05;
      },null,{timeout:30_000});
      await page.evaluate(()=>{
        const p=window.storyProbe,a=window.storyMusic.director.current.audio;
        p.kittenMusic={audio:a,time:a.currentTime};
      });
    }
    await page.evaluate(()=>{
      const p=window.storyProbe,s=p.lifecycle.scene;
      p.choiceGap={frames:0,uncovered:0,held:0,empty:0,seenIntro:true};
      const observer=s.onAfterRenderObservable.add(()=>{
        if(p.director.activeCutscene?.cutscene.id==="story-s1-first-kitten-introduction")p.choiceGap.seenIntro=true;
        else if(p.choiceGap.seenIntro&&!(p.authoredScene?.active?.actorsBegun&&p.authoredScene.active.cameraBegun)){
          p.choiceGap.frames++;
          const frame=document.querySelector("#transition-frame");
          if(frame.hidden)p.choiceGap.uncovered++;
          else{
            p.choiceGap.held++;
            const context=frame.getContext("2d");
            const samples=[.25,.5,.75].map(x=>context.getImageData(Math.floor(frame.width*x),Math.floor(frame.height*.5),1,1).data);
            if(samples.every(pixel=>pixel[3]===0||pixel[0]+pixel[1]+pixel[2]===0))p.choiceGap.empty++;
          }
        }
      });
      p.stopChoiceGap=()=>s.onAfterRenderObservable.remove(observer);
    });
    if(process.env.NEW_YOKOSUKA_KITTEN_HANDOFF_NATURAL_E2E!=="true")await page.keyboard.press("KeyX");
    else if(process.env.NEW_YOKOSUKA_KITTEN_HANDOFF_SEEK_E2E==="true"){
      // Keep the terminal boundary natural while bounding the review. The
      // existing seek still evaluates every native frame and command.
      expect(await page.evaluate(()=>window.storyProbe.director.activeCutscene.runtime.playback.seekBySeconds(100))).toBe(true);
    }
    await expect(page.getByRole("button",{name:"Dried fish",exact:true})).toBeVisible({timeout:150_000});
    if(process.env.NEW_YOKOSUKA_KITTEN_MUSIC_E2E==="true"){
      await page.waitForFunction(()=>{
        const p=window.storyProbe,current=window.storyMusic.director.current;
        return current?.trackId==="bgm051"&&current.audio===p.kittenMusic.audio
          &&!current.audio.paused&&current.audio.currentTime>p.kittenMusic.time+.2;
      },null,{timeout:15_000});
      console.info("Kitten music: same media element playing across choice");
    }
    const gap=await page.evaluate(()=>{window.storyProbe.stopChoiceGap();return window.storyProbe.choiceGap;});
    console.info("Kitten transition frames:",JSON.stringify(gap));
    expect(gap.uncovered).toBe(0);expect(gap.empty).toBe(0);
    expect(await page.locator("#transition-frame").isHidden()).toBe(true);
  };
  await approach();
  const staged=await page.evaluate(()=>{const p=window.storyProbe,owner=p.authoredScene.active;return {
    id:owner?.scene.id,cat:owner?.actors.activeActor("CATM")?.root.isEnabled(),box:owner?.sceneObjects?.objects.get("NBOX")?.root.isEnabled(),
    cameraOwned:owner?.cameraBegun,locked:p.lifecycle.getController().movementLocked,
    worldCats:owner?.actorSet?.actors.packageActors.worldRoots.length};});
  console.info("Connected kitten choice:",JSON.stringify(staged));
  expect(staged).toMatchObject({id:"s1.ju00.first-kitten.choice",cat:true,box:true,cameraOwned:true,locked:true});
  const waiting=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(waiting.character.storyFlags["story.s1.first-kitten.completed"]).not.toBe(true);
  await page.screenshot({path:testInfo.outputPath(`kitten-choice-${food}.png`)});
  if(process.env.NEW_YOKOSUKA_KITTEN_GAP_ONLY_E2E==="true"){
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("kitten-gap-review"));
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
    expect(await page.evaluate(()=>window.storyProbe.authoredScene.active)).toBeNull();
    expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    return;
  }
  if(process.env.NEW_YOKOSUKA_KITTEN_CHOICE_CANCEL_E2E==="true"){
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("kitten-choice-test"));
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
    expect(await page.evaluate(()=>window.storyProbe.authoredScene.active)).toBeNull();
    expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
    expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    if(process.env.NEW_YOKOSUKA_KITTEN_MUSIC_E2E==="true"){
      expect(await page.evaluate(()=>window.storyProbe.kittenMusic.audio.paused)).toBe(true);
      expect(await page.evaluate(()=>window.storyMusic.director.current?.trackId)).not.toBe("bgm051");
    }
    const cancelled=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
    expect(cancelled.character.storyFlags["story.s1.first-kitten.completed"]).not.toBe(true);
    await approach();
  }
  await page.getByRole("button",{name:food==="fish"?"Dried fish":"Tofu",exact:true}).click();
  await page.waitForFunction(food=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-first-kitten-${food}`,food,{timeout:60_000});
  if(process.env.NEW_YOKOSUKA_KITTEN_MUSIC_E2E==="true"){
    expect(await page.evaluate(()=>window.storyMusic.director.current?.audio===window.storyProbe.kittenMusic.audio&&!window.storyProbe.kittenMusic.audio.paused)).toBe(true);
  }
  expect(await page.evaluate(()=>window.storyProbe.authoredScene.active)).toBeNull();
  await page.waitForFunction(()=>!window.storyProbe.director.active,null,{timeout:120_000});
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.first-kitten.completed"])).toBe(true);
  const after=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(after.character.storyFlags["notebook.s1.black-car"]).toBe(true);
  expect(Boolean(after.character.storyFlags["notebook.s1.yamagishi-witness"])).toBe(food==="fish");
  expect(after.character.yen).toBe(character.yen);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  if(process.env.NEW_YOKOSUKA_KITTEN_MUSIC_E2E==="true"){
    expect(await page.evaluate(()=>window.storyProbe.kittenMusic.audio.paused)).toBe(true);
    expect(await page.evaluate(()=>window.storyMusic.director.current?.trackId)).not.toBe("bgm051");
  }
}

// Hold the successor's real actor preparation across cancellation to exercise
// the frozen-frame owner and late-load cleanup through the actual event.
export async function verifyKittenHandoffCancellation(page,character){
  expect(character.storyFlags["story.s1.first-dojo.completed"]).toBe(true);
  await page.evaluate(async()=>{
    const p=window.storyProbe;await p.lifecycle.travelToWorld("yamanose");p.delayKittenChoice=true;
    p.lifecycle.resetPlayer(p.lifecycle.vectorFromArray([36,2.6,45.3]),Math.PI,{persist:false});
  });
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
  try{await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.runtime?.playback?.active?.frame>=15,null,{timeout:60_000});}
  finally{await page.keyboard.up("KeyW");}
  await page.keyboard.press("KeyX");
  await page.waitForFunction(()=>window.storyProbe.choicePreparationWaiting&&!document.querySelector("#transition-frame").hidden,null,{timeout:60_000});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("kitten-handoff-test"));
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  expect(await page.locator("#transition-frame").isHidden()).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await page.evaluate(()=>window.storyProbe.releaseChoicePreparation());
  await page.waitForFunction(()=>window.storyProbe.choicePreparationSettled,null,{timeout:60_000});
  expect(await page.evaluate(()=>window.storyProbe.authoredScene.active)).toBeNull();
  expect(await page.locator("#transition-frame").isHidden()).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  const state=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(state.character.storyFlags["story.s1.first-kitten.completed"]).not.toBe(true);
}
