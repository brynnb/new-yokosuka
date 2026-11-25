import {readFileSync} from "node:fs";
import {parseAuthSequence} from "../../src/AuthSequence.js";
import {parseAuthStrings} from "../../src/AuthStrings.js";

export function originalFilm(dir,slug,slot=0) {
  const pack = JSON.parse(readFileSync(dir+"/manifest.json","utf8")), activity = pack.activities[slot];
  const auth = readFileSync(dir+"/"+activity.archiveMember);
  const strings = parseAuthStrings(auth).strings;
  const audio = JSON.parse(readFileSync("public/audio/world/"+slug+"/manifest.json","utf8"));
  const byPath = new Map(audio.voices.map(v=>[v.sourcePath,v.voiceId]));
  const ids = parseAuthSequence(auth).frames.flatMap(f=>f.commands).filter(c=>c.name==="voice").map(c=>byPath.get(strings[c.stringIndex]));
  return {activity,ids};
}

export function observeNativeFilm(page,{scene,actors,watchObjects=[],grips=[],watchFace=null}) {
  return page.evaluate(({scene, actors, watchObjects, grips, watchFace})=>{
    clearInterval(window.storyFilmTimer);
    const review=window.storyFilm={voices:[],actors:[],frames:[],objects:[],grips:[]};
    let initialFace=null;
    window.storyFilmTimer=setInterval(()=>{
      const p=window.storyProbe, cut=p.director.activeCutscene;
      if(cut?.cutscene.id!==scene) return;
      const runtime=cut.packageRuntime;
      const frame=runtime.activityRuntime.active?.currentFrame;
      if(Number.isFinite(frame) && frame > (review.frames.at(-1)??-1)+40)review.frames.push(frame);
      for (const record of runtime.audio.active?.elements||[]) {
        if(record.kind!=="voice" || record.audio.paused || record.audio.currentTime<=0)continue;
        const id=record.command.audio.voiceId;
        if(id&&!review.voices.includes(id))review.voices.push(id);
      }
      const drawable = root => root?.isEnabled() && root.getChildMeshes().some(mesh=>
        mesh.isEnabled() && mesh.isVisible && mesh.getTotalVertices()>0 && p.lifecycle.scene.isActiveMesh(mesh));
      if(watchFace && !review.face?.speaking){
        const face=runtime.presentation.faces?.active?.faces.get(watchFace);
        if(face){
          const mesh=face.entry.primaryMeshes.find(m=>m.getTotalVertices()>0);
          const position=mesh?.getVerticesData("position");
          if(position && !initialFace){
            initialFace={position:Float32Array.from(position),mouth:Float32Array.from(face.mouth.current)};
            review.face={actor:watchFace,code:face.entry.definition.faceCode,neutralFrame:frame,
              attached:face.entry.root.parent===face.actor.model.renderRoot,vertexCount:face.entry.table.vertexCount};
          }else if(position && initialFace){
            const record=[...(runtime.audio.active?.elements||[])].find(item=>item.kind==="voice" &&
              item.command.audio.voiceId?.startsWith("01GARB") && !item.audio.paused && item.audio.currentTime>0);
            if(record && drawable(face.entry.root)){
              const maxChange=(a,b)=>a.reduce((big,v,i)=>Math.max(big,Math.abs(v-b[i])),0);
              const mouthDelta=maxChange(face.mouth.current,initialFace.mouth);
              const meshDelta=maxChange(position,initialFace.position);
              if(mouthDelta>1e-6 && meshDelta>1e-6)review.face.speaking={frame,voice:record.command.audio.voiceId,mouthDelta,meshDelta};
            }
          }
        }
      }
      for (const tag of watchObjects) {
        const root=runtime.attachedObjects?.objects.get(tag)?.root || runtime.sceneObjects?.objects.get(tag)?.root;
        if(!review.objects.includes(tag) && drawable(root)) review.objects.push(tag);
      }
      const spec=grips[review.grips.length];
      if (spec && frame>=spec.frame && frame<spec.frame+15) {
        const record=runtime.attachedObjects?.objects.get(spec.tag);
        if(record){
          const root=record.root;
          if (!spec.parent) review.grips.push({frame,visible:root.isEnabled()});
          else {
            const actor=runtime.actors.activeActor(spec.parent);
            const model=actor?.model, node=model?.latestControllerFamily?.nodes.find(n=>n.type===spec.control);
            const matrix=node && model.latestControllerMatrices?.[node.index];
            if(matrix){
              const local=[-matrix[12], matrix[13], matrix[14]];
              const world=model.renderRoot.computeWorldMatrix(true).m;
              const hand=[0,1,2].map(i=>local[0]*world[i]+local[1]*world[4+i]+local[2]*world[8+i]+world[12+i]);
              root.computeWorldMatrix(true);
              const pos=root.getAbsolutePosition().asArray();
              review.grips.push({frame,visible:root.isEnabled(),distance:Math.hypot(...pos.map((v,i)=>v-hand[i]))});
            }
          }
        }
      }
      for(const tag of actors) {
        if(review.actors.includes(tag))continue;
        const root=runtime.actors.activeActor(tag)?.root;
        if(root?.getChildMeshes().some(m=>m.isEnabled()&&m.isVisible&&m.getTotalVertices()>0&&p.lifecycle.scene.isActiveMesh(m)))review.actors.push(tag);
      }
    },25);
  },{scene,actors,watchObjects,grips,watchFace});
}
