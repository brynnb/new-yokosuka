import {expect} from "@playwright/test";
import {fightWithKeyboard} from "./story-seventy-man.js";

const fightId = "s1.jd00.nozomi-park-rescue";
const slotId = slot => "EVSN/SEQDATA" + slot + ".AUTH";
const rescueDone = "story.s1.nozomi-park-rescue.completed";

async function nativeBank(page, characterId) {
  const response = await page.request.get("/api/characters/" + characterId + "/dialogue");
  expect(response.ok()).toBe(true);
  return Buffer.from((await response.json()).state.banks["2"], "base64");
}
const bit = (bank,index) => Boolean(bank[index >> 3] & (1 << (index % 8)));

async function observePark(page) {
  await page.evaluate(() => {
    const p = window.storyProbe;
    const scene = p.lifecycle.scene;
    const visits = [];
    let lastFilm, lastFight;
    window.parkCapture = {visits};
    const controller=p.regions.controller;
    if (!controller.parkCombatObserved) {
      const respond=controller.combatResponse.bind(controller);
      controller.combatResponse = (action,token,intent) => {
        if (intent?.outcome && p.combatRuntime?.active?.view?.id?.startsWith("s1.jd00.nozomi-park-rescue")) {
          (window.parkCapture.outcomes ||= []).push({outcome:intent.outcome,
            health:p.combatRuntime.active.view.actors.map(a=>({tag:a.tag,hp:a.health}))});
        }
        return respond(action,token,intent);
      };
      controller.parkCombatObserved=true;
    }
    scene.onAfterRenderObservable.add(() => {
      const director = p.director?.activeCutscene;
      const runtime = director?.packageRuntime;
      const film = runtime?.activityRuntime.active;
      const id = film?.record.activityId;
      if (id?.startsWith("EVSN/")) {
        if (film !== lastFilm) {
          lastFilm = film;
          visits.push({type:"film", id, wrapper:director.cutscene.id, duration:film.record.durationFrames, first:film.currentFrame, last:film.currentFrame, frames:0});
        }
        const record = visits.at(-1);
        record.last = film.currentFrame;
        record.frames++;
        if(!record.visible || (film.currentFrame >= (record.visible.at(-1)?.frame ?? -160) + 160)) {
          const camera=scene.activeCamera, actors={};
          for (const tag of ["AKIR","HRSK","KKEN","ENKI","NGSM"]) {
            const actor=runtime.actors.activeActor(tag), root=actor?.root;
            if(!root?.isEnabled())continue;
            const meshes=root.getChildMeshes(false).filter(m=>m.isEnabled()&&m.isVisible&&m.visibility>0&&m.getTotalVertices()>0&&scene.isActiveMesh(m)&&camera.isInFrustum(m));
            const vertices=meshes.reduce((sum,m)=>sum+m.getTotalVertices(),0);
            if (vertices)actors[tag]=vertices;
          }
          if(Object.keys(actors).length)(record.visible ||= []).push({frame:film.currentFrame,actors});
        }
      } else lastFilm = undefined;
      const fight = p.combatRuntime?.active;
      if (fight?.view?.id?.startsWith("s1.jd00.nozomi-park-rescue") && fight.view.ready) {
        const view = fight.view;
        if (fight !== lastFight) {
          lastFight = fight;
          visits.push({type:"fight", id:view.id, actors:view.actors.map(a=>a.tag), initialHealth:view.actors.map(a=>a.health), frames:0});
        }
        const record = visits.at(-1);
        record.health = view.actors.map(a=>a.health);
        if (view.id.endsWith("-ally") && !record.allyVisibleVertices) {
          const root=fight.records.get("HRSK")?.root;
          record.allyVisibleVertices=(root?.getChildMeshes(false) || [])
            .filter(m=>m.isEnabled() && m.isVisible && m.visibility>0 && scene.isActiveMesh(m) && scene.activeCamera.isInFrustum(m))
            .reduce((n,m)=>n+m.getTotalVertices(),0);
        }
        record.frames++;
        if(record.frames%300===1) (record.samples ||= []).push(view.actors.map(a=>({tag:a.tag,x:a.x,z:a.z,hp:a.health})));
      } else lastFight = undefined;
    });
  });
}

async function walkFrom(page, position, actorYaw, ready) {
  await page.evaluate(({position,actorYaw}) => {
    const l = window.storyProbe.lifecycle, c = l.getController();
    l.resetPlayer(l.vectorFromArray(position), actorYaw, {persist:false});
    c.setFirstPerson(true);c.cameraYaw=actorYaw-Math.PI;c.cameraPitch=0;c.updateCamera(1);
  },{position,actorYaw});
  await page.waitForTimeout(350);
  const primary = await page.evaluate(() => {
    const p=window.storyProbe, primary=p.regions.hasPrimaryControl();
    if(window.parkCapture)(window.parkCapture.approaches ||= []).push({primary,
      position:p.regions.getCharacter().worldId, before:p.lastRegionFrame?.playerPosition, yaw:p.lastRegionFrame?.playerYaw});
    return primary;
  });
  expect(primary).toBe(true);
  await page.locator("#renderCanvas").focus();
  await page.keyboard.down("KeyW");
  try {await ready();} finally {await page.keyboard.up("KeyW");}
}

async function earnStreetPrerequisite(page, testInfo, character) {
  const before = await nativeBank(page,character.id);
  expect(bit(before,852)).toBe(false);
  const events=[], id="s1.d000.enoki-street", done="story.s1.enoki-street.completed";
  const saved=()=>page.request.get("/api/characters/"+character.id+"/state").then(r=>r.json());
  const initial=await saved();
  await page.evaluate(()=>{
    const p=window.storyProbe, heard=new Set();
    window.parkStreetAudio=heard;
    const shots=window.parkStreetShots={};
    p.lifecycle.scene.onAfterRenderObservable.add(()=>{
      const owner=p.authoredScene?.active, id=owner?.scene.id;
      if(id?.includes(".enoki-street-") && !shots[id]?.every(a=>a?.vertices>0)) {
        const scene=p.lifecycle.scene,c=p.lifecycle.getController();
        const cast=owner.scene.actors.map(({tag})=>{
          const root=owner.actors.activeActor(tag)?.root;
          if(!root)return null;
          const location=root.getAbsolutePosition(), meshes=root.getChildMeshes(false).filter(m=>
            m.isEnabled()&&m.isVisible&&m.visibility>0&&m.getTotalVertices()>0&&scene.isActiveMesh(m)&&scene.activeCamera.isInFrustum(m));
          return {tag,position:location.asArray(),floor:c.sampleTerrain(location.x,location.z,location.y)?.height,vertices:meshes.reduce((sum,m)=>sum+m.getTotalVertices(),0)};
        });
        const hits=arr=>arr.filter(a=>a?.vertices>0).length;
        if(!shots[id] || hits(cast)>hits(shots[id]))shots[id]=cast;
      }
      const audio=p.dialogue?.audio, match=audio?.src?.match(/(E1064[A-C]\d{3})/i);
      if(match && !audio.paused && audio.currentTime>0)heard.add(match[1].toUpperCase());
    });
  });
  const check = async () => expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const active = () => page.waitForFunction(()=>window.storyProbe.regions.controller.active?.scriptIdentity.scriptSlug==="story-s1-enoki-street"||window.storyProbe.sceneErrors.length,null,{timeout:30_000});
  const enter = () => walkFrom(page,[65,0,40.8],0,active);
  const pressCue = async (index, button, key, recovery = false) => {
    await page.waitForFunction(({id,button,index,recovery})=>{
      const p=window.storyProbe, controller=p.regions.controller,prompt=controller.active?.challengePrompt,qte=controller.dialogue.qte?.active;
      return p.sceneErrors.length || (prompt?.id===id && prompt.ready && qte?.index===index
        && !qte.outcome && qte.recovering===recovery && qte.prompt.buttons[0]===button);
    },{id,button,index,recovery},{timeout:90_000});
    await check();
    events.push({button,index,recovery,key});
    await page.keyboard.press(key);
  };
  await enter();
  await page.waitForFunction(()=>window.parkStreetShots["s1.d000.enoki-street-intro"],null,{timeout:15_000});
  await page.screenshot({path:testInfo.outputPath("enoki-street-first-approach.png")});
  await pressCue(0,"Left","ArrowRight");
  await pressCue(0,"Left","ArrowRight",true);
  const leave=page.getByRole("button",{name:/leave/i});
  await leave.waitFor({timeout:90_000});
  await leave.click();
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  expect(await nativeBank(page,character.id)).toEqual(before);
  await enter();
  await pressCue(0,"Left","ArrowRight");
  await pressCue(0,"Left","ArrowLeft",true);
  await pressCue(1,"A","ArrowRight");
  await pressCue(1,"A","Enter",true);
  await pressCue(2,"B","ArrowRight");
  await pressCue(2,"A","Enter",true);
  await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:90_000}).toBe(true);
  const after=await saved(), bank=await nativeBank(page,character.id);
  expect(bit(bank,852)).toBe(true);expect(bit(bank,801)).toBe(false);
  expect(after.character.yen).toBe(initial.character.yen);expect(after.inventory).toEqual(initial.inventory);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await check();
  const shots=await page.evaluate(()=>window.parkStreetShots);
  const heard=await page.evaluate(()=>Array.from(window.parkStreetAudio));
  await testInfo.attach("park-rescue-earned-street",{body:JSON.stringify({shots,heard,inputs:events,completed:after.character.storyFlags[done],native852:bit(bank,852),native801:bit(bank,801)}),contentType:"application/json"});
  for(const stage of ["intro","miss","win"]){
    const cast=shots["s1.d000.enoki-street-"+stage] || [];
    expect(cast.filter(a=>a?.vertices>0).map(a=>a.tag)).toEqual(["AKIR","ENKI","NGSM"]);
    for(const actor of cast)expect(Math.abs(actor.position[1]-actor.floor)).toBeLessThan(.01);
  }
  expect(heard.length).toBe(16);
}

export async function verifyParkRescue(page, testInfo, character, enterStoryWorld) {
  if (process.env.NEW_YOKOSUKA_PARK_RESCUE_MODE === "park-street") {
    await earnStreetPrerequisite(page,testInfo,character);
    return;
  }
  const alternate = process.env.NEW_YOKOSUKA_PARK_RESCUE_ROUTE === "alternate";
  const wantLoss = process.env.NEW_YOKOSUKA_PARK_RESCUE_LOSS === "true";
  const saved = () => page.request.get("/api/characters/"+character.id+"/state").then(r=>r.json());
  const state = await saved(), initialBank = await nativeBank(page,character.id);
  const mode=process.env.NEW_YOKOSUKA_PARK_RESCUE_MODE;
  const blocked=["park-blocked","park-rain","park-night","park-early-step"].includes(mode);
  expect(bit(initialBank,852)).toBe(mode!=="park-blocked");expect(bit(initialBank,801)).toBe(false);
  expect(state.character.storyFlags[rescueDone]).not.toBe(true);
  const checkErrors = async () => expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle = async () => {
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");
    expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    await checkErrors();
  };
  const unchanged = async () => {
    const next = await saved();
    expect(next.character.yen).toBe(state.character.yen);expect(next.inventory).toEqual(state.inventory);
    expect(next.character.currentHp).toBe(state.character.currentHp);
    expect(next.character.storyFlags[rescueDone]).not.toBe(true);
    expect(await nativeBank(page,character.id)).toEqual(initialBank);
  };
  const film = async (slot,count=1) => {
    await page.waitForFunction(({id,count})=>{
      const p=window.storyProbe, capture=window.parkCapture;
      return p.sceneErrors.length || (p.director?.activeCutscene?.packageRuntime?.activityRuntime.active?.record.activityId===id && capture.visits.filter(v=>v.id===id).length>=count);
    },{id:slotId(slot),count},{timeout:150_000});
    await checkErrors();
    console.info("Park rescue film", slotId(slot), "visit", count);
  };
  let expectedFight = fightId;
  const fight = async count => {
    await page.waitForFunction(count=>window.storyProbe.sceneErrors.length || (window.storyProbe.combatRuntime?.active?.view?.id?.startsWith("s1.jd00.nozomi-park-rescue") && window.parkCapture.visits.filter(v=>v.type==="fight").length>=count),count,{timeout:150_000});
    expect(await page.evaluate(()=>window.storyProbe.combatRuntime.active.view.id)).toBe(expectedFight);
    await checkErrors();
    const cast=await page.evaluate(()=> window.storyProbe.combatRuntime.active.view.actors.map(a=>a.tag));
    expect(cast.sort()).toEqual(expectedFight===fightId?["AKIR","ENKI","NGSM"]:["AKIR","ENKI","HRSK","NGSM"]);
    console.info("Park rescue playable fight",count,cast.join(", "));
  };
  const cancel = async (physical=false) => {
    if (physical) {
      await page.locator("#renderCanvas").focus();await page.keyboard.press("KeyX");
    } else await page.evaluate(()=>window.storyProbe.regions.controller.cancel("park-encounter-test"));
    await idle();await unchanged();
  };
  if (await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)!=="sakuragaoka") {
    await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("sakuragaoka"));
    await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="sakuragaoka"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  }
  await observePark(page);
  const entry=alternate ? {position:[-11.2,0,9.2], yaw:0, lead:4} : {position:[-16.7,0,4.4],yaw:-Math.PI/2,lead:1};
  const approach=async count=>walkFrom(page,entry.position,entry.yaw,()=>film(entry.lead,count));
  let interrupted, beforeReload;
  const capture = () => page.evaluate(()=>({visits:window.parkCapture?.visits, approaches:window.parkCapture?.approaches, outcomes:window.parkCapture?.outcomes, starts:window.storyProbe.starts,
    errors:window.storyProbe.sceneErrors, status:window.storyProbe.regions.controller.status,
    position:window.storyProbe.lifecycle.getController().collider.position.asArray(),
    routeRejections:window.storyProbe.scriptRejections?.map(r=>r.message.code)}));
  const skip=async()=>{await page.locator("#renderCanvas").focus();await page.keyboard.press("KeyX");};
  async function win() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const prior = await page.evaluate(lead => {
        const capture = window.parkCapture;
        return {
          introductions: capture.visits.filter(visit => visit.id === lead).length,
          fights: capture.visits.filter(visit => visit.type === "fight").length,
          confrontations: capture.visits.filter(visit => visit.id === "EVSN/SEQDATA2.AUTH").length,
          outcomes: capture.outcomes?.length || 0,
        };
      }, slotId(entry.lead));

      let nextHealthSample=0;
      await fightWithKeyboard(page,async()=>{
        if(expectedFight!==fightId && Date.now()>=nextHealthSample){
          nextHealthSample=Date.now()+30_000;
          const health=await page.evaluate(()=>window.storyProbe.combatRuntime?.active?.view?.actors.map(a=>[a.tag,a.health]));
          console.info("Park allied combat health",JSON.stringify(health));
        }
        return page.evaluate(()=>{
          const fight=window.storyProbe.combatRuntime?.active;
          return !fight || Boolean(fight.outcome);
        });
      });
      await page.waitForFunction(
        count => (window.parkCapture.outcomes?.length || 0) > count,
        prior.outcomes, {timeout: 15_000},
      );
      const result = await page.evaluate(() => window.parkCapture.outcomes.at(-1));
      if (result.outcome === "success") {
        const opponents = result.health.filter(actor => ["ENKI","NGSM"].includes(actor.tag));
        expect(opponents.every(actor => actor.hp === 0)).toBe(true);
        return;
      }

      if (attempt === 2) break;
      if (result.outcome === "failure") {
        // Clock expiry ends the attempt. Walk back into the same entrance to retry.
        await idle();
        await unchanged();
        await approach(prior.introductions + 1);
        await skip();
      } else {
        expect(result.outcome).toBe("defeated");
      }
      await film(2, prior.confrontations + 1);
      await skip();
      await fight(prior.fights + 1);
    }
    throw Error("Three playable attempts ended before both opponents were defeated");
  }
  try {
    if (mode==="park-ally" || mode==="park-ally-low" || mode==="park-ally-earned") {
      const eligible=mode==="park-ally";
      const inputs=[];
      await page.evaluate(()=>{
        const client=window.storyProbe.regions.controller.client;
        const advance=client.advanceScriptEvent.bind(client);
        window.parkSent=[];
        client.advanceScriptEvent=(run,action,options)=>{
          if(options?.parkInputs)window.parkSent.push(options.parkInputs);
          return advance(run,action,options);
        };
      });
      const enterCode=async(correct,count)=>{
        await approach(count);
        await page.locator("#renderCanvas").focus();
        const keys=["KeyY","KeyY","ShiftLeft","KeyJ","Enter",correct?"Enter":"KeyJ","Enter"];
        await page.waitForFunction(()=>window.storyProbe.director.activeCutscene?.packageRuntime.activityRuntime.active?.currentFrame>=12);
        // Wait for the real film sampler to observe each physical transition.
        // Normal rendering may advance its activity frame earlier in the same tick.
        await page.evaluate(()=>{
          const active=window.storyProbe.director.activeCutscene;
          const original=active.onActivityFrame;
          const currentFrame=active.packageRuntime.activityRuntime.active.currentFrame;
          const witness=window.parkKeys={version:0,sampled:-1,lastFrame:currentFrame};
          const event=e=>{witness.version++;witness.key=e.code;witness.down=e.type==="keydown";};
          window.addEventListener("keydown",event,true);
          window.addEventListener("keyup",event,true);
          active.onActivityFrame=frame=>{
            original(frame);
            if(frame!==witness.lastFrame){witness.lastFrame=frame;witness.sampled=witness.version;}
          };
          window.clearParkKeys=()=>{
            active.onActivityFrame=original;
            window.removeEventListener("keydown",event,true);
            window.removeEventListener("keyup",event,true);
          };
        });
        const sampled=(key,down)=>page.waitForFunction(({key,down})=>{
          const w=window.parkKeys;return w.key===key && w.down===down && w.sampled===w.version;
        },{key,down},{timeout:3000});
        try{
          for(const key of keys){
            await page.keyboard.down(key);
            try{await sampled(key,true);}finally{await page.keyboard.up(key);}
            await sampled(key,false);
          }
        }finally{await page.evaluate(()=>window.clearParkKeys());}
        inputs.push(keys);await film(2,count);
        const sent=await page.evaluate(()=>window.parkSent.at(-1));
        console.info("Physical park input transitions",JSON.stringify(sent));
        await skip();await fight(count);
      };
      if(mode==="park-ally-earned"){
        expectedFight=fightId+"-ally";
        await enterCode(true,1);
        await page.waitForFunction(() => window.parkCapture.visits.some(visit => visit.allyVisibleVertices > 0));
        const observedFight = await page.evaluate(() => window.parkCapture.visits.find(visit => visit.allyVisibleVertices > 0));
        expect(observedFight.initialHealth).toEqual([200,150,600,400]);
        await cancel(true);
        const trace=await page.evaluate(()=>window.parkSent.at(-1));
        expect(trace.map(sample => sample.mask)).toEqual([2,0,2,0,512,0,4,0,1024,0,1024,0,1024,0]);
        await testInfo.attach("park-ally-earned",{contentType:"application/json",body:JSON.stringify({trace,observed:await capture()})});
        return;
      }
      await enterCode(!eligible,1);
      await cancel(true);
      if (eligible){
        expectedFight=fightId+"-ally";
        await enterCode(true,2);
        await page.screenshot({path:testInfo.outputPath("park-nozomi-ally-fight.png")});
        await win();
        await film(3);await unchanged();
        await expect.poll(async()=>bit(await nativeBank(page,character.id),801),{timeout:120_000}).toBe(true);
        await idle();
        const end=await saved();
        expect(end.character.storyFlags[rescueDone]).toBe(true);
        expect(end.character.currentHp).toBe(state.character.currentHp);
      }
      const observed=await capture();const transitions=await page.evaluate(()=>window.parkSent);
      expect(transitions).toHaveLength(inputs.length);
      if (eligible){
        const special=observed.visits.find(v=>v.id===fightId+"-ally");
        expect(special.allyVisibleVertices).toBeGreaterThan(0);
        expect(special.initialHealth).toEqual([200,150,600,400]);
      }
      const expected=[2,0,2,0,512,0,4,0,1024,0,1024,0,1024,0];
      expect(transitions.at(-1).map(row=>row.mask)).toEqual(expected);
      await testInfo.attach("park-ally-story",{contentType:"application/json",body:JSON.stringify({points:eligible?500:499,inputs,transitions,observed,completed:bit(await nativeBank(page,character.id),801)})});
      return;
    }
    if (blocked) {
      for (const route of [
        {start:[-16.7,0,4.4],yaw:-Math.PI/2,x:[-18.9,-17.3],z:[1.6,7.2]},
        {start:[-11.2,0,9.2],yaw:0,x:[-13.3,-9.1],z:[9.8,12.3]},
      ]) {
        await walkFrom(page,route.start,route.yaw,()=>page.waitForFunction(({x,z})=>{
          const pos=window.storyProbe.lastRegionFrame?.playerPosition;
          return pos && pos[0]>=x[0]&&pos[0]<=x[1]&&pos[2]>=z[0]&&pos[2]<=z[1];
        },route,{timeout:10_000}));
        await page.waitForTimeout(500);
        await idle();await unchanged();expect(await page.evaluate(()=>window.parkCapture.visits)).toEqual([]);
      }
      return;
    }
    await approach(1);
    await page.waitForFunction(()=>window.parkCapture.visits[0]?.visible?.length,null,{timeout:10_000});
    await page.screenshot({path:testInfo.outputPath("park-rescue-approach.png")});
    await cancel();
    if (mode==="park-visual")return;
    await approach(2);await skip();await film(2);await skip();await fight(1);await cancel(true);
    await approach(3);await film(2,2);await fight(2);
    if (wantLoss) {
      await film(2,3);await unchanged();await skip();await fight(3);
      const defeated=await page.evaluate(()=>window.parkCapture.outcomes?.at(-1));
      expect(defeated?.outcome).toBe("defeated");
      expect(defeated.health.find(a=>a.tag==="AKIR").hp).toBeLessThanOrEqual(0);
    }
    await page.screenshot({path:testInfo.outputPath("park-rescue-playable-fight.png")});
    await win();
    await film(3);await unchanged();
    if (wantLoss) {
      // The normal X control skips a film. A page reload genuinely interrupts
      // its Story transaction, which must leave 801 clear after a won fight.
      interrupted=await capture();
      await page.reload();await enterStoryWorld(page,character.name);
      await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
      await unchanged();
      await page.evaluate(()=>window.storyProbe.regions.controller.cancel("park-reload-position"));
      await idle();await observePark(page);
      await approach(1);await skip();await film(2);await skip();await fight(1);
      await win();
      await film(3);await unchanged();
    }
    await expect.poll(async()=>bit(await nativeBank(page,character.id),801),{timeout:120_000}).toBe(true);
    await idle();
    const after=await saved(),endBank=await nativeBank(page,character.id);
    expect(after.character.storyFlags[rescueDone]).toBe(true);expect(bit(endBank,852)).toBe(true);
    const onlyRescue=Buffer.from(initialBank);onlyRescue[801>>3] |= 1<<(801%8);
    expect(endBank).toEqual(onlyRescue);
    expect(after.character.yen).toBe(state.character.yen);expect(after.inventory).toEqual(state.inventory);
    expect(after.character.currentHp).toBe(state.character.currentHp);
    beforeReload=await capture();
    const natural=[...(interrupted?.visits || []),...beforeReload.visits].filter(v=>v.type==="film");
    expect(natural.some(v=>v.id===slotId(entry.lead)&&v.last>=v.duration-10)).toBe(true);
    expect(natural.some(v=>v.id===slotId(2)&&v.last>=v.duration-10)).toBe(true);
    expect(natural.some(v=>v.id===slotId(3)&&v.last>=v.duration-10)).toBe(true);
    await page.reload();await enterStoryWorld(page,character.name);
    await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
    expect(bit(await nativeBank(page,character.id),801)).toBe(true);await idle();
    await observePark(page);
    await walkFrom(page,entry.position,entry.yaw,()=>page.waitForTimeout(1300));
    await idle();expect(await page.evaluate(()=>window.parkCapture.visits)).toEqual([]);
  } finally {
    const current=await capture();
    await testInfo.attach("park-rescue-story",{body:JSON.stringify({mode, route:entry.lead,requestedLoss:wantLoss,
      interrupted, run:beforeReload || current,reload:beforeReload ? current : null}),contentType:"application/json"});
  }
}
