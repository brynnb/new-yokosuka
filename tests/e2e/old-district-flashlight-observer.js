import {expect} from "@playwright/test";

export async function observeFlashlight(page) {
  await page.evaluate(async () => {
    const p=window.storyProbe, runtime=p.authoredScene.motionRuntime;
    const url=await p.regions.controller.dialogue.voiceManifest.urlFor("E1008A010");
    const {Vector3,Matrix}=await import("/node_modules/@babylonjs/core/Maths/math.vector.js");
    const originalApply=runtime.applyNamed;
    const report=window.flashlightRun={stages:[],voice:null,effects:[]};
    const sounds=p.authoredScene.worldSounds, factory=sounds.audioFactory, clips=new Map();
    sounds.audioFactory=function(source,...args) {
      const clip=factory.call(this,source,...args);
      const match=source.match(/\/e1kaiqte\/(A9040[1-5]00)\.wav$/);
      if(match){
        const owner=p.authoredScene.active;
        const effect={id:match[1],scene:owner.scene.id,frame:Math.round(owner.elapsed*30),
          playedFrames:0,seconds:0,muted:false,volume:null,error:null,ended:false};
        clip.addEventListener("ended",()=>{effect.ended=true;},{once:true});
        clip.addEventListener("error",()=>{effect.error=clip.error?.message||"media error";},{once:true});
        report.effects.push(effect);clips.set(clip,effect);
      }
      return clip;
    };
    function sampleEffects(){
      for(const [clip,effect] of clips){
        const media=clip.slot?.audio;
        if(!media || media.paused || media.currentTime<=0)continue;
        effect.src=new URL(media.currentSrc||media.src,location.href).pathname;
        effect.playedFrames++;
        effect.seconds=Math.max(effect.seconds,Number(media.currentTime.toFixed(5)));
        effect.muted ||= media.muted;
        effect.volume=effect.volume===null?media.volume:Math.min(effect.volume,media.volume);
        if(media.error)effect.error=media.error.message||media.error.code;
      }
    }
    window.flashlightFinalEffectPlaying=()=>Array.from(clips).some(([clip,row])=>
      row.id==="A9040500" && row.seconds>=.075 && !clip.paused && sounds.activeAudio.has(clip));
    function stageFor(owner) {
      let stage=report.stages.at(-1);
      if (stage?.id!==owner.scene.id) {
        stage={id:owner.scene.id,samples:[],motions:[]};
        report.stages.push(stage);
      }
      return stage;
    }
    runtime.applyNamed=function(model,motion,elapsed,...args) {
      const ok=originalApply.call(this,model,motion,elapsed,...args);
      const owner=p.authoredScene.active;
      if(ok && owner?.scene.id.startsWith("s1.mfsy.old-district-") && owner.actors.activeActor("AKIR")?.model===model) {
        const stage=stageFor(owner);
        if(stage.motions.at(-1)?.name!==motion.name)stage.motions.push({
          name:motion.name,clipTime:elapsed,frame:Math.floor(owner.elapsed*30)
        });
      }
      return ok;
    };
    function view(root) {
      if(!root)return null;
      root.computeWorldMatrix(true);
      const round=v=>v.map(value=>Number(value.toFixed(5)));
      const meshes=root.getChildMeshes(false).filter(m=>m.isEnabled()&&m.isVisible&&m.getTotalVertices()>0);
      const sc=root.getScene(), cam=sc.activeCamera, engine=sc.getEngine();
      const bounds=root.getHierarchyBoundingVectors(true), center=bounds.min.add(bounds.max).scale(.5);
      const viewport=cam.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight());
      const screen=Vector3.Project(center,Matrix.Identity(),sc.getTransformMatrix(),viewport);
      return {center:round(center.asArray()),screen:round(screen.asArray()),viewport:[viewport.width,viewport.height],
        position:round(root.getAbsolutePosition().asArray()),rotation:round(root.absoluteRotationQuaternion.asArray()),
        drawable:meshes.length,inFrustum:meshes.some(m=>root.getScene().activeCamera.isInFrustum(m)),
        root:root.uniqueId,vertices:meshes.reduce((n,m)=>n+m.getTotalVertices(),0)};
    }
    let next;
    function sample(){
      sampleEffects();
      const controller=p.regions.controller, presenter=controller.dialogue;
      const audio=presenter.audio;
      if(!report.voice && audio?.src===url && !audio.paused && audio.currentTime>0)report.voice={
        id:"E1008A010",text:document.querySelector("#dialogue-source")?.textContent.trim(),seconds:audio.currentTime
      };
      const owner=p.authoredScene?.active;
      if(owner?.actorsBegun && owner.scene.id.startsWith("s1.mfsy.old-district-")) {
        const stage=stageFor(owner), frame=Math.floor(owner.elapsed*30), last=stage.samples.at(-1);
        if(!last||frame-last.frame>=(stage.id.endsWith("-reach")?1:2)) {
          const prop=owner.sceneObjects?.objects?.get("KAIS")?.root;
          const held=owner.objects?.objects?.get("KAIS")?.root;
          const b=owner.objects?.active?.bindings?.findLast(b=>b.actorTag==="KAIS"&&b.frame<=owner.objects.active.frame);
          const model=owner.actors.activeActor("AKIR")?.model;
          const joint=b && model?.latestControllerFamily?.nodes?.find(n=>n.type===b.controlId);
          const matrix=joint && model.latestControllerMatrices?.[joint.index];
          const wristLocal=matrix && Vector3.TransformCoordinates(Vector3.FromArray(b.translation),Matrix.FromArray(matrix));
          const wrist=wristLocal && Vector3.TransformCoordinates(new Vector3(-wristLocal.x,wristLocal.y,wristLocal.z),model.renderRoot.computeWorldMatrix(true));
          stage.samples.push({frame,world:view(prop),held:view(held),
            wrist:b?{tag:b.parentActorTag,id:b.controlId,sameRoot:prop===held,
              position:wrist?.asArray(),distance:wrist && Vector3.Distance(held.getAbsolutePosition(),wrist)}:null});
        }
      }
      next=requestAnimationFrame(sample);
    }
    sample();
    window.finishFlashlightRun=()=>{
      sampleEffects();
      for(const [clip,row] of clips){
        Object.assign(row,{activeAfterRelease:sounds.activeAudio.has(clip),pausedAfterRelease:clip.paused});
      }
      sounds.audioFactory=factory;
      cancelAnimationFrame(next);runtime.applyNamed=originalApply;
      return report;
    };
  });
}

export async function verifyFlashlightPresentation(page,testInfo) {
  const data=await page.evaluate(()=>window.finishFlashlightRun());
  await testInfo.attach("old-district-flashlight",{body:JSON.stringify(data),contentType:"application/json"});
  expect(data.voice?.id).toBe("E1008A010");expect(data.voice.text.length).toBeGreaterThan(0);
  const stages=suffix=>data.stages.filter(s=>s.id==="s1.mfsy.old-district-"+suffix);
  const names=suffix=>stages(suffix).flatMap(s=>s.motions.map(m=>m.name));
  expect(names("head-bump")).toContain("AKI_ATAMABUTUKERU1_0153");
  expect(names("miss")).toEqual(expect.arrayContaining(["AKI_TENOBASISIPPAI1_0153","AKI_SIPPAINIGERU1_0153"]));
  expect(names("reach")).toContain("AKI_KAITYUUDENTOUTORU1_0153");
  expect(names("catch")).toContain("AKI_SEIKOUNIGE1_0153");
  const all=suffix=>stages(suffix).flatMap(s=>s.samples);
  const world=all("prompt").filter(s=>s.world?.vertices>0);
  expect(new Set(world.map(s=>s.world.position.join(","))).size).toBeGreaterThan(1);
  expect(new Set(world.map(s=>s.world.rotation.join(","))).size).toBeGreaterThan(1);
  expect(all("reach").some(s=>s.world?.vertices>0)).toBe(true);
  const lastFree=all("reach").filter(s=>s.world?.vertices>0).at(-1).world;
  const firstHeld=all("catch").find(s=>s.held?.vertices>0).held;
  expect(lastFree.inFrustum && firstHeld.inFrustum).toBe(true);
  expect(Math.hypot(...lastFree.position.map((v,i)=>v-firstHeld.position[i]))).toBeLessThan(.10);
  expect(firstHeld.root).toBe(lastFree.root);
  const held=all("catch").filter(s=>s.held?.vertices>0);
  expect(held.length).toBeGreaterThan(3);
  for(const s of held) {
    expect(s.wrist).toMatchObject({tag:"AKIR",id:18,sameRoot:true});
    expect(s.wrist.distance).toBeLessThan(.003);
  }
  return data;
}


export function verifyFlashlightEffects(data,afterCancel){
  const misses=afterCancel?["A9040300","A9040300"]:["A9040300"];
  expect(data.effects.map(e=>e.id)).toEqual(["A9040100","A9040200",...misses,"A9040400","A9040500"]);
  for(const effect of data.effects){
    expect(effect.src).toMatch(new RegExp("/e1kaiqte/"+effect.id+"\\.wav$"));
    expect(effect.playedFrames,effect.id).toBeGreaterThan(1);
    expect(effect.seconds,effect.id).toBeGreaterThan(.02);
    expect(effect).toMatchObject({muted:false,error:null,activeAfterRelease:false,pausedAfterRelease:true});
    expect(effect.volume,effect.id).toBeGreaterThan(0);
  }
  if(afterCancel)expect(data.effects.at(-1).ended).toBe(false);
}
