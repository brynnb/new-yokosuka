import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildShenmue1ScriptedSceneInventory,
  describeAuthPayload,
  discoverEmbeddedAuthTracks,
  INVENTORY_SCHEMA,
  parseIpacArchive,
} from "../tools/scripting/build_shenmue1_scripted_scene_inventory.mjs";

function authFixture() {
  const aseqBody = Buffer.alloc(20);
  aseqBody.writeUInt8(0, 0);
  aseqBody.writeUInt8(5, 1);
  aseqBody.writeUInt32LE(30, 4);
  aseqBody.writeInt32LE(0, 8);
  aseqBody.writeUInt32LE(0, 12);
  aseqBody.writeInt32LE(-1, 16);
  const aseq = Buffer.alloc(8 + aseqBody.length);
  aseq.write("ASEQ", 0, 4, "ascii");
  aseq.writeUInt32LE(aseq.length, 4);
  aseqBody.copy(aseq, 8);
  const track = Buffer.alloc(8 + aseq.length);
  track.write("TRCK", 0, 4, "ascii");
  track.writeUInt32LE(track.length, 4);
  aseq.copy(track, 8);
  return track;
}

function archiveFixture(memberBytes) {
  const ipacOffset = 16;
  const contentOffset = 16;
  const dictionaryOffset = contentOffset + memberBytes.length;
  const ipac = Buffer.alloc(dictionaryOffset + 20);
  ipac.write("IPAC", 0, 4, "ascii");
  ipac.writeUInt32LE(dictionaryOffset, 4);
  ipac.writeUInt32LE(1, 8);
  ipac.writeUInt32LE(memberBytes.length, 12);
  memberBytes.copy(ipac, contentOffset);
  ipac.write("SEQDATA", dictionaryOffset, 7, "ascii");
  ipac.write("AUTH", dictionaryOffset + 8, 4, "ascii");
  ipac.writeUInt32LE(contentOffset, dictionaryOffset + 12);
  ipac.writeUInt32LE(memberBytes.length, dictionaryOffset + 16);
  const paks = Buffer.alloc(ipacOffset + ipac.length);
  paks.write("PAKS", 0, 4, "ascii");
  paks.writeUInt32LE(ipacOffset, 4);
  ipac.copy(paks, ipacOffset);
  return paks;
}

test("scripted-scene inventory parses structural IPAC and AUTH boundaries", () => {
  const auth = authFixture();
  const archive = parseIpacArchive(archiveFixture(auth));
  assert.equal(archive.containerMagic, "PAKS");
  assert.equal(archive.members.length, 1);
  assert.equal(archive.members[0].name, "SEQDATA");
  assert.equal(archive.members[0].extension, "AUTH");
  assert.deepEqual(archive.members[0].bytes, auth);

  const detail = describeAuthPayload(archive.members[0].bytes);
  assert.equal(detail.parseStatus, "complete");
  assert.equal(detail.durationFrames, 30);
  assert.deepEqual(detail.commandCounts, {});
});

test("embedded AUTH discovery rejects coincidental and truncated TRCK markers", () => {
  const auth = authFixture();
  const mapinfo = Buffer.alloc(32 + auth.length);
  mapinfo.write("TRCK", 0, 4, "ascii");
  mapinfo.writeUInt32LE(0xfffffff0, 4);
  auth.copy(mapinfo, 32);
  const tracks = discoverEmbeddedAuthTracks(mapinfo);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].offset, 32);
  assert.equal(tracks[0].detail.durationFrames, 30);
});

test("all-disc inventory keeps logical resources separate from payloads", (context) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ny-scripted-scenes-"));
  context.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const roots = [];
  const auth = authFixture();
  for (let disc = 1; disc <= 3; disc += 1) {
    const scene = String(disc).padStart(2, "0");
    const root = path.join(temporary, `disc${disc}`, "SCENE", scene);
    const area = path.join(root, disc === 1 ? "OP00" : "D000");
    fs.mkdirSync(area, { recursive: true });
    const mapinfo = Buffer.alloc(16 + (disc === 1 ? auth.length : 0));
    if (disc === 1) auth.copy(mapinfo, 16);
    fs.writeFileSync(path.join(area, "MAPINFO.BIN"), mapinfo);
    fs.writeFileSync(path.join(area, "AUTH.PKS"), archiveFixture(auth));
    roots.push({ disc, scene, root });
  }

  const inventory = buildShenmue1ScriptedSceneInventory({ roots });
  assert.equal(inventory.schema, INVENTORY_SCHEMA);
  assert.equal(inventory.summary.mapinfoProgramCount, 3);
  assert.equal(inventory.summary.authResourceCount, 4);
  assert.equal(inventory.summary.embeddedAuthResourceCount, 1);
  assert.equal(inventory.summary.archiveAuthResourceCount, 3);
  assert.equal(inventory.summary.uniqueAuthPayloadCount, 1);
  assert.equal(inventory.authPayloads[0].logicalResourceIds.length, 4);
  assert.equal(inventory.summary.sourceIssueCount, 0);
});

test("committed scripted-scene source evidence is internally consistent", () => {
  const inventory = JSON.parse(fs.readFileSync(
    "tools/evidence/shenmue1-scripted-scene-inventory.json",
    "utf8",
  ));
  assert.equal(inventory.schema, INVENTORY_SCHEMA);
  assert.equal(inventory.summary.mapinfoProgramCount, inventory.mapinfoPrograms.length);
  assert.equal(inventory.summary.archiveWithAuthCount, inventory.archiveSources.length);
  assert.equal(inventory.summary.authResourceCount, inventory.authResources.length);
  assert.equal(inventory.summary.uniqueAuthPayloadCount, inventory.authPayloads.length);
  const resources = new Map(inventory.authResources.map(record => [record.id, record]));
  assert.equal(resources.size, inventory.authResources.length);
  for (const payload of inventory.authPayloads) {
    for (const resourceId of payload.logicalResourceIds) {
      assert.equal(resources.get(resourceId)?.payloadSha256, payload.sha256);
    }
  }
});
