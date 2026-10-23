import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const REVIEW_SETS = {
  vision: [
    ...[false,true].map(natural=>["s1.jomo.snow-dream.scene","interior","JOMO",{}, {
      label:natural?"complete":"cancel",natural,frames:natural?[180,450,900]:[180],
      backdrop:"play/assets/hazuki/kkyc/SCROLL19.SPR",
    }]),
  ],
  telephone: [
    ...[false,true].map(natural=>["s1.jomo.jimmy-morning-call.scene","interior","JOMO",{}, {
      label:natural?"complete":"cancel",natural,frames:natural?[180,380,550,900,1160]:[380],objects:["TEL_"],
      ...(natural?{observeActors:{FUKU:"FUK",AKIR:"YKC"}}:{skipReceiver:true}),
      telephone:[[160,"FUKU",3],[521,"AKIR",4],[1135,null]],
    }]),
    ["s1.jomo.nozomi-night-call.scene","interior","JOMO",{}, {
      natural:true,frames:[810,1300,1990,2050],objects:["TEL_"],telephone:[[790,"AKIR",3],[2018,null]],
      observeActors:{INE_:"INE",AKIR:"YKC"},
    }],
  ],
  home: [
    ["s1.jomo.post-chen-home.scene","interior","JOMO",{AKIR:"YKC",FUKU:"FUK"},{natural:true,frames:[350,550]}],
    ["s1.jomo.bank-savings.scene","interior","JOMO",{AKIR:"YKC"},{natural:true,openingFrames:[180],frames:[330,690],objects:["BANK"]}],
    ["s1.jomo.travel-family.scene","interior","JOMO",{AKIR:"YKC",INE_:"INE",FUKU:"FUK"},{natural:true,frames:[1100,1900,2350]}],
    ...[false,true].map(natural=>["s1.jomo.fuku-travel-funds.scene","interior","JOMO",{}, {
      label:natural?"complete":"cancel",natural,frames:natural?[380,700,925,1160,1600,2400]:[380],objects:["PIG_"],
      prop:{tag:"PIG_",shown:[0,2660],attachments:[[345,"attach","FUKU"],[890,"attach","AKIR"],[1134,"detach"]],closeup:true},
    }]),
  ],
  mirror: [
    ...[false,true].map(natural=>["s1.ms08.mirror-meeting.explanation","ms08","MS08",{}, {
      label:natural?"complete":"cancel",natural,frames:natural?[100,750,1200,2250]:[750],objects:["KAGA"],
      prop:{tag:"KAGA",shown:[0,2263],attachments:[[723,"attach","AKIR"],[2262,"detach"]],closeup:true},
    }]),
    ...[["theft-start",[45,110,155]],["pursuit",[30,70]],["scaffolding",[30,100,250]],
      ["crane",[30,100,175]],["failure",[50,150,280]],["save-mirror",[60,200,400,510]]]
      .map(([part,frames])=>[`s1.ms08.mirror-meeting.${part}`,"ms08","MS08",{}, {
        natural:true,frames,
        // Original SEQDATA3 AMOV parks KAGA at y=-1 during the button shot;
        // it is not supposed to render while the crane pieces are visible.
        objects:part==="crane"?["CLE1","CLE2"]:["KAGA"],
        ...(part==="scaffolding"?{prop:{tag:"KAGA",shown:[0,273],attachments:[[0,"attach","CHAI"]],closeup:true}}:{}),
      }]),
    ["s1.ms08.mirror-meeting.hong-kong","ms08","MS08",{AKIR:"YKC",TAIJ:"SYU",KISY:"KIS"},{
      natural:true,openingFrames:[150],frames:[2500,3650],objects:["KAGA"],
      prop:{tag:"KAGA",shown:[0,3630],attachments:[[0,"attach","AKIR"],[3630,"detach"]],closeup:true},
    }],
  ],
  bunkado: [
    ...[false,true].map(natural=>["s1.dkty.handguard.arrival","dkty","DKTY",{AKIR:"YKC",OISI:"KOT_L"},{
      label:natural?"complete":"cancel",natural,openingFrames:[730,970],
      frames:natural?[1680,2200,2775,2830]:[1680],objects:["TUBA","HAKO","TOKE"],
      prop:{tag:"TUBA",shown:[0,2950],attachments:[[1630,"attach","OISI"],[2760,"attach","AKIR"]],closeup:true},
    }]),
    ["s1.dkty.handguard.remembrance","dkty","DKTY",{AKIR:"YKC",OISI:"KOT_L"},{natural:true,frames:[200,500],objects:["TUBA"]}],
    ["s1.dkty.handguard.phoenix-question","dkty","DKTY",{AKIR:"YKC",OISI:"KOT_L"},{natural:true,frames:[250,750,850],objects:["TUBA"]}],
  ],
  tattoo: [
    ...[false,true].map(natural=>["s1.tatq.charlie-aftermath.scene","tatq","TATQ",{CHRL:"BIS",AKIR:"YKC"},{
      label:natural?"complete":"cancel",natural,openingFrames:[45,105],frames:natural?[250,420,640,800,1000,1300,1600]:[420],
      objects:["NIFE","KTE3"],...(natural?{voiceCounts:{A0136:18}}:{}),
    }]),
  ],
  alley: [
    ...[false,true].map(natural=>["s1.heartbeats.alley.beer","dobuita","D000",{AKIR:"YKC",TONY:"GIJ"},{
      label:natural?"complete":"cancel",natural,openingFrames:[60],frames:natural?[320,400]:[300],objects:["BIN_"],
      ...(natural?{voiceCounts:{A01114:2}}:{}),
    }]),
  ],
  introduction: [
    ...[false,true].map(natural=>["s1.mend.chen-introduction-letter.scene","mend","MEND",{TAIJ:"SYU",AKIR:"YKC"},{
      label:natural?"complete":"cancel",natural,frames:natural?[900,1150,1300,1650,1800]:[900],objects:["FUTO"],
      prop:{tag:"FUTO",shown:[878,1758],attachments:[[878,"attach","TAIJ"],[1228,"attach","AKIR"],[1758,"detach"]],closeup:true},
    }]),
  ],
  amulet: [
    ...[false,true].map(natural=>["s1.mend.nozomi-amulet.scene","mend","MEND",{HRSK:"NZM",AKIR:"YKC"},{
      label:natural?"complete":"cancel",natural,frames:natural?[1500,1620,2080,2160,2400]:[1620],objects:["OMAM"],
      prop:{tag:"OMAM",shown:[1540,4187],attachments:[[1540,"attach","HRSK"],[2139,"attach","AKIR"]],closeup:true},
    }]),
  ],
  ticket: [
    ...[false, true].map(natural => ["s1.daza.boat-ticket-collection.scene", "daza", "DAZA", { KJHS: "TPL_L" }, {
      label: natural ? "complete" : "cancel", natural, frames: [],
    }]),
  ],
  portraits: [
    ["s1.ms08.master-chen.arrival", "ms08", "MS08", { KISY: "KIS", TAIJ: "SYU" }],
    ["s1.d000.jimmy-caught.scene", "dobuita", "D000", { JIMY: "JIM" }],
    ["s1.mend.nozomi-amulet.scene", "mend", "MEND", { HRSK: "NZM" }],
  ],
  letter: [
    ["s1.d000.nozomi-after-parlor.scene", "dobuita", "D000", { HRSK: "NZM", AKIR: "YKC" }, { natural: true, frames: [1200, 1900] }],
    ["s1.jhd0.fuku-resolve.scene", "exterior", "JHD0", { FUKU: "FUK", AKIR: "YKC" }, { natural: true, frames: [1200, 1800] }],
    ["s1.jhd0.ine-letter-invitation.scene", "exterior", "JHD0", { INE_: "INE", AKIR: "YKC" }, { natural: true, frames: [800] }],
    ["s1.jomo.chinese-letter.scene", "interior", "JOMO", { INE_: "INE", AKIR: "YKC" }, { natural: true, frames: [900, 1500, 1900], objects: ["MAIL"] }],
  ],
  allowance: [
    ...[false, true].map(natural => ["s1.jomo.first-allowance.scene", "interior", "JOMO", { INE_: "INE", AKIR: "YKC" }, {
      label: natural ? "complete" : "cancel", natural,
      frames: natural ? [740, 820, 1000, 1100, 1450, 1650] : [820], objects: ["KOZU"],
      prop: { tag: "KOZU", parent: "INE_", shown: [775, 1630], detach: 1035 },
    }]),
  ],
  dojo: [
    ...[false, true].map(natural => ["s1.jhd0.first-dojo.scene", "exterior", "JHD0", { FUKU: "FUK", AKIR: "YKC" }, {
      label: natural ? "complete" : "cancel", natural,
      frames: natural ? [500, 1050, 1150, 1400, 1770] : [500],
      openingFrames: [120], firstSpeechBefore: 1075,
      ...(natural ? { voiceCounts: { SA1116: 11, A0125: 5 } } : {}),
    }]),
  ],
};

// Presentation-only checks through the real Story adapter. These do not grant
// prerequisites or claim that replaying a scene proves its narrative trigger.
export async function reviewStoryFaces(page, testInfo, character) {
  const saved = () => page.request.get(`/api/characters/${character.id}/state`).then(r => r.json());
  const before = await saved();
  const set = process.env.NEW_YOKOSUKA_STORY_FACE_SET || "portraits";
  expect(REVIEW_SETS[set], `known Story face review set: ${set}`).toBeTruthy();
  // This test borrows the presentation adapter directly, without a Yarn run.
  // Stop admission, not animation or world updates, so region/room triggers
  // cannot race this intentionally unowned diagnostic transaction. Connected
  // progression tests leave these dispatchers untouched.
  await page.evaluate(() => {
    const p = window.storyProbe;
    const originals = [p.regions, p.automatic].map(owner => [owner, owner.update]);
    for (const [owner] of originals) owner.update = () => false;
    p.restoreFaceReviewDispatch = () => { for (const [owner, update] of originals) owner.update = update; };
  });
  try {
    await page.waitForFunction(() => window.storyProbe.regions.controller.status === "idle" && !window.storyProbe.automatic.pending);
    for (const [id, world, area, actors, options = {}] of REVIEW_SETS[set]) {
      const label = id.replaceAll(".", "-") + (options.label ? `-${options.label}` : "");
      await page.evaluate(async world => { await window.storyProbe.lifecycle.travelToWorld(world); }, world);
      await page.waitForFunction(() => window.storyProbe.lifecycle.worldRuntime.ready);
      const prior = await page.evaluate(() => {
        const p = window.storyProbe, c = p.lifecycle.getController();
        return { position: c.collider.position.asArray(), firstPerson: c.firstPerson,
          avatar: p.lifecycle.playerRuntime.activeCharacterId };
      });
      await page.evaluate(({ id, area, actors }) => {
        const p = window.storyProbe, presentation = p.regions.controller.presentation;
        const review = p.faceReview = { done: false, error: null, cancelling: false,
          samples: {}, frame: 0, objects: {}, voices: new Set(), voiceIds: new Set(),
          returnedFrom: p.lifecycle.worldRuntime.activeWorld.id };
        let nextSample = 0;
        const scene = p.lifecycle.scene;
        const observer = scene.onAfterRenderObservable.add(() => {
          if (performance.now() < nextSample) return;
          nextSample = performance.now() + 100;
          const runtime = p.director?.activeCutscene?.packageRuntime;
          if (runtime) {
            review.frame = runtime.activityRuntime.active?.currentFrame || review.frame;
            for (const voice of runtime.audio.active?.elements || []) {
              if (voice.kind === "voice" && !voice.audio.paused && voice.audio.currentTime > 0) {
                review.voices.add(voice.cue.speakerId);
                review.voiceIds.add(voice.command.audio.voiceId);
              }
            }
            for (const [tag, object] of new Map([...runtime.sceneObjects?.objects || [],...runtime.attachedObjects?.objects || []])) {
              if (!object.root.getChildMeshes().some(mesh => mesh.isEnabled() && scene.isActiveMesh(mesh))) continue;
              const sample = review.objects[tag] ||= { frames: 0, positions: new Set() };
              sample.frames++;
              sample.positions.add(JSON.stringify(object.root.getAbsolutePosition().asArray()));
            }
          }
          for (const [tag, face] of runtime?.presentation.faces?.active?.faces || []) {
            if (!actors[tag] || !face.voiceCue || face.voiceCue.positionSeconds <= 0) continue;
            const meshes = face.entry.primaryMeshes;
            if (!meshes.some(mesh => mesh.isEnabled() && scene.isActiveMesh(mesh))) continue;
            const sample = review.samples[tag] ||= { code: face.entry.definition.faceCode, firstFrame: review.frame,
              frames: 0, vertices: new Set(), mouths: new Set(), audio: new Set() };
            sample.frames++;
            sample.audio.add(face.voiceCue.positionSeconds);
            sample.mouths.add(JSON.stringify(Array.from(face.mouth.current)));
            sample.vertices.add(JSON.stringify(meshes.flatMap(mesh => {
              const positions = mesh.getVerticesData("position");
              return Array.from(mesh._mt5SourceVertexIndices).flatMap((source, index) => {
                const local = source - face.entry.primaryVertexBase;
                return mesh._mt5ExternalParentVertexOffsets?.[index] < 0
                  || local < 0 || local >= face.entry.table.vertexCount ? []
                  : Array.from(positions.slice(index * 3, index * 3 + 3));
              });
            })));
          }
          for (const [tag, face] of runtime?.presentation.faces?.active?.genericFaces || []) {
            if (!actors[tag] || !face.voiceCue || face.voiceCue.positionSeconds <= 0) continue;
            const meshes = face.speech.controller.binding.meshes.map(record => record.mesh);
            if (!meshes.some(mesh => mesh.isEnabled() && scene.isActiveMesh(mesh))) continue;
            const sample = review.samples[tag] ||= { code: face.actor.model.modelCode, firstFrame: review.frame,
              frames: 0, vertices: new Set(), mouths: new Set(), audio: new Set() };
            sample.frames++;
            sample.audio.add(face.voiceCue.positionSeconds);
            sample.mouths.add(face.speech.controller.weight);
            sample.vertices.add(JSON.stringify(meshes.flatMap(mesh => Array.from(mesh.getVerticesData("position")))));
          }
        });
        review.stopProbe = () => scene.onAfterRenderObservable.remove(observer);
        presentation.begin({ area });
        void presentation.execute({ name: "start_activity", arguments: [{ type: "string", isStatic: true, value: id }] })
          .then(() => { presentation.commit(); review.done = true; }, error => {
            presentation.rollback("face-review-failed");
            if (!review.cancelling) review.error = error.message;
            review.done = true;
          });
      }, { id, area, actors:{...options.observeActors,...actors} });
      try {
        // Capture the lead-in before waiting for later speaking shots. A missing
        // early recording must not be hidden by a working ending-film voice.
        for (const frame of options.openingFrames || []) {
          await page.waitForFunction(frame => {
            const r=window.storyProbe.faceReview; return r.error || r.done || r.frame >= frame;
          }, frame, { timeout: 120_000 });
          expect(await page.evaluate(()=>window.storyProbe.faceReview.error)).toBeNull();
          expect(await page.evaluate(()=>window.storyProbe.faceReview.frame)).toBeGreaterThanOrEqual(frame);
          await page.screenshot({ path: testInfo.outputPath(`${label}-opening-${frame}.png`) });
        }
        for (const [tag, code] of Object.entries(actors)) {
          await page.waitForFunction(tag => {
            const r = window.storyProbe.faceReview, s = r.samples[tag];
            return r.error || r.done || (s?.vertices.size > 2 && s.mouths.size > 2 && s.audio.size > 2);
          }, tag, { timeout: 120_000 });
          const sample = await page.evaluate(tag => {
            const r = window.storyProbe.faceReview, s = r.samples[tag];
            return { error: r.error, code: s?.code, frames: s?.frames, firstFrame: s?.firstFrame,
              vertices: s?.vertices.size, mouths: s?.mouths.size, audio: s?.audio.size };
          }, tag);
          console.info(`Story FACE ${id}/${tag}:`, JSON.stringify(sample));
          expect(sample.error).toBeNull(); expect(sample.code).toBe(code);
          expect(sample.frames).toBeGreaterThan(2); expect(sample.vertices).toBeGreaterThan(2);
          expect(sample.mouths).toBeGreaterThan(2); expect(sample.audio).toBeGreaterThan(2);
          if (options.firstSpeechBefore) expect(sample.firstFrame).toBeLessThan(options.firstSpeechBefore);
          await page.screenshot({ path: testInfo.outputPath(`${label}-face-${tag}.png`) });
          // An actor may be submitted by Babylon while hidden behind scenery.
          // Keep the native-shot capture, then explicitly frame the real shell
          // with the existing diagnostic camera for mesh/neck/eye inspection.
          await page.evaluate(async tag => {
            const { frameCutsceneSurface } = await import("/tests/e2e/cutscene-surface-framing.js");
            const p = window.storyProbe;
            p.faceReview.closeupFrames = 0;
            p.faceReview.restoreCamera = frameCutsceneSurface(p.director.activeCutscene.packageRuntime,
              "face", tag, null, () => { p.faceReview.closeupFrames++; });
          }, tag);
          try {
            await page.waitForFunction(() => window.storyProbe.faceReview.closeupFrames >= 2);
            await page.screenshot({ path: testInfo.outputPath(`diagnostic-${label}-face-${tag}.png`) });
          } finally {
            await page.evaluate(() => { window.storyProbe.faceReview.restoreCamera(); });
          }
        }
        for (const frame of options.frames || []) {
          await page.waitForFunction(frame => { const r = window.storyProbe.faceReview; return r.done || r.error || r.frame >= frame; }, frame, { timeout: 120_000 });
          const state = await page.evaluate(() => { const r = window.storyProbe.faceReview; return { done: r.done, error: r.error, frame: Math.round(r.frame) }; });
          expect(state.error).toBeNull();
          if (!state.done) await page.screenshot({ path: testInfo.outputPath(`${label}-native-${state.frame}.png`) });
          if(options.backdrop&&!state.done){
            const stage=await page.evaluate(()=>{
              const p=window.storyProbe,r=p.director.activeCutscene.packageRuntime;
              p.faceReview.stageRuntime=r;
              return {owner:r.scrollSprites?.owner===r,
                paths:r.scrollSprites.resources.filter(s=>s.layer.isEnabled).map(s=>s.definition.path),
                lighting:r.mapLayers.lightingPresetIndex,
                flatBehind:r.mapLayers.scene.layers.indexOf(r.mapLayers.background)<r.mapLayers.scene.layers.indexOf(r.scrollSprites.resources[0].layer)};
            });
            expect(stage).toEqual({owner:true,paths:[options.backdrop],lighting:0,flatBehind:true});
          }
          if(options.telephone&&!state.done){
            const phone=await page.evaluate(()=>{
              const p=window.storyProbe,r=p.director.activeCutscene.packageRuntime,a=r.telephoneReceiver.active;
              if(a){p.faceReview.receiver=a.receiver;p.faceReview.receiverParent=a.snapshot.parent;}
              return {frame:r.activityRuntime.active.currentFrame,actor:a?.binding.actorCode||null,
                selector:a?.binding.bindingIndex,parent:a?.receiver.parent?.name,
                position:a?.receiver.getAbsolutePosition().asArray()};
            });
            const expected=options.telephone.filter(([at])=>at<=phone.frame).at(-1);
            console.info(`${label} receiver`,JSON.stringify(phone));
            expect(phone.actor).toBe(expected?.[1]||null);
            if(phone.actor){
              expect(phone.selector).toBe(expected[2]);
              await page.evaluate(async({actor,selector})=>{
                const p=window.storyProbe,r=p.director.activeCutscene.packageRuntime;
                const {frameCutsceneSurface}=await import("/tests/e2e/cutscene-surface-framing.js");
                p.faceReview.closeupFrames=0;
                p.faceReview.restoreCamera=frameCutsceneSurface(r,"hand",actor,selector===3?"left":"right",()=>p.faceReview.closeupFrames++);
              },phone);
              try{
                await page.waitForFunction(()=>window.storyProbe.faceReview.closeupFrames>=2);
                await page.screenshot({path:testInfo.outputPath(`diagnostic-${label}-receiver-${frame}.png`)});
              }finally{await page.evaluate(()=>window.storyProbe.faceReview.restoreCamera());}
            }
          }
          if (options.prop && !state.done) {
            const prop = await page.evaluate(tag => {
              const p = window.storyProbe, r = p.director.activeCutscene.packageRuntime;
              const root = (r.sceneObjects.objects.get(tag)||r.attachedObjects.objects.get(tag)).root;
              const frame = r.activityRuntime.active.currentFrame;
              const binding = r.attachedObjects.active.bindings.filter(b=>b.actorTag===tag&&b.frame<=frame).at(-1);
              return { frame, enabled: root.isEnabled(), action: binding?.action || null,
                parent: binding?.parentActorTag,controlId:binding?.controlId,position: root.getAbsolutePosition().asArray() };
            }, options.prop.tag);
            console.info(`${label} prop`, JSON.stringify(prop));
            expect(prop.enabled).toBe(prop.frame >= options.prop.shown[0] && prop.frame < options.prop.shown[1]);
            const timeline=options.prop.attachments||[[options.prop.shown[0],"attach",options.prop.parent],[options.prop.detach,"detach"]];
            const expected=timeline.filter(([frame])=>frame<=prop.frame).at(-1);
            expect(prop.action).toBe(expected?.[1]||null);
            if(prop.action==="attach")expect(prop.parent).toBe(expected[2]);
            if(options.prop.closeup&&prop.enabled&&prop.action==="attach"){
              await page.evaluate(async ({parent,controlId})=>{
                const {frameCutsceneSurface}=await import("/tests/e2e/cutscene-surface-framing.js");
                const p=window.storyProbe,r=p.director.activeCutscene.packageRuntime;
                const side=controlId===12?"left":"right";
                if(!r.presentation.hands.active.hands.get(parent).sides[side].detailedActive)throw Error("Missing detailed hand during transfer");
                p.faceReview.closeupFrames=0;
                p.faceReview.restoreCamera=frameCutsceneSurface(r,"hand",parent,side,()=>p.faceReview.closeupFrames++);
              },prop);
              try{
                await page.waitForFunction(()=>window.storyProbe.faceReview.closeupFrames>=2);
                await page.screenshot({path:testInfo.outputPath(`diagnostic-${label}-prop-${frame}-${prop.parent}.png`)});
              }finally{await page.evaluate(()=>window.storyProbe.faceReview.restoreCamera());}
            }
          }
        }
        if(options.skipReceiver){
          const before=await page.evaluate(()=>window.storyProbe.faceReview.frame);
          await page.keyboard.press("Space");
          await page.waitForFunction(frame=>window.storyProbe.faceReview.frame>=frame+145,before);
          expect(await page.evaluate(()=>window.storyProbe.director.activeCutscene.packageRuntime.telephoneReceiver.active.binding.actorCode)).toBe("AKIR");
        }
        if (options.natural) {
          await page.waitForFunction(() => window.storyProbe.faceReview.done, null, { timeout: 120_000 });
          expect(await page.evaluate(() => window.storyProbe.faceReview.error)).toBeNull();
        }
        for(const [tag,code]of Object.entries(options.observeActors||{})){
          const sample=await page.evaluate(tag=>{
            const s=window.storyProbe.faceReview.samples[tag];
            return s&&{code:s.code,vertices:s.vertices.size,mouths:s.mouths.size,audio:s.audio.size};
          },tag);
          expect(sample?.code).toBe(code);
          for(const key of ["vertices","mouths","audio"])expect(sample[key]).toBeGreaterThan(2);
        }
        if (options.voiceCounts) {
          const ids = await page.evaluate(() => [...window.storyProbe.faceReview.voiceIds]);
          for (const [prefix, count] of Object.entries(options.voiceCounts)) {
            expect(ids.filter(id => id.startsWith(prefix)).length, `${prefix} actually played recordings`).toBe(count);
          }
        }
      } finally {
        const review = await page.evaluate(() => {
          const r = window.storyProbe.faceReview;
          return { error: r.error, frame: r.frame, done: r.done, voices: [...r.voices], voiceIds: [...r.voiceIds],
            samples: Object.fromEntries(Object.entries(r.samples).map(([tag, s]) => [tag,
              { code: s.code, firstFrame: s.firstFrame, frames: s.frames, mouths: s.mouths.size, vertices: s.vertices.size, audio: s.audio.size }])),
            objects: Object.fromEntries(Object.entries(r.objects).map(([tag, s]) => [tag, { frames: s.frames, positions: s.positions.size }])) };
        });
        await writeFile(testInfo.outputPath(`${label}-review.json`), JSON.stringify(review));
        console.info(`Story review ${id}`, JSON.stringify(review));
        await page.evaluate(() => {
          const p = window.storyProbe;
          p.faceReview.stopProbe(); p.faceReview.cancelling = true;
          p.regions.controller.presentation.rollback("face-review-cancel");
        });
        await page.waitForFunction(() => {
          const p = window.storyProbe;
          return p.faceReview.done && !p.director.active && p.lifecycle.worldRuntime.ready
            && p.lifecycle.worldRuntime.activeWorld.id === p.faceReview.returnedFrom
            && !p.lifecycle.getController().movementLocked;
        }, null, { timeout: 100_000 });
      }
      expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
      if(options.backdrop)expect(await page.evaluate(()=>{
        const r=window.storyProbe.faceReview.stageRuntime;
        return {owner:r.scrollSprites.owner,visible:r.scrollSprites.resources.some(s=>s.layer.isEnabled),
          lighting:r.mapLayers.lightingPresetIndex,isolation:r.mapLayers.releaseEnvironmentIsolation};
      })).toEqual({owner:null,visible:false,lighting:null,isolation:null});
      if(options.telephone)expect(await page.evaluate(()=>{
        const r=window.storyProbe.faceReview;
        return r.receiver && (r.receiver.isDisposed() || r.receiver.parent===r.receiverParent);
      })).toBe(true);
      for (const tag of options.objects || []) {
        expect(await page.evaluate(tag => window.storyProbe.faceReview.objects[tag]?.frames || 0, tag)).toBeGreaterThan(2);
      }
      const restored = await page.evaluate(() => {
        const p = window.storyProbe, c = p.lifecycle.getController();
        return { position: c.collider.position.asArray(), firstPerson: c.firstPerson,
          avatar: p.lifecycle.playerRuntime.activeCharacterId, leases: p.lifecycle.scheduledActors.activityActorOwners.size };
      });
      expect(restored.leases).toBe(0); expect(restored.firstPerson).toBe(prior.firstPerson);
      expect(restored.avatar).toBe(prior.avatar);
      restored.position.forEach((v, i) => expect(v).toBeCloseTo(prior.position[i], 3));
      const after = await saved();
      expect(after.character.storyFlags).toEqual(before.character.storyFlags);
      expect(after.character.yen).toBe(before.character.yen);
      expect(after.inventory).toEqual(before.inventory);
    }
  } finally {
    await page.evaluate(() => { window.storyProbe.restoreFaceReviewDispatch(); });
  }
}
