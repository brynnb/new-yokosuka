import assert from "node:assert/strict";
import test from "node:test";

import {
  compareShenmue2Areas,
  compareShenmue2Archives,
  compareShenmue2Records,
  groupShenmue2Catalog,
  shenmue2ArchivePresentation,
  shenmue2AreaPresentation,
  shenmue2RecordDisplayName,
  primaryShenmue2AreaRecords,
  shenmue2OutdoorViews,
  shenmue2InteriorViews,
  shenmue2SceneVariantViews,
  shenmue2ItemName,
} from "../src/Shenmue2AssetOrganization.js";

test("community item names use bounded model IDs and preserve ambiguous resources", () => {
  assert.equal(shenmue2ItemName("PNX02H6G.CHRM"), "Phoenix Mirror");
  assert.equal(shenmue2ItemName("GACIAK1I.CHRM"), "Akira 1");
  assert.equal(shenmue2ItemName("PNX02H6.MT7"), "Phoenix Mirror");
  assert.equal(shenmue2ItemName("TMEM200I.CHRM"), null);
  assert.equal(shenmue2ItemName("PNX02H6EXTRA.CHRM"), null);
  assert.equal(shenmue2ItemName("PNX02H6X.CHRM"), null);
  assert.equal(shenmue2RecordDisplayName({kind: "CHRM", sourceMember: "PNX02H6G.CHRM",
    duplicateMemberName: true, sourceMemberIndex: 3}, "MPK00"),
    "Phoenix Mirror · PNX02H6G.CHRM (archive entry 3)");
});

test("additional map labels preserve established names and unresolved ambiguity", () => {
  assert.equal(shenmue2AreaPresentation("Q109").label, "Thousand White Quarter (alternate)");
  assert.equal(shenmue2AreaPresentation("QAE1").label, "Tea Break / Three Birds Building — Floor 1");
  assert.equal(shenmue2AreaPresentation("QABT").label, "Unidentified scene QABT");
  assert.equal(shenmue2AreaPresentation("WEM1").label, "S.I.C. Pool Hall / Slot House W");
});

test("interior shortcuts select named environments once across all discs", () => {
  const record = (disc, area, kind = "MAPM") => ({disc, scene: String(disc), area, archive: "MPK00", kind, filename: `D${disc}_${area}`});
  const records = [record(2, "ARA0"), record(1, "ARA0"), record(4, "KES1"),
    record(1, "AR02"), record(1, "WES1"), record(3, "QEH1", "CHRM")];
  const views = shenmue2InteriorViews(groupShenmue2Catalog(records));
  assert.deepEqual(views.map(v => [v.area, v.disc]), [["ARA0", 1], ["KES1", 4]]);
  assert.deepEqual(views[0].records, [records[1]]);
});

test("outdoor shortcuts deduplicate discs without mixing their scene records", () => {
  const record = (disc, area, kind = "MAPM") => ({disc, scene:String(disc).padStart(2,"0"), area, archive:"MPK00", kind, filename:`D${disc}_${area}`});
  const groups = groupShenmue2Catalog([
    record(4,"QGBT"), record(3,"QGBT"), record(1,"AR02"),
    record(4,"KRH1"), record(2,"ARA0"), record(4,"KMZ1","CHRM"),
  ]);
  const views = shenmue2OutdoorViews(groups);
  assert.deepEqual(views.map(v=>[v.area,v.disc]), [["AR02",1],["QGBT",3],["KRH1",4]]);
  assert.deepEqual(views.find(v=>v.area==='QGBT').records.map(r=>r.filename), ['D3_QGBT']);
  assert.deepEqual(shenmue2SceneVariantViews(groups).map(v=>[v.area,v.disc]), [["QGBT",4]]);
});

test("main-area composition joins MPK01 terrain to MPK00 props, never alternate scenes", () => {
  const props = {kind:'PROP',filename:'main-props'};
  const environment = {kind:'MAPM',filename:'main-environment'};
  const alternate = {kind:'MAPM',filename:'event-copy'};
  const archives = new Map([['MPK00',[props]],['MPK01',[environment]],['MAP_KSH3',[alternate]]]);
  assert.deepEqual(primaryShenmue2AreaRecords(archives), [environment,props]);
  assert.equal(primaryShenmue2AreaRecords(new Map([['MPK00',[props]]])), null);
});

test("catalog keeps repeated disc and scenario areas in independent load groups", () => {
  const records = [
    { filename: "S2DC_D2_WT00_MPK00_MAP.MT7", disc: 2, scene: "02", area: "WT00", archive: "MPK00" },
    { filename: "S2DC_D1_WT00_MPK00_MAP.MT7" },
    { filename: "S2DC_D2_S03_WT00_MPK00_MAP.MT7", disc: 2, scene: "03", area: "WT00", archive: "MPK00" },
  ];
  const groups = groupShenmue2Catalog(records);
  assert.deepEqual(groups.map(g => [g.disc, g.scene, g.area]), [
    [1, null, "WT00"], [2, "02", "WT00"], [2, "03", "WT00"],
  ]);
  assert.ok(groups.every(g => g.archives.get("MPK00").length === 1));
  assert.equal(shenmue2AreaPresentation("Q100").region, "Kowloon");
  assert.equal(shenmue2AreaPresentation("KSH1").label, "Shenhua's House");
});

test("presents raw Shenmue II area codes as known locations", () => {
  assert.deepEqual(shenmue2AreaPresentation("AK00"), {
    code: "AK00",
    label: "Fortune's Pier",
    region: "Aberdeen",
    principal: true,
    library: false,
  });
  assert.equal(shenmue2AreaPresentation("WECF").label, "Moon Cafe");
  assert.equal(shenmue2AreaPresentation("ARBT").region, "Aberdeen");
  assert.equal(shenmue2AreaPresentation("WESM").region, "Wan Chai");
  assert.equal(shenmue2AreaPresentation("PACK").label, "Shared character packs");
  assert.equal(shenmue2AreaPresentation("0549").label, "Unidentified scene 0549");
});

test("sorts principal locations before connected locations and shared libraries", () => {
  const areas = ["GLOBAL", "WECF", "WE00", "0549", "AR03", "AKS0"];
  assert.deepEqual(areas.sort(compareShenmue2Areas), [
    "AR03",
    "AKS0",
    "WE00",
    "WECF",
    "0549",
    "GLOBAL",
  ]);
});

test("recognizes MPK00 as the coherent main area archive", () => {
  const archive = shenmue2ArchivePresentation("MPK00", [
    { kind: "MAPM" },
    { kind: "PROP" },
    { kind: "CHRM" },
  ]);
  assert.equal(archive.role, "main-area");
  assert.equal(archive.label, "Main area · environment, props & street objects");
  assert.notEqual(shenmue2ArchivePresentation("MPK00", [
    { kind: "PROP" }, { kind: "CHRM" },
  ]).role, "main-area");
});

test("separates additional scenes from event-only archive sets", () => {
  assert.equal(
    shenmue2ArchivePresentation("WNC0", [{ kind: "MAPM" }]).role,
    "additional-scene",
  );
  assert.equal(
    shenmue2ArchivePresentation("KAMI", [{ kind: "CHRM" }]).role,
    "event-set",
  );
  const entries = [
    { archive: "KAMI", records: [{ kind: "CHRM" }] },
    { archive: "MPK00", records: [{ kind: "MAPM" }] },
    { archive: "WNC0", records: [{ kind: "MAPM" }] },
  ];
  assert.deepEqual(entries.sort(compareShenmue2Archives).map((entry) => entry.archive), [
    "MPK00",
    "WNC0",
    "KAMI",
  ]);
});

test("orders and labels a main area like a scene instead of a file dump", () => {
  const records = [
    { kind: "CHRM", sourceMember: "GBOX200G.CHRM" },
    { kind: "PROP", sourceMember: "PROP.PROP" },
    { kind: "MAPM", sourceMember: "MAP04.MAPM" },
    { kind: "MAPM", sourceMember: "MAP.MAPM" },
  ];
  records.sort(compareShenmue2Records);
  assert.deepEqual(records.map((record) => record.sourceMember), [
    "MAP.MAPM",
    "MAP04.MAPM",
    "PROP.PROP",
    "GBOX200G.CHRM",
  ]);
  assert.equal(
    shenmue2RecordDisplayName(records[0], "MPK00"),
    "Base environment · MAP.MAPM",
  );
  assert.equal(
    shenmue2RecordDisplayName(records[3], "MPK00"),
    "Street object / character · GBOX200G.CHRM",
  );
});
