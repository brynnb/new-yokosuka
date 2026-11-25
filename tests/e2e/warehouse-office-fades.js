import {expect} from "@playwright/test";

const office="s1.ms8s.warehouse-eight-office";

// Record the foreground actually shown by the viewport, including the handoff
// while the office owner is moving Ryo to the outgoing window shot.
export async function observeWarehouseFades(page){
  await page.evaluate(async office=>{
    window.stopWarehouseFades?.();
    const p=window.storyProbe,element=document.querySelector("#story-screen-fade");
    if(!element)throw Error("Warehouse screen fade element is missing");
    const presenter=p.regions.controller.dialogue;
    const lastVoice=await presenter.voiceManifest.urlFor("E1009BA017");
    const data=window.warehouseFades={segments:[],events:[],covered:true,black:true};
    let current=null,raf=0,previousAlpha=0,lastFade=null;
    const now=()=>Math.round(performance.timeOrigin+performance.now());
    function sample(){
      const authored=p.authoredScene,owner=authored.active,fade=authored.screenFade.active;
      const style=getComputedStyle(element),alpha=element.hidden||style.display==="none"?0:Number(style.opacity);
      const stage=owner?.scene.id,world=p.lifecycle.worldRuntime.activeWorld.id;
      if(fade && stage?.startsWith(office)){
        if(fade!==lastFade){
          current={from:fade.fromAlpha,to:fade.toAlpha,duration:fade.durationFrames,stage,
            started:now(),steps:[],lastAudio:window.originalDialogue.lines.at(-1)?.id};
          data.segments.push(current);lastFade=fade;
        }
        if(current.steps.at(-1)?.frame!==fade.frame || current.steps.at(-1)?.alpha!==alpha){
          current.steps.push({frame:fade.frame,alpha,at:now()});
        }
        if(alpha>.01){
          const canvas=document.querySelector("#renderCanvas").getBoundingClientRect();
          const rect=element.getBoundingClientRect();
          data.covered&&=rect.left<=canvas.left+1 && rect.top<=canvas.top+1
            && rect.right>=canvas.right-1 && rect.bottom>=canvas.bottom-1;
          data.black&&=/rgba?\(0, 0, 0(?:, 1)?\)/.test(style.backgroundColor);
        }
      }
      if(!fade && lastFade){
        current.ended=now();
        current.releasedAlpha=alpha;
        lastFade=null;
      }
      if(current && previousAlpha!==alpha && (alpha===0||alpha===1))
        data.events.push({type:"endpoint",alpha,at:now(),stage:stage??null});
      if(stage===office+".departure" && !data.newPose){
        const pos=owner.actors.activeActor("AKIR")?.root?.getAbsolutePosition();
        if(pos && pos.z>146)data.newPose={alpha,at:now(),position:pos.asArray()};
      }
      if(!data.finalVoice && presenter.active && presenter.audio?.src===lastVoice && !presenter.audio.paused && presenter.audio.currentTime>0)
        data.finalVoice={alpha,at:now(),stage};
      if(current?.duration===60 && previousAlpha>=.9 && alpha<.1 && !data.transfer){
        const loading=document.querySelector("#loading");
        data.transfer={at:now(),world,loadingCovered:loading?.classList.contains("covered")??false,
          switching:p.lifecycle.worldRuntime.switching,ready:p.lifecycle.worldRuntime.ready};
      }
      previousAlpha=alpha;
    }
    const tick=()=>{sample();raf=requestAnimationFrame(tick);};
    const observer=new MutationObserver(sample);
    observer.observe(element,{attributes:true});
    observer.observe(document.querySelector("#loading"),{attributes:true});
    sample();raf=requestAnimationFrame(tick);
    window.stopWarehouseFades=()=>{
      cancelAnimationFrame(raf);observer.disconnect();sample();
      const fade=p.authoredScene.screenFade,style=getComputedStyle(element);
      data.final={hidden:element.hidden||style.display==="none",opacity:Number(style.opacity),owned:Boolean(fade.active),
        world:p.lifecycle.worldRuntime.activeWorld.id,locked:p.lifecycle.getController().movementLocked};
      return data;
    };
  },office);
}

async function viewportPixels(page,packets){
  const result=[];
  for(let i=0;i<packets.length;i+=16){
    const group=await page.evaluate(async frames=>Promise.all(frames.map(async packet=>{
      const bytes=Uint8Array.from(atob(packet.data),c=>c.charCodeAt(0));
      const bitmap=await createImageBitmap(new Blob([bytes],{type:"image/png"}));
      const surface=new OffscreenCanvas(24,16),ctx=surface.getContext("2d",{willReadFrequently:true});
      // Read the 3D viewport above the subtitle band and away from the menus.
      ctx.drawImage(bitmap,bitmap.width*.32,bitmap.height*.25,bitmap.width*.39,bitmap.height*.32,0,0,24,16);
      bitmap.close();
      const pixels=ctx.getImageData(0,0,24,16).data,values=[];
      for(let j=0;j<pixels.length;j+=4)values.push((pixels[j]+pixels[j+1]+pixels[j+2])/3);
      values.sort((a,b)=>a-b);
      return {at:packet.at,mean:+(values.reduce((a,b)=>a+b,0)/values.length).toFixed(2),
        p90:+values[Math.floor(values.length*.9)].toFixed(2)};
    })),packets.slice(i,i+16));
    result.push(...group);
  }
  return result;
}

export async function captureOfficeFadePixels(page){
  await observeWarehouseFades(page);
  await page.waitForFunction(id=>window.storyProbe.authoredScene.active?.scene.id===id
    ||window.storyProbe.sceneErrors.length,office+".reaction",{timeout:125_000});
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const session=await page.context().newCDPSession(page),packets=[];
  session.on("Page.screencastFrame",event=>{
    void session.send("Page.screencastFrameAck",{sessionId:event.sessionId}).catch(()=>{});
    if(event.metadata.timestamp && packets.length<420)packets.push({at:Math.round(event.metadata.timestamp*1000),data:event.data});
  });
  await session.send("Page.startScreencast",{format:"png",maxWidth:192,maxHeight:128,everyNthFrame:2});
  return async ()=>{
    await session.send("Page.stopScreencast");await session.detach();
    const data=await page.evaluate(()=>window.stopWarehouseFades());
    const pixels=await viewportPixels(page,packets);
    const samples=(start,end)=>pixels.filter(p=>p.at>=start && p.at<=end);
    const stats=points=>points.length?{count:points.length,minP90:Math.min(...points.map(v=>v.p90)),
      maxP90:Math.max(...points.map(v=>v.p90)),darkest:points.reduce((a,b)=>a.mean<=b.mean?a:b)}:null;
    const [hide,reveal,exit]=data.segments;
    data.compositor={count:pixels.length,baseline:stats(samples(pixels[0]?.at,hide?.started)),
      cover:stats(samples(hide?.started,reveal?.started+180)),
      reveal:stats(samples(reveal?.started,data.finalVoice?.at)),
      clear:stats(samples(data.finalVoice?.at,exit?.started)),
      exit:stats(samples(exit?.started,(exit?.ended??exit?.steps.at(-1)?.at)+200))};
    return data;
  };
}

export async function cancelOfficeDuringFade(page){
  await observeWarehouseFades(page);
  await page.waitForFunction(()=>{
    const p=window.storyProbe,f=p.authoredScene.screenFade.active,el=document.querySelector("#story-screen-fade");
    const alpha=Number(getComputedStyle(el).opacity);
    return f?.durationFrames===30 && f.toAlpha===255 && alpha>=.25 && alpha<=.85;
  },null,{timeout:125_000});
  const interrupted=await page.evaluate(async()=>{
    const alpha=Number(getComputedStyle(document.querySelector("#story-screen-fade")).opacity);
    await window.storyProbe.regions.controller.cancel("warehouse-office-mid-fade");
    return alpha;
  });
  expect(interrupted).toBeGreaterThan(.1);
  expect(interrupted).toBeLessThan(1);
  await page.waitForFunction(()=>window.storyProbe.regions.controller.status==="idle" &&
    !window.storyProbe.lifecycle.getController().movementLocked);
  const cancelled=await page.evaluate(()=>window.stopWarehouseFades());
  expect(cancelled.final).toMatchObject({hidden:true,owned:false,world:"ms8s",locked:false});
  return {interrupted,final:cancelled.final};
}

export async function verifyOfficeFades(testInfo,finish){
  const data=await finish();
  await testInfo.attach("warehouse-office-native-fades",{body:JSON.stringify(data),contentType:"application/json"});
  expect(data.segments.map(s=>[s.from,s.to,s.duration,s.stage.split(".").at(-1),s.lastAudio])).toEqual([
    [0,255,30,"reaction","E1009BA014"],[255,0,30,"departure","E1009BA014"],
    [0,255,60,"departure","E1009BA017"],
  ]);
  const curves=data.segments.map(segment=>{
    const {from,to,duration,stage,steps}=segment;
    const direction=Math.sign(to-from),increment=Math.trunc((to-from)*65536/duration);
    const errors=steps.map(step=>Math.abs(step.alpha*255-Math.floor((from*65536+increment*step.frame)/65536)));
    const distinct=steps.filter((step,i)=>i===0||step.frame!==steps[i-1].frame);
    expect(distinct.length).toBeGreaterThan(5);
    expect(distinct.some(s=>s.alpha>.2 && s.alpha<.8)).toBe(true);
    expect(Math.max(...errors)).toBeLessThan(.1);
    expect(distinct.every((s,i)=>!i||(s.alpha-distinct[i-1].alpha)*direction>=0)).toBe(true);
    expect(steps.at(-1).frame).toBeGreaterThanOrEqual(duration-3);
    const durationMs=segment.ended-segment.started;
    expect(durationMs).toBeGreaterThan(duration/30*650);
    return {stage,from,to,duration,sampledFrames:distinct.length,durationMs,
      frameRange:[steps[0].frame,steps.at(-1).frame],observedAlphaBytes:
        distinct.filter((v,i)=>i===0||i===Math.floor(distinct.length/2)||i===distinct.length-1)
          .map(s=>({frame:s.frame,alpha:Math.round(255*s.alpha)}))};
  });
  expect(data.black).toBe(true);expect(data.covered).toBe(true);
  expect(data.events.some(e=>e.alpha===1)).toBe(true);
  expect(data.newPose?.alpha).toBeGreaterThanOrEqual(.98);
  expect(data.finalVoice).toMatchObject({alpha:0,stage:office+".departure"});
  expect(data.transfer).toMatchObject({loadingCovered:true});
  expect(data.final).toMatchObject({world:"mfsy",hidden:true,owned:false,locked:false});
  const pixels=data.compositor;
  for(const name of ["baseline","cover","reveal","clear","exit"])expect(pixels[name]?.count,name).toBeGreaterThan(0);
  expect(pixels.cover.minP90).toBeLessThan(15);
  expect(pixels.exit.minP90).toBeLessThan(15);
  expect(pixels.baseline.maxP90).toBeGreaterThan(pixels.cover.minP90+15);
  expect(pixels.reveal.maxP90).toBeGreaterThan(pixels.reveal.minP90+15);
  expect(pixels.clear.maxP90).toBeGreaterThan(pixels.exit.minP90+15);
  return {curves,windowPose:data.newPose,finalVoice:data.finalVoice,handoff:data.transfer,returned:data.final,pixels};
}
