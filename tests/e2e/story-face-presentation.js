import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const REVIEW_SETS = {
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
      }, { id, area, actors });
      try {
        // Capture the lead-in before waiting for later speaking shots. A missing
        // early recording must not be hidden by a working ending-film voice.
        for (const frame of options.openingFrames || []) {
          await page.waitForFunction(frame => window.storyProbe.faceReview.frame >= frame, frame, { timeout: 120_000 });
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
        if (options.natural) {
          await page.waitForFunction(() => window.storyProbe.faceReview.done, null, { timeout: 120_000 });
          expect(await page.evaluate(() => window.storyProbe.faceReview.error)).toBeNull();
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
