import { createGameAudio } from "./MediaElementAudio.js";
import {
  audioPreferences,
  effectiveEffectsVolume,
} from "./AudioPreferences.js";
import { applyMediaElementAudio } from "./MediaElementAudio.js";

// These names were established by listening to the native a904 command
// samples. Keep the semantic mapping here even though the browser assets
// retain their source command IDs for provenance.
export const NATIVE_FORKLIFT_AUDIO = Object.freeze({
  startup: "/audio/forklift/a9040100.webm",
  shutdown: "/audio/forklift/a9040300.webm",
  horn: "/audio/forklift/a9040500.webm",
  flip: "/audio/forklift/a9040000.webm",
  flipImpact: "/audio/forklift/a9040a00.webm",
  reverse: "/audio/forklift/a9040d00-loop.webm",
  engineMoving: "/audio/forklift/a9041000-v1-loop.webm",
  engineIdle: "/audio/forklift/a9041000-v2-loop.webm",
  tinesDown: Object.freeze({
    start: "/audio/forklift/a9041100-v0.webm",
    loop: "/audio/forklift/a9041100-v0-loop.webm",
  }),
  tinesUp: Object.freeze({
    start: "/audio/forklift/a9041300.webm",
    loop: "/audio/forklift/a9041300-loop.webm",
  }),
  endOfDaySiren: "/audio/forklift/a9041500.webm",
});

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

export class ForkliftSounds {
  constructor({
    audioFactory = (source) => createGameAudio(source),
    preferences = audioPreferences,
    onNetworkCue = () => {},
  } = {}) {
    this.audioFactory = audioFactory;
    this.preferences = preferences;
    this.onNetworkCue = onNetworkCue;
    this.occupied = false;
    this.channels = new Map();
    this.liftDirection = 0;
    this.hornHeld = false;
    this.oneShotId = 0;
    this.previousTiltAngle = 0;
    this.flipActive = false;
    this.flipLanded = false;
    this.unsubscribe = preferences.subscribe?.(() => {
      for (const [name, channel] of this.channels) {
        this.#setGain(name, channel.gain);
      }
    }) || null;
  }

  enter() {
    if (this.occupied) return;
    this.occupied = true;
    this.liftDirection = 0;
    this.hornHeld = false;
    this.#resetFlipState();
    this.#oneShot(NATIVE_FORKLIFT_AUDIO.startup, 0.9);
    this.#loop("engineIdle", NATIVE_FORKLIFT_AUDIO.engineIdle, 0.52);
    this.#loop("engineMoving", NATIVE_FORKLIFT_AUDIO.engineMoving, 0);
  }

  update(_deltaSeconds, {
    occupied = true,
    speed = 0,
    throttle = 0,
    lift = 0,
    liftPosition = 0,
    maximumLift = Infinity,
    horn = false,
    tiltAngle = 0,
    groundImpactImpulse = 0,
    maximumForwardSpeed = 9,
    maximumReverseSpeed = 5.4,
  } = {}) {
    if (!occupied) {
      this.exit();
      return;
    }
    if (!this.occupied) this.enter();

    const speedLimit = speed < 0
      ? maximumReverseSpeed
      : maximumForwardSpeed;
    const speedFraction = clamp(Math.abs(speed) / Math.max(0.001, speedLimit));
    this.#applyEngineMix(speedFraction, Math.abs(throttle));
    this.#resumeChannels();

    const reversing = (
      !this.preferences.getState().forkliftReverseMuted
      && (speed < -0.08 || throttle < -0.1)
    );
    if (reversing) {
      this.#loop("reverse", NATIVE_FORKLIFT_AUDIO.reverse, 0.39);
    } else {
      this.#stopChannel("reverse");
    }

    const requestedLiftDirection = Math.abs(lift) > 0.01
      ? Math.sign(lift)
      : 0;
    const liftCanMove = (
      requestedLiftDirection > 0
        ? liftPosition < maximumLift - 0.001
        : requestedLiftDirection < 0
          ? liftPosition > 0.001
          : false
    );
    this.#setLiftDirection(liftCanMove ? requestedLiftDirection : 0);

    if (horn && !this.hornHeld) {
      this.#oneShot(NATIVE_FORKLIFT_AUDIO.horn, 0.95);
      this.onNetworkCue("horn");
    }
    this.hornHeld = Boolean(horn);
    this.#updateFlip(tiltAngle, groundImpactImpulse);
  }

  exit() {
    if (!this.occupied) return;
    this.occupied = false;
    this.liftDirection = 0;
    this.hornHeld = false;
    this.#resetFlipState();
    this.#stopAll();
    this.#oneShot(NATIVE_FORKLIFT_AUDIO.shutdown, 0.9);
  }

  reset() {
    this.occupied = false;
    this.liftDirection = 0;
    this.hornHeld = false;
    this.#resetFlipState();
    this.#stopAll();
  }

  playEndOfDaySiren() {
    return this.#oneShot(NATIVE_FORKLIFT_AUDIO.endOfDaySiren, 0.9);
  }

  #resetFlipState() {
    this.previousTiltAngle = 0;
    this.flipActive = false;
    this.flipLanded = false;
  }

  #updateFlip(tiltAngle, groundImpactImpulse) {
    const angle = Math.max(0, Number(tiltAngle) || 0);
    const flipStartAngle = 30 * Math.PI / 180;
    const settledSideAngle = 80 * Math.PI / 180;
    const resetAngle = 15 * Math.PI / 180;
    if (angle < resetAngle) {
      this.flipActive = false;
      this.flipLanded = false;
    }
    if (
      !this.flipActive
      && this.previousTiltAngle < flipStartAngle
      && angle >= flipStartAngle
    ) {
      this.flipActive = true;
      this.#oneShot(NATIVE_FORKLIFT_AUDIO.flip, 0.95);
    }
    const hardGroundContact = (
      angle >= 55 * Math.PI / 180
      && Number(groundImpactImpulse) >= 650
    );
    const reachedSideRest = (
      this.previousTiltAngle < settledSideAngle
      && angle >= settledSideAngle
    );
    if (
      this.flipActive
      && !this.flipLanded
      && (hardGroundContact || reachedSideRest)
    ) {
      this.flipLanded = true;
      this.#oneShot(NATIVE_FORKLIFT_AUDIO.flipImpact, 0.95);
      this.onNetworkCue("flip_impact");
    }
    this.previousTiltAngle = angle;
  }

  #applyEngineMix(speedFraction, throttleFraction) {
    const effort = Math.max(speedFraction, clamp(throttleFraction) * 0.65);
    this.#setGain("engineIdle", 0.52 * (1 - effort * 0.82));
    this.#setGain("engineMoving", 0.62 * effort);
  }

  #setLiftDirection(direction) {
    if (direction === this.liftDirection) return;
    this.liftDirection = direction;
    this.#stopChannel("tinesStart");
    this.#stopChannel("tinesLoop");
    if (!direction) return;

    const cue = direction > 0
      ? NATIVE_FORKLIFT_AUDIO.tinesUp
      : NATIVE_FORKLIFT_AUDIO.tinesDown;
    this.#startChannel("tinesStart", cue.start, {
      loop: false,
      gain: 0.78,
      onEnded: () => {
        this.channels.delete("tinesStart");
        if (this.occupied && this.liftDirection === direction) {
          this.#loop("tinesLoop", cue.loop, 0.78);
        }
      },
    });
  }

  #loop(name, source, gain) {
    return this.#startChannel(name, source, { loop: true, gain });
  }

  #startChannel(name, source, { loop, gain, onEnded = null }) {
    if (this.channels.has(name)) {
      this.#setGain(name, gain);
      return this.channels.get(name).audio;
    }
    const audio = this.audioFactory(source);
    audio.loop = loop;
    audio.preload = "auto";
    const channel = { audio, gain, started: false, blocked: false };
    this.channels.set(name, channel);
    this.#setGain(name, gain);
    if (onEnded) audio.addEventListener?.("ended", onEnded, { once: true });
    const state = this.preferences.getState();
    if (!state.masterMuted && !state.effectsMuted) {
      this.#playChannel(channel);
    }
    return audio;
  }

  #stopChannel(name) {
    const channel = this.channels.get(name);
    if (!channel) return;
    channel.audio.pause?.();
    try {
      channel.audio.currentTime = 0;
    } catch {
      // Some test/browser audio implementations expose a read-only clock.
    }
    this.channels.delete(name);
  }

  #stopAll() {
    for (const name of [...this.channels.keys()]) this.#stopChannel(name);
  }

  #setGain(name, gain) {
    const channel = this.channels.get(name);
    if (!channel) return;
    channel.gain = gain;
    const state = this.preferences.getState();
    applyMediaElementAudio(channel.audio, {
      muted: state.masterMuted || state.effectsMuted,
      volume: effectiveEffectsVolume(state)
        * (state.overallVolume ?? 1)
        * clamp(gain),
    });
  }

  #resumeChannels() {
    const state = this.preferences.getState();
    if (state.masterMuted || state.effectsMuted) return;
    for (const [name, channel] of this.channels) {
      this.#setGain(name, channel.gain);
      if (!channel.started && !channel.blocked) this.#playChannel(channel);
    }
  }

  #playChannel(channel) {
    channel.started = true;
    const playback = channel.audio.play();
    playback?.catch?.(() => {
      channel.started = false;
      channel.blocked = true;
    });
  }

  #oneShot(source, gain) {
    const state = this.preferences.getState();
    if (state.masterMuted || state.effectsMuted) return false;
    const audio = this.audioFactory(source);
    audio.preload = "auto";
    applyMediaElementAudio(audio, {
      muted: false,
      volume: effectiveEffectsVolume(state)
        * (state.overallVolume ?? 1)
        * clamp(gain),
    });
    const name = `oneShot:${this.oneShotId++}`;
    const release = () => this.channels.delete(name);
    this.channels.set(name, { audio, gain, started: true, blocked: false });
    audio.addEventListener?.("ended", release, { once: true });
    audio.addEventListener?.("error", release, { once: true });
    const playback = audio.play();
    playback?.catch?.(release);
    return true;
  }
}
