import {expect} from "@playwright/test";
import fs from "node:fs";

export async function verifyFukuReturn(page, testInfo, character, enterStoryWorld, slug) {
  const letter = slug === "fuku-translated-letter";
  if (!letter && slug !== "fuku-after-jimmy") throw new Error("Unknown Fuku-san home story");
  const choice = letter ? "Show Fuku-san the translated letter" : "Talk to Fuku-san about the trip";
  const flag = "story.s1."+slug+".completed", scene = "story-s1-"+slug, object = letter ? "MEMO" : "DOR0";
  const bank = JSON.parse(fs.readFileSync("public/audio/world/"+slug+"/manifest.json"));
  const ids = bank.voices.map(voice=>voice.voiceId);
  const saved = async () => {
    const [state, dialogue] = await Promise.all(["state","dialogue"].map(async key=>{
      const response=await page.request.get(`/api/characters/${character.id}/${key}`);
      expect(response.ok()).toBe(true);
      return response.json();
    }));
    const native=Buffer.from(dialogue.state.banks["2"] || "", "base64");
    return {...state,jimmyNative:((native[780 >> 3] || 0) >> (780 % 8)) & 1,letterNative:((native[751 >> 3] || 0) >> (751 % 8)) & 1};
  };
  const place = async point => {
    await page.evaluate(point=>{
      const lifecycle=window.storyProbe.lifecycle;
      lifecycle.resetPlayer(lifecycle.vectorFromArray(point),0,{persist:false});
    },point);
    await page.waitForTimeout(500);
  };
  const idle = () => page.waitForFunction(()=>{
    const p=window.storyProbe;
    return p.regions.controller.status==="idle" && !p.director.activeCutscene && !p.lifecycle.getController().movementLocked;
  },null,{timeout:60_000});
  const button=page.getByRole("button",{name:choice,exact:true});
  const approach = async () => {
    await place([-12.8,0,2]);
    await place([-16.5,0,1.6]);
    await expect(button).toBeVisible({timeout:45_000});
  };
  const observe = () => page.evaluate(({scene,object})=>{
    window.stopFukuReview?.();
    window.fukuPropRecord = null;
    const observed = window.fukuReview = {voices:[],actors:[],prop:false,door:[]};
    const timer=setInterval(()=>{
      const p=window.storyProbe,cut=p.director.activeCutscene;
      if(cut?.cutscene.id!==scene)return;
      const runtime=cut.packageRuntime;
      for(const record of runtime.audio.active?.elements || []){
        if(record.kind!=="voice"||record.audio.paused||record.audio.currentTime<=0)continue;
        const id=record.command.audio.voiceId;
        if(id&&!observed.voices.includes(id))observed.voices.push(id);
      }
      for(const tag of ["AKIR","FUKU"]){
        const root=runtime.actors.activeActor(tag)?.root;
        if(!observed.actors.includes(tag)&&root?.getChildMeshes().some(m=>m.isEnabled()&&m.isVisible&&m.getTotalVertices()>0&&p.lifecycle.scene.isActiveMesh(m)))observed.actors.push(tag);
      }
      const record=runtime.sceneObjects?.objects.get(object);
      if(record)window.fukuPropRecord=record;
      const root=record?.root;
      if(object==="DOR0" && root){
        const frame=runtime.activityRuntime.active?.currentFrame;
        const target=[989,1028,1057][observed.door.length];
        if(frame>=target && frame<target+10){
          const matrix=root.computeWorldMatrix(true).m;
          observed.door.push({frame,orientation:[matrix[0],matrix[2],matrix[8],matrix[10]],
            position:[matrix[12],matrix[13],matrix[14]]});
        }
      }
      if(root?.isEnabled()&&root.getChildMeshes().some(mesh=>mesh.isEnabled()&&mesh.isVisible&&mesh.getTotalVertices()>0))observed.prop=true;
    },35);
    window.stopFukuReview=()=>{clearInterval(timer);return observed;};
  },{scene,object});
  const propRestored = () => page.evaluate(() => {
    const record=window.fukuPropRecord;
    if(!record)return false;
    const root=record.root, prior=record.explorationSnapshot;
    if(!prior)return root.isDisposed() || !root.isEnabled();
    if(record.actorCode==="DOR0" && (root._filename!=="S1_JOMO_DR01_015.MT5"
      || root.metadata?.runtimeObject?.objectTag!=="dor7"))return false;
    if(root.isEnabled(false)!==prior.enabled)return false;
    for(const key of ["position","rotation","scaling"]){
      if(!root[key].asArray().every((value,i)=>Math.abs(value-prior[key][i])<1e-6))return false;
    }
    return prior.nodes.every(entry=>entry.node.isPickable===entry.isPickable
      && entry.node.checkCollisions===entry.checkCollisions);
  });
  const waitVoices = count => page.waitForFunction(count=>window.fukuReview?.voices.length>=count
    || window.storyProbe.sceneErrors.length,count,{timeout:100_000});
  const before=await saved();
  expect(before.character.storyFlags[flag]).not.toBe(true);
  expect(letter?before.letterNative:before.jimmyNative).toBe(0);
  await approach();
  await observe();
  await button.click();
  await waitVoices(2);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("fuku-home-review-cancel"));
  await idle();
  expect(await propRestored()).toBe(true);
  const pending=await saved();
  expect(pending.character.storyFlags).toEqual(before.character.storyFlags);
  expect(pending.letterNative).toBe(before.letterNative);
  expect(pending.jimmyNative).toBe(before.jimmyNative);
  await approach();
  await observe();
  await button.click();
  await waitVoices(3);
  await page.screenshot({path:testInfo.outputPath(slug+"-original.png")});
  expect((await saved()).character.storyFlags[flag]).not.toBe(true);
  await expect.poll(async()=>(await saved()).character.storyFlags[flag],{timeout:150_000}).toBe(true);
  await idle();
  expect(await propRestored()).toBe(true);
  const result=await page.evaluate(()=>window.stopFukuReview());
  expect(result.voices.slice().sort()).toEqual(ids.slice().sort());
  expect(result.actors.slice().sort()).toEqual(["AKIR","FUKU"]);
  expect(result.prop).toBe(true);
  if(!letter){
    expect(result.door).toHaveLength(3);
    const [closed,opened,returned]=result.door;
    const delta=(first,second)=>Math.max(...first.orientation.map((v,i)=>Math.abs(v-second.orientation[i])));
    expect(delta(closed,opened)).toBeGreaterThan(.05);
    expect(delta(closed,returned)).toBeLessThan(.03);
  }
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const after=await saved();
  expect(after.letterNative).toBe(letter?1:before.letterNative);
  expect(after.jimmyNative).toBe(letter?before.jimmyNative:1);
  expect(after.inventory).toEqual(before.inventory);
  expect(after.character.yen).toBe(before.character.yen);
  expect(after.character.worldId).toBe("interior");
  expect(after.character.storyTimeMs-before.character.storyTimeMs).toBeLessThan(3_600_000);
  await page.reload();await enterStoryWorld(page,character.name);
  await page.waitForFunction(()=>window.storyProbe?.ready && window.storyProbe.regions?.getCharacter()?.id,
    null,{timeout:120_000});
  expect((await saved()).character.storyFlags[flag]).toBe(true);
  await place([-12.8,0,2]);await place([-16.5,0,1.6]);
  await idle();
  expect(await button.count()).toBe(0);
  expect(await page.evaluate(()=>window.storyProbe.starts)).not.toContain(scene);
  await testInfo.attach(slug,{body:JSON.stringify(result),contentType:"application/json"});
  console.log("Fuku-san home film",JSON.stringify({slug,...result}));
}
