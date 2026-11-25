import {expect} from "@playwright/test";

export function observeStagedGoroFace(page){
  return page.evaluate(()=>{
    clearInterval(window.stagedGoroFaceTimer);
    const result=window.stagedGoroFace={voices:{},released:false};
    const roots=new Map();
    const previous=new Map();
    const delta=(a,b)=>a.reduce((maximum,value,i)=>Math.max(maximum,Math.abs(value-b[i])),0);
    window.stagedGoroFaceTimer=setInterval(()=>{
      const owner=window.storyProbe.authoredScene?.active;
      if(owner?.scene.id!=="s1.mfsy.goro-guard-intro"){
        if(roots.size===2 && [...roots.values()].every(root=>root.isDisposed())){
          result.released=true;
          clearInterval(window.stagedGoroFaceTimer);
        }
        return;
      }
      const id=window.originalDialogue?.lines.at(-1)?.id;
      if(!/^E1081[AB]00[12]$/.test(id))return;
      const samples=result.voices[id]??={};
      for(const tag of ["AKIR","GORO"]){
        const face=owner.faces?.active?.faces.get(tag);
        if(!face)continue;
        const entry=face.entry;
        const mesh=entry.primaryMeshes.find(node=>node.getTotalVertices()>0);
        const vertices=mesh?.getVerticesData("position");
        if(!vertices)continue;
        if(!roots.has(tag))roots.set(tag,entry.root);
        const row=samples[tag]??={code:entry.definition.faceCode,vertexCount:entry.table.vertexCount,
          attached:false,sameHead:true,voiceMoving:false,drawable:false,mouthDelta:0,meshDelta:0};
        row.attached ||= entry.root.parent===face.actor.model.renderRoot && entry.root.isEnabled();
        row.sameHead &&= roots.get(tag)===entry.root;
        row.drawable ||= window.storyProbe.lifecycle.scene.isActiveMesh(mesh) && mesh.isEnabled() && mesh.isVisible;
        const seconds=owner.faceVoices.get(tag)?.positionSeconds;
        const last=previous.get(tag);
        if(last?.id===id && Number.isFinite(seconds) && seconds>last.seconds){
          row.voiceMoving=true;
          row.mouthDelta=Math.max(row.mouthDelta,delta(face.mouth.current,last.mouth));
          row.meshDelta=Math.max(row.meshDelta,delta(vertices,last.vertices));
        }
        previous.set(tag,{id,seconds,mouth:Float32Array.from(face.mouth.current),vertices:Float32Array.from(vertices)});
      }
    },35);
  });
}

export async function verifyStagedGoroFace(page,testInfo){
  const result=await page.evaluate(()=>window.stagedGoroFace);
  await testInfo.attach("goro-prelude-face",{contentType:"application/json",body:JSON.stringify(result)});
  expect(result.released).toBe(true);
  for(const id of ["E1081B001","E1081A001","E1081B002","E1081A002"]){
    const samples=result.voices[id];
    expect(samples?.GORO,id).toMatchObject({code:"KMB",vertexCount:335,attached:true,sameHead:true});
    expect(samples?.AKIR,id).toMatchObject({code:"YKC",attached:true,sameHead:true});
    const speaking=samples[id.startsWith("E1081B")?"GORO":"AKIR"];
    expect(speaking.voiceMoving,id).toBe(true);
    expect(speaking.mouthDelta,id).toBeGreaterThan(1e-6);
    expect(speaking.meshDelta,id).toBeGreaterThan(1e-6);
  }
  expect(Object.values(result.voices).some(pair=>pair.GORO.drawable)).toBe(true);
  expect(Object.values(result.voices).some(pair=>pair.AKIR.drawable)).toBe(true);
}
