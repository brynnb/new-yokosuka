import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {ThirdPersonController} from "../src/ThirdPersonController.js";
import { WORLDS } from "../play/config/worlds.js";
import {
  parseNativeCollisionResponse,
  applyNativeDoorCollisionStates,
  createNativeWorldCollision,
  nativeCollisionDefinitionForWorld,
  loadNativeCollisionDefinitionForWorld,
  nativeCollisionSegments,
} from "../play/world/NativeWorldCollision.js";
import {
  parseNativeWorldCollisions,
} from "../tools/lib/native-world-collisions.mjs";
import {
  parseShenmue2WorldCollisions,
} from "../tools/lib/shenmue2-world-collisions.mjs";
import { discoverNativeStairFieldHandoffs, nativeStairFieldAtPosition } from "../src/NativeCollisionFieldHandoffs.js";

test("field handoffs require matching native stair markers and both alternate side walls",()=>{
  const data=JSON.parse(fs.readFileSync(new URL("../public/data/native-collisions/D000.json",import.meta.url)));
  const definition=nativeCollisionDefinitionForWorld({nativeArea:"D000",prefix:"S1_D000"},data);
  const alternate=definition.variantFields.find(field=>field.id==="0001");
  const handoffs=discoverNativeStairFieldHandoffs(definition.field,alternate,nativeCollisionSegments);
  assert.equal(handoffs.length,1);assert.equal(handoffs[0].sourceRecordOffset,9532);
  assert.equal(nativeStairFieldAtPosition(handoffs,{x:103.334,z:101.323},.24),true);
  assert.equal(nativeStairFieldAtPosition(handoffs,{x:101.227,z:96.496},.24),false);
  assert.equal(nativeStairFieldAtPosition(handoffs,{x:100.445,z:99.945},.24),false);
  const stripped=structuredClone(alternate);
  for(const section of stripped.sections)section.records=section.records.filter(record=>record.code!==9);
  assert.deepEqual(discoverNativeStairFieldHandoffs(definition.field,stripped,nativeCollisionSegments),[]);
  const missingGates=structuredClone(alternate);
  for(const section of missingGates.sections)section.records=section.records.filter(record=>record.code!==10);
  assert.deepEqual(discoverNativeStairFieldHandoffs(definition.field,missingGates,nativeCollisionSegments),[]);
  const distantSide=structuredClone(alternate);
  const side=distantSide.sections.flatMap(section=>section.records).find(record=>record.recordOffset===56);
  for(const point of [side.geometry.start,side.geometry.end]){point[0]-=20;point[1]-=20*3.57456/2.7677;}
  assert.deepEqual(discoverNativeStairFieldHandoffs(definition.field,distantSide,nativeCollisionSegments),[],"collinear but remote walls do not qualify");
  const engine=new BABYLON.NullEngine(),scene=new BABYLON.Scene(engine),currentMeshes=[];
  const meshes=createNativeWorldCollision({scene,currentMeshes,definition});
  assert.ok(meshes.some(mesh=>mesh.metadata.nativeCollisionFieldRole==="base"&&mesh.metadata.nativeCollisionRecordOffsets.includes(9532)),"base wall remains available");
  assert.ok(meshes.some(mesh=>mesh.metadata.nativeCollisionFieldRole==="alternate"&&mesh.metadata.nativeCollisionField==="0001"),"alternate boundaries are loaded");
  assert.deepEqual(meshes.find(mesh=>mesh.metadata.nativeCollisionFieldRole==="base").metadata.nativeCollisionHandoffs,handoffs);
  scene.dispose();engine.dispose();
});

test("custom world geometry does not borrow source-area collision in a different frame",async()=>{
  const world=WORLDS["s1-voyage"],area=JSON.parse(fs.readFileSync(new URL("../public/data/native-collisions/MEND.json",import.meta.url)));
  assert.ok(nativeCollisionDefinitionForWorld(WORLDS.mend,area));
  assert.equal(nativeCollisionDefinitionForWorld(world,area),null);
  assert.equal(await loadNativeCollisionDefinitionForWorld(world),null);
});

function record(code, shapeType, payload) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(code, 0);
  header.writeUInt32LE(shapeType, 4);
  const terminator = Buffer.alloc(4, 0xff);
  return Buffer.concat([header, payload, terminator]);
}

function floats(...values) {
  const output = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => output.writeFloatLE(value, index * 4));
  return output;
}

function mapinfoFixture(records) {
  const coliPayload = Buffer.concat(records);
  const coliHeader = Buffer.alloc(8);
  coliHeader.write("COLI", 0, "ascii");
  coliHeader.writeUInt32LE(coliPayload.length, 4);
  const coli = Buffer.concat([coliHeader, coliPayload]);
  const fieldHeader = Buffer.alloc(8);
  fieldHeader.write("0000", 0, "ascii");
  fieldHeader.writeUInt32LE(fieldHeader.length + coli.length, 4);
  const field = Buffer.concat([fieldHeader, coli]);
  const colsHeader = Buffer.alloc(8);
  colsHeader.write("COLS", 0, "ascii");
  colsHeader.writeUInt32LE(field.length, 4);
  return Buffer.concat([Buffer.alloc(12), colsHeader, field, Buffer.alloc(7)]);
}

test("new Shenmue I interiors select their extracted collision variants", () => {
  for (const worldId of ["jabe", "mkyu", "ms8s"]) {
    const world = WORLDS[worldId];
    const areaDefinition = JSON.parse(fs.readFileSync(
      new URL(
        `../public/data/native-collisions/${world.nativeArea}.json`,
        import.meta.url,
      ),
      "utf8",
    ));
    const definition = nativeCollisionDefinitionForWorld(
      world,
      areaDefinition,
    );
    assert.ok(definition, worldId);
    assert.equal(definition.area, world.nativeArea);
    assert.ok(definition.field.sections.some(
      (section) => section.records.length > 0,
    ));
  }
});

test("optional native collision JSON ignores Vite's HTML fallback", async () => {
  const response = new Response("<!doctype html><title>New Yokosuka</title>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });
  assert.equal(await parseNativeCollisionResponse(response, "WN00"), null);
});

test("optional native collision JSON still parses authored definitions", async () => {
  const definition = { area: "WN00", variants: {} };
  const response = new Response(JSON.stringify(definition), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  assert.deepEqual(
    await parseNativeCollisionResponse(response, "WN00"),
    definition,
  );
});

test("parses typed COLI records from a numbered COLS field", () => {
  const count = Buffer.alloc(4);
  count.writeUInt32LE(3, 0);
  const bytes = mapinfoFixture([
    record(100, 1, floats(1, 2, 3, 4)),
    record(9, 2, Buffer.concat([
      count,
      floats(1, 2, 3, 4, 5, 6),
    ])),
    record(0, 3, floats(7, 8, 9)),
    record(0, 5, floats(10, 11, 1, 0, 0, 2)),
  ]);

  const parsed = parseNativeWorldCollisions(bytes);
  const records = parsed.containers[0].fields[0].sections[0].records;
  assert.equal(records.length, 4);
  assert.deepEqual(records.map(({ shapeType }) => shapeType), [1, 2, 3, 5]);
  assert.deepEqual(records[0].geometry, {
    kind: "segment",
    start: [1, 2],
    end: [3, 4],
  });
  assert.deepEqual(records[2].geometry, {
    kind: "circle",
    radius: 7,
    center: [8, 9],
  });
  assert.equal(records[1].geometry.kind, "polyline");
});

test("parses Shenmue II FLDD vertices and fixed collision-face records", () => {
  const bytes = Buffer.alloc(0x140);
  bytes.write("FLDD", 0, "ascii");
  bytes.writeUInt32LE(bytes.length, 4);
  bytes.write("0000", 8, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 12);
  const content = 16;
  const footerRelative = 0x100;
  bytes.writeUInt32LE(footerRelative, content);
  const vertices = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [10, 11, 12],
  ];
  vertices.flat().forEach((value, index) => (
    bytes.writeFloatLE(value, content + 4 + index * 4)
  ));
  const faceOffset = content + 0x40;
  [1, 0xffff, 2, 3, 0, 1, 2, 3].forEach((value, index) => (
    bytes.writeUInt16LE(value, faceOffset + index * 2)
  ));
  const controlOffset = content + 0x50;
  bytes.writeInt32LE(-2, controlOffset);
  bytes.writeInt32LE(28, controlOffset + 4);
  bytes.writeInt32LE(29, controlOffset + 8);
  [273, 100, 455.5].forEach((value, index) => (
    bytes.writeFloatLE(value, controlOffset + 12 + index * 4)
  ));
  bytes.writeUInt16LE(0x4000, controlOffset + 24);
  bytes.writeInt32LE(-255, controlOffset + 28);
  const controlPointerTable = content + 0x70;
  bytes.writeUInt32LE(0x50, controlPointerTable);
  bytes.writeUInt32LE(0, controlPointerTable + 4);
  const footer = content + footerRelative;
  [4, 0x34, 0x34, 0x40, 0x34, 0x80, 0x90, 0x70]
    .forEach((value, index) => bytes.writeUInt32LE(value, footer + index * 4));

  const parsed = parseShenmue2WorldCollisions(bytes);
  assert.equal(parsed.fields.length, 1);
  assert.deepEqual(parsed.fields[0].vertices, vertices);
  assert.deepEqual(parsed.fields[0].faces[0], {
    fileOffset: faceOffset,
    recordOffset: 0,
    attributes: [1, 0xffff, 2, 3],
    indices: [0, 1, 2, 3],
  });
  assert.equal(parsed.fields[0].faces.length, 1);
  assert.deepEqual(parsed.fields[0].controls[0], {
    fileOffset: controlOffset,
    pointerFileOffset: controlPointerTable,
    byteLength: 32,
    type: -2,
    id: 28,
    value: 29,
    rawHex: bytes.subarray(controlOffset, controlOffset + 32).toString("hex"),
    position: [273, 100, 455.5],
    facing: 0x4000,
  });
});

test("builds ordinary Shenmue II FLDD faces as blocking native collision", () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new BABYLON.Scene(engine);
  const currentMeshes = [];
  const [mesh] = createNativeWorldCollision({
    scene,
    currentMeshes,
    definition: {
      area: "AR02",
      disc: 1,
      fieldId: "0000",
      field: {
        kind: "mesh",
        vertices: [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]],
        faces: [[1, 0xffff, 2, 3, 0, 1, 2, 3]],
      },
    },
  });

  assert.equal(currentMeshes[0], mesh);
  assert.equal(mesh.checkCollisions, true);
  assert.equal(mesh.visibility, 0);
  assert.equal(mesh.metadata.nativeCollisionBehavior, "blocking");
  assert.deepEqual(mesh.metadata.nativeCollisionFaceCodes, [1]);
  assert.equal(mesh.metadata.terrain, false);
  assert.deepEqual(
    mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind),
    [-1, 2, 3, -4, 5, 6, -7, 8, 9, -10, 11, 12],
  );
  assert.deepEqual(mesh.getIndices(), [0, 1, 2, 2, 1, 0, 0, 2, 3, 3, 2, 0]);
  mesh.dispose();
  scene.dispose();
  engine.dispose();
});

test("S2 FLDD code-10 faces use S1's nonblocking stair behavior", () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new BABYLON.Scene(engine);
  const currentMeshes = [];
  const meshes = createNativeWorldCollision({
    scene,
    currentMeshes,
    definition: {
      area: "WE00",
      disc: 1,
      fieldId: "0000",
      field: {
        kind: "mesh",
        vertices: [
          [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1],
          [2, 0, 0], [2, 2, 0], [2, 2, 1], [2, 0, 1],
        ],
        faces: [
          [10, 1, 10, 24, 0, 1, 2, 3],
          [1, 0xffff, 0, 0, 4, 5, 6, 7],
          [1, 0xffff, 0, 0, 0, 1, 2, 3],
        ],
      },
    },
  });

  assert.equal(meshes.length, 3);
  const stairBoundary = meshes.find((mesh) => (
    mesh.metadata.nativeCollisionBehavior === "stair-boundary"
  ));
  const blocking = meshes.find((mesh) => (
    mesh.metadata.nativeCollisionBehavior === "blocking"
  ));
  const terrainSurface = meshes.find((mesh) => (
    mesh.metadata.nativeCollisionBehavior === "terrain-surface"
  ));
  assert.ok(stairBoundary);
  assert.ok(blocking);
  assert.ok(terrainSurface);
  assert.equal(stairBoundary.checkCollisions, false);
  assert.equal(stairBoundary.metadata.nativeCollisionCode, 10);
  assert.deepEqual(stairBoundary.metadata.nativeCollisionFaceCodes, [10]);
  assert.deepEqual(stairBoundary.metadata.nativeCollisionFaceIndices, [0]);
  assert.equal(blocking.checkCollisions, true);
  assert.deepEqual(blocking.metadata.nativeCollisionFaceIndices, [1]);
  assert.deepEqual(blocking.metadata.nativeCollisionFaceNativeCodes, [1]);
  assert.deepEqual(blocking.metadata.nativeCollisionSegments, [
    [[-2, 0], [-2, 1]],
  ]);
  assert.deepEqual(blocking.metadata.nativeCollisionSegmentYRanges, [[0, 2]]);
  assert.equal(terrainSurface.checkCollisions, false);
  assert.deepEqual(terrainSurface.metadata.nativeCollisionFaceIndices, [2]);
  applyNativeDoorCollisionStates(meshes);
  assert.equal(stairBoundary.checkCollisions, false);
  assert.equal(terrainSurface.checkCollisions, false);
  assert.equal(blocking.checkCollisions, true);
  assert.equal(currentMeshes.length, 3);

  scene.dispose();
  engine.dispose();
});

test("S2 FLDD short stair risers do not become movement-blocking walls", () => {
  const engine = new BABYLON.NullEngine({ renderWidth: 64, renderHeight: 64 });
  const scene = new BABYLON.Scene(engine);
  const meshes = createNativeWorldCollision({
    scene,
    currentMeshes: [],
    definition: {
      area: "WB01",
      disc: 1,
      fieldId: "0000",
      field: {
        kind: "mesh",
        vertices: [
          [0, 0, 0], [2, 0, 0], [2, 0.225, 0], [0, 0.225, 0],
          [0, 0, 1], [2, 0, 1], [2, 1, 1], [0, 1, 1],
        ],
        faces: [
          [36, 3, 1, 103, 0, 1, 2, 3],
          [1, 0xffff, 0, 0, 4, 5, 6, 7],
        ],
      },
    },
  });

  const stepRiser = meshes.find((mesh) => (
    mesh.metadata.nativeCollisionBehavior === "step-riser"
  ));
  const wall = meshes.find((mesh) => (
    mesh.metadata.nativeCollisionBehavior === "blocking"
  ));
  assert.ok(stepRiser);
  assert.equal(stepRiser.checkCollisions, false);
  assert.deepEqual(stepRiser.metadata.nativeCollisionFaceIndices, [0]);
  assert.deepEqual(stepRiser.metadata.nativeCollisionSegments, []);
  assert.ok(wall);
  assert.equal(wall.checkCollisions, true);
  applyNativeDoorCollisionStates(meshes);
  assert.equal(stepRiser.checkCollisions, false);

  scene.dispose();
  engine.dispose();
});

test("selects the generated Worker's Pier FLDD catalog for an S2 disc prefix", () => {
  const areaDefinition = JSON.parse(fs.readFileSync(
    new URL("../public/data/native-collisions/AR02.json", import.meta.url),
    "utf8",
  ));
  const definition = nativeCollisionDefinitionForWorld(
    { nativeArea: "AR02", prefix: "S2DC_D1_AR02_MPK00" },
    areaDefinition,
  );
  assert.equal(definition.disc, 1);
  assert.equal(definition.field.kind, "mesh");
  assert.ok(definition.field.vertices.length > 3000);
  assert.ok(definition.field.faces.length > 1500);
});

test("generated S2 stairs retain native code 10 for shared classification", () => {
  const areaDefinition = JSON.parse(fs.readFileSync(
    new URL("../public/data/native-collisions/WE00.json", import.meta.url),
    "utf8",
  ));
  const definition = nativeCollisionDefinitionForWorld(
    { nativeArea: "WE00", prefix: "S2DC_D1_WE00_MPK00" },
    areaDefinition,
  );
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const meshes = createNativeWorldCollision({
    scene,
    currentMeshes: [],
    definition,
  });
  const stairBoundary = meshes.find((mesh) => (
    mesh.metadata.nativeCollisionBehavior === "stair-boundary"
  ));
  assert.ok(stairBoundary);
  assert.equal(stairBoundary.checkCollisions, false);
  assert.equal(stairBoundary.metadata.nativeCollisionFaceCount, 26);
  assert.ok(meshes.some((mesh) => (
    mesh.metadata.nativeCollisionBehavior === "blocking"
    && mesh.checkCollisions
  )));
  scene.dispose();
  engine.dispose();
});

test("generated Man Mo Temple stair risers remain nonblocking", () => {
  const areaDefinition = JSON.parse(fs.readFileSync(
    new URL("../public/data/native-collisions/WB01.json", import.meta.url),
    "utf8",
  ));
  const definition = nativeCollisionDefinitionForWorld(
    { nativeArea: "WB01", prefix: "S2DC_D1_WB01_MPK00" },
    areaDefinition,
  );
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const meshes = createNativeWorldCollision({
    scene,
    currentMeshes: [],
    definition,
  });
  const stepRiser = meshes.find((mesh) => (
    mesh.metadata.nativeCollisionBehavior === "step-riser"
  ));
  assert.ok(stepRiser);
  assert.equal(stepRiser.checkCollisions, false);
  assert.ok(stepRiser.metadata.nativeCollisionFaceIndices.includes(125));
  assert.ok(stepRiser.metadata.nativeCollisionFaceIndices.includes(127));
  assert.ok(stepRiser.metadata.nativeCollisionFaceIndices.includes(130));
  assert.ok(stepRiser.metadata.nativeCollisionFaceIndices.includes(131));
  assert.ok(!meshes.find((mesh) => (
    mesh.metadata.nativeCollisionBehavior === "blocking"
  )).metadata.nativeCollisionFaceIndices.includes(125));

  scene.dispose();
  engine.dispose();
});

test("converts native coordinates and preserves open type-2 wall chains", () => {
  assert.deepEqual(nativeCollisionSegments({
    kind: "polyline",
    vertices: [[1, 2], [3, 4], [5, 6]],
  }), [
    [[-1, -2], [-3, -4]],
    [[-3, -4], [-5, -6]],
  ]);
});

test("converts native type-3 circles without projecting them across the map", () => {
  const segments = nativeCollisionSegments({
    kind: "circle",
    radius: 0.5,
    center: [8, 9],
  });
  assert.equal(segments.length, 16);
  const points = segments.flat();
  assert.ok(points.every(([x, z]) => (
    x >= -8.5 && x <= -7.5
    && z >= -9.5 && z <= -8.5
  )));
});

test("MJQ authored boundary matches the observed browser stopping line", () => {
  const segments = nativeCollisionSegments({
    kind: "polyline",
    vertices: [
      [5.997519493103027, 7.3146867752075195],
      [4.20086145401001, 6.127297401428223],
    ],
  });
  const [[start, end]] = segments;
  const interpolation = (-4.5 - start[0]) / (end[0] - start[0]);
  const browserZ = start[1] + (end[1] - start[1]) * interpolation;
  assert.ok(Math.abs(browserZ - -6.324994416) < 1e-6);
});

test("selects a disc variant and builds grouped invisible collision walls", () => {
  const areaDefinition = {
    defaultField: "0000",
    area: "TEST",
    discVariants: { 1: "same" },
    variants: {
      same: {
        sources: [{ disc: 1, path: "TEST/MAPINFO.BIN" }],
        fields: [{
          id: "0000",
          sections: [{
            fileOffset: 64,
            records: [
              {
                recordOffset: 8,
                code: 0,
                shapeType: 1,
                geometry: {
                  kind: "segment",
                  start: [1, 2],
                  end: [3, 4],
                },
              },
              {
                recordOffset: 36,
                code: 100,
                shapeType: 3,
                geometry: {
                  kind: "circle",
                  radius: 0.5,
                  center: [6, 7],
                },
              },
            ],
          }],
        }],
      },
    },
  };
  const world = { nativeArea: "TEST", prefix: "S1_TEST" };
  assert.equal(
    nativeCollisionDefinitionForWorld(world, areaDefinition).variantId,
    "same",
  );
  const definition = nativeCollisionDefinitionForWorld(world, areaDefinition);

  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const currentMeshes = [];
  const meshes = createNativeWorldCollision({
    scene,
    currentMeshes,
    definition,
  });
  assert.equal(meshes.length, 2);
  assert.equal(currentMeshes.length, 2);
  assert.deepEqual(
    meshes.map((mesh) => mesh.metadata.nativeCollisionCode),
    [0, 100],
  );
  assert.ok(meshes.every((mesh) => (
    mesh.checkCollisions
    && !mesh.isPickable
    && mesh.metadata.nativeCollision
  )));
  assert.equal(meshes[0].getTotalIndices(), 12);

  const door = new BABYLON.TransformNode("door", scene);
  door.position.set(-6.5, 0, -7);
  applyNativeDoorCollisionStates(meshes, [{ root: door, state: "open" }]);
  assert.equal(meshes[0].checkCollisions, true);
  assert.equal(meshes[1].checkCollisions, false);
  applyNativeDoorCollisionStates(meshes, [{ root: door, state: "closed" }]);
  assert.ok(meshes.every((mesh) => mesh.checkCollisions));
  scene.dispose();
  engine.dispose();
});

test("an open Hazuki door leaves the nearby bed boundary active", () => {
  const areaDefinition = JSON.parse(fs.readFileSync(
    new URL("../public/data/native-collisions/JOMO.json", import.meta.url),
    "utf8",
  ));
  const definition = nativeCollisionDefinitionForWorld(
    { nativeArea: "JOMO", prefix: "S1_JOMO" },
    areaDefinition,
  );
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const meshes = createNativeWorldCollision({
    scene,
    currentMeshes: [],
    definition,
  });
  const openDoor = new BABYLON.TransformNode("dor7", scene);
  openDoor.position.set(-16.302, 0, 1.833);

  applyNativeDoorCollisionStates(meshes, [{
    root: openDoor,
    state: "open",
  }]);

  assert.equal(
    meshes.find((mesh) => mesh.metadata.nativeCollisionCode === 122)
      .checkCollisions,
    false,
  );
  assert.equal(
    meshes.find((mesh) => mesh.metadata.nativeCollisionCode === 9)
      .checkCollisions,
    true,
  );
  scene.dispose();
  engine.dispose();
});

test("code-10 Yamanose stair boundaries are retained but nonblocking", () => {
  const areaDefinition = JSON.parse(fs.readFileSync(
    new URL("../public/data/native-collisions/JU00.json", import.meta.url),
    "utf8",
  ));
  const definition = nativeCollisionDefinitionForWorld(
    { nativeArea: "JU00", prefix: "S1_JU00" },
    areaDefinition,
  );
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const meshes = createNativeWorldCollision({
    scene,
    currentMeshes: [],
    definition,
  });
  for (const recordOffset of [756, 2240]) {
    const mesh = meshes.find((candidate) => (
      candidate.metadata.nativeCollisionRecordOffsets.includes(recordOffset)
    ));
    assert.ok(mesh);
    assert.equal(mesh.metadata.nativeCollisionBehavior, "stair-boundary");
    assert.equal(mesh.checkCollisions, false);
  }
  for (const recordOffset of [688, 3468]) {
    assert.ok(meshes.some((mesh) => (
      mesh.metadata.nativeCollisionRecordOffsets.includes(recordOffset)
    )));
  }
  scene.dispose();
  engine.dispose();
});

test("Hazuki stairs are nonblocking while sparring walls stay excluded", () => {
  const areaDefinition = JSON.parse(fs.readFileSync(
    new URL("../public/data/native-collisions/JHD0.json", import.meta.url),
    "utf8",
  ));
  const definition = nativeCollisionDefinitionForWorld(
    { nativeArea: "JHD0", prefix: "S1_JHD0" },
    areaDefinition,
  );
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const meshes = createNativeWorldCollision({
    scene,
    currentMeshes: [],
    definition,
  });
  for (const recordOffset of [1532, 1912]) {
    const mesh = meshes.find((candidate) => (
      candidate.metadata.nativeCollisionRecordOffsets.includes(recordOffset)
    ));
    assert.ok(mesh);
    assert.equal(mesh.metadata.nativeCollisionBehavior, "stair-boundary");
    assert.equal(mesh.checkCollisions, false);
  }
  for (const recordOffset of [1968, 1996, 2024, 2108]) {
    assert.ok(meshes.every((mesh) => (
      !mesh.metadata.nativeCollisionRecordOffsets.includes(recordOffset)
    )));
  }
  assert.ok(meshes.some((mesh) => (
    mesh.metadata.nativeCollisionRecordOffsets.includes(708)
  )));
  assert.ok(meshes.some((mesh) => (
    mesh.metadata.nativeCollisionRecordOffsets.includes(744)
  )));
  scene.dispose();
  engine.dispose();
});

test("Dobuita cinema frontage fixture collision stays excluded", () => {
  const areaDefinition = JSON.parse(fs.readFileSync(
    new URL("../public/data/native-collisions/D000.json", import.meta.url),
    "utf8",
  ));
  const definition = nativeCollisionDefinitionForWorld(
    { nativeArea: "D000", prefix: "S1_D000" },
    areaDefinition,
  );
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const meshes = createNativeWorldCollision({
    scene,
    currentMeshes: [],
    definition,
  });

  assert.ok(meshes.every((mesh) => (
    !mesh.metadata.nativeCollisionRecordOffsets.includes(17776)
  )));
  assert.ok(meshes.some((mesh) => (
    mesh.metadata.nativeCollisionCode === 9
    && mesh.metadata.nativeCollisionRecordOffsets.length > 0
  )));
  scene.dispose();
  engine.dispose();
});

test("a sliding panel moves only its own native boundary", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const meshes = createNativeWorldCollision({
    scene,
    currentMeshes: [],
    definition: {
      area: "TEST",
      disc: 1,
      fieldId: "0000",
      field: {
        sections: [{
          records: [
            {
              recordOffset: 8,
              code: 100,
              geometry: {
                kind: "segment",
                start: [0.5, 0],
                end: [-0.5, 0],
              },
            },
            {
              recordOffset: 36,
              code: 100,
              geometry: {
                kind: "segment",
                start: [-0.5, 0],
                end: [-1.5, 0],
              },
            },
          ],
        }],
      },
    },
  });
  assert.equal(meshes.length, 2);

  const root = new BABYLON.TransformNode("sliding-door", scene);
  // Real two-leaf doors put the root at the shared boundary endpoint, not
  // at the moving panel's center. Matching the root would move both leaves.
  root.position.set(-.5, 0, 0);
  const panel = new BABYLON.TransformNode("sliding-panel", scene);
  panel.parent = root;
  panel.position.x = .5;
  const bindPosition = panel.getAbsolutePosition().clone();
  panel.position.x = 1.5;
  applyNativeDoorCollisionStates(meshes, [{
    type: "sliding",
    root,
    nodes: [panel],
    collisionBindPositions: [bindPosition],
    collisionBindCenter: bindPosition,
    state: "open",
  }]);

  assert.equal(meshes[0].checkCollisions, true);
  assert.equal(meshes[0].position.x, 1);
  assert.equal(meshes[0].metadata.nativeCollisionDoorMoved, true);
  assert.equal(meshes[1].checkCollisions, true);
  assert.equal(meshes[1].position.x, 0);
  assert.equal(meshes[1].metadata.nativeCollisionDoorOpen, false);

  applyNativeDoorCollisionStates(meshes, [{
    type: "sliding",
    root,
    nodes: [panel],
    collisionBindPositions: [bindPosition],
    collisionBindCenter: bindPosition,
    state: "closed",
  }]);
  assert.ok(meshes.every((mesh) => (
    mesh.checkCollisions && mesh.position.equals(BABYLON.Vector3.Zero())
  )));
  assert.throws(() => applyNativeDoorCollisionStates(meshes, [{
    type: "sliding", root, nodes: [panel], collisionBindPositions: [bindPosition], state: "open",
  }]), /no closed collision center/);
  scene.dispose();
  engine.dispose();
});

test("generated native walls stop Babylon ellipsoid traversal from both sides", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.collisionsEnabled = true;
  createNativeWorldCollision({
    scene,
    currentMeshes: [],
    definition: {
      area: "TEST",
      disc: 1,
      fieldId: "0000",
      field: {
        sections: [{
          records: [{
            recordOffset: 8,
            code: 0,
            geometry: {
              kind: "segment",
              start: [0, -2],
              end: [0, 2],
            },
          }],
        }],
      },
    },
  });
  const actor = BABYLON.MeshBuilder.CreateBox(
    "collision_test_actor",
    { size: 1 },
    scene,
  );
  actor.ellipsoid.set(0.5, 0.5, 0.5);
  actor.checkCollisions = true;

  actor.position.set(-1, 0, 0);
  actor.computeWorldMatrix(true);
  actor.moveWithCollisions(new BABYLON.Vector3(2, 0, 0));
  assert.ok(actor.position.x < -0.49);

  actor.position.set(1, 0, 0);
  actor.computeWorldMatrix(true);
  actor.moveWithCollisions(new BABYLON.Vector3(-2, 0, 0));
  assert.ok(actor.position.x > 0.49);
  scene.dispose();
  engine.dispose();
});

test("Warehouse No. 8 switches collision fields only inside the original office stair flight", () => {
  const data=JSON.parse(fs.readFileSync(new URL("../public/data/native-collisions/MS8S.json",import.meta.url)));
  const definition=nativeCollisionDefinitionForWorld({nativeArea:"MS8S",prefix:"S2_MS8S"},data);
  const alternate=definition.variantFields.find(field=>field.id==="0001");
  const detect=(field,source)=>discoverNativeStairFieldHandoffs(definition.field,field,nativeCollisionSegments,source);
  assert.deepEqual(detect(alternate,{}),[],"another source cannot opt into MS8S-specific records");
  for(const missing of [508,536,700,816]){
    const copy=structuredClone(alternate);
    for(const section of copy.sections)section.records=section.records.filter(r=>r.recordOffset!==missing);
    assert.deepEqual(detect(copy,definition.source),[],"missing source record "+missing);
  }
  const engine=new BABYLON.NullEngine(),scene=new BABYLON.Scene(engine);
  try {
    const meshes=createNativeWorldCollision({scene,currentMeshes:[],definition});
    const base=meshes.find(mesh=>mesh.metadata.nativeCollisionFieldRole==="base"&&mesh.metadata.nativeCollisionRecordOffsets.includes(72));
    assert.ok(base,"lower-floor barrier still exists");
    const upper=meshes.filter(mesh=>mesh.metadata.nativeCollisionFieldRole==="alternate");
    assert.ok(upper.some(mesh=>mesh.metadata.nativeCollisionRecordOffsets.includes(700)));
    assert.ok(upper.some(mesh=>mesh.metadata.nativeCollisionRecordOffsets.includes(816)));
    const handoffs=base.metadata.nativeCollisionHandoffs;
    const controller=Object.assign(Object.create(ThirdPersonController.prototype),{
      options:{playerRadius:.24},nativeCollisionHandoffs:handoffs,scene:{meshes},
    });
    // Descending uses the same real rails. Once Ryo clears the lower marker,
    // the controller restores the base room and its L-shaped barrier.
    for(const [x,y,z,role] of [
      [-13.19,4.275,156.20,"alternate"],[-12.63,4.275,155.65,"alternate"],
      [-10.23,1.8,153.02,"alternate"],[-8.38,0,151.4,"alternate"],[-7.81,0,150.83,"base"],
    ]){
      const candidates=controller.collisionCandidates(new BABYLON.Vector3(x,y,z));
      assert.deepEqual(new Set(candidates.map(mesh=>mesh.metadata.nativeCollisionFieldRole)),new Set([role]));
      assert.equal(candidates.includes(base),role==="base");
    }
    // Goro's original doorway (entry 1), the window (entry 0), and two
    // vertically overlapping points across the floor-0 obstacle.
    for(const [x,y,z,role] of [
      [-8.31,0,135.76,"base"],[-17,4.275,152.24,"alternate"],
      [-13.994,0,155.23,"base"],[-13.994,4.275,155.23,"alternate"],
      [-18.01,4.0,137.16,"base"],[-18.01,4.275,137.16,"alternate"],
    ]){
      const feet=new BABYLON.Vector3(x,y,z);
      const center=feet.add(new BABYLON.Vector3(0,.9,0));
      assert.deepEqual(controller.collisionCandidates(center,center,1,feet.y),controller.collisionCandidates(feet));
      assert.equal(controller.collisionCandidates(feet).includes(base),role==="base");
    }
    // Run the actual Babylon movement wrapper as well. The collider center
    // is above 4 m while Ryo's feet remain below the upper-floor cutoff.
    controller.raycastIndex={collisionCandidates:()=>meshes};
    controller.collider={
      getAbsolutePosition:()=>new BABYLON.Vector3(-13.994,3.5,155.23),
      ellipsoid:new BABYLON.Vector3(.24,.9,.24),ellipsoidOffset:new BABYLON.Vector3(0,.9,0),
      moveWithCollisions(){assert.ok(this.surroundingMeshes.includes(base));}
    };
    controller.moveColliderWithCollisions(new BABYLON.Vector3(.1,0,0));
    assert.equal(controller.collider.surroundingMeshes,undefined);
    assert.equal(handoffs.length,1);
    assert.ok(Math.abs(handoffs[0].width-1.7993)<.001);
    for(const [x,z] of [[-8.376,151.397],[-10.230,153.022],[-12.621,155.637]]){
      assert.equal(nativeStairFieldAtPosition(handoffs,{x,z},.24),true);
    }
    for(const [x,z] of [[-8.31,135.76],[-10.23,150],[-12.621,158],[-18.01,137.16]]){
      assert.equal(nativeStairFieldAtPosition(handoffs,{x,z},.24),false);
    }
  } finally {engine.dispose();}
});

test("each Warehouse No. 8 upper hinge opens its own source threshold and closes again",()=>{
  const data=JSON.parse(fs.readFileSync(new URL("../public/data/native-collisions/MS8S.json",import.meta.url)));
  const definition=nativeCollisionDefinitionForWorld({nativeArea:"MS8S",prefix:"S2_MS8S"},data);
  const engine=new BABYLON.NullEngine(),scene=new BABYLON.Scene(engine);
  try {
    const meshes=createNativeWorldCollision({scene,currentMeshes:[],definition});
    const doors=meshes.filter(mesh=>mesh.metadata.nativeCollisionCode===100);
    const originalPlacements=[
      [960,-22.16502,139.93974],[616,-25.9834,143.7581],[644,-13.343,131.1305],
    ];
    assert.equal(doors.length,4,"one lower and three upper native thresholds");
    for(const [record,x,z] of originalPlacements){
      const hinge={state:"open",type:"swing",root:{getAbsolutePosition:()=>new BABYLON.Vector3(x,4.28,z)}};
      applyNativeDoorCollisionStates(meshes,[hinge]);
      const opened=doors.filter(mesh=>!mesh.checkCollisions);
      assert.equal(opened.length,1);
      assert.equal(opened[0].metadata.nativeCollisionFieldRole,"alternate");
      assert.deepEqual(opened[0].metadata.nativeCollisionRecordOffsets,[record]);
      hinge.state="closed";
      applyNativeDoorCollisionStates(meshes,[hinge]);
      assert.ok(doors.every(mesh=>mesh.checkCollisions));
    }
  } finally {engine.dispose();}
});
