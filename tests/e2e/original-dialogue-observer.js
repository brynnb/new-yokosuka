// Read the same logical media URL as the voiced presenter. The browser's
// transport may resolve it to a blob URL; that transport URL has no voice ID.
export async function observeOriginalDialogue(page, ids, stagePrefix) {
  await page.evaluate(async ({ids, stagePrefix}) => {
    window.stopOriginalDialogue?.();
    const probe = window.storyProbe;
    const presenter = probe.regions.controller.dialogue;
    const urls = new Map(await Promise.all(ids.map(async id => [await presenter.voiceManifest.urlFor(id), id])));
    const observations = {lines:[], stages:[], handovers:[], props:[], sounds:[], plaque:[], stool:[], stoolCamera:[], office:[]};
    const {Vector3,Matrix} = await import("/node_modules/@babylonjs/core/Maths/math.vector.js");
    const playedSounds = new WeakSet();
    window.originalDialogue = observations;
    const drawable = root => Boolean(root?.isEnabled() && root.getChildMeshes(false).some(mesh =>
      mesh.isEnabled() && mesh.isVisible && mesh.getTotalVertices() > 0));
    const timer = setInterval(() => {
      const owner = probe.authoredScene?.active;
      const name = owner?.scene.id;
      if (owner?.actorsBegun && owner.elapsed > 0 && name?.startsWith(stagePrefix)) {
        for (const audio of owner.soundCueAudio || []) {
          if (playedSounds.has(audio) || audio.paused || !(audio.currentTime>0)) continue;
          playedSounds.add(audio);
          observations.sounds.push({stage:name,frame:Math.floor(owner.elapsed*30),asset:audio.src.split("/").at(-1)});
        }
        const first = observations.stages.at(-1)?.name !== name;
        if(name==="s1.ms8s.warehouse-eight-office"){
          const frame=Math.floor(owner.elapsed*30), threshold=[2,35,100][observations.office.length];
          if(threshold!==undefined && frame>=threshold){
            const camera=probe.lifecycle.scene.activeCamera;
            const q=v=>v.asArray().map(n=>Math.round(n*1000)/1000);
            const actors=owner.scene.actors.map(spec=>{
              const actor=owner.actors.activeActor(spec.tag), model=actor?.model;
              const hand=model?.latestControllerFamily?.nodes.find(node=>node.type===18);
              const matrix=hand && model.latestControllerMatrices?.[hand.index];
              return {tag:spec.tag,drawable:drawable(actor?.root),position:actor?.root?q(actor.root.getAbsolutePosition()):null,
                motion:spec.motion.name,wrist:matrix?Array.from(matrix.slice(12,15)).map(n=>Math.round(n*1000)/1000):null};
            });
            observations.office.push({frame,actors,eye:q(camera.globalPosition),target:q(camera.getTarget())});
          }
        }
        const stoolPickup = name==="s1.jhd0.mysterious-scroll-reveal-stool";
        const scroll = stoolPickup || name==="s1.jhd0.mysterious-scroll-reveal" || name==="s1.ms08.poetry-reading";
        if (first || name.endsWith(".handover") || scroll) {
          const runtime = owner.objects;
          const frame = runtime?.active?.frame ?? 0;
          const hands = [], world = [];
          for (const [tag, record] of runtime?.objects || []) {
            if (!drawable(record.root)) continue;
            const binding = runtime.active.bindings.findLast(event => event.actorTag===tag && event.frame<=frame);
            if (binding?.action === "attach" &&
                record.root.parent === owner.actors.activeActor(binding.parentActorTag)?.model?.renderRoot) {
              hands.push([tag,binding.parentActorTag,binding.controlId]);
            } else if (!record.root.parent) {
              world.push(tag);
            }
          }
          if (first) {
            const actors = owner.scene.actors.map(actor=>actor.tag)
              .filter(tag => drawable(owner.actors.activeActor(tag)?.root));
            const objects = [...(owner.sceneObjects?.objects || [])]
              .filter(([,record]) => drawable(record.root)).map(([tag]) => tag);
            observations.stages.push({name,actors,hands,objects:[...objects,...world]});
          }
          if(stoolPickup){
            const root=runtime?.objects.get("HAKO")?.root;
            const onWrist=hands.some(([tag,parent,control])=>tag==="HAKO"&&parent==="AKIR"&&control===12);
            const phase=onWrist?"wrist":world.includes("HAKO")?"floor":null;
            if(phase){
              const scene=root.getScene(), camera=scene.activeCamera, engine=scene.getEngine();
              const box=camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight());
              const round=v=>v.asArray().map(n=>Math.round(n*1000)/1000);
              const project=v=>round(Vector3.Project(v,Matrix.Identity(),scene.getTransformMatrix(),box));
              const verts=root.getChildMeshes(false).filter(mesh=>mesh.isEnabled() && mesh.isVisible && mesh.getTotalVertices()>0);
              const visible=verts.some(mesh=>camera.isInFrustum(mesh));
              const last=observations.stoolCamera.at(-1);
              if(!last || last.phase!==phase || last.visible!==visible || frame-last.frame>=7){
                observations.stoolCamera.push({frame,phase,visible,camera:camera.name,
                  viewport:[box.width,box.height],eye:round(camera.globalPosition),target:round(camera.getTarget()),
                  prop:round(root.getAbsolutePosition()),screen:project(root.getAbsolutePosition()),
                  meshCenter:verts[0]?project(verts[0].getBoundingInfo().boundingSphere.centerWorld):null});
              }
            }
            if(phase && !observations.stool.some(sample=>sample.phase===phase)){
              const camera=root.getScene().activeCamera;
              const onScreen=root.getChildMeshes(false).some(mesh=>mesh.getTotalVertices()>0 && camera.isInFrustum(mesh));
              observations.stool.push({frame,phase,onScreen,position:root.getAbsolutePosition().asArray()});
            }
          }
          if (name==="s1.jhd0.mysterious-scroll-reveal") {
            const phase=frame<80?"resident":frame>=98&&frame<115?"wall":frame>=280&&frame<540?"removed":frame>=658?"replaced":null;
            if(phase&&!observations.plaque.some(sample=>sample.phase===phase)){
              const root=owner.sceneObjects?.objects.get("GART")?.root;
              if(drawable(root)){
                const matrix=root.computeWorldMatrix(true).m;
                observations.plaque.push({phase,frame,position:root.position.asArray(),verticalAxis:matrix[5]});
              }
            }
          }
          if (scroll) {
            const signature = hands.map(([tag,parent,control])=>[tag,parent,control].join("/")).sort().join(",")
              +"|"+world.slice().sort().join(",");
            if(observations.props.at(-1)?.signature!==signature)observations.props.push({frame,signature});
            observations.stages.at(-1).lastFrame = frame;
          }
          if (name.endsWith(".handover") && hands.length+world.length===2) {
            const signature = hands.map(h=>h[0]).sort().join(",")+"|"+world.slice().sort().join(",");
            if (observations.handovers.at(-1)?.signature !== signature) {
              observations.handovers.push({frame,signature});
            }
          }
        }
      }
      const audio = presenter.audio;
      if (!audio || audio.paused || audio.currentTime <= 0 || !presenter.active) return;
      const id = urls.get(audio.src);
      if (!id || observations.lines.at(-1)?.id === id) return;
      const source = document.querySelector("#dialogue-source");
      observations.lines.push({id, text:source.textContent.trim().replace(/\s+/g," "),
        speaker:document.querySelector("#dialogue-speaker").textContent.trim(), stage:name ?? null});
    }, 30);
    window.stopOriginalDialogue = () => { clearInterval(timer); return observations; };
  }, {ids, stagePrefix});
}
