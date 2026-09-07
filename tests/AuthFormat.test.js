import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  evaluateAuthCamera,
  parseAuthCamera,
} from "../src/AuthCamera.js";
import {
  evaluateAuthActor,
  parseAuthMovement,
} from "../src/AuthMovement.js";
import { parseAuthSequence } from "../src/AuthSequence.js";
import { parseAuthStrings } from "../src/AuthStrings.js";
import { parseAuthTrack } from "../src/AuthTrack.js";

const discWork = process.env.NEW_YOKOSUKA_DISC_WORK || ".disc-work";

function tagValue(tag) {
  const bytes = Buffer.alloc(4);
  bytes.write(tag, 0, 4, "ascii");
  return bytes.readUInt32LE(0);
}

function command(type, args) {
  const bytes = Buffer.alloc(4 + args.length * 4);
  bytes.writeUInt8(type, 0);
  bytes.writeUInt8(args.length, 1);
  args.forEach((value, index) => bytes.writeUInt32LE(value >>> 0, 4 + index * 4));
  return bytes;
}

function frame(number, commands) {
  const header = Buffer.alloc(4);
  header.writeInt32LE(number);
  return Buffer.concat([header, ...commands, Buffer.alloc(4)]);
}

function curve(value, time = 0) {
  if (value === null) return Buffer.alloc(4);
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32LE(1, 0);
  bytes.writeFloatLE(time, 4);
  bytes.writeFloatLE(value, 8);
  bytes.writeFloatLE(0, 12);
  return bytes;
}

function chunk(tag, body) {
  const bytes = Buffer.alloc(8 + body.length);
  bytes.write(tag, 0, 4, "ascii");
  bytes.writeUInt32LE(bytes.length, 4);
  body.copy(bytes, 8);
  return bytes;
}

function indexedSplineChunk(tag, records) {
  const headerSize = 16 + (records.length + 1) * 4;
  const offsets = [];
  let nextOffset = headerSize;
  for (const record of records) {
    offsets.push(nextOffset);
    nextOffset += record.length;
  }
  offsets.push(nextOffset);
  const body = Buffer.alloc(headerSize - 8);
  body.writeUInt32LE(records.length, 4);
  offsets.forEach((offset, index) => body.writeUInt32LE(offset, 8 + index * 4));
  return chunk(tag, Buffer.concat([body, ...records]));
}

function fixture() {
  const cameraId = tagValue("(^^;");
  const actor = tagValue("AKIR");
  const aseqHeader = Buffer.alloc(8);
  aseqHeader.writeUInt8(0, 0);
  aseqHeader.writeUInt8(5, 1);
  aseqHeader.writeUInt32LE(60, 4);
  const duration = Buffer.alloc(4);
  duration.writeFloatLE(1.5);
  const aseq = chunk("ASEQ", Buffer.concat([
    aseqHeader,
    frame(0, [
      command(1, [cameraId, 0]),
      command(2, [actor, 0]),
      command(3, [actor, 0x1001, 0, 30, 0]),
      command(5, [actor, 0, 0xffffffff, 4, duration.readUInt32LE(0)]),
    ]),
    frame(30, [command(6, [0x04a9, 9, 1])]),
    frame(60, [command(6, [
      0x04a9,
      12,
      2,
      0,
      127,
      4,
      16,
      0,
      duration.readUInt32LE(0),
    ])]),
    Buffer.from([0xff, 0xff, 0xff, 0xff]),
  ]));

  const movementRecord = Buffer.concat([
    curve(1),
    curve(2),
    curve(3),
    curve(4),
    curve(5),
    curve(6),
    curve(7),
    curve(null),
    curve(9),
  ]);
  const cameraFlags = Buffer.alloc(4);
  cameraFlags.writeUInt32LE(0x61);
  const cameraRecord = Buffer.concat([
    cameraFlags,
    curve(10),
    curve(20),
    curve(30),
    curve(40),
    curve(50),
    curve(60),
    curve(70),
    curve(80),
  ]);
  const chunks = [
    aseq,
    indexedSplineChunk("ACAM", [cameraRecord]),
    indexedSplineChunk("AMOV", [movementRecord]),
  ];
  const track = Buffer.concat([Buffer.alloc(8), ...chunks]);
  track.write("TRCK", 0, 4, "ascii");
  track.writeUInt32LE(track.length, 4);
  return track;
}

test("AUTH parser follows the TRCK chunk directory and ordered ASEQ timeline", () => {
  const bytes = fixture();
  const track = parseAuthTrack(bytes);
  assert.deepEqual(track.chunks.map(({ tag }) => tag), ["ASEQ", "ACAM", "AMOV"]);

  const sequence = parseAuthSequence(bytes);
  assert.equal(sequence.version, 5);
  assert.equal(sequence.durationFrames, 60);
  assert.deepEqual(sequence.frames.map(({ frame }) => frame), [0, 30, 60]);
  assert.deepEqual(sequence.actors, ["AKIR"]);
  assert.equal(sequence.motions[0].motionBank, 0x10);
  assert.equal(sequence.motions[0].sequenceIndex, 0);
  assert.deepEqual(
    sequence.frames[0].commands.map(({ name }) => name),
    ["camera", "move", "motion", "voice"],
  );
  assert.equal(sequence.frames[0].commands[3].durationSeconds, 1.5);
  assert.equal(sequence.frames[1].commands[0].argc, 3);
  assert.equal(sequence.frames[2].commands[0].volume, 127);
});

test("AUTH movement parses all nine channels, including empty face curves", () => {
  const movement = parseAuthMovement(fixture());
  assert.deepEqual(Object.keys(movement.actors[0].channels), [
    "x",
    "y",
    "z",
    "rotationX",
    "rotationY",
    "rotationZ",
    "faceX",
    "faceY",
    "faceZ",
  ]);
  assert.deepEqual(evaluateAuthActor(movement.actors[0], 0), {
    x: 1,
    y: 2,
    z: 3,
    rotationX: 4,
    rotationY: 5,
    rotationZ: 6,
    faceX: 7,
    faceY: 0,
    faceZ: 9,
  });
  assert.equal(movement.actors[0].trailingByteCount, 0);
});

test("AUTH camera parses flags and its exact serialized channel order", () => {
  const camera = parseAuthCamera(fixture());
  assert.equal(camera.cameras[0].flags, 0x61);
  assert.deepEqual(evaluateAuthCamera(camera.cameras[0], 0), {
    positionX: 10,
    positionY: 20,
    positionZ: 30,
    targetX: 40,
    targetY: 50,
    targetZ: 60,
    roll: 70,
    perspective: 80,
  });
});

test("AUTH parsing fails closed instead of scanning for coincidental markers", () => {
  const bytes = fixture();
  assert.throws(
    () => parseAuthTrack(Buffer.concat([Buffer.alloc(4), bytes])),
    /TRCK header/,
  );

  const malformed = Buffer.from(bytes);
  malformed.writeUInt8(7, 28);
  assert.throws(() => parseAuthSequence(malformed), /Unknown AUTH ASEQ command/);
});

const drauthRoot = `${discWork}/exact/d000/unpacked/DRAUTH`;
test("DRAUTH activity resources parse as exact complete timelines", {
  skip: (
    !fs.existsSync(`${drauthRoot}/SEQDATA1.AUTH`)
    && "requires locally extracted DRAUTH source files"
  ),
}, () => {
  const expected = [
    {
      file: "SEQDATA1.AUTH",
      durationFrames: 1330,
      frameCount: 46,
      commandCounts: { camera: 1, move: 6, motion: 9, sound: 33, voice: 11 },
      movementDuration: 44.349998474121094,
      cameraDuration: 44.36666488647461,
    },
    {
      file: "SEQDATA2.AUTH",
      durationFrames: 500,
      frameCount: 21,
      commandCounts: { camera: 1, move: 6, motion: 9, sound: 15, voice: 1 },
      movementDuration: 16.683332443237305,
      cameraDuration: 16.683332443237305,
    },
  ];
  for (const fixture of expected) {
    const bytes = fs.readFileSync(`${drauthRoot}/${fixture.file}`);
    const sequence = parseAuthSequence(bytes);
    const movement = parseAuthMovement(bytes);
    const camera = parseAuthCamera(bytes);
    const strings = parseAuthStrings(bytes);
    const commandCounts = {};
    for (const { commands } of sequence.frames) {
      for (const { name } of commands) {
        commandCounts[name] = (commandCounts[name] || 0) + 1;
      }
    }
    assert.deepEqual(sequence.actors, [
      "AKIR",
      "SMTH",
      "HARY",
      "TONY",
      "SERA",
      "JONZ",
    ]);
    assert.equal(sequence.durationFrames, fixture.durationFrames);
    assert.equal(sequence.frames.length, fixture.frameCount);
    assert.deepEqual(commandCounts, fixture.commandCounts);
    assert.equal(sequence.motions.length, 9);
    assert.equal(movement.duration, fixture.movementDuration);
    assert.equal(camera.duration, fixture.cameraDuration);
    assert.equal(camera.cameras.length, 1);
    assert.ok(strings.strings.length > 0);
    for (const { commands } of sequence.frames) {
      for (const command of commands) {
        if (Number.isInteger(command.stringIndex)) {
          assert.ok(command.stringIndex < strings.strings.length);
        }
      }
    }
    assert.ok(movement.actors.every((actor) => actor.trailingByteCount === 0));
  }
});
