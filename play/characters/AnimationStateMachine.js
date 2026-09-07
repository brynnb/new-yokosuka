import {
  interpolateAffineMatrix,
  interpolateMatrixRouteMaps,
  interpolateMatrixRoutes,
} from "../../src/AnimationMatrixInterpolation.js";
import {
  analyzeRyoMotnRootMotion,
  evaluateRyoMotnFrame,
  ryoMotnFrameForGameTick,
  ryoMotnGameplayTiming,
  splitRyoActorTranslation,
  removeHumanoidPoseHeading,
} from "../../src/RyoMotnRuntime.js";

function groupAuthoredSoundCuesByTick(cues, timing) {
  const result = new Map();
  for (const cue of cues || []) {
    const tick = (
      Math.round(cue.frame / timing.sourceFramesPerGameTick)
      % timing.gameTicksPerCycle
    );
    const group = result.get(tick) || [];
    group.push(cue);
    result.set(tick, group);
  }
  return result;
}

export class AnimationStateMachine {
  constructor({
    renderMatrixByKey,
    emotes,
    runtimeEmotes,
    pickerEmoteIds,
    gameTicksPerSecond,
    emoteBlendTicks,
    locomotionBlendSeconds,
    oneShotBlendSeconds = 3 / gameTicksPerSecond,
    locomotionStates,
    applyPose,
    onActionCue = () => {},
    onEmoteCleared = () => {},
    onEmoteStarted = () => {},
  }) {
    this.renderMatrixByKey = renderMatrixByKey;
    this.emotes = emotes;
    this.runtimeEmotes = runtimeEmotes;
    this.pickerEmoteIds = pickerEmoteIds;
    this.gameTicksPerSecond = gameTicksPerSecond;
    this.emoteBlendTicks = emoteBlendTicks;
    this.locomotionBlendSeconds = locomotionBlendSeconds;
    this.oneShotBlendSeconds = Math.max(0, oneShotBlendSeconds);
    this.locomotionStates = locomotionStates;
    this.applyPose = applyPose;
    this.onActionCue = onActionCue;
    this.onEmoteCleared = onEmoteCleared;
    this.onEmoteStarted = onEmoteStarted;
    this.clips = null;
    this.phaseStates = new Map();
    this.state = "idle";
    this.tick = 0;
    this.accumulator = 0;
    this.transition = null;
    this.activeEmote = null;
    this.activeOneShot = null;
    this.oneShotPlaybackRevision = 0;
  }

  get ready() {
    return Boolean(this.clips);
  }

  reset({ clearEmote = true } = {}) {
    if (clearEmote) this.clearEmote();
    this.activeOneShot = null;
    this.state = "idle";
    this.tick = 0;
    this.accumulator = 0;
    this.transition = null;
  }

  setState(state) {
    this.state = state;
    this.tick = 0;
    this.accumulator = 0;
    this.transition = null;
    this.emitActionCue();
  }

  emitActionCue() {
    if (!this.clips) return;
    const clipState = this.locomotionClipState(this.state);
    const clip = this.clips[clipState];
    const common = {
      state: this.state,
      clipState,
      tick: this.tick,
      sequence: clip?.sequence,
    };
    const surfaceCue = clip?.surfaceSoundCuesByTick?.get(this.tick);
    if (surfaceCue) {
      this.onActionCue({
        ...common,
        type: "surfaceSound",
        cue: surfaceCue,
      });
    }
    for (const cue of clip?.authoredSoundCuesByTick?.get(this.tick) || []) {
      this.onActionCue({
        ...common,
        type: "nativeSound",
        cue,
      });
    }
  }

  buildClip(motion, name, options = {}) {
    const sequence = motion.getSequence(name);
    if (!sequence?.valid || !sequence.valueData?.complete) {
      throw new Error(`Complete MOTN sequence not found: ${name}`);
    }
    const timing = ryoMotnGameplayTiming(sequence);
    if (options.inPlaceTurn && !sequence.actionMetadata?.mirrorSetup?.complete) {
      throw new Error(`Unresolved native turn setup: ${name}`);
    }
    const mirror = Boolean(options.inPlaceTurn && sequence.actionMetadata.mirrorSetup.mirrored);
    const rootMotion = analyzeRyoMotnRootMotion(sequence);
    let shoulderRollRaw = [...(options.initialShoulderRollRaw || [0, 0])];

    if (options.settleLoop !== false) {
      for (let cycle = 0; cycle < 64; cycle += 1) {
        const before = [...shoulderRollRaw];
        for (let tick = 0; tick < timing.gameTicksPerCycle; tick += 1) {
          const frame = ryoMotnFrameForGameTick(sequence, tick);
          const result = evaluateRyoMotnFrame(sequence, frame, {
            shoulderRollRaw,
            mirror,
          });
          shoulderRollRaw = result.shoulderRollRaw;
        }
        if (before.every((value, index) => value === shoulderRollRaw[index])) {
          break;
        }
      }
    }

    const frames = [];
    for (let tick = 0; tick < timing.gameTicksPerCycle; tick += 1) {
      const frame = ryoMotnFrameForGameTick(sequence, tick);
      const result = evaluateRyoMotnFrame(sequence, frame, {
        shoulderRollRaw,
        mirror,
      });
      shoulderRollRaw = result.shoulderRollRaw;
      const pose = splitRyoActorTranslation(result.matrices, {
        extractHorizontal: rootMotion.kind === "travel",
      });
      frames.push({
        ...result,
        ...pose,
        poseMatrices: options.inPlaceTurn
          ? removeHumanoidPoseHeading(pose.poseMatrices)
          : pose.poseMatrices,
      });
    }

    return {
      sequence,
      timing,
      rootMotion,
      frames,
      surfaceSoundCuesByTick: new Map(
        (sequence.actionMetadata?.surfaceSoundCues || []).map((cue) => [
          Math.round(cue.frame / timing.sourceFramesPerGameTick)
            % timing.gameTicksPerCycle,
          cue,
        ]),
      ),
      authoredSoundCuesByTick: groupAuthoredSoundCuesByTick(
        options.authoredSoundCues,
        timing,
      ),
      shoulderRollRawEnd: [...shoulderRollRaw],
      speed: (
        rootMotion.cycleDisplacement
        * this.gameTicksPerSecond
        / timing.gameTicksPerCycle
      ),
    };
  }

  registerClip(state, build) {
    // Preserve the synchronous playback API, but bake an optional clip only
    // when it is requested. Failed preparation is not memoized.
    Object.defineProperty(this.clips, state, {
      configurable: true,
      enumerable: true,
      get: () => {
        const clip = build();
        Object.defineProperty(this.clips, state, {
          configurable: true, enumerable: true, writable: true, value: clip,
        });
        return clip;
      },
      set: value => Object.defineProperty(this.clips, state, {
        configurable: true, enumerable: true, writable: true, value,
      }),
    });
  }

  async prepareClips(states, signal) {
    let deadline = performance.now() + 8;
    for (const state of states) {
      signal?.throwIfAborted();
      if (!Object.hasOwn(this.clips, state)) throw new Error(`Unknown animation state: ${state}`);
      void this.clips[state];
      if (performance.now() >= deadline) {
        if (globalThis.scheduler?.yield) await globalThis.scheduler.yield();
        else await new Promise(resolve => setTimeout(resolve, 0));
        deadline = performance.now() + 8;
      }
    }
    signal?.throwIfAborted();
  }

  configure({
    motion,
    supplementalMotions,
    sequences,
    locomotionMotionFiles = {},
    combatMotion = null,
    combatMoveMotion = combatMotion,
    combatMoveAnimationProperty = "animation",
    combatVictimMotion = combatMoveMotion,
    combatVictimAnimationProperty = "victimAnimation",
    combatOpponentVictimMotion = null,
    combatOpponentVictimAnimationProperty = "enemyVictimAnimation",
    combatFollowupMotion = combatMoveMotion,
    combatFollowupVictimMotion = combatVictimMotion,
    combatReactionMotionById = {},
    combatStance = null,
    combatGuard = null,
    combatLocomotion = {},
    combatMoves = {},
    combatStrings = {},
    combatFollowups = {},
    combatReactions = {},
    scriptedMotions = {},
    deferOptional = false,
  }) {
    this.clips = {};
    const addClip = (state, bank, name, options) => {
      const build = () => this.buildClip(bank, name, options);
      if (deferOptional) this.registerClip(state, build);
      else this.clips[state] = build();
    };
    for (const clipState of ["idle", "walk", "run", "forkliftSit", "turnLeft", "turnRight"]) {
      const motionFile = locomotionMotionFiles[clipState];
      const clipMotion = motionFile
        ? supplementalMotions.get(motionFile)
        : motion;
      if (!clipMotion) {
        throw new Error(
          `Locomotion motion file is not loaded: ${motionFile}`,
        );
      }
      addClip(clipState, clipMotion, sequences[clipState], {
        inPlaceTurn: clipState === "turnLeft" || clipState === "turnRight",
      });
    }
    // All basic movement is ready before handing control to the player.
    for (const state of ["idle", "walk", "run", "turnLeft", "turnRight"]) void this.clips[state];
    this.phaseStates.clear();
    this.pendingEmotes = new Map();
    for (const [request, value] of Object.entries(scriptedMotions)) {
      const definition = typeof value === "string"
        ? { name: value, motionFile: null }
        : value;
      const scriptedMotion = definition?.motionFile
        ? supplementalMotions.get(definition.motionFile)
        : motion;
      if (!scriptedMotion || typeof definition?.name !== "string") {
        throw new Error(`Native scripted motion ${request} is invalid`);
      }
      addClip(`native-motion:${request}`,
        scriptedMotion,
        definition.name,
        { settleLoop: false },
      );
    }
    for (const emote of this.runtimeEmotes) {
      const build = () => {
        const emoteMotion = supplementalMotions.get(emote.motionFile) || motion;
        let shoulderRollRaw = this.clips.idle.shoulderRollRawEnd;
        for (const phase of ["entry", "loop", "exit"]) {
          if (!emote[phase]) continue;
          const clipState = `${emote.id}:${phase}`;
          this.clips[clipState] = this.buildClip(emoteMotion, emote[phase], {
            initialShoulderRollRaw: shoulderRollRaw,
            settleLoop: false,
            authoredSoundCues: emote.audioCues?.[phase],
          });
          shoulderRollRaw = this.clips[clipState].shoulderRollRawEnd;
        }
        this.alignEmotePhaseOrigins(emote);
        this.prepareEmotePhaseClips([emote]);
      };
      if (deferOptional) {
        this.pendingEmotes.set(emote.id, build);
        const states = this.authoredEmoteStates(emote);
        this.phaseStates.set(emote.id, emote.nativeDirect ? states : [
          `${emote.id}:blendIn`, ...states, `${emote.id}:blendOut`,
        ]);
      } else build();
    }
    if (combatMotion) {
      if (combatStance) {
        addClip("combatStance",
          combatMotion,
          combatStance,
        );
      }
      if (combatGuard) {
        addClip("combatGuard",
          combatMotion,
          combatGuard,
        );
      }
      for (const [clipState, sequenceName] of Object.entries(
        combatLocomotion,
      )) {
        addClip(clipState,
          combatMotion,
          sequenceName,
        );
      }
      for (const [reactionId, sequenceName] of Object.entries(
        combatReactions,
      )) {
        const reactionMotion = (
          combatReactionMotionById[reactionId]
          || combatMotion
        );
        addClip(`combat-reaction:${reactionId}`,
          reactionMotion,
          sequenceName,
          { settleLoop: false },
        );
      }
    }
    if (combatMoveMotion) {
      for (const move of Object.values(combatMoves)) {
        const sequenceName = move[combatMoveAnimationProperty];
        if (sequenceName) {
          addClip(`combat:${move.id}`,
            combatMoveMotion,
            sequenceName,
            { settleLoop: false },
          );
          if (move.highProficiencyAnimation) {
            addClip(`combat:${move.id}:high`,
              combatMoveMotion,
              move.highProficiencyAnimation,
              { settleLoop: false },
            );
          }
        }
        const victimSequenceName = move[combatVictimAnimationProperty];
        if (combatVictimMotion && victimSequenceName) {
          addClip(`combat:${move.id}:victim`,
            combatVictimMotion,
            victimSequenceName,
            { settleLoop: false },
          );
          if (move.highProficiencyVictimAnimation) {
            addClip(`combat:${move.id}:victim:high`,
              combatVictimMotion,
              move.highProficiencyVictimAnimation,
              { settleLoop: false },
            );
          }
        }
        const opponentVictimSequenceName = (
          move[combatOpponentVictimAnimationProperty]
        );
        if (combatOpponentVictimMotion && opponentVictimSequenceName) {
          addClip(`combat:${move.id}:opponent-victim`,
            combatOpponentVictimMotion,
            opponentVictimSequenceName,
            { settleLoop: false },
          );
        }
      }
      for (const stage of Object.values(combatStrings)) {
        if (!stage.animation) continue;
        addClip(`combat-string:${stage.id}`,
          combatMoveMotion,
          stage.animation,
          { settleLoop: false },
        );
      }
      for (const stage of Object.values(combatFollowups)) {
        if (combatFollowupMotion && stage.animation) {
          addClip(`combat-followup:${stage.id}`,
            combatFollowupMotion,
            stage.animation,
            { settleLoop: false },
          );
        }
        if (combatFollowupVictimMotion && stage.victimAnimation) {
          addClip(`combat-followup:${stage.id}:victim`,
            combatFollowupVictimMotion,
            stage.victimAnimation,
            { settleLoop: false },
          );
        }
      }
    }
    this.reset();
    return this.clips;
  }

  buildPoseBlendClip(startPose, endPose, ticks = this.emoteBlendTicks) {
    const frameCount = Math.max(2, ticks);
    return {
      sequence: null,
      timing: null,
      rootMotion: null,
      speed: 0,
      frames: Array.from({ length: frameCount }, (_, index) => {
        const amount = index / (frameCount - 1);
        return {
          poseMatrices: startPose.map((matrix, matrixIndex) => (
            interpolateAffineMatrix(matrix, endPose[matrixIndex], amount)
          )),
        };
      }),
    };
  }

  authoredEmoteStates(emote) {
    return ["entry", "loop", "exit"]
      .filter((phase) => emote[phase])
      .map((phase) => `${emote.id}:${phase}`);
  }

  translateClipHorizontalOrigin(clip, x, z) {
    for (const frame of clip.frames) {
      for (const matrix of frame.poseMatrices) {
        matrix[12] += x;
        matrix[14] += z;
      }
    }
  }

  alignEmotePhaseOrigins(emote) {
    let previousPose = this.clips.idle.frames[0].poseMatrices;
    for (const state of this.authoredEmoteStates(emote)) {
      const clip = this.clips[state];
      const firstPose = clip.frames[0].poseMatrices;
      this.translateClipHorizontalOrigin(
        clip,
        previousPose[0][12] - firstPose[0][12],
        previousPose[0][14] - firstPose[0][14],
      );
      previousPose = clip.frames.at(-1).poseMatrices;
    }
  }

  ensureEmote(emoteId) {
    const build = this.pendingEmotes?.get(emoteId);
    if (!build) return;
    build();
    this.pendingEmotes.delete(emoteId);
  }

  prepareEmotePhaseClips(emotes = this.runtimeEmotes) {
    const idlePose = this.clips.idle.frames[0].poseMatrices;
    for (const emote of emotes) {
      const authoredStates = this.authoredEmoteStates(emote);
      if (emote.nativeDirect) {
        this.phaseStates.set(emote.id, authoredStates);
        continue;
      }
      const firstPose = this.clips[authoredStates[0]].frames[0].poseMatrices;
      const finalFrames = this.clips[authoredStates.at(-1)].frames;
      const finalPose = finalFrames.at(-1).poseMatrices;
      const blendInState = `${emote.id}:blendIn`;
      const blendOutState = `${emote.id}:blendOut`;
      this.clips[blendInState] = this.buildPoseBlendClip(idlePose, firstPose);
      if (emote.preserveEndPosition) {
        const x = finalPose[0][12] - idlePose[0][12];
        const z = finalPose[0][14] - idlePose[0][14];
        const standingPose = idlePose.map(matrix => {
          const translated = [...matrix];
          translated[12] += x;
          translated[14] += z;
          return translated;
        });
        // Settle at the authored destination, not back at the actor origin.
        const blend = this.buildPoseBlendClip(finalPose, standingPose);
        blend.completionTranslation = [x, 0, z];
        this.clips[blendOutState] = blend;
      } else {
        this.clips[blendOutState] = this.buildPoseBlendClip(finalPose, idlePose);
      }
      this.phaseStates.set(emote.id, [
        blendInState,
        ...authoredStates,
        blendOutState,
      ]);
    }
  }

  locomotionClipState(state) {
    if (state === "backpedal") return "walk";
    if (state === "combatRetreat") return "combatAdvance";
    return state;
  }

  clipRoutesAt(clipState, tick, {
    loop = false,
    nextState = clipState,
  } = {}) {
    const clip = this.clips[clipState];
    const frameCount = clip.frames.length;
    const clampedTick = loop
      ? ((tick % frameCount) + frameCount) % frameCount
      : Math.max(0, Math.min(frameCount - 1, tick));
    const frameIndex = Math.floor(clampedTick);
    const amount = clampedTick - frameIndex;
    const frame = clip.frames[frameIndex];
    const nextFrame = frameIndex + 1 < frameCount
      ? clip.frames[frameIndex + 1]
      : this.clips[nextState].frames[0];
    return interpolateMatrixRoutes(
      frame.poseMatrices,
      nextFrame.poseMatrices,
      this.renderMatrixByKey,
      amount,
    );
  }

  remoteEmoteRoutes(emoteId, elapsedSeconds) {
    this.ensureEmote(emoteId);
    const states = this.phaseStates.get(emoteId);
    if (!states) return null;
    const emote = this.runtimeEmotes.find(
      (candidate) => candidate.id === emoteId,
    );
    let remainingTicks = Math.max(
      0,
      elapsedSeconds * this.gameTicksPerSecond,
    );
    for (const [index, clipState] of states.entries()) {
      const frameCount = this.clips[clipState].frames.length;
      if (
        emote?.holdLoopUntilMovement
        && clipState === `${emoteId}:loop`
      ) {
        return this.clipRoutesAt(
          clipState,
          remainingTicks % frameCount,
          { loop: true },
        );
      }
      if (remainingTicks < frameCount) {
        return this.clipRoutesAt(clipState, remainingTicks, {
          nextState: states[index + 1] || "idle",
        });
      }
      remainingTicks -= frameCount;
    }
    return null;
  }

  nextState() {
    if (this.activeOneShot) return "idle";
    if (!this.activeEmote) return this.state;
    const states = this.activeEmote.states;
    const currentPhase = states[this.activeEmote.phaseIndex];
    if (currentPhase !== this.state) return this.state;
    return states[this.activeEmote.phaseIndex + 1] || "idle";
  }

  currentRoutes(amount = 0) {
    const playbackState = this.locomotionClipState(this.state);
    const clip = this.clips[playbackState];
    const holdingFinalFrame = Boolean(
      this.activeOneShot?.holdLastFrame
      && this.tick >= clip.frames.length - 1
    );
    const playbackTick = holdingFinalFrame
      ? clip.frames.length - 1
      : this.state === "backpedal" || this.state === "combatRetreat"
        ? -(this.tick + amount)
        : this.tick + amount;
    const normalizedTick = (
      (playbackTick % clip.frames.length) + clip.frames.length
    ) % clip.frames.length;
    const frameIndex = Math.floor(normalizedTick);
    const frameAmount = normalizedTick - frameIndex;
    const frame = clip.frames[frameIndex];
    const nextFrame = holdingFinalFrame || (clip.completionTranslation && frameIndex === clip.frames.length - 1)
      ? frame
      : frameIndex + 1 < clip.frames.length
      ? clip.frames[frameIndex + 1]
      : this.activeOneShot?.loop
        ? clip.frames[0]
      : this.clips[this.locomotionClipState(this.nextState())].frames[0];
    let routedMatrices = interpolateMatrixRoutes(
      frame.poseMatrices,
      nextFrame.poseMatrices,
      this.renderMatrixByKey,
      frameAmount,
    );
    if (this.transition) {
      routedMatrices = interpolateMatrixRouteMaps(
        this.transition.fromRoutes,
        routedMatrices,
        this.transition.elapsedSeconds / this.transition.durationSeconds,
      );
    }
    return { routedMatrices, frame, nextFrame };
  }

  apply(amount = 0) {
    if (!this.clips) return;
    const pose = this.currentRoutes(amount);
    let oneShotRootMotion = null;
    if (this.activeOneShot) {
      const clip = this.clips[this.activeOneShot.clipState];
      const currentTranslation = pose.frame.actorTranslation;
      if (
        this.activeOneShot.applyRootMotion
        && clip.rootMotion?.kind === "travel"
        && Array.isArray(currentTranslation)
      ) {
        const nextTranslation = this.tick + 1 < clip.frames.length
          ? pose.nextFrame.actorTranslation
          : currentTranslation;
        oneShotRootMotion = {
          clipState: this.activeOneShot.clipState,
          playbackRevision: this.activeOneShot.playbackRevision,
          generation: this.activeOneShot.rootMotionGeneration,
          context: this.activeOneShot.context,
          translation: currentTranslation.map((value, index) => (
            value + (
              (nextTranslation?.[index] ?? value) - value
            ) * amount
          )),
        };
      }
    }
    this.applyPose({
      ...pose,
      amount,
      oneShotRootMotion,
    });
  }

  advanceEmotePhase() {
    if (!this.activeEmote) return false;
    const currentState = this.activeEmote.states[this.activeEmote.phaseIndex];
    if (
      this.activeEmote.emote.holdLoopUntilMovement
      && currentState === `${this.activeEmote.emote.id}:loop`
    ) {
      this.tick = 0;
      return true;
    }
    this.activeEmote.phaseIndex += 1;
    if (this.activeEmote.phaseIndex >= this.activeEmote.states.length) {
      this.clearEmote({ completed: true });
      this.state = "idle";
      this.tick = 0;
      return true;
    }
    this.state = this.activeEmote.states[this.activeEmote.phaseIndex];
    this.tick = 0;
    return true;
  }

  advanceOneShot() {
    if (!this.activeOneShot) return false;
    if (this.activeOneShot.loop) {
      this.tick = 0;
      return true;
    }
    if (this.activeOneShot.holdLastFrame) {
      if (!this.activeOneShot.endNotified) {
        this.activeOneShot.endNotified = true;
        this.activeOneShot.onComplete?.(this.activeOneShot);
      }
      this.tick = Math.max(
        0,
        this.clips[this.activeOneShot.clipState].frames.length - 1,
      );
      this.accumulator = 0;
      return true;
    }
    const completed = this.activeOneShot;
    this.activeOneShot = null;
    this.state = "idle";
    this.tick = 0;
    completed.onComplete?.(completed);
    return true;
  }

  update(deltaSeconds, nextState) {
    // A combat move or reaction owns the pose until its authored sequence
    // completes. Locomotion/combat-stance selection happens later in the
    // player frame than combat event processing, so do not let that ordinary
    // state request replace a one-shot on the same frame it starts.
    const requestedState = this.activeOneShot ? this.state : nextState;
    if (requestedState !== this.state) {
      const fromRoutes = this.locomotionStates.has(requestedState)
        ? this.currentRoutes(this.accumulator).routedMatrices
        : null;
      this.state = requestedState;
      this.tick = 0;
      this.accumulator = 0;
      this.transition = fromRoutes
        ? {
          fromRoutes,
          elapsedSeconds: 0,
          durationSeconds: this.locomotionBlendSeconds,
        }
        : null;
      this.emitActionCue();
      this.apply();
      return;
    }
    if (this.transition) {
      this.transition.elapsedSeconds += deltaSeconds;
      if (this.transition.elapsedSeconds >= this.transition.durationSeconds) {
        this.transition = null;
      }
    }
    const activeClip = this.activeOneShot
      ? this.clips[this.activeOneShot.clipState]
      : null;
    if (
      this.activeOneShot?.holdLastFrame
      && activeClip
      && this.tick >= activeClip.frames.length - 1
    ) {
      // A held defeat/knockdown must be a truly static pose. Letting the
      // fractional accumulator continue would interpolate the final authored
      // frame toward idle, then snap back on every simulation tick.
      // Reaching the held pose is also completion of the authored motion.
      // Notify its owner before freezing the pose; otherwise the early return
      // here prevents advanceOneShot() from ever publishing completion.
      this.advanceOneShot();
      this.apply(0);
      return;
    }
    this.accumulator += deltaSeconds * this.gameTicksPerSecond;
    while (this.accumulator >= 1) {
      this.accumulator -= 1;
      this.tick += 1;
      if (
        this.tick
        >= this.clips[this.locomotionClipState(this.state)].frames.length
      ) {
        if (!this.advanceOneShot() && !this.advanceEmotePhase()) this.tick = 0;
      }
      this.emitActionCue();
    }
    this.apply(this.accumulator);
  }

  stateForMovement(movement) {
    if (this.activeOneShot) return this.state;
    if (!movement.moving && !movement.turning) {
      return this.activeEmote ? this.state : "idle";
    }
    if (this.activeEmote) this.clearEmote();
    if (!movement.moving) return movement.turnDirection < 0 ? "turnLeft" : "turnRight";
    if (movement.backpedaling) return "backpedal";
    return movement.running ? "run" : "walk";
  }

  playEmote(emote, context = null) {
    this.ensureEmote(emote.id);
    const states = this.phaseStates.get(emote.id);
    if (!states) return false;
    // A stationary blend-in clip starts at idle, but the player may have just
    // walked/turned into an interaction. Preserve that displayed pose rather
    // than snapping to idle on the first emote frame. Native-direct scripted
    // motions deliberately retain their authored, unblended entry.
    const fromRoutes = !emote.nativeDirect
      ? this.currentRoutes(this.accumulator).routedMatrices : null;
    this.activeOneShot = null;
    if (this.activeEmote) this.clearEmote();
    this.activeEmote = { emote, states, phaseIndex: 0, context };
    this.setState(states[0]);
    if (fromRoutes && this.emoteBlendTicks > 0) {
      this.transition = {
        fromRoutes,
        elapsedSeconds: 0,
        durationSeconds: this.emoteBlendTicks / this.gameTicksPerSecond,
      };
    }
    this.onEmoteStarted(this.activeEmote);
    this.apply();
    return true;
  }

  playOneShot(clipState, {
    onComplete = null,
    context = null,
    holdLastFrame = false,
    loop = false,
    applyRootMotion = true,
    blendSeconds = this.oneShotBlendSeconds,
  } = {}) {
    if (!this.clips?.[clipState]) return false;
    const fromRoutes = this.currentRoutes(this.accumulator).routedMatrices;
    if (this.activeEmote) this.clearEmote();
    this.activeOneShot = {
      clipState,
      onComplete,
      context,
      holdLastFrame: Boolean(holdLastFrame),
      loop: Boolean(loop),
      applyRootMotion: Boolean(applyRootMotion),
      playbackRevision: ++this.oneShotPlaybackRevision,
      rootMotionGeneration: 0,
      endNotified: false,
    };
    this.setState(clipState);
    if (blendSeconds > 0) {
      this.transition = {
        fromRoutes,
        elapsedSeconds: 0,
        durationSeconds: blendSeconds,
      };
    }
    this.apply();
    return true;
  }

  playNativeMotionRequest(request, options = {}) {
    if (!Number.isInteger(request)) return false;
    return this.playOneShot(`native-motion:${request}`, options);
  }

  nativeMotionDescriptor(request) {
    if (!Number.isInteger(request)) return null;
    const clip = this.clips?.[`native-motion:${request}`];
    if (!clip) return null;
    return {
      request,
      rootMotionKind: clip.rootMotion?.kind ?? null,
      speed: clip.speed,
      gameTicksPerCycle: clip.timing?.gameTicksPerCycle ?? null,
      cycleDisplacement: clip.rootMotion?.cycleDisplacement ?? null,
    };
  }

  nativeMotionPhase(playbackRevision) {
    const active = this.activeOneShot;
    if (
      !active
      || active.playbackRevision !== playbackRevision
      || active.context?.kind !== "native-scripted-motion"
    ) {
      return null;
    }
    const clip = this.clips?.[active.clipState];
    if (!clip) return null;
    return {
      request: active.context.request,
      // FUN_0c10db04 advances MOMT+0xf0 by the scaled MOMT+0xdc step,
      // and FUN_0c10ed58 supplies that same phase to motion evaluation.
      // Non-walk MOTN playback has one authored source frame per game tick;
      // the fractional accumulator is the engine's sub-tick scale term.
      phase: Math.fround(this.tick + this.accumulator),
      gameTicksPerCycle: clip.timing?.gameTicksPerCycle ?? null,
    };
  }

  nativeMotionControllerVector(playbackRevision) {
    const active = this.activeOneShot;
    if (
      !active
      || active.playbackRevision !== playbackRevision
      || active.context?.kind !== "native-scripted-motion"
    ) {
      return null;
    }
    const { frame, nextFrame } = this.currentRoutes(this.accumulator);
    const current = frame?.actorTranslation;
    const next = nextFrame?.actorTranslation || current;
    if (
      !Array.isArray(current)
      || current.length !== 3
      || !Array.isArray(next)
      || next.length !== 3
    ) {
      return null;
    }
    return current.map((value, index) => Math.fround(
      value + (next[index] - value) * this.accumulator,
    ));
  }

  playCombatMove(moveId, {
    highProficiency = false,
    ...options
  } = {}) {
    const highState = `combat:${moveId}:high`;
    const clipState = highProficiency && this.clips?.[highState]
      ? highState
      : `combat:${moveId}`;
    return this.playOneShot(clipState, options);
  }

  playCombatMoveVictim(moveId, {
    highProficiency = false,
    ...options
  } = {}) {
    const highState = `combat:${moveId}:victim:high`;
    const clipState = highProficiency && this.clips?.[highState]
      ? highState
      : `combat:${moveId}:victim`;
    return this.playOneShot(clipState, options);
  }

  playCombatOpponentVictim(moveId, options = {}) {
    const clipState = `combat:${moveId}:opponent-victim`;
    if (!this.clips?.[clipState]) {
      return this.playCombatMoveVictim(moveId, options);
    }
    return this.playOneShot(clipState, options);
  }

  playCombatStringStage(stageId, options = {}) {
    return this.playOneShot(`combat-string:${stageId}`, options);
  }

  playCombatFollowupStage(stageId, options = {}) {
    return this.playOneShot(`combat-followup:${stageId}`, options);
  }

  playCombatFollowupVictim(stageId, options = {}) {
    return this.playOneShot(`combat-followup:${stageId}:victim`, options);
  }

  activeOneShotRootMotionKind() {
    if (!this.activeOneShot) return null;
    return this.clips?.[this.activeOneShot.clipState]?.rootMotion?.kind || null;
  }

  activeOneShotChoreographySample() {
    if (!this.activeOneShot) return null;
    const clip = this.clips?.[this.activeOneShot.clipState];
    const frame = clip?.frames?.[0];
    const root = frame?.poseMatrices?.[0];
    if (!clip || !frame || !root || root.length !== 16) return null;
    const kind = clip.rootMotion?.kind || "pose";
    const authoredTranslation = kind === "travel"
      ? frame.actorTranslation
      : [root[12], root[13], root[14]];
    if (!Array.isArray(authoredTranslation)) return null;
    return {
      kind,
      authoredTranslation: [...authoredTranslation],
      // Traveling horizontal root motion is extracted onto the actor root.
      // Pose-root translation remains embedded in the rendered skeleton.
      embeddedTranslation: kind === "pose"
        ? [root[12], root[13], root[14]]
        : [0, 0, 0],
    };
  }

  activeOneShotPoseRootTranslation(amount = this.accumulator) {
    if (this.activeOneShotRootMotionKind() !== "pose") return null;
    const { frame, nextFrame } = this.currentRoutes(amount);
    const root = frame?.poseMatrices?.[0];
    const nextRoot = nextFrame?.poseMatrices?.[0] || root;
    if (!root || root.length !== 16 || !nextRoot || nextRoot.length !== 16) {
      return null;
    }
    return [
      root[12] + (nextRoot[12] - root[12]) * amount,
      root[13] + (nextRoot[13] - root[13]) * amount,
      root[14] + (nextRoot[14] - root[14]) * amount,
    ];
  }

  playCombatReaction(reactionId, options = {}) {
    if (
      reactionId === "defeated"
      && this.clips?.["combat-reaction:defeatedIdle"]
    ) {
      const {
        onComplete,
        blendSeconds = this.oneShotBlendSeconds,
        ...fallOptions
      } = options;
      return this.playOneShot("combat-reaction:defeated", {
        ...fallOptions,
        holdLastFrame: false,
        loop: false,
        blendSeconds,
        onComplete: (completed) => {
          onComplete?.(completed);
          this.playOneShot("combat-reaction:defeatedIdle", {
            loop: true,
            blendSeconds: 2 / this.gameTicksPerSecond,
          });
        },
      });
    }
    return this.playOneShot(`combat-reaction:${reactionId}`, options);
  }

  releaseOneShot(nextState = "idle", {
    blendSeconds = this.oneShotBlendSeconds,
  } = {}) {
    if (!this.activeOneShot || !this.clips?.[nextState]) return false;
    const fromRoutes = this.currentRoutes(this.accumulator).routedMatrices;
    this.activeOneShot = null;
    this.state = nextState;
    this.tick = 0;
    this.accumulator = 0;
    this.transition = blendSeconds > 0
      ? {
        fromRoutes,
        elapsedSeconds: 0,
        durationSeconds: blendSeconds,
      }
      : null;
    this.apply();
    return true;
  }

  rebaseOneShotRootMotion() {
    if (!this.activeOneShot) return false;
    this.activeOneShot.rootMotionGeneration += 1;
    this.apply(this.accumulator);
    return true;
  }

  clearEmote({ completed = false } = {}) {
    if (!this.activeEmote) return false;
    const previous = this.activeEmote;
    if (completed) {
      previous.completionTranslation = this.clips[this.state]?.completionTranslation;
    }
    this.activeEmote = null;
    this.onEmoteCleared(previous);
    return true;
  }
}
