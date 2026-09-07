import { Sound } from "@babylonjs/core/Audio/sound.js";
import {
  audioPreferences,
  effectiveEffectsVolume,
} from "./AudioPreferences.js";
import { NATIVE_FORKLIFT_AUDIO } from "./ForkliftSounds.js";

const EVENT_SOURCES = Object.freeze({
  startup: NATIVE_FORKLIFT_AUDIO.startup,
  shutdown: NATIVE_FORKLIFT_AUDIO.shutdown,
  horn: NATIVE_FORKLIFT_AUDIO.horn,
  flip_impact: NATIVE_FORKLIFT_AUDIO.flipImpact,
});

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function defaultSoundFactory(scene, {
  name,
  source,
  loop,
  volume,
  position,
  maxDistance,
}) {
  const sound = new Sound(name, resolveRuntimeAssetUrl(source), scene, null, {
    autoplay: false,
    loop,
    volume,
    spatialSound: true,
    maxDistance,
    refDistance: 2.5,
    rolloffFactor: 1.25,
    distanceModel: "inverse",
  });
  sound.setPosition(position);
  sound.switchPanningModelToHRTF();
  return sound;
}

export class RemoteForkliftSounds {
  constructor({
    scene,
    preferences = audioPreferences,
    soundFactory = (options) => defaultSoundFactory(scene, options),
    maxDistance = 48,
  }) {
    this.preferences = preferences;
    this.soundFactory = soundFactory;
    this.maxDistance = maxDistance;
    this.vehicles = new Map();
    this.oneShots = new Set();
    this.pendingEvents = new Map();
    this.soundId = 0;
  }

  update(deltaSeconds, snapshots = []) {
    const dt = Math.max(1 / 240, Number(deltaSeconds) || 0);
    const seen = new Set();
    for (const snapshot of snapshots) {
      if (!snapshot?.id || !snapshot.position) continue;
      seen.add(snapshot.id);
      const vehicle = this.#ensureVehicle(snapshot);
      vehicle.position.copyFrom(snapshot.position);
      this.#positionChannels(vehicle);
      this.#applyEngineMix(vehicle, snapshot.signedSpeed);
      this.#updateReverse(vehicle, snapshot.signedSpeed);
      this.#updateTines(vehicle, snapshot.lift, dt);
      this.#updateFlip(vehicle, snapshot.tiltAngle);
      this.#flushPending(snapshot.id, vehicle.position);
    }
    for (const id of [...this.vehicles.keys()]) {
      if (!seen.has(id)) this.#disposeVehicle(id);
    }
    this.#agePendingEvents(dt);
  }

  playEvent(event) {
    const source = EVENT_SOURCES[event?.cue];
    if (!source || !event?.forkliftId) return false;
    const vehicle = this.vehicles.get(event.forkliftId);
    if (vehicle) {
      this.#oneShot(source, 0.95, vehicle.position);
      return true;
    }
    const pending = this.pendingEvents.get(event.forkliftId) || [];
    pending.push({ source, age: 0 });
    this.pendingEvents.set(event.forkliftId, pending);
    return true;
  }

  reset() {
    for (const id of [...this.vehicles.keys()]) this.#disposeVehicle(id);
    for (const sound of this.oneShots) sound.dispose?.();
    this.oneShots.clear();
    this.pendingEvents.clear();
  }

  dispose() {
    this.reset();
  }

  #ensureVehicle(snapshot) {
    let vehicle = this.vehicles.get(snapshot.id);
    if (vehicle) return vehicle;
    vehicle = {
      id: snapshot.id,
      position: snapshot.position.clone(),
      lift: Number(snapshot.lift) || 0,
      liftDirection: 0,
      tiltAngle: Math.max(0, Number(snapshot.tiltAngle) || 0),
      channels: new Map(),
    };
    this.vehicles.set(snapshot.id, vehicle);
    this.#loop(
      vehicle,
      "engineIdle",
      NATIVE_FORKLIFT_AUDIO.engineIdle,
      0.52,
    );
    this.#loop(
      vehicle,
      "engineMoving",
      NATIVE_FORKLIFT_AUDIO.engineMoving,
      0,
    );
    return vehicle;
  }

  #applyEngineMix(vehicle, signedSpeed) {
    const effort = clamp(Math.abs(Number(signedSpeed) || 0) / 9);
    this.#setGain(vehicle, "engineIdle", 0.52 * (1 - effort * 0.82));
    this.#setGain(vehicle, "engineMoving", 0.62 * effort);
  }

  #updateReverse(vehicle, signedSpeed) {
    if (
      !this.preferences.getState().forkliftReverseMuted
      && Number(signedSpeed) < -0.08
    ) {
      this.#loop(vehicle, "reverse", NATIVE_FORKLIFT_AUDIO.reverse, 0.39);
    } else {
      this.#stopChannel(vehicle, "reverse");
    }
  }

  #updateTines(vehicle, lift, deltaSeconds) {
    const nextLift = Number(lift) || 0;
    const delta = nextLift - vehicle.lift;
    vehicle.lift = nextLift;
    const velocity = delta / deltaSeconds;
    const direction = Math.abs(velocity) >= 0.02 ? Math.sign(velocity) : 0;
    if (direction === vehicle.liftDirection) return;
    vehicle.liftDirection = direction;
    this.#stopChannel(vehicle, "tinesStart");
    this.#stopChannel(vehicle, "tinesLoop");
    if (!direction) return;
    const cue = direction > 0
      ? NATIVE_FORKLIFT_AUDIO.tinesUp
      : NATIVE_FORKLIFT_AUDIO.tinesDown;
    this.#startChannel(vehicle, "tinesStart", cue.start, {
      loop: false,
      gain: 0.78,
      onEnded: () => {
        vehicle.channels.delete("tinesStart");
        if (
          this.vehicles.get(vehicle.id) === vehicle
          && vehicle.liftDirection === direction
        ) {
          this.#loop(vehicle, "tinesLoop", cue.loop, 0.78);
        }
      },
    });
  }

  #updateFlip(vehicle, tiltAngle) {
    const angle = Math.max(0, Number(tiltAngle) || 0);
    const threshold = 30 * Math.PI / 180;
    if (vehicle.tiltAngle < threshold && angle >= threshold) {
      this.#oneShot(NATIVE_FORKLIFT_AUDIO.flip, 0.95, vehicle.position);
    }
    vehicle.tiltAngle = angle;
  }

  #loop(vehicle, name, source, gain) {
    return this.#startChannel(vehicle, name, source, {
      loop: true,
      gain,
    });
  }

  #startChannel(
    vehicle,
    name,
    source,
    { loop, gain, onEnded = null },
  ) {
    if (vehicle.channels.has(name)) {
      this.#setGain(vehicle, name, gain);
      return vehicle.channels.get(name).sound;
    }
    const sound = this.#createSound(source, loop, gain, vehicle.position);
    vehicle.channels.set(name, { sound, gain });
    if (onEnded) sound.onEndedObservable?.addOnce?.(onEnded);
    sound.play?.();
    return sound;
  }

  #createSound(source, loop, gain, position) {
    return this.soundFactory({
      name: `remote-forklift-${this.soundId++}`,
      source,
      loop,
      volume: this.#volume(gain),
      position,
      maxDistance: this.maxDistance,
    });
  }

  #setGain(vehicle, name, gain) {
    const channel = vehicle.channels.get(name);
    if (!channel) return;
    channel.gain = gain;
    channel.sound.setVolume?.(this.#volume(gain));
  }

  #positionChannels(vehicle) {
    for (const channel of vehicle.channels.values()) {
      channel.sound.setPosition?.(vehicle.position);
      channel.sound.setVolume?.(this.#volume(channel.gain));
    }
  }

  #stopChannel(vehicle, name) {
    const channel = vehicle.channels.get(name);
    if (!channel) return;
    channel.sound.stop?.();
    channel.sound.dispose?.();
    vehicle.channels.delete(name);
  }

  #oneShot(source, gain, position) {
    const sound = this.#createSound(source, false, gain, position);
    this.oneShots.add(sound);
    const release = () => {
      this.oneShots.delete(sound);
      sound.dispose?.();
    };
    sound.onEndedObservable?.addOnce?.(release);
    sound.play?.();
  }

  #flushPending(id, position) {
    const pending = this.pendingEvents.get(id);
    if (!pending) return;
    this.pendingEvents.delete(id);
    for (const { source } of pending) this.#oneShot(source, 0.95, position);
  }

  #agePendingEvents(deltaSeconds) {
    for (const [id, pending] of this.pendingEvents) {
      const retained = pending
        .map((event) => ({ ...event, age: event.age + deltaSeconds }))
        .filter((event) => event.age <= 1);
      if (retained.length) this.pendingEvents.set(id, retained);
      else this.pendingEvents.delete(id);
    }
  }

  #disposeVehicle(id) {
    const vehicle = this.vehicles.get(id);
    if (!vehicle) return;
    for (const name of [...vehicle.channels.keys()]) {
      this.#stopChannel(vehicle, name);
    }
    this.vehicles.delete(id);
  }

  #volume(gain) {
    const state = this.preferences.getState();
    if (state.masterMuted || state.effectsMuted) return 0;
    return effectiveEffectsVolume(state)
      * (state.overallVolume ?? 1)
      * clamp(gain);
  }
}
import { resolveRuntimeAssetUrl } from "../../src/RuntimeAssets.js";
