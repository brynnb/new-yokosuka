// Recover the workers, postures and camera for the original upstairs listening scene.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {parseIpacActivityArchive, sha256} from "../lib/NativeAseqActivityPack.mjs";
import {composeEventCameraShots} from "../lib/StagedEventCamera.mjs";
import {MotnLoader} from "../../src/MotnLoader.js";

const root = path.resolve(import.meta.dirname, "../..");
const area = path.join(process.env.SHENMUE_DISC2_EXTRACTED_ROOT || path.join(root, "extracted_disc2_v2"), "data/SCENE/02/MS8S");
const mapFile = path.join(area, "MAPINFO.BIN");
const map = fs.readFileSync(mapFile);
if (sha256(map) !== "0f0914b81f40fb73e87b073d955a1b9f5c46e4b094efeabf1215e3ea16e947c2") throw Error("Changed MS8S director");
const archive = parseIpacActivityArchive(fs.readFileSync(path.join(area, "MPK00.PKS")));
const prefix = "play/assets/harbor/warehouse-eight";
const assetRegistry = path.join(root, "src/runtime-assets.generated.json");
const registry = JSON.parse(fs.readFileSync(assetRegistry));
const catalogPath = path.join(root, "play/data/authored-story-scenes.json");
let catalogText = fs.readFileSync(catalogPath, "utf8");
const catalog = JSON.parse(catalogText);
function bank(key, name, expected) {
  const bytes = archive.members.find(member => member.name === name)?.bytes;
  if (!bytes || sha256(bytes) !== expected) throw Error("Changed MS8S motion " + name);
  const target = prefix + "/" + name;
  fs.writeFileSync(path.join(root, target), bytes);
  registry.assets[target] = {sha256: expected, size: bytes.length};
  if (catalog.motionBanks[key] && catalog.motionBanks[key] !== target) throw Error("Conflicting bank " + key);
  if (!catalog.motionBanks[key]) catalogText = catalogText.replace('"motionBanks":{', '"motionBanks":{' + JSON.stringify(key) + ':' + JSON.stringify(target) + ',');
  const clips = MotnLoader.parse(bytes).sequences;
  return (index, loop) => ({bank: key, name: clips[index].name, loop});
}
const listen = bank("warehouseOfficeRyo", "M_0153.MOTN", "b64317c6c2340df367025b80673dae6054ba8371283f00e2d08b512bf5699cde");
const workers = bank("warehouseOfficeStaff", "M_MS8S.MOTN", "dadd2b76d28260333b187170cec10af6dff1a6ab34b69013e70e921da8307979");
const staff = [
  {actorCode:"TMHN",label:"Tomohito Niizato",modelCode:"KWA_L",activityOnly:true},
  {actorCode:"TKSA",label:"Tsukasa Takagi",modelCode:"SGK_L",activityOnly:true}
];
for (const {modelCode} of staff) {
  const name = modelCode + ".CHRM";
  const member = archive.members.find(member => member.name === name);
  if (!member?.bytes.equals(fs.readFileSync(path.join(root, "play/assets/characters", name)))) throw Error("MS8S worker model mismatch " + modelCode);
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ny-warehouse-office-"));
let camera;
try {
  const out = path.join(temp, "cameras.json");
  execFileSync("python3", ["-m", "tools.scripting.extract_event_camera_catalog", mapFile, "--out", out, "--camera", "1106"], {cwd:root, stdio:"pipe"});
  const record = JSON.parse(fs.readFileSync(out)).records.find(r => r.cameraNumber === 1106);
  camera = composeEventCameraShots(new Map([[1106,record]]), [{frame:0,cameraNumber:1106}], 130);
} finally {
  fs.rmSync(temp, {recursive:true, force:true});
}
const pose = (x,y,z,yaw) => ({x,y,z,rotationX:0,rotationY:yaw*360/65536,rotationZ:0});
const id = "s1.ms8s.warehouse-eight-office";
// The raw floats and turn angles are the arguments to MS8S 0x25c30 / 0x25c4c.
// Ryo moves to the static vector at 0x2bea0 before the native listening posture.
const scene = {id, area:"MS8S",worldId:"ms8s",durationSeconds:130/30,waitForMotionCompletion:false,actorDefinitions:staff,isolateScheduledActors:true,
  actors:[
    {tag:"AKIR",pose:pose(map.readFloatLE(0x2bea0),map.readFloatLE(0x2bea4),map.readFloatLE(0x2bea8),8192),motion:listen(1,false)},
    {tag:"TMHN",pose:pose(15.5600004196167,4.275000095367432,131.08999633789062,40413),motion:workers(1,true)},
    {tag:"TKSA",pose:pose(16.779199600219727,4.275000095367432,132.35000610351562,7094),motion:workers(0,true)}
  ],...camera,provenance:"MS8S/0x25bd8 places the two workers. The 0x27284 invoice director moves AKIR to 0x2bea0, requests camera 1106 and clips 0x2002, 0x1001 and 0x1002. This stage retains the original camera movement and listening action, holding the final shot through the dialogue. Staff movement loops are adapted to line playback timing."};
const line = new RegExp('^    \\{"id":"' + id.replaceAll('.', '\\.') + '".*?\\},$', 'm');
if (!line.test(catalogText)) throw Error("Missing office scene entry");
fs.writeFileSync(catalogPath, catalogText.replace(line, '    ' + JSON.stringify(scene) + ','));
registry.assets = Object.fromEntries(Object.entries(registry.assets).sort(([a],[b]) => a.localeCompare(b)));
fs.writeFileSync(assetRegistry, JSON.stringify(registry,null,2) + "\n");
