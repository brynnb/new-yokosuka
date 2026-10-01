import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { playbackExpectationForCutscene } from "./cutscene-preview-timeout.js";
import { assertPlaywrightRenderer } from "../../scripts/testing/playwright-renderer.mjs";
import { verifiedContinuingMediaRangeAbort } from "./cutscene-preview-media.js";

export async function runCutscenePreview({
  page,
  cutscene,
  completionTimeout,
  sampleOnly = false,
  expectedMusicTrack = null,
  verifyReplay = false,
  verifyMusicAcrossActivities = true,
  inspectPlayback = null,
  testInfo = null,
}) {
  const browserErrors = [];
  const failedResources = [];
  const expectedPlayback = playbackExpectationForCutscene(cutscene.id);
  const report = {
    cutsceneId: cutscene.id,
    label: cutscene.label,
    mode: sampleOnly ? "launch-progress-cancel" : "complete-playback",
    expectedPlayback,
    verification: { packaged: true, fullBrowserPlayback: false, visuallyReviewed: false },
    reachedPlayback: false,
    advanced: false,
    returnedToMenu: false,
    navigations: [],
    authRequests: [],
    expectedAborts: [],
    mediaRequests: [],
    verifiedMediaRangeAborts: [],
    browserErrors,
    failedResources,
  };
  const runtimeModuleUrls = {};
  const mediaRequests = new Map();
  let cancelling = false;
  const stage = value => {
    report.stage = value;
    if (testInfo) console.info(`[cutscene ${cutscene.id}] ${value}`);
  };
  page.on("framenavigated", frame => {
    if (frame === page.mainFrame()) report.navigations.push(frame.url());
  });
  page.on("request", request => {
    if (request.resourceType() === "media") {
      const record = { url: request.url(), range: request.headers().range, stage: report.stage };
      mediaRequests.set(request, record);
      report.mediaRequests.push(record);
    }
    if (/\.AUTH(?:[?#]|$)/i.test(request.url())) report.authRequests.push(request.url());
    const pathname = new URL(request.url()).pathname;
    if ([
      "/play/events/NativeAseqActivityRuntime.js",
      "/play/events/NativeAseqHandPresentation.js",
      "/play/events/NativeScriptedEventRuntime.js",
      "/play/cutscenes/NativeCutsceneDirector.js",
      "/play/audio/MusicDirector.js",
      "/play/characters/ScheduledActorRuntime.js",
      "/play/characters/NativeClothSimulation.js",
      "/src/state.js",
      "/play/world/WorldEnvironmentRuntime.js",
    ].includes(pathname)) runtimeModuleUrls[pathname] = request.url();
  });
  page.on("pageerror", error => {
    browserErrors.push(`pageerror: ${error.message}`);
  });
  page.on("console", message => {
    if (message.type() !== "error") return;
    // The account shell polls its optional status endpoint. A plain Vite
    // preview deliberately has no backend, so this is not a cutscene failure.
    if (message.text().startsWith("Failed to load resource:")) return;
    // Babylon VideoTexture reports Chrome's expected AbortError as an error
    // when an attract-screen video is paused during world teardown. It is not
    // a thrown page error and is unrelated to cutscene playback.
    if (
      message.text().startsWith("BJS - ")
      && message.text().includes(
        "The play() request was interrupted by a call to pause().",
      )
    ) return;
    const location = message.location();
    const source = location.url
      ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})`
      : "";
    browserErrors.push(`console: ${message.text()}${source}`);
  });
  page.on("response", response => {
    const media = mediaRequests.get(response.request());
    if (media) {
      media.status = response.status();
      media.contentRange = response.headers()["content-range"];
    }
    if (
      response.status() >= 400 &&
      !response.url().endsWith("/api/status")
    ) {
      failedResources.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", request => {
    if (new URL(request.url()).pathname === "/api/status") return;
    const failure = request.failure()?.errorText || "network failure";
    const media = mediaRequests.get(request);
    if (media) { media.failure = failure; media.failureStage = report.stage; media.failureAt = Date.now(); }
    // Cancellation intentionally aborts outstanding requests. Keep genuine
    // startup/network failures, which the HTTP response listener cannot see.
    if (failure === "net::ERR_ABORTED" && (
      cancelling || /\/music\/shenmue-main-menu\.ogg$/.test(new URL(request.url()).pathname)
    )) {
      // Disposing the menu cancels its streaming music, independently of the
      // selected cutscene. Retain the evidence but do not label it asset loss.
      report.expectedAborts.push(request.url());
      return;
    }
    failedResources.push(`${failure} ${request.url()}`);
  });
  page.on("requestfinished", request => {
    const media = mediaRequests.get(request);
    if (media) media.finishedAt = Date.now();
  });

  try {
    stage("opening-menu");
    await page.goto("/play/");
    const introPrompt = page.getByLabel("Open the New Yokosuka menu");
    // Headed runs can receive a real key while the splash is mounting. Either
    // valid entry state is fine; do not wait for a prompt already dismissed.
    await expect(introPrompt.or(page.locator(".account-shell-welcome"))).toBeVisible({ timeout: 120_000 });
    // The production prompt listens at window capture level and removes itself
    // immediately. Keyboard input exercises that path without retrying a click
    // against the intentionally disappearing element.
    if (await introPrompt.isVisible()) await page.keyboard.press("Enter");
    // Previews are internal-only: enter the existing selector through the dev
    // module, without reintroducing a public button or a production debug hook.
    await page.evaluate(async (moduleUrls) => {
      const { useAccountStore } = await import('/play/account/react/accountStore.js');
      const activityUrl = moduleUrls["/play/events/NativeAseqActivityRuntime.js"];
      const directorUrl = moduleUrls["/play/cutscenes/NativeCutsceneDirector.js"];
      const eventsUrl = moduleUrls["/play/events/NativeScriptedEventRuntime.js"];
      if (!activityUrl || !directorUrl || !eventsUrl) throw new Error("Cutscene runtime modules were not observed loading");
      // Preserve Vite's versioned module URLs: importing a bare path after a
      // code edit can create a second class that the application never uses.
      const { NativeAseqActivityRuntime } = await import(activityUrl);
      const { NativeCutsceneDirector } = await import(directorUrl);
      const { NativeScriptedEventRuntime } = await import(eventsUrl);
      const { NativeAseqHandPresentation } = await import(moduleUrls["/play/events/NativeAseqHandPresentation.js"]);
      const { NativeClothSimulation } = await import(moduleUrls["/play/characters/NativeClothSimulation.js"]);
      const clothInputs = new WeakMap();
      const advanceCloth = NativeClothSimulation.prototype.advance;
      NativeClothSimulation.prototype.advance = function(deltaSeconds, inputs) {
        clothInputs.set(this, inputs);
        return advanceCloth.call(this, deltaSeconds, inputs);
      };
      // Observe the real adapters without replacing their results or rendering.
      // Program transport intentionally has no aggregate elapsed-time field;
      // counting actual accepted AUTH updates avoids relying on that debug UI.
      const probe = window.__cutsceneBrowserProbe = {
        acceptedUpdates: 0, activity: null, activities: [], settlements: [], events: [], musicEvents: [], musicPlayback: [], backgroundMedia: [], scheduledActorSelections: [], scheduledActorPreparations: [],
      };
      probe.handCommands = [];
      let activeHands = null;
      const beginHands = NativeAseqHandPresentation.prototype.begin;
      NativeAseqHandPresentation.prototype.begin = function(...args) {
        const result = beginHands.apply(this, args);
        activeHands = this;
        return result;
      };
      const playHand = NativeAseqHandPresentation.prototype.play;
      NativeAseqHandPresentation.prototype.play = function(owner, command) {
        const accepted = playHand.call(this, owner, command);
        activeHands = this;
        probe.handCommands.push({ name: command.name, actorTag: command.actorTag,
          side: command.side, accepted, poseTableOffset: command.poseTableOffset });
        return accepted;
      };
      window.__readCutsceneHands = () => [...(activeHands?.active?.hands || [])].flatMap(([actorTag, hand]) =>
        Object.entries(hand.sides).map(([side, value]) => ({
          actorTag, side, detailed: value.detailedActive, enabled: value.side.root?.isEnabled() || false,
          nonzeroPoseWords: Array.from(value.side.pose.current).filter(value => value !== 0).length,
          pose: Array.from(value.side.pose.current),
          componentRotationRaw: value.side.componentRotationRaw || [0, 0, 0],
          attachmentMatrix: value.side.root?._mt5CharacterWorldMatrices?.get(value.side.primaryNode?.addr),
          bodyPose: Array.from(value.bodyPose.current),
        })));
      // Render-only isolation for investigating an attachment seam. Toggle
      // only patched body draw meshes, never the wrist transform or its
      // detailed child. Normal playback tests do not invoke this hook.
      window.__setCutsceneHandBodyVisible = (actorTag, side, visible) => {
        const value = activeHands?.active?.hands.get(actorTag)?.sides[side];
        const patches = value?.bodySurface?.patches || [];
        for (const { mesh } of patches) mesh.isVisible = visible;
        return patches.map(({ mesh }) => ({ name: mesh.name, indices: mesh.getTotalIndices() }));
      };
      const notifySettled = NativeScriptedEventRuntime.prototype.notifySettled;
      NativeScriptedEventRuntime.prototype.notifySettled = function(kind, result) {
        probe.settlements.push({ kind, status: result.status, programId: result.programId, reason: result.reason });
        return notifySettled.call(this, kind, result);
      };
      const startActivity = NativeAseqActivityRuntime.prototype.startActivity;
      NativeAseqActivityRuntime.prototype.startActivity = async function(...args) {
        const result = await startActivity.apply(this, args);
        probe.activities.push({ id: result.activityId, slot: result.slot, durationFrames: result.durationFrames });
        // Pair the new occurrence with its own frame immediately. Otherwise a
        // between-shot sample can label the previous shot's final frame as the
        // new shot's late image and never capture the real late shot.
        probe.activity = {
          id: result.activityId, frame: this.active.currentFrame,
          durationFrames: result.durationFrames,
        };
        return result;
      };
      const stopActivity = NativeAseqActivityRuntime.prototype.stopActivity;
      NativeAseqActivityRuntime.prototype.stopActivity = function(detail) {
        const active = this.active;
        const result = stopActivity.call(this, detail);
        if (active && result === true) {
          const occurrence = probe.activities.at(-1);
          if (occurrence?.id === active.record.activityId) {
            occurrence.finalFrame = active.currentFrame;
            occurrence.stopReason = detail?.reason;
          }
        }
        return result;
      };
      const scheduledUrl = moduleUrls["/play/characters/ScheduledActorRuntime.js"];
      if (!scheduledUrl) throw new Error("Scheduled actor runtime module was not observed loading");
      const { ScheduledActorRuntime } = await import(scheduledUrl);
      const prepareActors = ScheduledActorRuntime.prototype.prepareActivityActors;
      ScheduledActorRuntime.prototype.prepareActivityActors = async function(codes, options) {
        const records = this.entries.filter(entry => codes.includes(entry.definition.actorCode)).map(entry => ({
          actorCode: entry.definition.actorCode, modelCode: entry.definition.modelCode,
          loadedBefore: [...entry.models.keys()],
        }));
        const accepted = await prepareActors.call(this, codes, options);
        for (const record of records) {
          const entry = this.entries.find(entry => entry.definition.actorCode === record.actorCode);
          record.loadedAfter = [...entry.models.keys()];
        }
        probe.scheduledActorPreparations.push(...records);
        return accepted;
      };
      const beginActors = ScheduledActorRuntime.prototype.beginActivityActors;
      let selectedActorRuntime = null;
      ScheduledActorRuntime.prototype.beginActivityActors = function(owner, codes) {
        selectedActorRuntime = this;
        const records = this.entries.filter(entry => codes.includes(entry.definition.actorCode)).map(entry => ({
          actorCode: entry.definition.actorCode,
          instanceId: entry.definition.instanceId,
          modelCode: entry.definition.modelCode,
          activityOnly: Boolean(entry.definition.activityOnly),
          authoritative: Boolean(entry.definition.authoritative),
          loadedModels: [...entry.models.keys()],
          pendingModels: [...entry.pendingModels.keys()],
          defaultModel: entry.defaultModel?.modelCode || null,
          enabledModels: [...entry.models.values()].filter(model => model.root.isEnabled()).map(model => model.modelCode),
        }));
        probe.scheduledActorSelections.push(...records);
        return beginActors.call(this, owner, codes);
      };
      window.__readCutsceneActorPresentation = () => selectedActorRuntime ? {
        cameraFadeEnabled: selectedActorRuntime.getCameraFadeEnabled?.() !== false,
        camera: {
          position: selectedActorRuntime.state.scene.activeCamera.position.asArray(),
          target: selectedActorRuntime.state.scene.activeCamera.getTarget().asArray(),
        },
        actors: selectedActorRuntime.entries.filter(entry => entry.activityPresentation).map(entry => ({
          actorCode: entry.definition.actorCode,
          models: [...entry.models.values()].filter(model => model.root.isEnabled()).map(model => ({
            modelCode: model.modelCode,
            position: model.root.getAbsolutePosition().asArray(),
            meshes: model.renderMeshes.filter(mesh => mesh.getTotalVertices() > 0).map(mesh => {
              mesh.computeWorldMatrix(true);
              const bounds = mesh.getBoundingInfo().boundingBox;
              return {
                name: mesh.name, enabled: mesh.isEnabled(), visible: mesh.isVisible,
                visibility: mesh.visibility,
                minimum: bounds.minimumWorld.asArray(), maximum: bounds.maximumWorld.asArray(),
              };
            }),
            cameraFaded: Boolean(model.cameraFadeState),
            materials: [...new Set(model.renderMeshes.map(mesh => mesh.material))].filter(Boolean)
              .map(material => ({ name: material.name, alpha: material.alpha })),
          })),
        })),
      } : null;
      const musicUrl = moduleUrls["/play/audio/MusicDirector.js"];
      if (!musicUrl) throw new Error("Music runtime module was not observed loading");
      const { PlayMusicDirector } = await import(musicUrl);
      const observedBackground = new WeakSet();
      const setWorld = PlayMusicDirector.prototype.setWorld;
      PlayMusicDirector.prototype.setWorld = function(...args) {
        const result = setWorld.apply(this, args);
        for (const entry of [this.current, this.outgoing]) {
          if (!entry || entry.temporary || observedBackground.has(entry)) continue;
          observedBackground.add(entry);
          const record = { src: entry.audio.src, releasedAt: null, error: null, maxTime: 0 };
          probe.backgroundMedia.push(record);
          const sample = () => {
            if (entry.audio.currentTime > record.maxTime) record.lastAdvancedAt = Date.now();
            record.maxTime = Math.max(record.maxTime, entry.audio.currentTime);
            record.error ||= entry.audio.error?.message || null;
          };
          for (const event of ["timeupdate", "error"]) entry.audio.addEventListener(event, sample);
          const remove = entry.audio.removeAttribute;
          entry.audio.removeAttribute = function(name) {
            if (name === "src") {
              sample();
              record.releasedAt = Date.now();
              record.error = this.error?.message || null;
            }
            return remove.call(this, name);
          };
        }
        return result;
      };
      let musicOwner = null;
      let musicEntry = null;
      const observedMusic = new Map();
      const playMusic = PlayMusicDirector.prototype.playTemporaryTrack;
      PlayMusicDirector.prototype.playTemporaryTrack = function(trackId, options) {
        const accepted = playMusic.call(this, trackId, options);
        probe.musicEvents.push({ event: "start", trackId, accepted });
        if (accepted) {
          musicOwner = this;
          musicEntry = this.current;
          const entry = this.current;
          const record = { trackId, src: entry.audio.src, maxTime: 0, played: false, error: null, released: false };
          const sample = () => {
            record.src = entry.audio.currentSrc || record.src;
            if (entry.audio.currentTime > record.maxTime) record.lastAdvancedAt = Date.now();
            record.maxTime = Math.max(record.maxTime, entry.audio.currentTime);
            record.played ||= !entry.audio.paused && !entry.audio.muted && entry.audio.volume > 0;
            record.error ||= entry.audio.error?.message || null;
          };
          for (const event of ["timeupdate", "playing", "error"]) entry.audio.addEventListener(event, sample);
          // One-shot scores release their source from onended, not necessarily
          // stopTemporaryTrack. Observe the actual media boundary as well.
          const remove = entry.audio.removeAttribute;
          entry.audio.removeAttribute = function(name) {
            if (name === "src") {
              sample();
              record.released = true;
              record.releasedAt = Date.now();
            }
            return remove.call(this, name);
          };
          observedMusic.set(entry, { record, sample });
          probe.musicPlayback.push(record);
        }
        return accepted;
      };
      const stopMusic = PlayMusicDirector.prototype.stopTemporaryTrack;
      PlayMusicDirector.prototype.stopTemporaryTrack = function(trackId) {
        const observed = observedMusic.get(this.current);
        observed?.sample();
        const accepted = stopMusic.call(this, trackId);
        if (accepted && observed) observed.record.released = true;
        probe.musicEvents.push({ event: "stop", trackId, accepted });
        return accepted;
      };
      window.__readCutsceneMusic = () => musicEntry ? {
        trackId: musicEntry.trackId,
        current: musicOwner.current === musicEntry,
        time: musicEntry.audio.currentTime,
        readyState: musicEntry.audio.readyState,
        paused: musicEntry.audio.paused,
        muted: musicEntry.audio.muted,
        volume: musicEntry.audio.volume,
        error: musicEntry.audio.error?.message || null,
        src: musicEntry.audio.currentSrc,
      } : null;
      const update = NativeAseqActivityRuntime.prototype.updateActivity;
      NativeAseqActivityRuntime.prototype.updateActivity = function(detail) {
        const result = update.call(this, detail);
        if (result === true) {
          probe.acceptedUpdates += 1;
          probe.activity = {
            id: detail.activityId, frame: detail.currentFrame,
            durationFrames: detail.durationFrames,
          };
        }
        return result;
      };
      const start = NativeCutsceneDirector.prototype.start;
      let currentDirector = null;
      // Test-only access for rendered attachment/scene-object diagnostics.
      window.__getCutsceneDirector = () => currentDirector;
      let surfaceCameraSnapshot = null;
      window.__frameCutsceneSurface = (kind, actorTag, sideName) => {
        if (kind === "restore") {
          const { camera, position, target, scene, observer } = surfaceCameraSnapshot;
          scene.onBeforeCameraRenderObservable.remove(observer);
          camera.position.copyFrom(position); camera.setTarget(target);
          surfaceCameraSnapshot = null;
          return;
        }
        const runtime = [...currentDirector.runtimes.values()].find(runtime => runtime.presentation.active);
        const entry = kind === "face" ? runtime.presentation.faces.entries.get(actorTag)
          : runtime.presentation.hands.active.hands.get(actorTag).sides[sideName].side;
        const root = entry.root;
        const camera = root.getScene().activeCamera;
        const matrix = root._mt5CharacterWorldMatrices.get(entry.primaryNode.addr);
        const content = entry.loader.characterContentRoot(root).computeWorldMatrix(true).asArray();
        const point = camera.position.clone();
        point.set(...[0, 1, 2].map(axis => matrix[12] * content[axis]
          + matrix[13] * content[4 + axis] + matrix[14] * content[8 + axis] + content[12 + axis]));
        const scene = root.getScene();
        surfaceCameraSnapshot = { camera, scene, position: camera.position.clone(), target: camera.getTarget().clone() };
        const direction = kind === "face" ? point.clone().set(...[0, 1, 2].map(axis =>
          matrix[0] * content[axis] + matrix[1] * content[4 + axis] + matrix[2] * content[8 + axis])).normalize()
          : camera.position.subtract(point).normalize();
        const closeupPosition = point.add(direction.scale(kind === "face" ? 0.65 : 0.5));
        // This is an explicitly diagnostic camera, not an authored shot.
        // Wait for rendered frames, not an arbitrary wall-clock delay.
        window.__cutsceneSurfaceFrames = 0;
        surfaceCameraSnapshot.observer = scene.onBeforeCameraRenderObservable.add(activeCamera => {
          if (activeCamera !== camera) return;
          camera.position.copyFrom(closeupPosition);
          camera.setTarget(point);
          scene.setTransformMatrix(camera.getViewMatrix(true), camera.getProjectionMatrix(true));
          window.__cutsceneSurfaceFrames += 1;
        });
      };
      window.__readCutsceneLookPoints = () => [...(currentDirector?.runtimes.values() || [])]
        .flatMap(runtime => [...(runtime.presentation?.actorLookPoints?.targets || [])].map(([actorTag, record]) => {
          const model = runtime.actors.activeActor(actorTag)?.model;
          return { actorTag, target: record.target,
            vertical: record.state.vertical, horizontal: record.state.horizontal,
            baseHead: record.state.baseRoutes?.get(-67),
            renderedHead: model?.latestRetargetedRoutes?.get(-67),
            targetWorld: record.target?.objectTag ? runtime.actors.objectWorldPosition(record.target.objectTag) : null };
        }));
      window.__readCutsceneFaces = () => [...(currentDirector?.runtimes.values() || [])]
        .flatMap(runtime => [...(runtime.presentation?.faces?.active?.faces || [])]
          .map(([actorTag, face]) => ({
            actorTag, faceCode: face.entry.definition.faceCode,
            enabled: face.entry.root.isEnabled(),
            controllerMode: face.controllerMode, controllerDrivenClose: face.controllerDrivenClose,
            upperSelector: face.upperSelector, poseBase: face.poseBase,
            mouth: Array.from(face.mouth.current), upper: Array.from(face.upper.current),
            vertices: face.entry.primaryMeshes.flatMap(mesh => {
              const positions = mesh.getVerticesData("position");
              return Array.from(mesh._mt5SourceVertexIndices).flatMap((source, index) => {
                const local = source - face.entry.primaryVertexBase;
                return mesh._mt5ExternalParentVertexOffsets?.[index] < 0
                  || local < 0 || local >= face.entry.table.vertexCount ? []
                  : Array.from(positions.slice(index * 3, index * 3 + 3));
              });
            }),
          })));
      window.__readCutsceneCloth = () => [...(currentDirector?.runtimes.values() || [])]
        .flatMap(runtime => [...(runtime.presentation?.cloth?.states || [])].map(state => ({
          packageId: runtime.id, modelCode: state.model.modelCode,
          active: state.active, acquired: state.acquired, runtimeSeconds: state.runtimeSeconds,
          runtimeMode: state.runtimeMode,
          groups: state.groups.map(group => ({
            controlType: group.group.controlType,
            vertices: group.group.vertexCount,
            sourceVertexOrder: group.topology.sourceVertexOrder,
            simulated: group.simulation.active,
            positions: group.simulation.currentPositions(),
            inputs: clothInputs.get(group.simulation),
          })),
        })));
      window.__readCutsceneLeases = () => ({
        active: currentDirector?.active || false,
        worldMaps: (currentDirector?.worldContext?.meshes || [])
          .filter(root => /_MAP(?:\d+)?\./i.test(root._filename || ""))
          .map(root => ({ filename: root._filename, enabled: root.isEnabled(),
            renderedChildren: root.getChildMeshes().filter(mesh => mesh.isEnabled() && mesh.isVisible && mesh.getTotalVertices() > 0).length })),
        packages: [...(currentDirector?.runtimes.values() || [])].map(runtime => ({
          id: runtime.id, program: Boolean(runtime.programLease), active: runtime.active,
          attachments: Boolean(runtime.attachedObjects?.active),
          mapPresentation: runtime.mapLayers ? {
            activityId: runtime.mapLayers.active?.activityId,
            background: runtime.mapLayers.background?.color.asArray() ?? null,
            roots: [...runtime.mapLayers.roots].map(([name, root]) => ({ name, enabled: root.isEnabled() })),
          } : null,
          replacedWorldObjects: (runtime.packageActors?.worldRoots || []).map(root => ({
            actorTag: root.metadata.runtimeObject.objectTag, enabled: root.isEnabled(),
          })),
        })),
      });
      window.__readCutscenePropPresentation = () => {
        const runtime = currentDirector?.activeCutscene?.packageRuntime;
        return [...(runtime?.attachedObjects?.objects || [])].map(([actorTag, record]) => {
          const attachments = runtime.attachedObjects;
          const binding = attachments.active?.bindings.filter(value => value.actorTag === actorTag
            && value.frame <= attachments.active.frame).at(-1);
          const parent = binding?.parentActorTag ? runtime.actors.activeActor(binding.parentActorTag) : null;
          const control = parent?.model?.latestControllerFamily?.nodes.find(node => node.type === binding.controlId);
          const matrix = parent?.model?.latestControllerMatrices?.[control?.index];
          return {
            actorTag,
            rootId: record.root.uniqueId,
            sceneRootId: runtime.sceneObjects?.objects.get(actorTag)?.root.uniqueId ?? null,
            borrowedSceneObject: record.sceneObject,
            enabled: record.root.isEnabled(),
            position: record.root.getAbsolutePosition().asArray(),
            meshes: record.root.getChildMeshes().filter(mesh => mesh.getTotalVertices() > 0).map(mesh => {
              mesh.computeWorldMatrix(true);
              const bounds = mesh.getBoundingInfo().boundingBox;
              return {
                name: mesh.name, enabled: mesh.isEnabled(), visible: mesh.isVisible,
                visibility: mesh.visibility, vertices: mesh.getTotalVertices(),
                minimum: bounds.minimumWorld.asArray(), maximum: bounds.maximumWorld.asArray(),
              };
            }),
            attachment: binding?.action === "attach" && matrix ? {
              binding,
              controllerMatrix: Array.from(matrix),
              actorWorld: Array.from(parent.root.computeWorldMatrix(true).asArray()),
              renderWorld: Array.from(parent.model.renderRoot.computeWorldMatrix(true).asArray()),
              contentWorld: Array.from((parent.model.renderRoot._mt5CharacterContentRoot
                || parent.model.renderRoot).computeWorldMatrix(true).asArray()),
            } : null,
          };
        });
      };
      NativeCutsceneDirector.prototype.start = async function(cutscene, options) {
        currentDirector = this;
        probe.events.push({ event: "start", id: cutscene.id });
        try {
          const result = await start.call(this, cutscene, options);
          probe.events.push({ event: "start-result", result });
          return result;
        } catch (error) {
          probe.events.push({ event: "start-error", message: error.message });
          throw error;
        }
      };
      const stop = NativeCutsceneDirector.prototype.stop;
      NativeCutsceneDirector.prototype.stop = function(reason) {
        probe.events.push({ event: "stop", reason });
        return stop.call(this, reason);
      };
      useAccountStore.getState().controller.showCutscenes();
    }, runtimeModuleUrls);

    const cutsceneOption = page.locator(
      `[data-cutscene-id="${cutscene.id}"]`,
    );
    await expect(cutsceneOption).toHaveCount(1);
    await cutsceneOption.click();
    stage("loading-scene");
    // Internal selector navigation currently leaves account-ui-root aria-hidden
    // even though it is rendered. Target its visible button text, without force
    // clicking or changing the application's accessibility state in the test.
    await page.locator(".account-shell-cutscenes button")
      .filter({ hasText: /^Enter Cutscene$/ }).click();

    const cutsceneMenu = page.locator(".account-shell-cutscenes");
    await expect(cutsceneMenu).toBeHidden({ timeout: 120_000 });
    const launchStarted = Date.now();
    // A menu disappearing and reappearing can also mean startup failed. Require
    // the real presentation lease and a changing transport before calling this
    // a playback pass; no no-op actor or camera adapters are used here.
    const launchOutcome = await Promise.race([
      page.locator("body.cutscene-active").waitFor({ state: "attached", timeout: 120_000 })
        .then(() => "playing"),
      cutsceneMenu.waitFor({ state: "visible", timeout: 120_000 })
        .then(() => "returned-to-menu-before-playback"),
    ]);
    report.launchOutcome = launchOutcome;
    report.returnedToMenu = launchOutcome === "returned-to-menu-before-playback";
    expect(launchOutcome, `Launch ${cutscene.id}; ${browserErrors.join("\n")}`).toBe("playing");
    report.reachedPlayback = true;
    stage("playing");
    report.launchMs = Date.now() - launchStarted;
    const initialUpdates = await page.evaluate(() => window.__cutsceneBrowserProbe.acceptedUpdates);
    await expect.poll(() => page.evaluate(() => window.__cutsceneBrowserProbe.acceptedUpdates), {
      timeout: 15_000, message: `${cutscene.id} timeline advances`,
    }).toBeGreaterThan(initialUpdates);
    report.advanced = true;
    report.activity = await page.evaluate(() => window.__cutsceneBrowserProbe.activity);
    report.registeredProps = await page.evaluate(() => window.__readCutscenePropPresentation());
    for (const tag of expectedPlayback.attachedActorTags) {
      expect(report.registeredProps.some(prop => prop.actorTag === tag), `${tag} compiled prop is registered in the live package`).toBe(true);
    }
    if (expectedMusicTrack) {
      await expect.poll(() => page.evaluate(() => window.__readCutsceneMusic()), {
        timeout: 15_000, message: "Authored cutscene music actually plays",
      }).toMatchObject({ trackId: expectedMusicTrack, current: true, paused: false, muted: false, error: null });
      await expect.poll(() => page.evaluate(() => window.__readCutsceneMusic()?.time), {
        timeout: 15_000,
      }).toBeGreaterThan(0.5);
      report.musicAtStart = await page.evaluate(() => window.__readCutsceneMusic());
      report.musicStartActivity = await page.evaluate(() => window.__cutsceneBrowserProbe.activity);
      expect(report.musicAtStart.volume).toBeGreaterThan(0);
    }
    if (expectedMusicTrack && verifyMusicAcrossActivities) {
      // A successful play() is insufficient: cross an actual shot boundary
      // and verify the same stream continues, rather than restarting per AUTH.
      await expect.poll(() => page.evaluate(() => window.__cutsceneBrowserProbe.activity?.id), {
        // AUTH duration is authored at 30 frames/second. Some first segments
        // (notably CATA1) last over a minute; do not mistake that for a stall.
        timeout: Math.max(35_000, report.musicStartActivity.durationFrames / 30 * 1_000 + 15_000),
      }).not.toBe(report.musicStartActivity.id);
      report.musicAfterShotChange = await page.evaluate(() => window.__readCutsceneMusic());
      expect(report.musicAfterShotChange).toMatchObject({ trackId: expectedMusicTrack, current: true, paused: false, error: null });
      expect(report.musicAfterShotChange.time).toBeGreaterThan(report.musicAtStart.time);
      expect(await page.evaluate(trackId => window.__cutsceneBrowserProbe.musicEvents.filter(
        event => event.event === "start" && event.trackId === trackId,
      ).length, expectedMusicTrack)).toBe(1);
    }
    // Verify the actual game context as well as the runner's blank-page
    // preflight. Standalone diagnostics must use the shared launch options too.
    report.renderer = await page.evaluate(async url => {
      const { default: state } = await import(url);
      return state.scene.getEngine().getGlInfo();
    }, runtimeModuleUrls["/src/state.js"]);
    assertPlaywrightRenderer(report.renderer.renderer);
    if (inspectPlayback) await inspectPlayback({ page, report, runtimeModuleUrls });
    if (testInfo) {
      const path = testInfo.outputPath("first-playback-frame.png");
      await page.screenshot({ path });
      await testInfo.attach("cutscene-first-playback-frame", {
        path, contentType: "image/png",
      });
    }
    if (sampleOnly) {
      // Observe several rendered seconds, not just the first ownership change.
      await page.waitForTimeout(3_000);
      report.activityAfterSample = await page.evaluate(() => window.__cutsceneBrowserProbe.activity);
      if (testInfo) {
        const path = testInfo.outputPath("sampled-frame.png");
        await page.screenshot({ path });
        await testInfo.attach("cutscene-sampled-frame", {
          path, contentType: "image/png",
        });
      }
      if (expectedMusicTrack) {
        report.musicBeforeExit = await page.evaluate(() => window.__readCutsceneMusic());
        expect(report.musicBeforeExit).toMatchObject({
          trackId: expectedMusicTrack, current: true, paused: false, muted: false, error: null,
        });
        expect(report.musicBeforeExit.time).toBeGreaterThan(report.musicAtStart.time);
        expect(await page.evaluate(trackId => window.__cutsceneBrowserProbe.musicEvents.filter(
          event => event.event === "start" && event.trackId === trackId,
        ).length, expectedMusicTrack)).toBe(1);
      }
      cancelling = true;
      stage("cancelling");
      // Follow the visible configured binding, rather than assuming Escape.
      const cancelKey = await page.locator('#dialogue-controls-hud [data-control-binding="cancel"]').textContent();
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press(cancelKey.trim());
    }
    const completionDeadline = Date.now() + completionTimeout;
    if (!sampleOnly && testInfo) {
      // Capture actual rendered shots for later human/agent review, not just
      // a single launch frame. These images are evidence, not visual assertions.
      report.renderedFrames = [];
      const captured = new Set();
      let progressAt = 0;
      let progressOccurrence = -1;
      while (!await cutsceneMenu.isVisible() && Date.now() < completionDeadline) {
        const state = await page.evaluate(() => {
          const probe = window.__cutsceneBrowserProbe;
          if (!probe) throw new Error("Cutscene observation was lost after page navigation/reload; this run cannot verify completion");
          return { ...probe.activity, occurrence: probe.activities.length - 1 };
        });
        expect(browserErrors, `Runtime errors during ${cutscene.id}`).toEqual([]);
        if (state.occurrence !== progressOccurrence || Date.now() - progressAt >= 30_000) {
          console.info(`[cutscene ${cutscene.id}] segment ${state.occurrence + 1}/${expectedPlayback.activityOrder.length}: ${state.id} frame ${state.frame}/${state.durationFrames}`);
          progressAt = Date.now();
          progressOccurrence = state.occurrence;
        }
        const fraction = state.frame / state.durationFrames;
        const propCue = expectedPlayback.propCheckpoints.find(cue => cue.activityId === state.id
          && state.frame >= cue.frame + 15 && state.frame < cue.frame + 60
          && !captured.has(`${state.occurrence}-prop-${cue.frame}`));
        const sample = propCue ? `prop-${propCue.frame}`
          : fraction >= 0.65 ? "late" : fraction >= 0.2 ? "early" : state.frame >= 15 ? "start" : null;
        const key = `${state.occurrence}-${sample}`;
        if (sample && !captured.has(key)) {
          const path = testInfo.outputPath(`shot-${key}.png`);
          // Captions often cover the hands. Prop checkpoints omit only that
          // HTML overlay for inspection; ordinary shot samples keep the UI.
          await page.screenshot({
            path,
            ...(propCue ? {
              style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }",
            } : {}),
          });
          const { props, leases, actors, hands, captureEnd } = await page.evaluate(() => ({
            props: window.__readCutscenePropPresentation(),
            leases: window.__readCutsceneLeases(),
            actors: window.__readCutsceneActorPresentation(),
            hands: window.__readCutsceneHands(),
            captureEnd: {
              ...window.__cutsceneBrowserProbe.activity,
              active: document.body.classList.contains("cutscene-active"),
            },
          }));
          for (const prop of props.filter(value => value.borrowedSceneObject)) {
            expect(prop.rootId, `${prop.actorTag} attachment reuses its scene object`).toBe(prop.sceneRootId);
          }
          // Playback is not paused for screenshots. Flag a crossed boundary so
          // a short scene's menu image cannot be mistaken for its final shot.
          report.renderedFrames.push({ ...state, sample, path, hiddenCaptions: Boolean(propCue), props, actors, hands, leases, captureEnd });
          captured.add(key);
        }
        await page.waitForTimeout(250);
      }
    }
    await expect(cutsceneMenu).toBeVisible({ timeout: Math.max(100, completionDeadline - Date.now()) });
    report.returnedToMenu = true;
    stage("checking-settlement");
    await expect(page.locator("body.cutscene-active")).toHaveCount(0);
    report.probe = await page.evaluate(() => window.__cutsceneBrowserProbe);
    report.settlements = report.probe.settlements.filter(result => result.programId === expectedPlayback.programId);
    expect(report.settlements, "Menu return must have an explicit successful terminal event").toEqual([
      expect.objectContaining({ kind: sampleOnly ? "cancelled" : "completed", status: sampleOnly ? "cancelled" : "completed" }),
    ]);
    if (!sampleOnly) {
      expect(report.probe.activities.map(activity => activity.id), "All expected shots play in authored preview order")
        .toEqual(expectedPlayback.activityOrder);
      expect(report.probe.activities.map(activity => activity.finalFrame), "Every shot reaches its last authored frame")
        .toEqual(expectedPlayback.activityDurations);
      if (expectedPlayback.musicSpans.length) {
        expect(report.probe.musicPlayback.map(record => record.trackId), "Compiled score cues play in order")
          .toEqual(expectedPlayback.musicSpans.map(span => span.trackId));
        for (const [index, span] of expectedPlayback.musicSpans.entries()) {
          const record = report.probe.musicPlayback[index];
          expect(record).toMatchObject({ played: true, error: null, released: true });
          // Allow media startup/event-sampling latency, but not truncation at
          // the first AUTH boundary of a multi-segment score.
          expect(record.maxTime, `${span.trackId} spans its compiled scene interval`)
            .toBeGreaterThanOrEqual(Math.max(0, span.durationSeconds - 2));
        }
      }
    }
    stage(sampleOnly ? "cancelled-to-menu" : "completed-to-menu");
    if (expectedMusicTrack) {
      report.musicAfterExit = await page.evaluate(() => window.__readCutsceneMusic());
      expect(report.musicAfterExit).toMatchObject({ current: false, paused: true });
      expect(await page.evaluate(trackId => window.__cutsceneBrowserProbe.musicEvents.filter(
        event => event.event === "stop" && event.trackId === trackId && event.accepted,
      ).length, expectedMusicTrack)).toBe(1);
    }
    if (verifyReplay && !sampleOnly) {
      stage("replaying-without-reload");
      const before = report.probe;
      // Re-enter through the same live selector and runtime instance. A fresh
      // page cannot expose leaked slot ownership from the previous playback.
      await cutsceneOption.click();
      await page.locator(".account-shell-cutscenes button").filter({ hasText: /^Enter Cutscene$/ }).click();
      await expect(page.locator("body.cutscene-active")).toHaveCount(1, { timeout: 120_000 });
      // Short previews can finish before a fixed 60-frame replay checkpoint.
      // Still require advancing playback, then leave time for actual UI cancel.
      const replayProgressFrames = Math.min(60, Math.max(1, Math.floor(expectedPlayback.durationFrames / 4)));
      await expect.poll(() => page.evaluate(() => window.__cutsceneBrowserProbe.acceptedUpdates), {
        timeout: 20_000, intervals: [50],
      }).toBeGreaterThan(before.acceptedUpdates + replayProgressFrames);
      const replayProbe = await page.evaluate(() => window.__cutsceneBrowserProbe);
      expect(replayProbe.activities[before.activities.length].id).toBe(expectedPlayback.activityOrder[0]);
      cancelling = true;
      stage("cancelling-replay");
      const cancelKey = await page.locator('#dialogue-controls-hud [data-control-binding="cancel"]').textContent();
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press(cancelKey.trim());
      await expect(cutsceneMenu).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("body.cutscene-active")).toHaveCount(0);
      const after = await page.evaluate(() => window.__cutsceneBrowserProbe);
      report.probe = after;
      const replaySettlements = after.settlements.slice(before.settlements.length);
      expect(replaySettlements).toEqual([
        expect.objectContaining({ programId: expectedPlayback.programId, kind: "cancelled", status: "cancelled" }),
      ]);
      const leases = await page.evaluate(() => window.__readCutsceneLeases());
      expect(leases.active).toBe(false);
      expect(leases.packages.every(record => !record.active && !record.program && !record.attachments)).toBe(true);
      const music = await page.evaluate(() => window.__readCutsceneMusic());
      if (music) expect(music).toMatchObject({ current: false, paused: true });
      report.replay = { verified: true, progressFrames: replayProgressFrames, settlements: replaySettlements, leases, music };
      stage("replay-cancelled-to-menu");
    }

    // Chrome reads Ogg headers, requests the tail, then resumes a buffered
    // range. Require observed continuation or intentional source release;
    // a successful response alone does not establish healthy playback.
    for (const media of report.mediaRequests) {
      if (verifiedContinuingMediaRangeAbort(media, report.mediaRequests,
        [...report.probe.backgroundMedia, ...report.probe.musicPlayback])) {
        const index = failedResources.indexOf(`${media.failure} ${media.url}`);
        if (index !== -1) {
          failedResources.splice(index, 1);
          report.verifiedMediaRangeAborts.push(media);
        }
        continue;
      }
      // World/menu handoff deliberately tears down non-cinematic streams too.
      // Require an observed source removal at the abort, not a filename allowlist.
      const release = report.probe.backgroundMedia.find(record => record.src === media.url
        && record.releasedAt !== null && !record.error
        && (record.maxTime > 0.5
          || (media.failureAt >= record.releasedAt && media.failureAt - record.releasedAt < 1000)));
      if (release && media.failure === "net::ERR_ABORTED" && media.status === 206) {
        const index = failedResources.indexOf(`${media.failure} ${media.url}`);
        if (index !== -1) failedResources.splice(index, 1);
        report.expectedAborts.push(media.url);
        continue;
      }
      const playback = report.probe.musicPlayback.find(record => record.src === media.url
        && record.played && record.maxTime > 0.5 && !record.error && record.released);
      if (!playback || media.failure !== "net::ERR_ABORTED"
        || media.status !== 206 || !media.range || !media.contentRange) continue;
      const index = failedResources.indexOf(`${media.failure} ${media.url}`);
      if (index !== -1) {
        failedResources.splice(index, 1);
        report.verifiedMediaRangeAborts.push(media);
      }
    }

    const alerts = await page.locator('[role="alert"]').allTextContents();
    const cutsceneErrors = [...browserErrors, ...failedResources];
    expect(
      cutsceneErrors,
      `Browser errors while playing ${cutscene.id} — ${cutscene.label}:\n${[
        ...browserErrors,
        ...failedResources,
      ].join("\n")}`,
    ).toEqual([]);
    expect(
      alerts,
      `UI errors after playing ${cutscene.id} — ${cutscene.label}:\n${alerts.join("\n")}`,
    ).toEqual([]);
    report.verification.fullBrowserPlayback = !sampleOnly;
    return report;
  } finally {
    if (testInfo) {
      report.probe = await page.evaluate(() => window.__cutsceneBrowserProbe).catch(() => null);
      const path = testInfo.outputPath("browser-inventory.json");
      await writeFile(path, JSON.stringify(report, null, 2));
      await testInfo.attach("cutscene-browser-inventory", {
        path,
        contentType: "application/json",
      });
    }
  }
}
