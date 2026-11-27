import {expect} from "@playwright/test";
import {fightWithKeyboard} from "./story-seventy-man.js";

const fightId = "s1.d000.enoki-revenge";
const completedFlag = "story.s1.enoki-revenge.completed";

async function savedCharacter(page, id) {
  const response = await page.request.get("/api/characters/"+id+"/state");
  expect(response.ok()).toBe(true);
  return (await response.json()).character;
}

async function nativeBank(page, id) {
  const response = await page.request.get("/api/characters/"+id+"/dialogue");
  expect(response.ok()).toBe(true);
  return Buffer.from((await response.json()).state.banks["2"],"base64");
}

async function observe(page) {
  await page.evaluate(id=>{
    const probe=window.storyProbe, scene=probe.lifecycle.scene;
    const samples={stages:[], fights:[], sounds:{}, outcomes:[]};
    window.enokiRevengeSamples=samples;
    let lastStage,lastFight;
    const controller=probe.regions.controller;
    const respond=controller.combatResponse.bind(controller);
    controller.combatResponse=(action,token,intent)=>{
      const fight=probe.combatRuntime?.active?.view;
      if(fight?.id===id && intent?.outcome)samples.outcomes.push({
        outcome:intent.outcome,health:Object.fromEntries(fight.actors.map(actor=>[actor.tag,actor.health])),
      });
      return respond(action,token,intent);
    };
    scene.onAfterRenderObservable.add(()=>{
      const owner=probe.authoredScene?.active;
      // The staging owner is exposed while its assets load. Sample only after
      // playback has a duration so every captured timeline is measurable.
      if(owner?.scene?.id?.startsWith(id+"-") && Number.isFinite(owner.durationSeconds)){
        if(owner!==lastStage){
          samples.stages.push({id:owner.scene.id,duration:owner.durationSeconds,frame:0,visible:{},cameras:[]});
          lastStage=owner;
        }
        const stage=samples.stages.at(-1), frame=Math.floor(owner.elapsed*30);
        if(frame!==stage.frame || !stage.cameras.length){
          stage.frame=frame;
          if(frame%6<=1 || !stage.cameras.length){
            const camera=scene.activeCamera;
            const eye=camera.globalPosition.asArray().map(v=>Math.round(v*100)/100);
            const prev=stage.cameras.at(-1);
            if(!prev || Math.hypot(...eye.map((v,i)=>v-prev.eye[i]))>.3){
              stage.cameras.push({frame,eye,fov:Math.round(camera.fov*1000)/1000});
            }
            for(const actor of owner.scene.actors){
              const root=owner.actors.activeActor(actor.tag)?.root;
              if(!root)continue;
              const meshes=root.getChildMeshes(false).filter(m=>m.isEnabled()&&m.isVisible&&m.visibility>0&&m.getTotalVertices()>0&&scene.isActiveMesh(m)&&camera.isInFrustum(m));
              const vertices=meshes.reduce((sum,m)=>sum+m.getTotalVertices(),0);
              if(vertices>(stage.visible[actor.tag]?.vertices||0))stage.visible[actor.tag]={vertices,frame,position:root.getAbsolutePosition().asArray()};
            }
          }
        }
      }else lastStage=null;
      const fight=probe.combatRuntime?.active;
      if(fight && fight!==lastFight && fight.view?.id===id){
        samples.fights.push(fight.view.actors.map(a=>({tag:a.tag,hp:a.health,x:a.x,z:a.z})));
        lastFight=fight;
      }else if(!fight){lastFight=null;}
      const audio=probe.dialogue?.audio;
      const voice=audio?.src?.match(/E1065[A-C][0-9]{3}/i)?.[0]?.toUpperCase();
      if(voice && !audio.paused && audio.currentTime>0){
        samples.sounds[voice]={text:probe.dialogue.dom.sourceText.textContent};
      }
    });
  },fightId);
}

async function walkApproach(page, admitted) {
  await page.evaluate(()=>{
    const probe=window.storyProbe,l=probe.lifecycle,c=l.getController();
    l.resetPlayer(l.vectorFromArray([-44.3,5.25,77.4]),0,{persist:false});
    c.setFirstPerson(true);c.cameraYaw=-Math.PI;c.cameraPitch=0;c.updateCamera(1);
  });
  await page.waitForTimeout(300);
  await page.locator("#renderCanvas").focus();
  await page.keyboard.down("KeyW");
  try {
    await page.waitForFunction(eligible=>{
      const p=window.storyProbe, point=p.lastRegionFrame?.playerPosition;
      return p.sceneErrors.length || (eligible
        ? p.regions.controller.active?.scriptIdentity?.scriptSlug==="story-s1-enoki-revenge"
        : point && point[2]>=79.2);
    },admitted,{timeout:25_000});
  } finally {await page.keyboard.up("KeyW");}
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
}

async function waitForFight(page,count) {
  await page.waitForFunction(n=>window.storyProbe.sceneErrors.length ||
    (window.enokiRevengeSamples.fights.length>=n && window.storyProbe.combatRuntime?.active?.view?.id==="s1.d000.enoki-revenge"),
    count,{timeout:150_000});
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  console.info("Dobuita revenge fight",count);
}

async function win(page) {
  for(let attempt=0;attempt<5;attempt++){
    const before=await page.evaluate(()=>window.enokiRevengeSamples.outcomes.length);
    const fightCount=await page.evaluate(()=>window.enokiRevengeSamples.fights.length);
    await fightWithKeyboard(page,()=>page.evaluate(()=>{
      const fight=window.storyProbe.combatRuntime?.active;return !fight || Boolean(fight.outcome);
    }));
    await page.waitForFunction(n=>window.enokiRevengeSamples.outcomes.length>n,before,{timeout:15_000});
    const outcome=await page.evaluate(()=>window.enokiRevengeSamples.outcomes.at(-1));
    console.info("Dobuita revenge fight outcome",outcome.outcome,JSON.stringify(outcome.health));
    if(outcome.outcome==="success"){
      expect(Object.entries(outcome.health).filter(([tag])=>tag!=="AKIR").every(([,hp])=>hp<=0)).toBe(true);
      return;
    }
    expect(outcome.outcome).toBe("defeated");await waitForFight(page,fightCount+1);
  }
  throw Error("Ryo was defeated on every keyboard attempt");
}

export async function verifyEnokiRevenge(page,testInfo,character,enterStoryWorld){
  const mode=process.env.NEW_YOKOSUKA_ENOKI_REVENGE;
  const continuation=mode==="revenge-resume";
  const positive=mode==="revenge-positive" || continuation,history=[];
  const original=await nativeBank(page,character.id);
  const initial=await savedCharacter(page,character.id);
  const unchanged=async()=>expect(await nativeBank(page,character.id)).toEqual(original);
  const reconnect=async()=>{
    await page.reload();
    await enterStoryWorld(page,character.name);
    await page.waitForFunction(id=>window.storyProbe?.ready && window.storyProbe.regions?.controller && window.storyProbe.regions.getCharacter()?.id===id,
      character.id,{timeout:120_000});
  };
  const waitForWinScene=()=>page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.d000.enoki-revenge-win",null,{timeout:70_000});
  try {
    await observe(page);await walkApproach(page,positive);
    if(!positive){
      await page.waitForTimeout(700);
      expect(await page.evaluate(()=>window.enokiRevengeSamples.stages)).toEqual([]);
      expect(await page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await unchanged();
      return;
    }
    await waitForFight(page,1);await unchanged();
    if(!continuation){
      // Genuine combat with no input reaches defeat. The director plays its
      // defeat conversation before repeating the confrontation and fight.
      await waitForFight(page,2);await unchanged();
      const retry=await page.evaluate(()=>window.enokiRevengeSamples);
      expect(retry.outcomes[0].outcome).toBe("defeated");expect(retry.outcomes[0].health.AKIR).toBeLessThanOrEqual(0);
      expect(retry.stages.map(s=>s.id)).toEqual([fightId+"-intro",fightId+"-defeat",fightId+"-intro"]);
      expect(retry.fights[1].map(a=>[a.tag,a.hp])).toEqual(retry.fights[0].map(a=>[a.tag,a.hp]));
    }
    await page.screenshot({path:testInfo.outputPath("dobuita-revenge-fight.png")});
    await win(page);await waitForWinScene();await unchanged();
    if(mode==="revenge-positive"){
      console.info("Reloading a won but unsettled revenge encounter");
      history.push(await page.evaluate(()=>window.enokiRevengeSamples));
      await reconnect();await unchanged();
      await observe(page);await walkApproach(page,true);await waitForFight(page,1);await win(page);await waitForWinScene();
    }
    await expect.poll(async()=>(await savedCharacter(page,character.id)).storyFlags[completedFlag],{timeout:120_000}).toBe(true);
    const settled=await nativeBank(page,character.id), expected=Buffer.from(original);
    expected[851>>3]|=1<<(851%8);expect(settled).toEqual(expected);
    const final=await savedCharacter(page,character.id);
    expect(Object.keys(final.storyFlags).filter(k=>!!final.storyFlags[k]&&!initial.storyFlags[k])).toEqual([completedFlag]);
    expect(final.yen).toBe(initial.yen);
    history.push(await page.evaluate(()=>window.enokiRevengeSamples));
    const heard=Object.assign({},...history.map(x=>x.sounds));
    expect(Object.keys(heard)).toHaveLength(continuation?13:16);
    for(const id of ["E1065B003","E1065B005"])expect(heard[id].text).toBe("");
    for(const phase of continuation?["intro","win"]:["intro","defeat","win"]){
      const scene=history.flatMap(h=>h.stages).filter(s=>s.id===fightId+"-"+phase).sort((a,b)=>b.frame-a.frame)[0];
      expect(scene, "Captured "+phase+" before the fight advanced").toBeDefined();
      expect(scene.duration).toBeGreaterThan(0);
      expect(scene.frame).toBeGreaterThanOrEqual(Math.floor(scene.duration*30)-3);
      expect(scene.cameras.length).toBeGreaterThan(1);
      expect(Object.keys(scene.visible).length).toBeGreaterThan(0);
    }
    await reconnect();await observe(page);await walkApproach(page,false);
    expect(await nativeBank(page,character.id)).toEqual(expected);
    expect(await page.evaluate(()=>window.enokiRevengeSamples.stages)).toEqual([]);
  } finally {
    const current=await page.evaluate(()=>({capture:window.enokiRevengeSamples,errors:window.storyProbe.sceneErrors,
      script:window.storyProbe.regions.controller.active?.scriptIdentity?.scriptSlug,
      coord:window.storyProbe.lastRegionFrame?.playerPosition,status:window.storyProbe.regions.controller.status})).catch(()=>({}));
    await testInfo.attach("enoki-revenge-"+mode,{body:JSON.stringify({mode,history,current}),contentType:"application/json"});
  }
}
