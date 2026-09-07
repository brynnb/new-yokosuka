import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { MotnLoader } from "../src/MotnLoader.js";
import {
  NATIVE_FOOTSTEP_SURFACE_COMMANDS,
  WorldSounds,
  nativeFootstepCommand,
} from "../play/audio/WorldSounds.js";
import {
  packagedNativeFootstepCommand,
} from "../play/audio/NativeFootstepCommands.js";
import {
  nativeD000DoorCommands,
  nativeD000DoorOpeningCommand,
} from "../play/audio/NativeDoorCommands.js";
import {
  JOMO_DRAWER_PHASE_COMMANDS,
  nativeJomoDrawerPhaseCommand,
} from "../play/audio/NativeJomoObjectCommands.js";
import {
  JOMO_DOOR_PHASE_COMMANDS_BY_MODEL,
  JOMO_DR23_DOOR_PHASE_COMMANDS,
  nativeJomoDoorPhaseCommand,
} from "../play/audio/NativeJomoDoorCommands.js";

function harness(preferenceOverrides = {}) {
  const played = [];
  const state = {
    overallVolume: 0.8,
    effectsVolume: 0.5,
    effectsMuted: false,
    footstepsMuted: false,
    masterMuted: false,
    ...preferenceOverrides,
  };
  const sounds = new WorldSounds({
    preferences: { getState: () => state },
    random: () => 0.999,
    audioFactory(source) {
      return {
        source,
        volume: 0,
        addEventListener() {},
        play() {
          played.push({ source: this.source, volume: this.volume });
          return Promise.resolve();
        },
        pause() {},
      };
    },
  });
  return { sounds, played, state };
}

test("parses native locomotion surface callbacks separately from DTPK cues", () => {
  const bytes = new Uint8Array(36);
  bytes.set([0x00, 0x00, 0x04, 0x05, 0x00, 0x00, 0x00, 0x01], 12);
  bytes.set([0x12, 0x00, 0x04, 0x05, 0x01, 0x00, 0x00, 0x01], 20);
  bytes.set([0x08, 0x00, 0x04, 0x05, 0xab, 0x03, 0x01, 0x00], 28);
  const metadata = new MotnLoader(bytes).parseActionMetadata(0, bytes.length);
  assert.deepEqual(
    metadata.surfaceSoundCues.map(({ frame, contactKind }) => (
      [frame, contactKind]
    )),
    [[0, 0], [18, 1]],
  );
  assert.deepEqual(
    metadata.soundCues.map(({ frame, commandHex }) => [frame, commandHex]),
    [[8, "ab030100"]],
  );
});

test("native surface table selects an AB03 base and four variants", () => {
  assert.equal(NATIVE_FOOTSTEP_SURFACE_COMMANDS.length, 23);
  assert.equal(nativeFootstepCommand({ surfaceIndex: 1, variant: 0 }), "ab030000");
  assert.equal(nativeFootstepCommand({ surfaceIndex: 1, variant: 3 }), "ab030300");
  assert.equal(nativeFootstepCommand({ surfaceIndex: 2, variant: 2 }), "ab030600");
  assert.equal(nativeFootstepCommand({ surfaceIndex: 8, variant: 0 }), "ab031c80");
  assert.equal(nativeFootstepCommand({ surfaceIndex: 10, variant: 3 }), "ab032780");
  assert.equal(nativeFootstepCommand({ surfaceIndex: 30, variant: 0 }), null);
});

test("world footsteps resolve the authored MAPINFO surface at Ryo's feet", () => {
  const { sounds, played } = harness();
  sounds.setMovement({
    moving: true,
    movementLocked: false,
    noClip: false,
    terrain: { mesh: { metadata: {} } },
    nativeArea: "D000",
    position: {
      x: 64.87008857727051,
      z: 62.61539840698242,
    },
  });
  assert.equal(sounds.handleActionCue({
    type: "surfaceSound",
    cue: { contactKind: 0 },
  }), true);
  assert.equal(played[0].source, "/audio/world/ab034380.webm");
});

test("harbor pavement falls back through Ryo's authored MFSY STEP property", () => {
  const { sounds, played } = harness();
  sounds.setMovement({
    moving: true,
    movementLocked: false,
    noClip: false,
    terrain: { mesh: { metadata: {} } },
    nativeArea: "MFSY",
    nativeActorTag: "AKIR",
    position: {
      x: 114.00789642333984,
      z: 134.16819763183594,
    },
  });
  assert.equal(sounds.handleActionCue({
    type: "surfaceSound",
    cue: { contactKind: 0 },
  }), true);
  assert.equal(played[0].source, "/audio/world/ab034380.webm");
});

test("unsupported indoor areas use the pavement-family default", () => {
  const { sounds, played } = harness();
  sounds.setMovement({
    moving: true,
    movementLocked: false,
    noClip: false,
    terrain: { mesh: { metadata: {} } },
    nativeArea: "DGCT",
    nativeActorTag: "AKIR",
    position: { x: 0, z: 0 },
  });
  assert.equal(sounds.handleActionCue({
    type: "surfaceSound",
    cue: { contactKind: 0 },
  }), true);
  assert.equal(played[0].source, "/audio/world/ab034380.webm");
});

test("world footsteps require grounded movement and obey audio preferences", () => {
  const { sounds, played, state } = harness();
  const cue = { type: "surfaceSound", cue: { contactKind: 0 } };
  sounds.setMovement({
    moving: true,
    movementLocked: false,
    noClip: false,
    terrain: { mesh: { metadata: {} } },
  });
  assert.equal(sounds.handleActionCue(cue), true);
  assert.deepEqual(played, [{
    source: "/audio/world/ab034380.webm",
    volume: 0.5 * 0.35 * 0.8,
  }]);

  sounds.setMovement({ moving: true, noClip: true, terrain: {} });
  assert.equal(sounds.handleActionCue(cue), false);
  sounds.setMovement({ moving: true, noClip: false, terrain: null });
  assert.equal(sounds.handleActionCue(cue), false);
  sounds.setMovement({ moving: true, noClip: false, terrain: {} });
  state.effectsMuted = true;
  assert.equal(sounds.handleActionCue(cue), false);
  assert.equal(played.length, 1);
  state.effectsMuted = false;
  state.footstepsMuted = true;
  assert.equal(sounds.handleActionCue(cue), false);
  assert.equal(played.length, 1);
});

test("D000 door commands come only from native registration descriptors", () => {
  assert.equal(nativeD000DoorOpeningCommand(53), "ab022400");
  assert.deepEqual(nativeD000DoorCommands(44), [
    "ab022100",
    "ab022900",
    "ab022800",
  ]);
  assert.equal(nativeD000DoorOpeningCommand(25), null);
  assert.equal(nativeD000DoorOpeningCommand(53.5), null);
});

test("D000 door cues use their bank and attenuate from the listener", () => {
  const { sounds, played } = harness();
  sounds.setMovement({
    position: { x: 0, z: 0 },
  });
  assert.equal(sounds.handleInteractionCue({
    type: "nativeD000DoorOpening",
    doorSelector: 53,
    position: { x: 3, z: 0 },
  }), true);
  assert.equal(played[0].source, "/audio/world/f1dobuit/ab022400.webm");
  assert.equal(played[0].volume, 0.5 * 0.35 * 0.8 * 0.5);

  assert.equal(sounds.handleInteractionCue({
    type: "nativeD000DoorOpening",
    doorSelector: 25,
    position: { x: 1, z: 0 },
  }), false);
  assert.equal(sounds.handleInteractionCue({
    type: "nativeD000DoorOpening",
    doorSelector: 53,
    position: { x: 14, z: 0 },
  }), false);
  assert.equal(played.length, 1);
});

test("JOMO drawer cues use the dynamically proven native phases", () => {
  assert.equal(
    nativeJomoDrawerPhaseCommand("ATS1", "openingStart"),
    JOMO_DRAWER_PHASE_COMMANDS.openingStart,
  );
  assert.equal(
    nativeJomoDrawerPhaseCommand("ATS6", "closingImpact"),
    JOMO_DRAWER_PHASE_COMMANDS.closingImpact,
  );
  assert.equal(
    nativeJomoDrawerPhaseCommand("ATS7", "openingStart"),
    null,
  );

  const { sounds, played } = harness();
  sounds.setMovement({ position: { x: 0, z: 0 } });
  for (const phase of [
    "openingStart",
    "closingStart",
    "closingImpact",
  ]) {
    assert.equal(sounds.handleInteractionCue({
      type: "nativeJomoDrawerPhase",
      objectTag: "ATS1",
      phase,
      position: { x: 3, z: 0 },
    }), true);
  }
  assert.deepEqual(
    played.map(({ source }) => source),
    Object.values(JOMO_DRAWER_PHASE_COMMANDS).map(
      (commandHex) => `/audio/world/f1omoyaa/${commandHex}.webm`,
    ),
  );
  assert.ok(played.every(({ volume }) => (
    volume === 0.5 * 0.35 * 0.8 * 0.5
  )));

  assert.equal(sounds.handleInteractionCue({
    type: "nativeJomoDrawerPhase",
    objectTag: "ATS7",
    phase: "openingStart",
    position: { x: 1, z: 0 },
  }), false);
});

test("JOMO door cues retain every model-scoped native phase pair", () => {
  assert.equal(
    nativeJomoDoorPhaseCommand(
      "S1_JOMO_DR23_000.MT5",
      "openingStart",
    ),
    JOMO_DR23_DOOR_PHASE_COMMANDS.openingStart,
  );
  assert.equal(
    nativeJomoDoorPhaseCommand(
      "S1_JOMO_DR15_026.MT5",
      "openingStart",
    ),
    JOMO_DOOR_PHASE_COMMANDS_BY_MODEL[
      "S1_JOMO_DR15_026.MT5"
    ].openingStart,
  );

  const { sounds, played } = harness();
  sounds.setMovement({ position: { x: 0, z: 0 } });
  for (const [model, commands] of Object.entries(
    JOMO_DOOR_PHASE_COMMANDS_BY_MODEL,
  )) {
    for (const phase of ["openingStart", "closingStart"]) {
      assert.equal(sounds.handleInteractionCue({
        type: "nativeJomoDoorPhase",
        model,
        phase,
        position: { x: 3, z: 0 },
      }), true);
      assert.equal(
        played.at(-1).source,
        `/audio/world/f1omoyaa/${commands[phase]}.webm`,
      );
    }
  }
  assert.equal(sounds.handleInteractionCue({
    type: "nativeJomoDoorPhase",
    model: "S1_JOMO_NOT_A_DOOR.MT5",
    phase: "openingStart",
    position: { x: 1, z: 0 },
  }), false);
});

test("authored native sound cues resolve through their declared bank", () => {
  const { sounds, played } = harness();
  sounds.setMovement({
    position: { x: 12, z: 34 },
  });
  assert.equal(sounds.handleActionCue({
    type: "nativeSound",
    cue: {
      commandHex: "a9040200",
      bank: "e1gachap",
    },
  }), true);
  assert.equal(
    played[0].source,
    "/audio/world/e1gachap/a9040200.webm",
  );
  assert.equal(sounds.handleActionCue({
    type: "nativeSound",
    cue: {
      commandHex: "../bad",
      bank: "e1gachap",
    },
  }), false);
});

test("bank-scoped native commands use their proven room bank directory", () => {
  const { sounds, played } = harness();
  assert.equal(sounds.playCommand("a9056800", {
    bank: "f1dobuit",
  }), true);
  assert.equal(
    played[0].source,
    "/audio/world/f1dobuit/a9056800.webm",
  );
});

test("bank-scoped commands can select an explicitly packaged PCM asset", () => {
  const { sounds, played } = harness();
  assert.equal(sounds.playCommand("a9056500", {
    bank: "f1omoyaa",
    extension: "wav",
  }), true);
  assert.equal(
    played[0].source,
    "/audio/world/f1omoyaa/a9056500.wav",
  );
  assert.equal(sounds.playCommand("a9056500", {
    bank: "f1omoyaa",
    extension: "mp3",
  }), false);
});

test("world audio manifest proves every shipped default surface command", () => {
  const manifest = JSON.parse(readFileSync(
    new URL("../public/audio/world/manifest.json", import.meta.url),
  ));
  assert.equal(manifest.schema, "new-yokosuka-world-audio-v1");
  assert.equal(manifest.source.commandGroup, "ab03");
  assert.equal(manifest.source.nativeResolver, "FUN_0c17bb14");
  assert.deepEqual(
    manifest.surfaceIndices,
    [1, 2, 3, 4, 5, 8, 9, 10, 11, 13, 16, 17, 21],
  );
  assert.equal(manifest.tracks.length, 49);
  assert.deepEqual(
    manifest.unsupportedFootstepTracks.map(({ commandHex }) => commandHex),
    ["ab030b00", "ab030f00", "ab033380"],
  );
  assert.equal(manifest.source.transitionCommandGroup, "ab0a");
  const archivedTransitionCommands = [
    "ab0a0000",
    "ab0a0100",
    "ab0a0200",
  ];
  assert.deepEqual(
    manifest.transitionTracks.map(({ commandHex }) => commandHex),
    archivedTransitionCommands,
  );
  for (const surfaceIndex of manifest.surfaceIndices) {
    for (let variant = 0; variant < 4; variant += 1) {
      const commandHex = nativeFootstepCommand({ surfaceIndex, variant });
      const packaged = packagedNativeFootstepCommand({
        surfaceIndex,
        variant,
      });
      if (!packaged) {
        assert.ok(manifest.unsupportedFootstepTracks.some((track) => (
          track.commandHex === commandHex
        )));
        continue;
      }
      assert.ok(manifest.tracks.some((track) => (
        track.commandHex === commandHex
      )));
      assert.ok(existsSync(new URL(
        `../public/audio/world/${commandHex}.webm`,
        import.meta.url,
      )));
    }
  }
  for (const commandHex of archivedTransitionCommands) {
    assert.ok(existsSync(new URL(
      `../public/audio/world/system1/${commandHex}.webm`,
      import.meta.url,
    )));
  }
  assert.deepEqual(
    manifest.telmControllerTracks.map(({ commandHex }) => commandHex),
    [
      "ab050000",
      "ab050100",
      "ab050200",
      "ab050300",
      "ab050600",
      "ab050700",
    ],
  );
  assert.match(manifest.telmControllerRuntimeStatus, /unwired/);
  for (const track of manifest.telmControllerTracks) {
    if (track.controlOnly) {
      assert.equal(track.asset, null);
    } else {
      assert.ok(existsSync(new URL(
        `../public/audio/world/system1/${track.commandHex}.webm`,
        import.meta.url,
      )));
    }
  }
  assert.deepEqual(
    manifest.sharedSystemDirectTracks.map(({ commandHex }) => commandHex),
    [
      "ab000000",
      "ab000900",
      "ab000a00",
      "ab001100",
      "ab034200",
      "ab050400",
      "ab050500",
      "ab050600",
      "ab050700",
      "ab050800",
      "ab050900",
    ],
  );
  assert.equal(
    manifest.sharedSystemDirectTracks.reduce(
      (total, { callCount }) => total + callCount,
      0,
    ),
    322,
  );
  for (const track of manifest.sharedSystemDirectTracks) {
    if (track.controlOnly) {
      assert.equal(track.asset, null);
    } else {
      assert.ok(existsSync(new URL(
        `../public/audio/world/system1/${track.commandHex}.webm`,
        import.meta.url,
      )));
    }
  }
});

test("D000 door manifest proves every registered command asset", () => {
  const manifest = JSON.parse(readFileSync(
    new URL(
      "../public/audio/world/f1dobuit/manifest.json",
      import.meta.url,
    ),
  ));
  assert.equal(manifest.schema, "new-yokosuka-d000-door-audio-pack-v1");
  assert.equal(manifest.source.commandGroup, "ab02");
  assert.equal(manifest.tracks.length, 5);
  for (const track of manifest.tracks) {
    assert.ok(existsSync(new URL(
      `../public/audio/world/f1dobuit/${track.commandHex}.webm`,
      import.meta.url,
    )));
  }
});

test("D000 vending AUTH commands have bank-scoped assets without runtime guesses", () => {
  const manifest = JSON.parse(readFileSync(
    new URL(
      "../public/audio/world/a1_yanji/manifest.json",
      import.meta.url,
    ),
  ));
  const evidence = JSON.parse(readFileSync(
    new URL(
      "../tools/evidence/d000-vending-interaction.json",
      import.meta.url,
    ),
  ));
  assert.equal(
    manifest.schema,
    "new-yokosuka-d000-vending-audio-pack-v1",
  );
  assert.equal(manifest.source.commandGroup, "a904");
  assert.match(manifest.runtimeStatus, /intentionally unwired/);
  const authoredCommands = [...new Set(
    evidence.authoredSequences.flatMap(({ sounds }) => (
      sounds.filter(({ stop }) => !stop).map(({ commandHex }) => commandHex)
    )),
  )].sort();
  assert.deepEqual(
    manifest.tracks.map(({ commandHex }) => commandHex),
    authoredCommands,
  );
  for (const commandHex of authoredCommands) {
    assert.ok(existsSync(new URL(
      `../public/audio/world/a1_yanji/${commandHex}.webm`,
      import.meta.url,
    )));
  }
});

test("D000 phone-book AUTH commands have exact bank-scoped assets", () => {
  const manifest = JSON.parse(readFileSync(
    new URL(
      "../public/audio/world/a1_telp/manifest.json",
      import.meta.url,
    ),
  ));
  const evidence = JSON.parse(readFileSync(
    new URL(
      "../tools/evidence/d000-phone-book-audio.json",
      import.meta.url,
    ),
  ));
  assert.equal(evidence.status, "verified");
  assert.equal(
    manifest.schema,
    "new-yokosuka-d000-phone-book-audio-pack-v1",
  );
  assert.equal(manifest.source.commandGroup, "a904");
  assert.match(manifest.runtimeStatus, /intentionally unwired/);
  const authoredCommands = [...new Set(
    evidence.timeline.sounds.map(({ commandHex }) => commandHex),
  )].sort();
  assert.deepEqual(
    manifest.tracks.map(({ commandHex }) => commandHex),
    authoredCommands,
  );
  for (const commandHex of authoredCommands) {
    assert.ok(existsSync(new URL(
      `../public/audio/world/a1_telp/${commandHex}.webm`,
      import.meta.url,
    )));
  }
});
