import { CUTSCENE_SELECTIONS } from "../../config/cutscenes.js";
import shenmue2Exploration from '../../data/shenmue2-exploration-worlds.json' with { type: 'json' };

export const TRAVEL_DESTINATIONS = Object.freeze([
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

export const SHENMUE_II_TRAVEL_DESTINATIONS = Object.freeze([
  ["s2ak00", "Fortune's Pier"],
  ["s2ar02", "Worker's Pier"],
  ["s2ar03", "Queen's Street"],
  ["s2wb00", "Scarlet Hills"],
  ["s2we00", "Golden Quarter"],
  ["s2wk00", "South Carmain Quarter"],
  ["s2wn00", "Lucky Charm Quarter"],
  ["s2wr00", "White Dynasty Quarter"],
  ["s2ws00", "Green Market Quarter"],
  ["s2wt00", "Wise Men's Quarter"],
]);

export const TRAVEL_DESTINATION_GROUPS = Object.freeze([
  Object.freeze({
    label: "Shenmue",
    destinations: TRAVEL_DESTINATIONS,
  }),
  Object.freeze({
    label: "Shenmue II",
    destinations: SHENMUE_II_TRAVEL_DESTINATIONS,
  }),
  ...[2, 3, 4].map(disc => Object.freeze({
    label: `Shenmue II · Disc ${disc} exploration`,
    destinations: Object.freeze(shenmue2Exploration.worlds.filter(world => world.disc === disc)
      .map(world => Object.freeze([world.id, `${world.label} · ${world.area}`]))),
  })),
]);

export { CUTSCENE_SELECTIONS };
