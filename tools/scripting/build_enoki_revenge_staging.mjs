// Build the three DEFB scenes from its actual timed calls and retail ECAM curves.
import fs from "node:fs";
import path from "node:path";
import {sha256} from "../lib/NativeAseqActivityPack.mjs";
import {MotnLoader} from "../../src/MotnLoader.js";
import {evaluateAuthCamera} from "../../src/AuthCamera.js";

const root = path.resolve(import.meta.dirname, "../..");
const read = file => fs.readFileSync(path.join(root, file));
const json = file => JSON.parse(read(file));
const evidence = json("tools/evidence/d000-enoki-revenge-director.json");
const cameraCatalog = json("tools/evidence/d000-event-camera-catalog.json");
const map = read(evidence.source);
if (sha256(map) !== evidence.mapinfoSha256 || cameraCatalog.mapinfoSha256 !== evidence.mapinfoSha256) {
  throw Error("D000 scene and camera source digests disagree");
}
const cameras = new Map(cameraCatalog.records.map(record => [record.cameraNumber, record]));
const bankPath = "play/assets/dobuita/enoki-revenge/M_DEFB.MOTN";
const eventBank = MotnLoader.parse(read(bankPath));
const sharedBank = MotnLoader.parse(read("extracted_files/data/MOTION/MOTION.BIN"));
const definitions = [
  ["ENKI", "Akio Enoki", "YAA_L"], ["NGSM", "Tetsuya Nagashima", "YAB_L"],
  ["TMNY", "Enoki's friend", "YAC_L"], ["MYTY", "Enoki's friend", "YAE_L"],
].map(([actorCode, label, modelCode]) => ({actorCode, label, modelCode, activityOnly: true}));
const tags = ["AKIR", ...definitions.map(actor => actor.actorCode)];
const axes = ["x", "y", "z", "rotationX", "rotationY", "rotationZ"];
const base = {x: 10, y: 0, z: 64, rotationY: 0};
const ground = map.readFloatLE(0xae0a4 + 4);
const fps = 30;
const immediate = 0xffffffff;
const word = Buffer.alloc(4);
function float(value) { word.writeUInt32LE(value); return word.readFloatLE(); }
function tag(value) { word.writeUInt32LE(value); return word.toString("ascii"); }

// Native workers wait relative to their launch. The introductory group waits
// 100 ticks before starting its second batch. Victory waits 1,020 ticks before
// queuing the escape. Camera 8911 and 8912 each contain 260 ticks of rails.
function phase(stage, offset) {
  if (stage === "intro" && offset >= 0x65544) return 100;
  if (stage === "win" && offset >= 0x66fd4) return 1020;
  return 0;
}
const durations = {intro: 530, defeat: 260, win: 1280};
function atFrame(stage, address, delay) {
  return phase(stage, Number(address)) + (delay === immediate ? 0 : delay);
}
function clip(id) {
  const local = id >= 0x7801;
  const sequence = (local ? eventBank : sharedBank).sequences[id - (local ? 0x7801 : 1)];
  if (!sequence?.valueData?.complete) throw Error("Unavailable original motion " + id);
  return {bank: local ? "enokiRevenge" : "free", name: sequence.name, loop: /(?:_LP(?:_|$)|_WALK_SLOW$)/.test(sequence.name)};
}
function placed(x, z, yaw, parent) {
  const angle = parent.rotationY * Math.PI / 180;
  return {x: parent.x + x*Math.cos(angle) + z*Math.sin(angle), y: ground,
    z: parent.z - x*Math.sin(angle) + z*Math.cos(angle), rotationX: 0, rotationY: parent.rotationY + yaw, rotationZ: 0};
}
function linear() { return {times: [], values: [], interpolation: "linear"}; }
function key(curve, time, value) { curve.times.push(time); curve.values.push(value); }
function movement(keys, duration) {
  const channels = {};
  for (const axis of axes) {
    const curve = linear();
    let previous = keys[0].pose[axis];
    key(curve, 0, previous);
    for (const {frame, pose} of keys.slice(1)) {
      if (pose[axis] === previous) continue;
      key(curve, frame / fps, previous);
      previous = pose[axis];
      key(curve, frame / fps, previous);
    }
    key(curve, duration / fps, previous);
    channels[axis] = curve;
  }
  return {channels};
}
function cameraTimeline(shots) {
  const cameraCuts = shots.map(shot => {
    const record = cameras.get(shot.id);
    if (!record) throw Error("Missing original ECAM " + shot.id);
    const channels = {};
    for (const [field, curve] of Object.entries(record.curves)) {
      // BASE translates position and target horizontally; its Y and rotation
      // are both zero. Translation preserves the original Hermite derivatives.
      const offset = field.endsWith("X") ? base.x : field.endsWith("Z") ? base.z : 0;
      channels[field] = {times: curve.times, values: curve.values.map(v => v + offset), tangents: curve.slopes};
    }
    return {cameraNumber: shot.id, atSeconds: shot.frame/fps, channels};
  });
  return {camera: evaluateAuthCamera(cameraCuts[0], 0), cameraCuts};
}
function build(stage, director) {
  const duration = durations[stage];
  const positions = Object.fromEntries(tags.map(t => [t, []]));
  const motions = Object.fromEntries(tags.map(t => [t, []]));
  const shots = [];
  const dialogueCues = [];
  const operations = director.calls.flatMap(([address, type, args]) => {
    if (!args.length || args.some(v => v == null)) throw Error("Unresolved DEFB call at " + address);
    if (type === "rotateTicks") {
      // Helper 0x63cd4 converts degrees to signed native turns using FTRC,
      // writes the Y component at +4, then yields once per increment.
      const [actor, delay, ticks, degrees] = args;
      const delta = Math.trunc(float(degrees) * 65536 / 360) * 360 / 65536;
      const start = atFrame(stage, address, delay);
      return Array.from({length: ticks}, (_, tick) => ({type: "rotate", args: [actor, delta], frame: start+tick, address}));
    }
    return [{type, args, frame: atFrame(stage, address, args.at(-1)), address}];
  });
  for (const {type, args, frame, address} of operations.sort((a,b) => a.frame-b.frame || Number(a.address)-Number(b.address))) {
    if (type === "camera") {
      if (tag(args[1]) !== "BASE" || tag(args[2]) !== "BASE") throw Error("Unexpected camera anchors");
      shots.push({frame, id: args[0]});
    } else if (type === "voice") {
      const index = args[0];
      const part = index < 4 ? ["A", index+1] : index < 12 ? ["B", index-3] : ["C", index-11];
      const voiceId = "E1065" + part[0] + String(part[1]).padStart(3, "0");
      dialogueCues.push({voiceId, atSeconds: frame/fps});
    } else if (["place", "turn", "rotate"].includes(type)) {
      const actor = tag(args[0]);
      if (actor === "BASE") continue;
      const parentTag = type === "rotate" ? "BASE" : tag(args[1]);
      const parent = parentTag === "BASE" || args[1] === immediate ? base : positions[parentTag]?.at(-1)?.pose;
      if (!parent) throw Error("Unresolved stage mark at " + address);
      const pose = type === "place" ? placed(float(args[2]), float(args[3]), float(args[4]), parent)
        : {...positions[actor].at(-1).pose, rotationY: type === "rotate" ? positions[actor].at(-1).pose.rotationY + args[1] : parent.rotationY + float(args[2])};
      const keys = positions[actor];
      if (keys.at(-1)?.frame === frame) keys.pop();
      keys.push({frame, pose});
    } else if (type === "motion") {
      const [actorWord, id, start, speed] = args;
      const track = motions[tag(actorWord)];
      if (track.at(-1)?.frame === frame) track.pop();
      track.push({frame, motion: clip(id), startSeconds: float(start)/fps, playbackRate: float(speed)});
    }
  }
  const actors = tags.map(actor => {
    const poses = positions[actor], sequence = motions[actor];
    // Combat releases its cast before Story acquires the aftermath. These
    // three losers have no new initial motion in the director. The same DEFB
    // room uses free motion 958 as its resting knockdown in the loss scene.
    if (stage === "win" && sequence[0]?.frame > 0 && ["NGSM","MYTY","TMNY"].includes(actor)) {
      sequence.unshift({frame: 0, motion: clip(958), startSeconds: 0, playbackRate: 1});
    }
    if (poses[0]?.frame !== 0 || sequence[0]?.frame !== 0) throw Error("Missing initial cue: " + stage + "/" + actor);
    const [initial, ...rest] = sequence;
    return {tag: actor, pose: poses[0].pose, motion: initial.motion, playbackRate: initial.playbackRate,
      motionStartSeconds: initial.startSeconds, ...(poses.length>1 ? {movement: movement(poses, duration)} : {}),
      motionCues: rest.map(({frame, ...cue}) => ({atSeconds: frame/fps, ...cue}))};
  });
  return {id: "s1.d000.enoki-revenge-" + stage, area: "D000", worldId: "dobuita",
    actorDefinitions: definitions, actors, ...cameraTimeline(shots), durationSeconds: duration/fps,
    isolateScheduledActors: true, holdEndPose: true, playThroughFinish: true, dialogueCues,
    provenance: "D000 DEFB " + director.owner + ". Original stage marks, motion requests and ECAM shots. E1065 dialogue advances through Story."};
}
const scenes = Object.entries(evidence.stages).map(([stage, director]) => build(stage, director));
const schema = json("play/data/authored-story-scenes.json").schema;
const output = path.join(root, "play/data/story-enoki-revenge.generated.json");
const serialized = JSON.stringify({schema, motionBanks: {enokiRevenge: bankPath}, scenes}) + "\n";
if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== serialized) {
  fs.writeFileSync(output, serialized);
}
