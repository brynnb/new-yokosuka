import { evaluateAuthCamera } from "../../src/AuthCamera.js";
import { evaluateAuthActor } from "../../src/AuthMovement.js";

const AUTH_FRAMES_PER_SECOND = 30;

function requireAdapter(adapter, methods, label) {
  for (const method of methods) {
    if (typeof adapter?.[method] !== "function") {
      throw new TypeError(`AUTH presentation requires ${label}.${method}`);
    }
  }
  return adapter;
}

function accepted(value, label) {
  if (value !== true || value?.then) {
    throw new Error(`AUTH presentation ${label} was rejected`);
  }
}

function orderedFrames(frames, expectedFrame) {
  if (!Array.isArray(frames)) {
    throw new TypeError("AUTH presentation frames must be an array");
  }
  for (const frame of frames) {
    if (frame?.frame !== expectedFrame || !Array.isArray(frame.commands)) {
      throw new Error(`AUTH presentation received an invalid frame ${expectedFrame}`);
    }
  }
  return frames;
}

export class NativeAseqPresentationRuntime {
  constructor({
    actors,
    camera,
    audio,
    faces = null,
    hands = null,
    actorLookPoints = null,
    secondaryMotion = null,
    cloth = null,
    nodeMotion = null,
  } = {}) {
    this.actors = requireAdapter(
      actors,
      ["begin", "applyTransform", "applyMotion", "end"],
      "actors",
    );
    this.camera = requireAdapter(camera, ["begin", "apply", "end"], "camera");
    this.audio = requireAdapter(audio, ["begin", "play", "end"], "audio");
    this.faces = faces
      ? requireAdapter(faces, ["prepare", "begin", "play", "apply", "end"], "faces")
      : null;
    this.hands = hands
      ? requireAdapter(hands, ["prepare", "begin", "play", "apply", "end"], "hands")
      : null;
    this.actorLookPoints = actorLookPoints
      ? requireAdapter(actorLookPoints, ["begin", "play", "end"], "actor look points")
      : null;
    this.secondaryMotion = secondaryMotion
      ? requireAdapter(
          secondaryMotion,
          ["begin", "apply", "end"],
          "secondary motion",
        )
      : null;
    this.cloth = cloth
      ? requireAdapter(cloth, ["begin", "apply", "end"], "cloth")
      : null;
    this.nodeMotion = nodeMotion
      ? requireAdapter(nodeMotion, ["prepare", "begin", "apply", "end"], "node motion")
      : null;
    this.active = null;
    this.transientAudioSuppressed = false;
    this.faceProgramOwner = null;
  }

  async prepare(detail) {
    const [facesPrepared, handsPrepared, clothPrepared, nodeMotionPrepared] = await Promise.all([
      this.faces ? this.faces.prepare(detail) : true,
      this.hands ? this.hands.prepare(detail) : true,
      this.cloth?.prepare ? this.cloth.prepare(detail) : true,
      this.nodeMotion ? this.nodeMotion.prepare(detail) : true,
    ]);
    if (facesPrepared !== true) throw new Error("AUTH face preparation was rejected");
    if (handsPrepared !== true) throw new Error("AUTH hand preparation was rejected");
    if (clothPrepared !== true) throw new Error("AUTH cloth preparation was rejected");
    if (nodeMotionPrepared !== true) throw new Error("AUTH node-motion preparation was rejected");
    return true;
  }

  reset() {
    if (this.active) return false;
    if (
      typeof this.actors.resetPresentationState === "function"
      && this.actors.resetPresentationState() !== true
    ) {
      return false;
    }
    if (typeof this.faces?.reset === "function" && this.faces.reset() !== true) {
      return false;
    }
    if (typeof this.hands?.reset === "function" && this.hands.reset() !== true) {
      return false;
    }
    if (
      typeof this.actorLookPoints?.reset === "function"
      && this.actorLookPoints.reset() !== true
    ) return false;
    if (
      typeof this.secondaryMotion?.reset === "function"
      && this.secondaryMotion.reset() !== true
    ) {
      return false;
    }
    if (typeof this.cloth?.reset === "function" && this.cloth.reset() !== true) {
      return false;
    }
    if (typeof this.nodeMotion?.reset === "function" && this.nodeMotion.reset() !== true) {
      return false;
    }
    return true;
  }

  setPaused(owner, paused) {
    const active = this.active;
    if (!active || active.owner !== owner) return false;
    if (typeof this.audio.setPaused !== "function") return true;
    return this.audio.setPaused(owner, paused) === true;
  }

  setTransientAudioSuppressed(suppressed) {
    this.transientAudioSuppressed = Boolean(suppressed);
    return true;
  }

  beginProgram(owner, options = {}) {
    let cameraBegun = false;
    let nodeMotionBegun = false;
    let facesBegun = false;
    try {
      if (typeof this.camera.beginProgram === "function") {
        accepted(this.camera.beginProgram(owner, options), "camera program ownership");
        cameraBegun = true;
      }
      if (this.nodeMotion?.beginProgram) {
        accepted(this.nodeMotion.beginProgram(owner), "node-motion program ownership");
        nodeMotionBegun = true;
      }
      if (options.continuousActivities && this.faces?.beginProgram) {
        accepted(
          this.faces.beginProgram(owner, options.actorTags || []),
          "face program ownership",
        );
        facesBegun = true;
        this.faceProgramOwner = owner;
      }
      return true;
    } catch (error) {
      if (facesBegun) {
        this.faces.endProgram(owner);
        this.faceProgramOwner = null;
      }
      if (nodeMotionBegun) this.nodeMotion.endProgram(owner);
      if (cameraBegun) this.camera.endProgram(owner);
      throw error;
    }
  }

  async prepareProgramAssets() {
    if (!this.nodeMotion?.prepare) return true;
    await this.nodeMotion.prepare();
    return true;
  }

  applyNodeMotionResource(owner, detail) {
    if (!this.nodeMotion?.applyResource) return false;
    return this.nodeMotion.applyResource(owner, detail) === true;
  }

  endProgram(owner) {
    const errors = [];
    if (this.faceProgramOwner === owner && this.faces?.endProgram) {
      try {
        accepted(this.faces.endProgram(owner), "face program cleanup");
        this.faceProgramOwner = null;
      } catch (error) {
        errors.push(error);
      }
    }
    if (this.nodeMotion?.endProgram) {
      try {
        accepted(this.nodeMotion.endProgram(owner), "node-motion program cleanup");
      } catch (error) {
        errors.push(error);
      }
    }
    if (typeof this.camera.endProgram === "function") {
      try {
        accepted(this.camera.endProgram(owner), "camera program cleanup");
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "AUTH program presentation cleanup failed");
    }
    return true;
  }

  beginActivity(detail) {
    if (this.active) throw new Error("an AUTH presentation is already active");
    const owner = Object.freeze({
      kind: "native-aseq-presentation",
      activityId: String(detail?.activityId || ""),
    });
    if (!owner.activityId || !Array.isArray(detail?.actors)) {
      throw new TypeError("AUTH presentation requires an activity and actors");
    }
    const active = {
      owner,
      currentFrame: 0,
      cameraTrack: null,
      movementByActor: new Map(),
      motionByActor: new Map(),
      actorsBegun: false,
      secondaryMotionBegun: false,
      clothBegun: false,
      nodeMotionBegun: false,
      handsBegun: false,
      actorLookPointsBegun: false,
      facesBegun: false,
      cameraBegun: false,
      audioBegun: false,
    };
    try {
      accepted(this.actors.begin(owner, detail.actors), "actor ownership");
      active.actorsBegun = true;
      if (this.secondaryMotion) {
        accepted(
          this.secondaryMotion.begin(owner, detail.actors),
          "secondary-motion ownership",
        );
        active.secondaryMotionBegun = true;
      }
      if (this.cloth) {
        accepted(
          this.cloth.begin(owner, detail.actors, { slot: detail.slot }),
          "cloth ownership",
        );
        active.clothBegun = true;
      }
      if (this.nodeMotion) {
        accepted(this.nodeMotion.begin(owner, detail.actors), "node-motion ownership");
        active.nodeMotionBegun = true;
      }
      if (this.hands) {
        accepted(this.hands.begin(owner, detail.actors), "hand ownership");
        active.handsBegun = true;
      }
      if (this.actorLookPoints) {
        accepted(this.actorLookPoints.begin(owner), "actor look-point ownership");
        active.actorLookPointsBegun = true;
      }
      if (this.faces) {
        accepted(this.faces.begin(owner, detail.actors), "face ownership");
        active.facesBegun = true;
      }
      accepted(this.camera.begin(owner), "camera ownership");
      active.cameraBegun = true;
      accepted(this.audio.begin(owner), "audio ownership");
      active.audioBegun = true;
      this.active = active;
      this.#consume(active, orderedFrames(detail.initialFrames || [], 0));
      this.#consume(active, orderedFrames(detail.primedFrames || [], 1));
      this.#apply(active);
      return owner;
    } catch (error) {
      this.#cleanup(active, "begin-failed");
      this.active = null;
      throw error;
    }
  }

  advanceActivity(detail) {
    const active = this.active;
    if (
      !active
      || detail?.owner !== active.owner
      || detail?.previousFrame !== active.currentFrame
      || detail?.currentFrame !== active.currentFrame + 1
    ) return false;
    this.#consume(
      active,
      orderedFrames(detail.frames || [], detail.currentFrame),
    );
    active.currentFrame = detail.currentFrame;
    this.#apply(active);
    return true;
  }

  endActivity(detail) {
    const active = this.active;
    if (!active || detail?.owner !== active.owner) return false;
    try {
      this.#cleanup(active, String(detail.reason || "stopped"));
    } finally {
      this.active = null;
    }
    return true;
  }

  #consume(active, frames) {
    for (const frame of frames) {
      for (const command of frame.commands) {
        if (command.name === "camera") {
          active.cameraTrack = command.camera;
          continue;
        }
        if (command.name === "move") {
          active.movementByActor.set(command.actorTag, command.movement);
          continue;
        }
        if (command.name === "motion") {
          active.motionByActor.set(command.actorTag, {
            sequence: command.motion.sequence,
            commandFrame: command.presentationPrime ? 0 : frame.frame,
            startFrame: command.startFrame,
            endFrame: command.endFrame,
          });
          continue;
        }
        if (command.name === "voice" || command.name === "sound") {
          if (!this.transientAudioSuppressed) {
            accepted(this.audio.play(active.owner, command), `${command.name} cue`);
          }
          if (command.name === "voice" && this.faces) {
            accepted(
              this.faces.play(active.owner, command, { frame: frame.frame }),
              "voice face cue",
            );
          }
          continue;
        }
        if (
          (
            command.name === "face-clip"
            || command.name === "face-gaze"
            || command.name === "face-controller"
          )
          && this.faces
        ) {
          accepted(
            this.faces.play(active.owner, command, { frame: frame.frame }),
            `${command.name} cue`,
          );
          continue;
        }
        if (command.name === "effect") {
          // AUTH type 4 is the native FACE/CLIP route at 0x0c154220. Its
          // resolved handler forwards the three authored halfwords to
          // CLIP: group, expression selector, and transition duration. A
          // package may deliberately have no verified detailed FACE surface
          // (OP02's MGR variant is one); it must still consume the authored
          // FACE/CLIP command rather than abort the whole cutscene.
          if (this.faces) {
            accepted(this.faces.play(active.owner, {
              name: "face-clip",
              actorTag: command.actorTag,
              clipGroup: command.effectType,
              selector: command.pattern,
              durationNativeTicks: Math.max(1, command.speed),
            }, { frame: frame.frame }), "AUTH FACE effect cue");
          }
          continue;
        }
        if (
          (
            command.name === "hand-pose"
            || command.name === "body-hand-pose"
            || command.name === "detailed-hand-default"
          )
          && this.hands
        ) {
          accepted(
            this.hands.play(active.owner, command, { frame: frame.frame }),
            "hand pose cue",
          );
          continue;
        }
        if (command.name === "actor-look-point" && this.actorLookPoints) {
          accepted(
            this.actorLookPoints.play(active.owner, command),
            "actor look-point cue",
          );
          continue;
        }
        throw new Error(`AUTH command ${command.name || "<unknown>"} is unsupported`);
      }
    }
  }

  #apply(active) {
    const time = Math.fround(active.currentFrame / AUTH_FRAMES_PER_SECOND);
    for (const [actorTag, movement] of active.movementByActor) {
      accepted(
        this.actors.applyTransform(
          active.owner,
          actorTag,
          evaluateAuthActor(movement, time),
        ),
        `${actorTag} transform`,
      );
    }
    for (const [actorTag, motion] of active.motionByActor) {
      const elapsedFrames = active.currentFrame - motion.commandFrame;
      const updateCount = motion.endFrame - motion.startFrame;
      if (elapsedFrames >= updateCount) {
        active.motionByActor.delete(actorTag);
        continue;
      }
      accepted(
        this.actors.applyMotion(active.owner, actorTag, {
          sequence: motion.sequence,
          frame: motion.startFrame - 1 + elapsedFrames,
        }),
        `${actorTag} motion`,
      );
    }
    if (this.nodeMotion) {
      accepted(
        this.nodeMotion.apply(active.owner, active.currentFrame),
        "node-motion frame",
      );
    }
    if (this.faces) {
      accepted(
        this.faces.apply(active.owner, {
          frame: active.currentFrame,
          timeSeconds: time,
        }),
        "face frame",
      );
    }
    if (this.hands) {
      accepted(
        this.hands.apply(active.owner, {
          frame: active.currentFrame,
          timeSeconds: time,
        }),
        "hand frame",
      );
    }
    // Native OSAG consumes the final animated attachment transforms. Run it
    // after body, FACE, and HAND presentation so a later surface integration
    // pass cannot overwrite the secondary node matrices in the same frame.
    if (this.secondaryMotion) {
      accepted(
        this.secondaryMotion.apply(active.owner, {
          frame: active.currentFrame,
          timeSeconds: time,
        }),
        "secondary-motion frame",
      );
    }
    // Native CLTH consumes the final animated/controller state and owns its
    // paired output vertices. It therefore runs after body attachments and
    // OSAG, but remains independent of camera presentation.
    if (this.cloth) {
      accepted(
        this.cloth.apply(active.owner, {
          frame: active.currentFrame,
          timeSeconds: time,
        }),
        "cloth frame",
      );
    }
    if (active.cameraTrack) {
      accepted(
        this.camera.apply(
          active.owner,
          evaluateAuthCamera(active.cameraTrack, time),
        ),
        "camera frame",
      );
    }
  }

  #cleanup(active, reason) {
    const errors = [];
    if (active.audioBegun) {
      try {
        accepted(this.audio.end(active.owner, reason), "audio cleanup");
      } catch (error) {
        errors.push(error);
      }
    }
    if (active.cameraBegun) {
      try {
        accepted(this.camera.end(active.owner, reason), "camera cleanup");
      } catch (error) {
        errors.push(error);
      }
    }
    if (active.facesBegun) {
      try {
        accepted(this.faces.end(active.owner, reason), "face cleanup");
      } catch (error) {
        errors.push(error);
      }
    }
    if (active.actorLookPointsBegun) {
      try {
        accepted(
          this.actorLookPoints.end(active.owner, reason),
          "actor look-point cleanup",
        );
      } catch (error) {
        errors.push(error);
      }
    }
    if (active.handsBegun) {
      try {
        accepted(this.hands.end(active.owner, reason), "hand cleanup");
      } catch (error) {
        errors.push(error);
      }
    }
    // Cloth is acquired after secondary motion and must release its activity
    // state before the matrices it consumed are restored.
    if (active.clothBegun) {
      try {
        accepted(this.cloth.end(active.owner, reason), "cloth cleanup");
      } catch (error) {
        errors.push(error);
      }
    }
    if (active.nodeMotionBegun) {
      try {
        accepted(this.nodeMotion.end(active.owner, reason), "node-motion cleanup");
      } catch (error) {
        errors.push(error);
      }
    }
    if (active.secondaryMotionBegun) {
      try {
        accepted(
          this.secondaryMotion.end(active.owner, reason),
          "secondary-motion cleanup",
        );
      } catch (error) {
        errors.push(error);
      }
    }
    if (active.actorsBegun) {
      try {
        accepted(this.actors.end(active.owner, reason), "actor cleanup");
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, "AUTH cleanup failed");
  }
}

export function createNativeAseqPresentationRuntime(options) {
  return new NativeAseqPresentationRuntime(options);
}
