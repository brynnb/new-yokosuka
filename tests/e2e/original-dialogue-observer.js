// Read the same logical media URL as the voiced presenter. The browser's
// transport may resolve it to a blob URL; that transport URL has no voice ID.
export async function observeOriginalDialogue(page, ids, stagePrefix) {
  await page.evaluate(async ({ids, stagePrefix}) => {
    window.stopOriginalDialogue?.();
    const probe = window.storyProbe;
    const presenter = probe.regions.controller.dialogue;
    const urls = new Map(await Promise.all(ids.map(async id => [await presenter.voiceManifest.urlFor(id), id])));
    const observations = {lines:[], stages:[], handovers:[], props:[], sounds:[]};
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
        const scroll = name==="s1.jhd0.mysterious-scroll-reveal" || name==="s1.ms08.poetry-reading";
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
