import assert from "node:assert/strict";
import test from "node:test";
import catalog from "../play/assets/cutscenes/native-faces/manifest.generated.json" with {type:"json"};
import tgma from "../play/assets/hazuki/tgma/manifest.json" with {type:"json"};
import rescue from "../play/assets/dobuita/chai-rescue/manifest.json" with {type:"json"};

import {
  resolveNativeCutsceneFacialAssets,
  bindNativeCutsceneFacialAssets,
} from "../play/cutscenes/NativeCutsceneFacialAssets.js";

test("cutscene FACE aliases borrow exact assets while retaining authored identity", () => {
  const source = Object.freeze({
    actorTag: "AKIR",
    faceCode: "YKC",
    poses: Object.freeze({ actorTag: "AKIR", path: "poses.json" }),
  });
  const result = resolveNativeCutsceneFacialAssets(
    { AKIR: source },
    { AKID: "AKIR" },
  );
  assert.equal(result.AKIR, source);
  assert.equal(result.AKID.actorTag, "AKID");
  assert.equal(result.AKID.faceCode, "YKC");
  assert.equal(result.AKID.poses.actorTag, "AKIR");
  assert.equal(result.AKID.poses.path, "poses.json");
  assert.throws(
    () => resolveNativeCutsceneFacialAssets({ AKIR: source }, { AKIR: "AKIR" }),
    /conflicts/,
  );
});

const face = (tag, model) => Object.freeze({
  actorTag: tag, bodyModelCode: model,
  model: { path: `${model}/face.mt5` }, table: { path: `${model}/ftbl.bin` },
  poses: { path: "talk.json", actorTag: tag },
});

test("arcade rescue binds the exact FUB body to existing FUB FACE and TALK assets", () => {
  const bound=bindNativeCutsceneFacialAssets({id:"chai-rescue",actorTags:rescue.actorTags,
    environment:{packageActors:rescue.packageActors}},catalog,path=>`/local/${path}`);
  const selected=bound.presentation.facialAssets.FUKU;
  assert.deepEqual(selected,tgma.facialAssets.FUKU);
  assert.equal(selected.bodyModelCode,"FUB_M");
  assert.notEqual(selected.table.sha256,catalog.facialAssets.FUKU.table.sha256);
  for(const record of [selected.model,selected.table,selected.poses])assert.equal(bound.assets[record.path],`/local/${record.path}`);
});

test("package completion binds all proven bodies, not only the player, with their asset dependencies", () => {
  const catalog = { facialAssets: { AKIR: face("AKIR", "YKC_M"), INE_: face("INE_", "INE_M") } };
  const definition = { id: "handover", actorTags: ["AKIR", "INE_", "KOZU"],
    environment: { packageActors: { INE_: { modelCode: "INE_M" } } }, assets: { motion: "/motion" } };
  const bound = bindNativeCutsceneFacialAssets(definition, catalog, path => `/local/${path}`);
  assert.deepEqual(Object.keys(bound.presentation.facialAssets), ["AKIR", "INE_"]);
  assert.equal(bound.presentation.facialAssets.INE_, catalog.facialAssets.INE_);
  assert.equal(bound.assets["INE_M/face.mt5"], "/local/INE_M/face.mt5");
  assert.equal(bound.assets["talk.json"], "/local/talk.json");
  assert.equal(bound.assets.motion, "/motion");
  assert.equal(definition.presentation, undefined);
});

test("package body variants override global actor tags and never borrow an incompatible face", () => {
  const catalog = { facialAssets: { HRSK: face("HRSK", "NZM_L"), JAKR: face("JAKR", "JKA_M") },
    facialVariants: { young: face("JAKR", "JKB_M") } };
  const bound = bindNativeCutsceneFacialAssets({ id: "variants", actorTags: ["HRSK", "JAKR", "OTHER"],
    actorDefinitions: [{ actorCode: "HRSK", modelCode: "NZM_L" }],
    environment: { packageActors: { HRSK: { modelCode: "NZM_M" }, JAKR: { modelCode: "JKB_M" } } },
  }, catalog, path => path);
  assert.deepEqual(Object.keys(bound.presentation.facialAssets), ["JAKR"]);
  assert.equal(bound.presentation.facialAssets.JAKR, catalog.facialVariants.young);
});

test("explicit faces and aliases are preserved; exact body reuse keeps source TALK identity", () => {
  const special = face("FUKU", "FUB_M"), source = face("SMTH", "GIB_M");
  const catalog = { facialAssets: { FUKU: face("FUKU", "FUK_M"), SMTH: source } };
  const bound = bindNativeCutsceneFacialAssets({ id: "explicit", actorTags: ["FUKU", "BKH_", "COPY"],
    actorDefinitions: [{ actorCode: "BKH_", modelCode: "GIB_M" }, { actorCode: "COPY", modelCode: "GIB_M" }],
    presentation: { facialAssets: { FUKU: special }, facialActorAliases: { COPY: "FUKU" }, handAssets: { FUKU: "hands" } },
  }, catalog, path => path);
  assert.equal(bound.presentation.facialAssets.FUKU, special);
  assert.equal(bound.presentation.facialAssets.BKH_.actorTag, "BKH_");
  assert.equal(bound.presentation.facialAssets.BKH_.poses.actorTag, "SMTH");
  assert.equal(bound.presentation.facialAssets.COPY, undefined);
  assert.equal(bound.presentation.handAssets.FUKU, "hands");
  assert.deepEqual(bound.presentation.facialActorAliases, { COPY: "FUKU" });
});

test("ambiguous proven pairs and incomplete selected assets fail explicitly", () => {
  const definition = { id: "invalid", actorTags: ["TEST"], actorDefinitions: [{ actorCode: "TEST", modelCode: "GIB_M" }] };
  assert.throws(() => bindNativeCutsceneFacialAssets(definition, {
    facialAssets: { first: face("ONE_", "GIB_M"), second: face("TWO_", "GIB_M") },
  }, path => path), /ambiguous FACE/);
  assert.throws(() => bindNativeCutsceneFacialAssets(definition, {
    facialAssets: { first: { ...face("TEST", "GIB_M"), poses: null } },
  }, path => path), /incomplete FACE assets/);
});
