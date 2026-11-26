import {expect} from "@playwright/test";

const prefix="s1.mfsy.old-district-";

// Hold real, unmodified server yields at the client receive boundary to simulate
// a slow response without changing the authoritative sequence or the QTE clock.
export async function observeFlashlightContinuity(page) {
  const lateRight=process.env.NEW_YOKOSUKA_FLASHLIGHT_CANCEL_E2E==="true";
  await page.exposeFunction("pressOldDistrictKey",key=>page.keyboard.press(key));
  await page.evaluate(({prefix,delayMs,lateRight}) => {
    const p=window.storyProbe, c=p.regions.controller, scene=p.lifecycle.scene;
    const previousYield=c.processYield;
    const evidence=window.flashlightContinuity={frames:0,gaps:[],phases:[],delays:[],inputs:[],attempts:[]};
    const roots=new Set();
    let previousStage="",expectedCamera=null,armed=false,delay=null;
    const point=v=>v.asArray().map(n=>Number(n.toFixed(5)));
    const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
    const getLight=()=>{
      const owner=p.authoredScene.active;
      for(const record of [owner?.sceneObjects?.objects?.get("KAIS"),owner?.objects?.objects?.get("KAIS")]){
        if(record?.root)roots.add(record.root);
      }
      const visible=[];
      for(const root of roots){
        if(root.isDisposed()){roots.delete(root);continue;}
        const drawn=root.isEnabled() && root.getChildMeshes(false)
          .some(m=>m.isEnabled() && m.isVisible && m.visibility>0 && m.getTotalVertices()>0);
        if(drawn)visible.push(root);
      }
      return visible;
    };
    const short=id=>id?.startsWith(prefix)?id.slice(prefix.length):null;
    const camera=()=>({eye:point(scene.activeCamera.globalPosition),target:point(scene.activeCamera.getTarget())});
    const sample=()=>{
      const owner=p.authoredScene.active,stage=short(owner?.scene.id);
      const visible=getLight();
      if(!armed && stage==="head-bump" && visible.length===1) {
        expectedCamera=camera(); armed=true;
      }
      if(!armed)return;
      if(previousStage==="catch" && stage!=="catch") {armed=false;return;}
      const current=camera();
      const error=[];
      if(visible.length!==1)error.push("drawn flashlights="+visible.length);
      if(distance(expectedCamera.eye,current.eye)>.025 || distance(expectedCamera.target,current.target)>.025)error.push("camera changed");
      if(error.length && evidence.gaps.length<12)evidence.gaps.push({frame:evidence.frames,from:previousStage,stage,camera:current,error});
      evidence.frames++;
      if(stage){
        previousStage=stage;
        if(evidence.phases.at(-1)?.stage!==stage)evidence.phases.push({stage,frame:evidence.frames});
      }
      if(delay){
        delay.frames++;
        if(error.length)delay.badFrames++;
        if(visible.length===1){
          const at=point(visible[0].getAbsolutePosition());
          delay.first??=at;delay.last=at;
          delay.maxDisplacement=Math.max(delay.maxDisplacement,distance(delay.first,at));
          if(c.dialogue.qte?.active)delay.activeInputFrames++;
        }
      }
    };
    const observer=scene.onAfterRenderObservable.add(sample);
    c.processYield=async function(message) {
      const event=message?.event;
      const name=event?.type==="command" && event.name==="play_sequence" ? short(event.arguments?.[0]?.value) : null;
      const next=name?.endsWith(".start")?name.slice(0,-6):null;
      const ready=event?.type==="challenge" && message.challenge?.ready===true && previousStage==="prompt";
      const branches=["head-bump/prompt","prompt/reach","prompt/miss","reach/catch","miss/prompt"];
      if(armed && (ready || branches.includes(previousStage+"/"+next))) {
        const entry={from:previousStage,to:ready?"challenge-ready":next,frames:0,badFrames:0,activeInputFrames:0,maxDisplacement:0};
        evidence.delays.push(entry);delay=entry;
        const start=performance.now();
        await new Promise(resolve=>setTimeout(resolve,delayMs));
        entry.durationMs=Number((performance.now()-start).toFixed(2));
        delay=null;
      }
      return previousYield.call(this,message);
    };
    const dialogue=c.dialogue, start=dialogue.onChallengeStart, respond=dialogue.onChallengeResponse;
    const timers=[];
    dialogue.onChallengeStart=function(id,clock){
      const result=start.call(this,id,clock);
      if(id!=="s1.mfsy.old-district-flashlight")return result;
      const qte=dialogue.qte, owner=qte.active;
      const attempt={token:dialogue.qteToken,openedAtMs:qte.now(),windowMs:owner.steps[0].windowMs};
      evidence.attempts.push(attempt);
      const input=(key,at)=>timers.push(setTimeout(()=>{
        if(dialogue.qte?.active===owner && !owner.outcome)window.pressOldDistrictKey(key);
      },at));
      const index=evidence.attempts.length;
      if(index===1)input("ArrowLeft",160);
      if(index===(lateRight?3:2)){
        input("ArrowLeft",55);
        input("ArrowRight",lateRight?665:165);
      }
      return result;
    };
    dialogue.onChallengeResponse=function(action,token,outcome){
      const attempt=evidence.attempts.find(item=>item.token===token);
      if(action==="challenge_result" && attempt) {
        attempt.outcome=outcome;
        attempt.resultAtMs=Number((performance.now()-attempt.openedAtMs).toFixed(2));
      }
      return respond.call(this,action,token,outcome);
    };
    function recordKey(event){
      if(!["ArrowLeft","ArrowRight"].includes(event.code) || previousStage!=="prompt")return;
      const qte=c.dialogue.qte, owner=qte?.active;
      if(!owner)return;
      const step=owner.steps[owner.index];
      evidence.inputs.push({attempt:evidence.attempts.findIndex(item=>item.token===c.dialogue.qteToken)+1,button:event.code,windowMs:step.windowMs,elapsedMs:Number((step.windowMs-(owner.deadline-qte.now())).toFixed(2))});
    }
    window.addEventListener("keydown",recordKey,true);
    window.stopFlashlightContinuity=()=>{
      scene.onAfterRenderObservable.remove(observer); c.processYield=previousYield; window.removeEventListener("keydown",recordKey,true);
      dialogue.onChallengeStart=start; dialogue.onChallengeResponse=respond;
      timers.forEach(clearTimeout);
      return evidence;
    };
  },{prefix,delayMs:320,lateRight});
}

export async function verifyFlashlightContinuity(page,testInfo,lateRight){
  const run=await page.evaluate(()=>window.stopFlashlightContinuity());
  await testInfo.attach("old-district-render-latency",{body:JSON.stringify(run),contentType:"application/json"});
  expect(run.frames).toBeGreaterThan(100);
  expect(run.gaps).toEqual([]);
  for(const [from,to] of [["head-bump","prompt"],["prompt","challenge-ready"],["prompt","miss"],["miss","prompt"],["prompt","reach"],["reach","catch"]]) {
    const realYields=run.delays.filter(row=>row.from===from && row.to===to);
    expect(realYields.length,from+" -> "+to).toBeGreaterThan(0);
    for(const row of realYields) {
      expect(row.durationMs).toBeGreaterThanOrEqual(300);
      expect(row.frames).toBeGreaterThan(2);
      expect(row.badFrames).toBe(0);
      if(to==="challenge-ready"){
        expect(row.activeInputFrames).toBe(0);
        expect(row.maxDisplacement).toBeLessThan(.001);
      }
    }
  }
  expect(run.attempts.map(attempt=>attempt.outcome)).toEqual(lateRight?["failure","failure","success"]:["failure","success"]);
  for(const attempt of run.attempts.filter(attempt=>attempt.outcome==="failure")){
    expect(attempt.windowMs).toBe(1000);
    expect(attempt.resultAtMs).toBeGreaterThanOrEqual(990);
  }
  expect(run.inputs.filter(row=>row.attempt===1).map(row=>row.button)).toEqual(["ArrowLeft"]);
  if(lateRight)expect(run.inputs.filter(row=>row.attempt===2)).toEqual([]);
  const corrected=run.inputs.filter(row=>row.attempt===run.attempts.length);
  expect(corrected.map(row=>row.button)).toEqual(["ArrowLeft","ArrowRight"]);
  const right=corrected[1];
  expect(right.windowMs).toBe(1000);
  if(lateRight)expect(right.elapsedMs).toBeGreaterThan(590);
  else expect(right.elapsedMs).toBeLessThan(400);
  expect(right.elapsedMs).toBeLessThan(1000);
}
