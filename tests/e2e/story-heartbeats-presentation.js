import { expect } from "@playwright/test";
import fs from "node:fs";
import { parseIpacActivityArchive, sha256 } from "../../tools/lib/NativeAseqActivityPack.mjs";

// Original motion review, deliberately separate from progression verification.
// No asset or guessed actor alignment enters the game merely by passing this.
export async function inspectHeartbeatsBarMotions(page, testInfo, character) {
  expect(character.storyFlags["story.s1.heartbeats-bar.completed"]).toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before=await saved();
  expect(Array.isArray(before.inventory)).toBe(true);
  const archive=fs.readFileSync("extracted_files/data/SCENE/01/DHQB/MPK00.PKS");
  expect(sha256(archive)).toBe("9252217af74608f215f1b90bd8460cd9182840b1758094e109520572c028f3a2");
  const motion=parseIpacActivityArchive(archive).members.find(m=>m.name==="M_DHQB.MOTN").bytes;
  expect(sha256(motion)).toBe("b53970dc8443c01cdbb02daf4d15b959746aa5729c8919f126df22d7d2c8359b");
  await page.route("**/__story-review/heartbeats.MOTN",route=>route.fulfill({body:motion,contentType:"application/octet-stream"}));
  await page.evaluate(async()=>{
    const p=window.storyProbe;await p.lifecycle.travelToWorld("dbhb");
    Object.defineProperty(p.regions.controller,"ownsPlayerPresentation",{configurable:true,get:()=>p.regions.controller.presentation.ownsPlayerPresentation});
  });
  const samples=process.env.NEW_YOKOSUKA_BAR_HIGHKICK_CONTACT_REVIEW==="true"?[
    // Diagnostic positions, not inferred original placements or Story data.
    ["highkick-front-near","JONZ","AKI_QOK_QOK_HIGHKICK_HB_QTE","OTH_TKC_QOK_QOK_HIGHKICK_HB_QTE",2.17,{x:0,z:-1,yaw:180,baseX:3.5,baseZ:-6.5}],
    ["highkick-front-far","JONZ","AKI_QOK_QOK_HIGHKICK_HB_QTE","OTH_TKC_QOK_QOK_HIGHKICK_HB_QTE",2.17,{x:0,z:-1.5,yaw:180,baseX:3.5,baseZ:-6.5}],
    ["highkick-front-same","JONZ","AKI_QOK_QOK_HIGHKICK_HB_QTE","OTH_TKC_QOK_QOK_HIGHKICK_HB_QTE",2.17,{x:0,z:-1,yaw:0,baseX:3.5,baseZ:-6.5}],
    ["highkick-front-offset","JONZ","AKI_QOK_QOK_HIGHKICK_HB_QTE","OTH_TKC_QOK_QOK_HIGHKICK_HB_QTE",2.17,{x:.5,z:-1,yaw:180,baseX:3.5,baseZ:-6.5}],
  ]:process.env.NEW_YOKOSUKA_BAR_OPEN_MOTION_REVIEW==="true"?[
    ["open-counter","SERA","AKI_QOK_NAGERU_CAUNTER_HB_A","OTH_TKA_QOK_NORU_CAUNTER_HB_A",2.7,{x:-.82703,z:.42759,yaw:-79.7557,baseX:3.5,baseZ:-6.5}],
    ["open-table","HARY","AKI_QOK_TUKKOMU_TABLE_HB_B","OTH_TKB_QOK_TUKKOMU_TABLE_HB_B",9.6,{x:-.82703,z:.42759,yaw:-79.7557,baseX:3.5,baseZ:-6.5}],
    ["open-kick","JONZ","AKI_QOK_KICK_HB_QTE","OTH_TKC_QOK_KICK_HB_QTE",4.14,{x:-.82703,z:.42759,yaw:-79.7557,baseX:3.5,baseZ:-6.5}],
    ["open-highkick","JONZ","AKI_QOK_QOK_HIGHKICK_HB_QTE","OTH_TKC_QOK_QOK_HIGHKICK_HB_QTE",2.17,{x:-.82703,z:.42759,yaw:-79.7557,baseX:3.5,baseZ:-6.5}],
  ]:process.env.NEW_YOKOSUKA_BAR_SPACE_REVIEW==="true"?[
    ["space-a","JONZ","AKI_QOK_KICK_HB_QTE","OTH_TKC_QOK_KICK_HB_QTE",4.14,{x:-.82703,z:.42759,yaw:-79.7557,baseX:.3,baseZ:-4.5}],
    ["space-b","JONZ","AKI_QOK_KICK_HB_QTE","OTH_TKC_QOK_KICK_HB_QTE",4.14,{x:-.82703,z:.42759,yaw:-79.7557,baseX:.3,baseZ:-6.5}],
    ["space-c","JONZ","AKI_QOK_KICK_HB_QTE","OTH_TKC_QOK_KICK_HB_QTE",4.14,{x:-.82703,z:.42759,yaw:-79.7557,baseX:3.5,baseZ:-6.5}],
    ["space-d","JONZ","AKI_QOK_KICK_HB_QTE","OTH_TKC_QOK_KICK_HB_QTE",4.14,{x:-.82703,z:.42759,yaw:-79.7557,baseX:3.5,baseZ:-4.5}],
  ]:process.env.NEW_YOKOSUKA_BAR_ALIGNMENT_REVIEW==="true"?[
    // The original DHQB controller calls a relative link helper with these
    // offsets; both coordinate handedness and which state owns the link still
    // need rendered review. These are not gameplay staging records.
    ["link-a","JONZ","AKI_QOK_KICK_HB_QTE","OTH_TKC_QOK_KICK_HB_QTE",4.14,{x:.82703,z:.42759,yaw:79.7557}],
    ["link-b","JONZ","AKI_QOK_KICK_HB_QTE","OTH_TKC_QOK_KICK_HB_QTE",4.14,{x:-.82703,z:.42759,yaw:-79.7557}],
    ["link-c","JONZ","AKI_QOK_KICK_HB_QTE","OTH_TKC_QOK_KICK_HB_QTE",4.14,{x:.42759,z:.82703,yaw:79.7557}],
    ["link-d","JONZ","AKI_QOK_KICK_HB_QTE","OTH_TKC_QOK_KICK_HB_QTE",4.14,{x:-.42759,z:.82703,yaw:-79.7557}],
  ]:[
    ["counter","SERA","AKI_QOK_NAGERU_CAUNTER_HB_A","OTH_TKA_QOK_NORU_CAUNTER_HB_A",2.7],
    ["table","HARY","AKI_QOK_TUKKOMU_TABLE_HB_B","OTH_TKB_QOK_TUKKOMU_TABLE_HB_B",9.6],
    ["kick","JONZ","AKI_QOK_KICK_HB_QTE","OTH_TKC_QOK_KICK_HB_QTE",4.14],
    ["highkick","JONZ","AKI_QOK_QOK_HIGHKICK_HB_QTE","OTH_TKC_QOK_QOK_HIGHKICK_HB_QTE",2.17],
  ];
  try { for(const [id,other,ryo,opponent,duration,relative] of samples) {
    const returnedFrom=await page.evaluate(()=>{
      const p=window.storyProbe,c=p.lifecycle.getController();
      return {position:c.collider.position.asArray(),firstPerson:c.firstPerson,avatar:p.lifecycle.playerRuntime.activeCharacterId};
    });
    await page.evaluate(async({id,other,ryo,opponent,relative})=>{
      const p=window.storyProbe,presentation=p.regions.controller.presentation;
      const pose=(x,z,rotationY)=>({x,y:0,z,rotationX:0,rotationY,rotationZ:0});
      const x=relative?.baseX??1.8,z=relative?.baseZ??-5.7;
      const scene={id,area:"DBHB",actors:[
        {tag:"AKIR",pose:pose(x,z,0),motion:{bank:"free",name:"AKI_AKI_STAND_LP",loop:true}},
        {tag:other,pose:relative?pose(x+relative.x,z+relative.z,relative.yaw):pose(1.8,-4.5,180),motion:{bank:"free",name:"AKI_AKI_STAND_LP",loop:true}},
      ],camera:{positionX:-1.5,positionY:1.7,positionZ:-6.8,targetX:1.8,targetY:1,targetZ:-4.8,roll:0,perspective:65}};
      presentation.begin({area:"DBHB"});
      if(!await presentation.adapters.playSequence({kind:"scene-staging-start",scene},presentation.transaction))throw Error("Bar review staging rejected");
      p.authoredScene.motionRuntime.bankUrls.barReview="/__story-review/heartbeats.MOTN";
      const motions=[ryo,opponent].map(name=>({bank:"barReview",name,loop:false}));
      await p.authoredScene.motionRuntime.loadNamedSelections(motions);
      scene.actors.forEach((a,i)=>a.motion=motions[i]);p.authoredScene.active.elapsed=0;
      let previous=performance.now();
      const tick=now=>{if(!p.authoredScene.active)return;p.authoredScene.update(presentation.transaction,Math.max(0,(now-previous)/1000));previous=now;p.motionReviewFrame=requestAnimationFrame(tick);};
      p.motionReviewFrame=requestAnimationFrame(tick);
    },{id,other,ryo,opponent,relative});
    try {
      for(const [index,seconds] of [.1,.7,1.3,Math.min(2,duration),duration].entries()) {
        await page.waitForFunction(t=>window.storyProbe.authoredScene.active?.elapsed>=t,seconds);
        await page.screenshot({path:testInfo.outputPath(`bar-${id}-${index}.png`)});
      }
    } finally {
      await page.evaluate(()=>{cancelAnimationFrame(window.storyProbe.motionReviewFrame);window.storyProbe.regions.controller.presentation.rollback("bar-motion-review-finished");});
    }
    const restored=await page.evaluate(()=>{
      const p=window.storyProbe,c=p.lifecycle.getController();
      return {position:c.collider.position.asArray(),firstPerson:c.firstPerson,avatar:p.lifecycle.playerRuntime.activeCharacterId,
        locked:c.movementLocked,leases:p.lifecycle.scheduledActors.activityActorOwners.size};
    });
    expect(restored.locked).toBe(false);expect(restored.leases).toBe(0);
    expect(restored.avatar).toBe(returnedFrom.avatar);expect(restored.firstPerson).toBe(returnedFrom.firstPerson);
    restored.position.forEach((v,i)=>expect(v).toBeCloseTo(returnedFrom.position[i],4));
  } } finally {
    await page.evaluate(()=>{
      const p=window.storyProbe;cancelAnimationFrame(p.motionReviewFrame);
      p.regions.controller.presentation.rollback("bar-review-cleanup");
      delete p.regions.controller.ownsPlayerPresentation;
      if(p.authoredScene)delete p.authoredScene.motionRuntime.bankUrls.barReview;
    });
    await page.unroute("**/__story-review/heartbeats.MOTN");
  }
  const after=await saved();
  expect(after.character.storyFlags).toEqual(before.character.storyFlags);expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);
}

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

// Render the actual staged transition with an earned character; this bypasses
// challenge results and never awards progress. Captures are for visual review.
export async function reviewHeartbeatsSecondExchange(page,testInfo,character) {
  expect(character.storyFlags["story.s1.heartbeats-alley.completed"]).toBe(true);
  const before=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
  await placeAtHeartbeatsApproach(page);
  await page.evaluate(async()=>{
    const p=window.storyProbe, presentation=p.regions.controller.presentation;
    Object.defineProperty(p.regions.controller,"ownsPlayerPresentation",{configurable:true,get:()=>presentation.ownsPlayerPresentation});
    const {createScriptEventPresentationCatalog}=await import("/play/scripts/ScriptEventPresentationCatalog.js");
    const catalog=createScriptEventPresentationCatalog();
    presentation.begin({area:"D000"});
    p.secondReview={done:false,error:null};
    let previous=performance.now();
    const tick=now=>{if(!p.secondReview||p.secondReview.done)return;p.authoredScene.update(presentation.transaction,Math.max(0,(now-previous)/1000));previous=now;p.motionReviewFrame=requestAnimationFrame(tick);};
    p.motionReviewFrame=requestAnimationFrame(tick);
    void (async()=>{
      for(const part of ["prompt","success","second-setup","second-prompt","second-success","second-failure"]){
        if(!await presentation.adapters.playSequence(catalog.sequence(`s1.heartbeats.alley.defense.${part}.start`),presentation.transaction))throw Error(`Rejected ${part}`);
      }
      p.secondReview.done=true;
    })().catch(error=>{p.secondReview.error=error.message;p.secondReview.done=true;});
  });
  try {
    for(const [part,time] of [["second-setup",.5],["second-setup",1.7],["second-success",.6],["second-success",2],["second-failure",.6]]){
      await page.waitForFunction(({part,time})=>window.storyProbe.secondReview.error||(window.storyProbe.authoredScene.active?.scene.id.endsWith(`.${part}`)&&window.storyProbe.authoredScene.active.elapsed>=time),{part,time},{timeout:20_000});
      expect(await page.evaluate(()=>window.storyProbe.secondReview.error)).toBeNull();
      await page.screenshot({path:testInfo.outputPath(`alley-review-${part}-${time}.png`)});
    }
    await page.waitForFunction(()=>window.storyProbe.secondReview.done,null,{timeout:20_000});
    expect(await page.evaluate(()=>window.storyProbe.secondReview.error)).toBeNull();
  } finally {
    await page.evaluate(()=>{const p=window.storyProbe;cancelAnimationFrame(p.motionReviewFrame);p.regions.controller.presentation.rollback("second-exchange-review");delete p.regions.controller.ownsPlayerPresentation;});
  }
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
  const after=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
  expect(after.storyFlags).toEqual(before.storyFlags);expect(after.yen).toBe(before.yen);
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
