import { expect } from "@playwright/test";

// Review the original bank in the real world before assigning uncertain clips
// to Story inputs. This never sends a challenge result or edits progress.
export async function inspectHeartbeatsMotions(page, testInfo, character) {
  expect(character.storyFlags["story.s1.heartbeats-alley.completed"]).toBe(true);
  await placeAtHeartbeatsApproach(page);
  await page.evaluate(()=>{
    const c=window.storyProbe.regions.controller;
    // Inspection has no server run, but must suppress the gameplay pose/camera
    // writer while the same production presentation adapters own those actors.
    Object.defineProperty(c,"ownsPlayerPresentation",{configurable:true,get:()=>c.presentation.ownsPlayerPresentation});
  });
  const pairs=process.env.NEW_YOKOSUKA_ALLEY_FINISHER_REVIEW==="true"?[
    ["throw-success","AKI_TUKAMIKAIHI_SIPPAI_NAGE_SEIKOU_B_7QTE","TKA_TUKAMIKAIHI_SIPPAI_NAGE_SEIKOU_B_7QTE",4.2],
    ["backfist","AKI_HISSATU_URAKEN_SEIKOU_QTE_NEW0300","TKA_URAKEN_SEIKOU_5QTE",8.7],
    ["jump-kick","AKI_HISSATU_TOBIGERI_SEIKOU_QTE_NEW0300","TKA_URAKEN_SEIKOU_5QTE",8.7],
  ]:[
    ["kick-success","AKI_KERI_SEIKOU_1QTE","TKA_KERI_SEIKOU_1QTE",4.2],
    ["kick-failure","AKI_KERI_SIPPAI_1QTE","TKA_KERI_SIPPAI_1QTE",2.3],
    ["counter-success","AKI_HANGEKI_SEIKOU_1QTE","TKA_HANGEKI_SEIKOU_1QTE",3.6],
    ["counter-failure","AKI_HANGEKI_SIPPAI_1QTE","TKA_HANGEKI_SIPPAI_1QTE",3.5],
  ];
  for(const [id,ryo,tony,duration] of pairs) {
    await page.evaluate(async ({id,ryo,tony})=>{
      const p=window.storyProbe,presentation=p.regions.controller.presentation;
      const pose=(x,z,rotationY)=>({x,y:-1.88258,z,rotationX:0,rotationY,rotationZ:0});
      const idle={bank:"free",name:"AKI_AKI_STAND_LP",loop:true};
      const scene={id,area:"D000",actors:[
        {tag:"AKIR",pose:pose(-119.9,70.6,0),motion:idle},
        {tag:"TONY",pose:pose(-119.9,69.4,180),motion:idle},
        {tag:"SMTH",pose:pose(-121.1,68.2,150),motion:idle},
      ],camera:{positionX:-114.75444030761719,positionY:1.9238849878311157,positionZ:68.40476989746094,targetX:-120.64001464843751,targetY:-1.3068560361861545,targetZ:70.30879211425787,roll:0,perspective:45.60366821368092}};
      presentation.begin({area:"D000"});
      await presentation.adapters.playSequence({kind:"scene-staging-start",scene},presentation.transaction);
      const runtime=p.authoredScene;
      const a={bank:"heartbeats",name:ryo,loop:false},b={bank:"heartbeats",name:tony,loop:false};
      await runtime.motionRuntime.loadNamedSelections([a,b]);
      scene.actors[0].motion=a;scene.actors[1].motion=b;runtime.active.elapsed=0;
      // This is an inspection transaction, not an active server Story run.
      // Advance it using the rendered frame clock normally supplied by that run.
      let previous=performance.now();
      const tick=now=>{if(!runtime.active)return;runtime.update(presentation.transaction,Math.max(0,(now-previous)/1000));previous=now;p.motionReviewFrame=requestAnimationFrame(tick);};
      p.motionReviewFrame=requestAnimationFrame(tick);
    },{id,ryo,tony});
    for(const [index,seconds] of [.15,.65,1.1,1.6,2.1,...(duration>5?[3,4,5,6,7]:[]),duration].entries()) {
      await page.waitForFunction(t=>window.storyProbe.authoredScene.active?.elapsed>=t,seconds,{timeout:15_000});
      await page.screenshot({path:testInfo.outputPath(`${id}-${index}.png`)});
    }
    await page.evaluate(()=>{cancelAnimationFrame(window.storyProbe.motionReviewFrame);window.storyProbe.regions.controller.presentation.rollback("motion-review-finished");});
    expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  }
  await page.evaluate(()=>{delete window.storyProbe.regions.controller.ownsPlayerPresentation;});
}

export async function placeAtHeartbeatsApproach(page) {
  const approach=await page.evaluate(async()=>{
    const life=window.storyProbe.lifecycle;
    await life.travelToWorld("dobuita");
    const c=life.getController();
    // Search both sides of the region's X boundary on the actual alley floor.
    // The old +Z approach (124.56,67.4) was over a void and produced misleading
    // passing progress tests with a below-map gameplay camera.
    for(const z of [64.41,63,65,62.5,65.5])for(const [fromX,toX] of [[121,123],[127,125]]){
      const points=[];
      for(let step=0;step<=8;step++){
        const p=c.recoveryCandidateAt(fromX+(toX-fromX)*step/8,z,-1.8,{constrainHeight:false});
        if(!p||Math.abs(p.y+1.8)>.2)break;
        points.push(p);
      }
      if(points.length!==9)continue;
      const from=points[0],to=points.at(-1);
      const yaw=Math.atan2(to.x-from.x,to.z-from.z);
      life.resetPlayer(from,yaw,{persist:false});
      c.setFirstPerson(true);c.cameraYaw=yaw-Math.PI;c.cameraPitch=0;c.updateCamera(1);
      return {from:from.asArray(),to:to.asArray()};
    }
    throw Error("No floor-supported clear Heartbeats test approach");
  });
  console.info("Supported Heartbeats approach",approach);
  return approach;
}

// Presentation-only review from an earned checkpoint: use the exact activity
// adapter used by Yarn, without changing flags or pretending to replay a gate.
export async function reviewHeartbeatsPresentation(page, testInfo, character) {
  expect(character.storyFlags["story.s1.heartbeats-alley.completed"]).toBe(true);
  const before = (await (await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
  const approach=await placeAtHeartbeatsApproach(page);
  await page.locator("#renderCanvas").focus();
  await page.keyboard.down("KeyW");
  try {
    await page.waitForFunction(to=>{
      const p=window.storyProbe.lifecycle.getController().collider.position;
      return Math.hypot(p.x-to[0],p.z-to[2])<.6;
    },approach.to,{timeout:5000});
  } finally { await page.keyboard.up("KeyW"); }
  await page.evaluate(async () => {
    const life = window.storyProbe.lifecycle;
    await life.travelToWorld("dobuita");
    life.resetPlayer(life.vectorFromArray([124.56, -1.8, 64.41]), Math.PI, { persist: false });
  });
  await page.waitForTimeout(400);
  const ground = await page.evaluate(() => {
    const c = window.storyProbe.lifecycle.getController();
    return { position: c.collider.position.asArray(), floor: c.sampleTerrain(c.collider.position.x,c.collider.position.z,c.collider.position.y)?.height };
  });
  console.info("Heartbeats ground", ground);
  expect(ground.floor).toBeCloseTo(ground.position[1], 2);
  for (const part of ["introduction", "beer"]) {
    await page.evaluate(part => {
      const p=window.storyProbe;
      const presentation=p.regions.controller.presentation;
      p.activityReview={done:false,error:null};
      presentation.begin({area:p.lifecycle.worldRuntime.activeWorld.nativeArea});
      void presentation.execute({name:"start_activity",arguments:[{type:"string",isStatic:true,value:`s1.heartbeats.alley.${part}`}]})
        .then(()=>{presentation.commit();p.activityReview.done=true;},error=>{presentation.rollback("review-failed");p.activityReview.error=error.message;});
    },part);
    await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.runtime?.playback?.active?.frame>=15
      ||window.storyProbe.activityReview.error,null,{timeout:60_000});
    expect(await page.evaluate(()=>window.storyProbe.activityReview.error)).toBeNull();
    await page.screenshot({path:testInfo.outputPath(`alley-${part}-active.png`)});
    if(part==="beer") {
      await page.waitForTimeout(4000);
      await page.screenshot({path:testInfo.outputPath("alley-beer-later.png")});
    }
    await page.waitForFunction(()=>window.storyProbe.activityReview.done||window.storyProbe.activityReview.error,null,{timeout:45_000});
    expect(await page.evaluate(()=>window.storyProbe.activityReview.error)).toBeNull();
    const restored=await page.evaluate(()=>{
      const l=window.storyProbe.lifecycle,c=l.getController();
      return {position:c.collider.position.asArray(),locked:c.movementLocked,active:!!window.storyProbe.director.activeCutscene};
    });
    expect(restored.active).toBe(false);expect(restored.locked).toBe(false);
    for(let i=0;i<3;i++)expect(restored.position[i]).toBeCloseTo(ground.position[i],2);
  }
  const after=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
  expect(after.storyFlags).toEqual(before.storyFlags);expect(after.yen).toBe(before.yen);
}
