import assert from "node:assert/strict";
import test from "node:test";
import exploration from '../play/data/shenmue2-exploration-worlds.json' with {type:'json'};

import {
  CUTSCENE_SELECTIONS,
  SHENMUE_II_TRAVEL_DESTINATIONS,
  TRAVEL_DESTINATION_GROUPS,
  TRAVEL_DESTINATIONS,
} from "../play/ui/react/SidebarData.js";

test("travel dropdown preserves the former map order without subtext", () => {
  assert.deepEqual(TRAVEL_DESTINATIONS, [
    ["interior", "Hazuki Residence Interior"],
    ["exterior", "Hazuki Residence Grounds"],
    ["yamanose", "Yamanose"],
    ["sakuragaoka", "Sakuragaoka"],
    ["dobuita", "Dobuita"],
    ["cinema", "Cinema"],
    ["arcade", "You Arcade"],
    ["djaz", "MJQ Jazz Bar"],
    ["mfsy", "New Yokosuka Harbor"],
    ["mksg", "Old Warehouse District"],
    ["mfbt", "Combat Practice"],
    ["ma00", "Forklift Playground"],
    ["ma00race", "Forklift Races"],
  ]);
});

test("travel dropdown groups every destination by game", () => {
  assert.deepEqual(TRAVEL_DESTINATION_GROUPS, [
    {
      label: "Shenmue",
      destinations: TRAVEL_DESTINATIONS,
    },
    {
      label: "Shenmue II",
      destinations: SHENMUE_II_TRAVEL_DESTINATIONS,
    },
    ...[2,3,4].map(disc=>({
      label: `Shenmue II · Disc ${disc} exploration`,
      destinations: exploration.worlds.filter(w=>w.disc===disc).map(w=>[w.id,`${w.label} · ${w.area}`]),
    })),
  ]);
});

test("cutscene dropdown preserves the curated scene order", () => {
  assert.deepEqual(CUTSCENE_SELECTIONS, [
    ["S1-HOUO-01", "Phoenix Mirror — Ryo and Fuku-san"],
    ["S1-TOKI-01", "Chinese Letter — Xia Xiu Yu"],
    ["S1-OP02-00", "Opening Vision — Shenhua and the Hawk"],
    ["S1-000", "Introduction — Iwao's Murder"],
    ["S1-DRAUTH-01", "DRAUTH — Sequence 1"],
    ["S1-DRAUTH-02", "DRAUTH — Sequence 2"],
    ["S1-YQ14-01", "Heartbeats Alley — Confrontation"],
    ["S1-YQ14-02", "Heartbeats Alley — Beer QTE"],
    ["S1-YBHN-01", "Nozomi Waits for Ryo"],
    ["S1-DJHN-01", "Vending Machine — Sequence 1"],
    ["S1-DJHN-02", "Vending Machine — Sequence 2"],
    ["S1-DJHN-03", "Vending Machine — Sequence 3"],
    ["S1-DJHN-04", "Vending Machine — Sequence 4"],
    ["S1-DJHN-05", "Vending Machine — Sequence 5"],
    ["S1-DJHN-06", "Vending Machine — Sequence 6"],
    ["S1-DJHN-07", "Vending Machine — Sequence 7"],
    ...Array.from({ length: 12 }, (_, index) => [
      `S1-D0W0-${String(index + 1).padStart(2, "0")}`,
      `Yamagishi's Advice — Sequence ${index + 1}`,
    ]),
    ["S1-DNOZ-01", "Nozomi's Confession"],
    ["S1-DNOZ-02", "Nozomi's Tears"],
    ["S1-TGMA-01", "Fuku-san's Letter"],
    ...Array.from({ length: 8 }, (_, index) => [
      `S1-JHW0-${String(index + 1).padStart(2, "0")}`,
      `Fuku-san's Move Training — Sequence ${index + 1}`,
    ]),
    ["S1-MSKA-01", "Fuku-san — Iwao's Death"],
    ["S1-KAKG-01", "Fuku-san — Ryo's Resolve"],
    ["S1-KAKG-02", "Ine-san — Promise to Iwao"],
    ["S1-BUSS-01", "Bus to New Yokosuka Harbor — Boarding A"],
    ["S1-BUSS-02", "Bus to New Yokosuka Harbor — Boarding B"],
    ["S1-BUSS-03", "Bus to New Yokosuka Harbor — Arrival A"],
    ["S1-BUSS-04", "Bus to New Yokosuka Harbor — Arrival B"],
    ["S1-HIHY-01", "Iwao and Young Ryo — The Path"],
    ["S1-CATA1-01", "Megumi and the Kitten"],
    ["S1-EVSN-01", "Nozomi Rescue — Main Route"],
    ["S1-EVSN-02", "Nozomi Rescue — Alternate Lead-in"],
    ["S1-BEBF-01", "Ryo's Nightmare — Shenhua's Warning"],
    ["S1-KKYA-01", "Dream Vision — Phoenix Mirror"],
    ["S1-KKYB-01", "Dream Vision — The Two Mirrors"],
    ["S1-KKYC-01", "Dream Vision — Shenhua"],
    ["S1-KKYD-01", "Dream Vision — Shenhua and the Stone"],
    ["S1-KKYE-01", "Dream Vision — Shenhua and the Hawk"],
    ["S1-KKYF-01", "Dream Vision — Lan Di"],
    ["S1-SAKR-01", "Iwao and Young Ryo — Training Memory"],
  ]);
});
