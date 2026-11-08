import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const REVIEW_SETS = {
  "harbor-camera": [["s1.mfsy.charlie-harbor-interrogation.scene","mfsy","MFSY",{}, {
    frames:[30],combatScenes:["s1.mfsy.biker-thugs","s1.mfsy.charlie-harbor"],
    cameraSeparation:true,
  }]],
  "harbor-camera-mobile": [["s1.mfsy.charlie-harbor-interrogation.scene","mfsy","MFSY",{}, {
    frames:[30],combatScenes:["s1.mfsy.biker-thugs","s1.mfsy.charlie-harbor"],
    cameraSeparation:true,viewport:{width:390,height:844},
  }]],
  "harbor-headlights": [["s1.mfsy.charlie-harbor-interrogation.scene","mfsy","MFSY",{}, {
    frames:[180],objectCloseups:["BIK0","BIK1","BIK2"],inspectLightMeshes:true,
    objectCloseupOptions:{localCamera:[3,2.5,-7],localTarget:[0,.5,-2]},
  }]],
  "harbor-charlie": [["s1.mfsy.charlie-harbor-interrogation.scene","mfsy","MFSY",{}, {
    natural:true,frames:[180,450,750,1100,1400],
    objects:["BIK0","BIK1","BIK2","RY00","RY01","RY10","RY11","RY20","RY21"],objectCloseups:["BIK0","BIK1","BIK2"],
    combatScenes:["s1.mfsy.biker-thugs","s1.mfsy.charlie-harbor"],
    observeActors:{AKIR:"YKC",CHRL:"BIK_L"},voiceCounts:{"01CBK":12},
  }]],
  "workday-lunch": [false,true].map(natural=>["s1.mfsy.workday-lunch.scene","mfsy","MFSY",{}, {
    label:natural?"complete":"cancel",natural,frames:natural?[90,180,300,420]:[180],geometryMask:true,
  }]),
  "goro-appointment": [
    ...[false,true].map(natural=>["s1.mfsy.goro-job-appointment.scene","mfsy","MFSY",{}, {
      label:natural?"complete":"cancel",natural,frames:natural?[100,500,900,1500,1850]:[100],
      ...(natural?{observeActors:{AKIR:"YKC",GORO:"KMB_L",HINA:"MIB_L"},voiceCounts:{"01GORA":22}}:{}),
      verifyView:true,
      residentPlacements:[{id:"runtime-GHAK",distance:3,yOffset:0},{id:"static-door-14",distance:3,yOffset:1}],
    }]),
  ],
  "warning-letter-yada": [["s1.mfsy.warning-letter.scene","mfsy","MFSY",{}, {
    label:"yada-grip",frames:[470],isolatedStage:true,objects:["ROOM","KMEM"],
    props:[{tag:"KMEM",shown:[435,1030],attachments:[[435,"attach","TMRA"],[550,"attach","AKIR"],[760,"attach","AKIR"],[1030,"detach"]],closeupObject:true,reverse:true}],
  }]],
  "warning-letter-props": [
    ...[false,true].map(natural=>["s1.mfsy.warning-letter.scene","mfsy","MFSY",{}, {
      label:natural?"complete":"cancel",natural,frames:natural?[90,230,470,600,810,1080]:[90],
      isolatedStage:true,objects:natural?["ROOM","KYUF","KMEM"]:["ROOM","KYUF"],
      props:[
        {tag:"KYUF",shown:[10,195],attachments:[[10,"attach","TMRA"],[195,"detach"]]},
        {tag:"KMEM",shown:[435,1030],attachments:[[435,"attach","TMRA"],[550,"attach","AKIR"],[760,"attach","AKIR"],[1030,"detach"]],closeupObject:true},
      ],
    }]),
  ],
  "allowance-door": [
    ...[false, true].map(natural => ["s1.jomo.first-allowance.scene", "interior", "JOMO", {}, {
      label: natural ? "complete" : "cancel", natural,
      frames: natural ? [15, 45, 90, 180, 350] : [45], objects: ["DOR0"], borrowedActorTag: "DOR0",
    }]),
  ],
  "chase-doors": [
    ...[false, true].map(natural => ["s1.d000.jimmy-knock.scene", "dobuita", "D000", {}, {
      label: natural ? "complete" : "cancel", natural,
      frames: natural ? [90, 180, 350, 500] : [180],
      objects: ["DOR1", "DOR2"], replacedTransition: "d000-door-25-to-daza-reverse-matched",
    }]),
  ],
  dismissal: [
    ...[false,true].map(natural=>["s1.mfsy.yada-dismissal.scene","mfsy","MFSY",{}, {
      label:natural?"complete":"cancel",natural,frames:natural?[90,300,650,1000,1600]:[300],
      objects:["DOOR","ROOM"],isolatedStage:true,observeActors:{AKIR:"YKC",TMRA:"KWD_L"},
    }]),
  ],
  hiring: [
    ...[false,true].map(natural=>["s1.mfsy.yada-job-interview.scene","mfsy","MFSY",{}, {
      label:natural?"complete":"cancel",natural,frames:natural?[90,300,650,800]:[300],
      objects:["DOOR","ROOM"],isolatedStage:true,observeActors:{AKIR:"YKC",TMRA:"KWD_L"},
    }]),
    ...[false,true].map(natural=>["s1.mfsy.mark-job-introduction.scene","mfsy","MFSY",{}, {
      label:natural?"complete":"cancel",natural,frames:natural?[180,500,1000,1600,1900]:[500],
      // Mark's speech begins after this cancellation point; verify it on the full run.
      objects:["FORK"],observeActors:{AKIR:"YKC",TMRA:"KWD_L",...(natural?{MARK:"GIC_L"}:{})},
    }]),
  ],
  "leased-rooms": [
    ...[false,true].flatMap(natural=>[
      ["s1.mfsy.warning-letter.scene","mfsy","MFSY",{}, {
        label:natural?"complete":"cancel",natural,frames:natural?[180,600,1000,1300]:[300],
        isolatedStage:true,objects:["ROOM"],
      }],
      ["s1.mfbt.gui-after-battle.scene","mfbt","MFBT",{}, {
        label:natural?"complete":"cancel",natural,frames:natural?[180,600,1000,1450]:[300],
        isolatedStage:true,retainEnvironment:true,objects:["ROOM"],
      }],
    ]),
  ],
  chase: [
    ...[false,true].map(natural=>["s1.d000.jimmy-knock.scene","dobuita","D000",{}, {
      label:natural?"complete":"cancel",natural,frames:natural?[90,180,350,500]:[220],
      ...(natural?{observeActors:{AKIR:"YKC",JIMY:"JIM"},voiceCounts:{"01JIMB":6}}:{}),
    }]),
    ["s1.d000.jimmy-caught.scene","dobuita","D000",{JIMY:"JIM"},{
      natural:true,frames:[450,620],objects:["CAR_"],voiceCounts:{"01JIM":6},
    }],
    ["s1.d000.jimmy-escaped.scene","dobuita","D000",{}, {
      natural:true,frames:[100,220,300],objects:["CAR_"],voiceCounts:{"01JIM":2},
    }],
    ["s1.daza.jimmy-interrogation.scene","daza","DAZA",{}, {
      natural:true,frames:[150,450,850,1250,1800],observeActors:{AKIR:"YKC",JIMY:"JIM"},voiceCounts:{A0174:25},
    }],
  ],
  arcade: [
    ...[false,true].map(natural=>["s1.dgct.chai-intro.scene","arcade","DGCT",{}, {
      label:natural?"complete":"cancel",natural,frames:natural?[180,430,700,1050,1500,1950]:[430],
      ...(natural?{observeActors:{AKIR:"YKC",CHAI:"CHA_M"},voiceCounts:{A0172:11}}:{}),
    }]),
    ["s1.dgct.chai-victory.scene","arcade","DGCT",{NITO:"GAT_L"},{natural:true,frames:[500,950]}],
    ["s1.dgct.chai-rescue.scene","arcade","DGCT",{FUKU:"FUB"},{natural:true,frames:[],voiceCounts:{A0172A:3}}],
  ],
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
      const previousViewport=page.viewportSize();
      if(options.viewport){
        await page.setViewportSize(options.viewport);
        // The test enables the developer panel; review the normal game view
        // by using its existing visibility setting rather than covering combat.
        await page.evaluate(()=>{const el=document.getElementById("show-debug");window.storyProbe.previousDebugVisibility=el.checked;el.checked=false;el.dispatchEvent(new Event("change",{bubbles:true}));});
      }
      await page.evaluate(async world => { await window.storyProbe.lifecycle.travelToWorld(world); }, world);
      await page.waitForFunction(() => window.storyProbe.lifecycle.worldRuntime.ready);
      const prior = await page.evaluate(() => {
        const p = window.storyProbe, c = p.lifecycle.getController();
        return { position: c.collider.position.asArray(), firstPerson: c.firstPerson,
          avatar: p.lifecycle.playerRuntime.activeCharacterId,
          view: [c.cameraYaw,c.cameraPitch,c.cameraDistance] };
      });
      await page.evaluate(({ id, area, actors, isolatedStage, retainEnvironment, replacedTransition, borrowedActorTag }) => {
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
            if (borrowedActorTag && !review.borrowed) {
              const record = runtime.sceneObjects.objects.get(borrowedActorTag);
              if (!record?.explorationSnapshot) throw Error(`Missing borrowed scene object ${borrowedActorTag}`);
              review.borrowed = {root:record.root, snapshot:record.explorationSnapshot};
            }
            if (replacedTransition) {
              const matches = [...runtime.sceneObjects.replacedWorldRoots].filter(([root]) =>
                root.metadata?.interactiveMapTransition?.transition?.id === replacedTransition);
              if (matches.length !== 1) throw Error(`Expected one replaced world transition: ${replacedTransition}`);
              const [root, snapshot] = matches[0];
              review.replacement ||= { root, wasEnabled: snapshot.enabled, frames: 0, visibleDuringFilm: 0 };
              review.replacement.frames++;
              if (root.isEnabled(false)) review.replacement.visibleDuringFilm++;
            }
            if (isolatedStage && runtime.mapLayers?.active?.residentIsolation) {
              review.stageRuntime = runtime;
              review.stageSnapshots ||= runtime.mapLayers.active.residentIsolation.snapshots;
              const sample = review.stage ||= { frames: 0, roots: 0, hiddenActors: new Set(), violations: new Set() };
              sample.frames++;
              sample.roots = runtime.mapLayers.worldRoots.length;
              if (Boolean(runtime.mapLayers.releaseEnvironmentIsolation) === Boolean(retainEnvironment)) {
                sample.violations.add("incorrect environment ownership");
              }
              for (const root of runtime.mapLayers.worldRoots) {
                if (root.isEnabled()) sample.violations.add(`resident geometry: ${root.name}`);
              }
              const scheduled = p.lifecycle.scheduledActors;
              const lease = scheduled.activityActorSuppressions.get(runtime.mapLayers);
              if (!lease) sample.violations.add("missing actor isolation lease");
              for (const entry of scheduled.entries.filter(e => lease?.codes.has(e.definition.actorCode))) {
                sample.hiddenActors.add(entry.definition.actorCode);
                for (const root of [entry.root, ...entry.modelRoots.values(), entry.secondaryObject?.root].filter(Boolean)) {
                  if (root.isEnabled()) sample.violations.add(`ambient actor: ${entry.definition.actorCode}`);
                }
              }
            }
            for (const voice of runtime.audio.active?.elements || []) {
              if (voice.kind === "voice" && !voice.audio.paused && voice.audio.currentTime > 0) {
                review.voices.add(voice.cue.speakerId);
                review.voiceIds.add(voice.command.audio.voiceId);
              }
            }
            for (const [tag, object] of new Map([...runtime.sceneObjects?.objects || [],...runtime.attachedObjects?.objects || []])) {
              if (!object.root.getChildMeshes().some(mesh => mesh.isEnabled() && scene.isActiveMesh(mesh))) continue;
              const sample = review.objects[tag] ||= { frames: 0, positions: new Set(), rotations: new Set() };
              sample.frames++;
              sample.positions.add(JSON.stringify(object.root.getAbsolutePosition().asArray()));
              sample.rotations.add(JSON.stringify(object.root.rotationQuaternion?.asArray()||object.root.rotation.asArray()));
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
      }, { id, area, actors:{...options.observeActors,...actors}, isolatedStage: options.isolatedStage, retainEnvironment: options.retainEnvironment, replacedTransition: options.replacedTransition, borrowedActorTag: options.borrowedActorTag });
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
          if(options.objectCloseups&&!state.done&&frame===options.frames[0]) for(const tag of options.objectCloseups){
            const observed=await page.evaluate(async ({tag,options})=>{
              const {frameSceneRoot}=await import("/tests/e2e/cutscene-surface-framing.js");
              const p=window.storyProbe,root=p.director.activeCutscene.packageRuntime.sceneObjects.objects.get(tag)?.root;
              if(!root)throw Error(`Missing owned object ${tag}`);
              p.faceReview.closeupFrames=0;
              p.faceReview.restoreCamera=frameSceneRoot(root,()=>p.faceReview.closeupFrames++,{distance:4,yOffset:.65,...options});
              return {enabled:root.isEnabled(),meshCount:root.getChildMeshes().length,position:root.getAbsolutePosition().asArray()};
            },{tag,options:options.objectCloseupOptions||{}});
            expect(observed.enabled).toBe(true);expect(observed.meshCount).toBeGreaterThan(0);
            try{
              await page.waitForFunction(()=>window.storyProbe.faceReview.closeupFrames>=2);
              await page.screenshot({path:testInfo.outputPath(`diagnostic-${label}-${tag}.png`)});
            } finally { await page.evaluate(()=>window.storyProbe.faceReview.restoreCamera()); }
          }
          if(options.inspectLightMeshes&&!state.done&&frame===options.frames[0]){
            await page.evaluate(async()=>{
              const {frameSceneRoot}=await import("/tests/e2e/cutscene-surface-framing.js"),p=window.storyProbe;
              const root=p.director.activeCutscene.packageRuntime.sceneObjects.objects.get("BIK0").root;
              p.faceReview.closeupFrames=0;
              p.faceReview.restoreCamera=frameSceneRoot(root,()=>p.faceReview.closeupFrames++,{localCamera:[3,3,-6],localTarget:[0,.4,-2]});
            });
            try{
              await page.waitForFunction(()=>window.storyProbe.faceReview.closeupFrames>=3);
              await page.screenshot({path:testInfo.outputPath(`diagnostic-${label}-lights-on.png`)});
              await page.evaluate(()=>{const p=window.storyProbe;p.faceReview.closeupFrames=0;for(const [tag,o] of p.director.activeCutscene.packageRuntime.sceneObjects.objects)if(tag.startsWith("RY"))o.root.setEnabled(false);});
              await page.waitForFunction(()=>window.storyProbe.faceReview.closeupFrames>=3);
              await page.screenshot({path:testInfo.outputPath(`diagnostic-${label}-lights-off.png`)});
            } finally { await page.evaluate(()=>{const p=window.storyProbe;for(const [tag,o] of p.director.activeCutscene.packageRuntime.sceneObjects.objects)if(tag.startsWith("RY"))o.root.setEnabled(true);p.faceReview.restoreCamera();}); }
          }
          if(options.geometryMask&&!state.done&&frame===180){
            const masks=await page.evaluate(()=>{
              const p=window.storyProbe,r=p.director.activeCutscene.packageRuntime;
              p.faceReview.geometrySnapshots=r.mapLayers.active.maskedGeometry.map(({mesh,indices,enabled})=>({mesh,indices,enabled}));
              return p.faceReview.geometrySnapshots.map(({mesh,indices})=>({batched:!!indices,changed:indices&&indices.some((v,i)=>mesh.getIndices()[i]!==v)}));
            });
            expect(masks.length).toBeGreaterThan(0);expect(masks.every(m=>m.batched&&m.changed)).toBe(true);
          }
          if(options.residentPlacements&&!state.done&&frame===options.frames[0]) for(const placement of options.residentPlacements){
            const roots=await page.evaluate(id=>{
              const scene=window.storyProbe.lifecycle.scene;
              return [...scene.transformNodes,...scene.meshes].filter(root=>root._runtimePlacementRecord?.id===id).map(root=>({
                enabled:root.isEnabled(),position:root.getAbsolutePosition().asArray(),
                meshes:root.getChildMeshes(false).length+(scene.meshes.includes(root)?1:0),
              }));
            },placement.id);
            expect(roots.length,placement.id).toBeGreaterThan(0);
            expect(roots.some(root=>root.enabled&&root.meshes>0),placement.id).toBe(true);
            await page.evaluate(async ({id,distance,yOffset})=>{
              const {frameSceneRoot}=await import("/tests/e2e/cutscene-surface-framing.js");
              const p=window.storyProbe,scene=p.lifecycle.scene;
              const root=[...scene.transformNodes,...scene.meshes].find(node=>node._runtimePlacementRecord?.id===id&&node.isEnabled());
              p.faceReview.closeupFrames=0;p.faceReview.placement=root;
              p.faceReview.restoreCamera=frameSceneRoot(root,()=>p.faceReview.closeupFrames++,{distance,yOffset});
            },placement);
            try {
              await page.waitForFunction(()=>window.storyProbe.faceReview.closeupFrames>=2);
              const active=await page.evaluate(()=>{
                const p=window.storyProbe,scene=p.lifecycle.scene,root=p.faceReview.placement;
                return [root,...root.getChildMeshes(false)].some(mesh=>scene.meshes.includes(mesh)&&mesh.isEnabled()&&scene.isActiveMesh(mesh));
              });
              expect(active,placement.id).toBe(true);
              await page.screenshot({path:testInfo.outputPath(`diagnostic-${label}-${placement.id}.png`)});
            } finally { await page.evaluate(()=>window.storyProbe.faceReview.restoreCamera()); }
          }
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
          for (const propSpec of options.props || (options.prop ? [options.prop] : [])) if (!state.done) {
            const prop = await page.evaluate(tag => {
              const p = window.storyProbe, r = p.director.activeCutscene.packageRuntime;
              const root = (r.sceneObjects.objects.get(tag)||r.attachedObjects.objects.get(tag)).root;
              const frame = r.activityRuntime.active.currentFrame;
              const binding = r.attachedObjects.active.bindings.filter(b=>b.actorTag===tag&&b.frame<=frame).at(-1);
              return { frame, enabled: root.isEnabled(), action: binding?.action || null,
                parent: binding?.parentActorTag,controlId:binding?.controlId,position: root.getAbsolutePosition().asArray() };
            }, propSpec.tag);
            console.info(`${label} prop`, JSON.stringify(prop));
            expect(prop.enabled).toBe(prop.frame >= propSpec.shown[0] && prop.frame < propSpec.shown[1]);
            const timeline=propSpec.attachments||[[propSpec.shown[0],"attach",propSpec.parent],[propSpec.detach,"detach"]];
            const expected=timeline.filter(([frame])=>frame<=prop.frame).at(-1);
            expect(prop.action).toBe(expected?.[1]||null);
            if(prop.action==="attach")expect(prop.parent).toBe(expected[2]);
            if((propSpec.closeup||propSpec.closeupObject)&&prop.enabled&&prop.action==="attach"){
              await page.evaluate(async ({tag,parent,controlId,objectCloseup,reverse})=>{
                const {frameCutsceneObject,frameCutsceneSurface}=await import("/tests/e2e/cutscene-surface-framing.js");
                const p=window.storyProbe,r=p.director.activeCutscene.packageRuntime;
                p.faceReview.closeupFrames=0;
                if(objectCloseup) p.faceReview.restoreCamera=frameCutsceneObject(r,tag,()=>p.faceReview.closeupFrames++,{reverse});
                else {
                  const side=controlId===12?"left":"right";
                  if(!r.presentation.hands.active.hands.get(parent).sides[side].detailedActive)throw Error("Missing detailed hand during transfer");
                  p.faceReview.restoreCamera=frameCutsceneSurface(r,"hand",parent,side,()=>p.faceReview.closeupFrames++);
                }
              },{...prop,tag:propSpec.tag,objectCloseup:!!propSpec.closeupObject,reverse:!!propSpec.reverse});
              try{
                await page.waitForFunction(()=>window.storyProbe.faceReview.closeupFrames>=2);
                await page.screenshot({path:testInfo.outputPath(`diagnostic-${label}-${propSpec.tag}-${frame}-${prop.parent}.png`)});
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
            ...(r.stage ? { stage: { frames: r.stage.frames, roots: r.stage.roots,
              hiddenActors: [...r.stage.hiddenActors], violations: [...r.stage.violations] } } : {}),
            samples: Object.fromEntries(Object.entries(r.samples).map(([tag, s]) => [tag,
              { code: s.code, firstFrame: s.firstFrame, frames: s.frames, mouths: s.mouths.size, vertices: s.vertices.size, audio: s.audio.size }])),
            objects: Object.fromEntries(Object.entries(r.objects).map(([tag, s]) => [tag, { frames: s.frames, positions: s.positions.size,rotations:s.rotations.size }])) };
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
      if(options.geometryMask)expect(await page.evaluate(()=>window.storyProbe.faceReview.geometrySnapshots.every(({mesh,indices,enabled})=>
        mesh.isDisposed()||(indices?indices.every((v,i)=>mesh.getIndices()[i]===v):mesh.isEnabled()===enabled)))).toBe(true);
      if(options.isolatedStage){
        const stage=await page.evaluate(()=>{
          const p=window.storyProbe,r=p.faceReview,s=r.stage,m=r.stageRuntime?.mapLayers;
          return {frames:s?.frames,roots:s?.roots,violations:[...s?.violations||[]],
            actorLease:m?.releaseActorIsolation,weatherLease:m?.releaseEnvironmentIsolation,
            unreturned:(r.stageSnapshots||[]).filter(([root,enabled])=>!root.isDisposed()&&root.isEnabled()!==enabled).map(([root])=>root.name),
            suppressions:p.lifecycle.scheduledActors.activityActorSuppressions.size};
        });
        expect(stage.frames).toBeGreaterThan(2);expect(stage.roots).toBeGreaterThan(0);
        expect(stage.violations).toEqual([]);expect(stage.unreturned).toEqual([]);
        expect(stage.actorLease).toBeNull();expect(stage.weatherLease).toBeNull();expect(stage.suppressions).toBe(0);
      }
      if(options.backdrop)expect(await page.evaluate(()=>{
        const r=window.storyProbe.faceReview.stageRuntime;
        return {owner:r.scrollSprites.owner,visible:r.scrollSprites.resources.some(s=>s.layer.isEnabled),
          lighting:r.mapLayers.lightingPresetIndex,isolation:r.mapLayers.releaseEnvironmentIsolation};
      })).toEqual({owner:null,visible:false,lighting:null,isolation:null});
      if(options.telephone)expect(await page.evaluate(()=>{
        const r=window.storyProbe.faceReview;
        return r.receiver && (r.receiver.isDisposed() || r.receiver.parent===r.receiverParent);
      })).toBe(true);
      if(options.replacedTransition){
        const replacement=await page.evaluate(()=>{
          const r=window.storyProbe.faceReview.replacement;
          return r&&{frames:r.frames,visibleDuringFilm:r.visibleDuringFilm,restored:r.root.isEnabled(false)===r.wasEnabled};
        });
        expect(replacement?.frames).toBeGreaterThan(2);
        expect(replacement.visibleDuringFilm).toBe(0);
        expect(replacement.restored).toBe(true);
      }
      if(options.borrowedActorTag){
        const borrowed=await page.evaluate(()=>{
          const value=window.storyProbe.faceReview.borrowed;
          if(!value)return null;
          const {root,snapshot}=value;
          return {enabled:root.isEnabled(),expectedEnabled:snapshot.enabled,position:root.position.asArray(),
            expectedPosition:snapshot.position,rotation:root.rotation.asArray(),expectedRotation:snapshot.rotation,
            scaling:root.scaling.asArray(),expectedScaling:snapshot.scaling,leased:snapshot.leased};
        });
        expect(borrowed).toBeTruthy();expect(borrowed.leased).toBe(false);
        expect(borrowed.enabled).toBe(borrowed.expectedEnabled);
        for(const key of ["position","rotation","scaling"])
          borrowed[key].forEach((value,index)=>expect(value).toBeCloseTo(borrowed[`expected${key[0].toUpperCase()+key.slice(1)}`][index],5));
      }
      for (const tag of options.objects || []) {
        expect(await page.evaluate(tag => window.storyProbe.faceReview.objects[tag]?.frames || 0, tag)).toBeGreaterThan(2);
      }
      const restored = await page.evaluate(() => {
        const p = window.storyProbe, c = p.lifecycle.getController();
        return { position: c.collider.position.asArray(), firstPerson: c.firstPerson,
          avatar: p.lifecycle.playerRuntime.activeCharacterId, leases: p.lifecycle.scheduledActors.activityActorOwners.size,
          view: [c.cameraYaw,c.cameraPitch,c.cameraDistance] };
      });
      expect(restored.leases).toBe(0); expect(restored.firstPerson).toBe(prior.firstPerson);
      expect(restored.avatar).toBe(prior.avatar);
      restored.position.forEach((v, i) => expect(v).toBeCloseTo(prior.position[i], 3));
      if(options.verifyView)restored.view.forEach((v,i)=>expect(v).toBeCloseTo(prior.view[i],4));
      // Diagnostic combat presentation only: actual trigger/result progression
      // is covered separately by story-harbor-bikers.js.
      for(const combatId of options.combatScenes||[]){
        const props=await page.evaluate(async id=>{
          const p=window.storyProbe,tx={area:"MFSY"};
          // This is a presentation-only probe, not the natural trigger that
          // normally places the player at the alley before combat begins.
          p.lifecycle.resetPlayer(p.lifecycle.vectorFromArray([-92,0,25]),0,{persist:false});
          p.faceReview.combatTransaction=tx;
          await p.regions.controller.presentation.adapters.showCombat({id,token:"diagnostic-props",ready:true},tx);
          const roots=[...p.combatRuntime.active.objects.objects].map(([tag,object])=>({tag,root:object.root}));
          p.faceReview.combatRoots=roots;
          p.faceReview.combatMaterials=[...new Set(roots.flatMap(({root})=>root.getChildMeshes().map(mesh=>mesh.material).filter(Boolean)))];
          p.faceReview.combatFrame=p.lifecycle.scene.getFrameId();
          return roots.map(({tag,root})=>({tag,enabled:root.isEnabled(),meshes:root.getChildMeshes().length}));
        },combatId);
        expect(props.map(p=>p.tag).sort()).toEqual(["BIK0","BIK1","BIK2","RY00","RY01","RY10","RY11","RY20","RY21"]);
        expect(props.every(p=>p.enabled&&p.meshes>0)).toBe(true);
        await page.waitForFunction(()=>window.storyProbe.lifecycle.scene.getFrameId()>window.storyProbe.faceReview.combatFrame+2);
        await page.screenshot({path:testInfo.outputPath(`diagnostic-${combatId.replaceAll(".","-")}.png`)});
        if(options.cameraSeparation){
          const separation=await page.evaluate(async()=>{
            const {Vector3,Matrix}=await import("/node_modules/@babylonjs/core/index.js"),p=window.storyProbe;
            const scene=p.lifecycle.scene,camera=scene.activeCamera,engine=scene.getEngine(),e=p.combatRuntime.encounter;
            const project=actor=>Vector3.Project(actor.position().add(new Vector3(0,1,0)),Matrix.Identity(),scene.getTransformMatrix(),camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight()));
            const player=project(e.playerActor),target=project(e.enemyActor);
            return {player:player.asArray(),target:target.asArray(),width:engine.getRenderWidth()};
          });
          expect(Math.abs(separation.player[0]-separation.target[0])).toBeGreaterThan(separation.width*.15);
          expect(separation.target[0]).toBeGreaterThan(0);expect(separation.target[0]).toBeLessThan(separation.width);
        }
        const disposed=await page.evaluate(()=>{
          const p=window.storyProbe;
          p.combatRuntime.finish(p.faceReview.combatTransaction);
          return {roots:p.faceReview.combatRoots.map(({root})=>root.isDisposed()),
            materials:p.faceReview.combatMaterials.map(material=>!p.lifecycle.scene.materials.includes(material))};
        });
        expect(disposed.roots.every(Boolean)).toBe(true);expect(disposed.materials.every(Boolean)).toBe(true);
      }
      const after = await saved();
      expect(after.character.storyFlags).toEqual(before.character.storyFlags);
      expect(after.character.yen).toBe(before.character.yen);
      expect(after.inventory).toEqual(before.inventory);
      if(options.viewport&&previousViewport){
        await page.evaluate(()=>{const el=document.getElementById("show-debug");el.checked=window.storyProbe.previousDebugVisibility;el.dispatchEvent(new Event("change",{bubbles:true}));});
        await page.setViewportSize(previousViewport);
      }
    }
  } finally {
    await page.evaluate(() => { window.storyProbe.restoreFaceReviewDispatch(); });
  }
}
