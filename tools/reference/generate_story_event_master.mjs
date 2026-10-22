#!/usr/bin/env node
// Documentation only: never import this inventory into Story's runtime rules.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { anchor, conversationOutput, sourceInput, loadConversations, expandFamilies,
  renderExpansions, renderConversations } from "./story_event_expansions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const input = "tools/data/shenmue1-story-event-master.json";
const output = "docs/reference/shenmue1-story-event-master.generated.md";
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const inventory = read(input);
const routeList = read("tools/scripting/story-investigation.json").routes;
const moves = read("play/data/story-move-learning.json").moves;
const routes = new Map(routeList.map(route => [route.id, route]));
// Use the maintained place-name source without importing Babylon or game startup.
const areaNames = new Map(fs.readFileSync(path.join(root, "public/data/maps.csv"), "utf8")
  .split(/\r?\n/).slice(1).map(line => line.split(";").map(value => value.trim()))
  .filter(([, id]) => /^[A-Z0-9]{4}$/.test(id || ""))
  .map(([name, id]) => [id, name]));
assert.equal(routes.size, routeList.length, "duplicate Story route");
assert.equal(inventory.schema, "shenmue1-story-event-master-v1");
const chapters = new Map(inventory.chapters.map(chapter => [chapter.id, chapter]));
assert.equal(chapters.size, inventory.chapters.length, "duplicate chapter");
const assigned = new Set();
const events = [];
const ref = (label, file) => `[${label}](${path.relative(path.dirname(output), file)})`;
const cell = value => String(value || "—").replaceAll("|", "\\|").replaceAll("\n", " ");
const sourceRef = id => {
  const source = inventory.sources[id];
  assert(source, `unknown evidence source ${id}`);
  if (source.path) assert(fs.existsSync(path.join(root, source.path)), `missing ${source.path}`);
  return source.url ? `[${id}](${source.url})` : ref(id, source.path);
};
function assign(id) {
  assert(routes.has(id), `unknown route ${id}`);
  assert(!assigned.has(id), `route assigned twice: ${id}`);
  assigned.add(id);
}
function add(event) {
  assert(chapters.has(event.chapter), `unknown chapter ${event.chapter}`);
  assert(event.id && event.name && event.kind && event.where && event.sources?.length,
    `incomplete event ${event.id}`);
  event.sources.forEach(sourceRef);
  if (event.before) {
    const index = events.findIndex(candidate => candidate.id === event.before);
    assert(index !== -1 && events[index].chapter === event.chapter,
      `invalid ordering anchor ${event.before} for ${event.id}`);
    events.splice(index, 0, event);
  } else events.push(event);
}

for (const chapter of inventory.chapters) {
  for (const id of chapter.routes) {
    assign(id);
    const route = routes.get(id);
    const kind = route.challenge ? "Challenge" : route.trigger === "use" ? "Interaction"
      : route.activities?.length ? "Scene" : route.voiceIds?.length ? "Conversation" : "Story event";
    const parts = inventory.splits[id] || [[null, route.title, kind]];
    for (const [suffix, name, partKind] of parts) {
      add({id: `story.${id}${suffix ? `.${suffix}` : ""}`, chapter: chapter.id, name,
        kind: partKind, where: `${areaNames.get(route.area) || "Location label unresolved"} (${route.area})`,
        sources: ["routes"], binding: `route:${id}`,
        note: inventory.routeNotes[id] || ""});
    }
  }
}
for (const [alias, target] of Object.entries(inventory.routeAliases)) {
  assign(alias);
  assert(assigned.has(target), `alias target is not an inventoried route: ${target}`);
}
for (const id of Object.keys(inventory.routeAdapters)) assign(id);
assert.deepEqual(routeList.map(route => route.id).filter(id => !assigned.has(id)), [],
  "new Story routes need an explicit inventory entry, alias or adapter classification");
for (const id of Object.keys(inventory.splits)) assert(assigned.has(id), `unbound split ${id}`);
for (const event of inventory.events) add(event);

// Lessons and scrolls use the authoritative content list, not a copied list
// that can silently omit the next optional lesson. Their original locations
// and timing are still separate evidence questions.
const existingLessons = {tornadoKick: "story.tom-lesson.practice", swallowFlip: "story.swallow-flip.practice"};
for (const move of moves) {
  if (existingLessons[move.id]) {
    assert(events.some(event => event.id === existingLessons[move.id]));
    continue;
  }
  if (move.teacher) {
    add({id: `learning.${move.id}`, chapter: "learning", name: `Learn ${move.name} from ${move.teacher}`,
      kind: "Lesson", where: "Offer, demonstration, practice and completion; decline/retry variants",
      sources: ["moves", "move-guide"], binding: `move:${move.id}`});
  } else {
    const disputed = ["twinBlades", "shadowReaper"].includes(move.id);
    add({id: `scroll.${move.id}.acquire`, chapter: "learning", name: `${move.price ? "Buy" : "Find"} the ${move.name} scroll`,
      kind: move.price ? "Purchase" : "Pickup",
      where: disputed ? "Hazuki home; room assignment disputed" : move.location || "Bunkado Antiques",
      sources: ["moves", "move-guide"], binding: `item:${move.itemKey}`,
      note: disputed ? "Implementation and walkthrough swap the two household scroll locations; see coverage gaps." : ""});
    add({id: `scroll.${move.id}.read`, chapter: "learning", name: `Read and learn ${move.name}`,
      kind: "Learning", where: "Owned scroll; translation prerequisite where applicable",
      sources: ["moves", "move-guide"], binding: `move:${move.id}`});
  }
}
add({id:"scroll.stabArmor.translate",chapter:"learning",name:"Have Stab Armor translated",
  kind:"Conversation",where:"Warehouse No. 8; original translator disputed",
  sources:["moves","move-guide","afs-guide"],binding:"story.s1.stab-armor.translated",
  note:"Current adaptation uses Master Chen; the annotated SA1108 source names Gui Zhang. Verify original actor."});

assert.equal(new Set(events.map(event => event.id)).size, events.length, "duplicate event ID");
const families = events.filter(event => /family/i.test(event.kind));
const named = events.length - families.length;
const source = read(sourceInput);
const conversations = await loadConversations(root, source);
const expansion = expandFamilies({inventory, events, source, conversations,
  challenges: read("play/data/story-challenges.json").challenges,
  encounters: read("play/data/story-combat.json").encounters});
const { counts } = expansion;
const expansionById = new Map(expansion.sections.map(section => [section.id, section]));
const generated = [
  "# Shenmue I master event list", "",
  `Reviewed ${inventory.reviewed}. Generated by ${ref("generate_story_event_master.mjs", "tools/reference/generate_story_event_master.mjs")}; edit the ${ref("maintained inventory", input)}, not this output.`, "",
  "This is the central inventory of events that interrupt ordinary Shenmue I exploration: story scenes, optional encounters, conversations, lessons, discoveries, fights, QTEs, travel and repeatable activities. It is a coverage checklist against the original game, not a list of completed New Yokosuka features.", "",
  `**${named} main-list entries; all ${families.length} former expansion groups now have detailed records.** The expansions contain ${counts.topics} source-backed topics/responses, ${counts.cases} encounter-specific review cases and ${counts.aliases} links to already-listed events. A separate ${ref("conversation appendix", conversationOutput)} enumerates ${conversations.length} native conversation entries, including ${counts.calendar} holiday-related branches. These overlapping categories must not be added into a claimed unique-event total.`, "",
  `All ${routeList.length} current authored investigation routes and all ${moves.length} taught/scroll moves are accounted for. This is still not a certified census of every original-game event: exact native triggers, unassigned resources, semantic overlaps and original failure presentations remain open below.`, "",
  "## Counting and scope", "",
  "- Give each distinct controlled sequence or interaction its own stable ID. A continuous conversation can use multiple camera shots or AUTH resources without becoming multiple events.",
  "- Split transitions between a scene, player-controlled challenge and materially different outcome. Individual QTE button presses and ordinary camera cuts are not separate events.",
  "- Repeatable activities appear once with their variants, not once per day or attempt. Different teaching moves, discoveries and meaningful branches have separate entries.",
  "- Chapter order is navigation, not a mandatory dependency chain. Optional events can overlap chapters. Exact original prerequisites, dates and weather must be established independently of our adapted route flags.",
  "- Family rows now link to detailed expansions. Original conversation entry markers are source branches, not automatically distinct player-facing events. Unresolved native handoffs remain visible in the appendix.",
  "- Shenmue II and non-playthrough material are outside this list; see the exclusions at the end.", "",
  "## How to read implementation status", "",
  "**Bound** means a current project route, package, move or item reference is recorded. It does not prove its original trigger, complete presentation, live deployment or a successful browser run. **Unmapped** means this inventory has not established the runtime binding; it does not prove the feature is absent. **Gap** names a verified omission. **Expanded** links to the family's detailed source records or review cases; it does not mean implemented.", "",
  "Every row starts with presentation **unreviewed** unless a specific result is recorded. Check these independently before marking an event complete: actors; mouths/faces; objects and handovers; body/hand motion; cameras; voice/music/effects; input/QTE/combat; durable outcome; skip/cancel/retry/restoration. Use **not applicable** only after checking the event. Playing to completion or saving a notebook entry does not clear the presentation checks.", "",
  "The route links retain native resource locators, hashes, voices and adaptation notes where available. A route's authored flags and bounds are not asserted to be the original game's rules. A package ID is not automatically a Story trigger.", "",
  "## Chapters", "",
  ...inventory.chapters.map(chapter => `- [${chapter.title}](#${chapter.title.toLowerCase().replace(/[^a-z0-9 ]/g, "").replaceAll(" ", "-")})`), "",
  "- [Expanded event groups](#expanded-event-groups)",
  `- ${ref("Native conversation entries, by character", conversationOutput)}`, "",
];
for (const chapter of inventory.chapters) {
  generated.push(`## ${chapter.title}`, "");
  if (chapter.id === "learning") generated.push(
    "Tornado Kick and Swallow Flip are listed at their story positions above, not duplicated here. This section lists the other six lessons and all nine scroll acquisition/reading pairs. Original lesson windows and the two household scroll locations require the review noted below.", "");
  generated.push("| ID | Event | Type and context | Evidence and current binding | Status |",
    "| --- | --- | --- | --- | --- |");
  const list = events.filter(event => event.chapter === chapter.id);
  for (const event of list) {
    const evidence = event.sources.map(sourceRef).join(", ");
    const binding = event.binding ? `; \`${event.binding}\`` : "";
    const section = expansionById.get(event.id);
    const status = section ? `[Expanded](#expanded-${anchor(event.id)})` : event.gap ? `Gap: ${event.gap}` : event.binding ? "Bound; review" : "Unmapped; review";
    generated.push(`| \`${event.id}\` | ${cell(event.name)} | ${cell(event.kind)} — ${cell(event.where)}${event.note ? `<br>${cell(event.note)}` : ""} | ${evidence}${binding} | ${cell(status)} |`);
  }
  generated.push("");
}
generated.push(...renderExpansions(expansion.sections, sourceRef, ref));
generated.push("## Shared presentation omissions", "",
  "The first allowance package has no facial bindings for either voiced actor and marks its KOZU handover object as an invisible reference. The common late-Story package factory binds only Ryo's facial assets, so recording a route here must not be mistaken for complete NPC lip sync. These are existing implementation gaps, not missing requirements. See the [cutscene facial contract](../implementation/cutscenes.md#character-faces) and the package registry.", "",
  "## Locations and project adapters", "",
  "These bindings are accounted for without inflating the original-event count. Alternate telephone locations and scene-entry confirmations belong to their parent event. The current project's explicit travel confirmations, clock jumps and checkpoint plumbing are not asserted to be separate original-game cinematics.", "",
  "| Current route | Inventory owner or reason |", "| --- | --- |");
for (const [alias, target] of Object.entries(inventory.routeAliases)) {
  generated.push(`| \`${alias}\` | \`route:${target}\` |`);
}
for (const [id, reason] of Object.entries(inventory.routeAdapters)) {
  generated.push(`| \`${id}\` | ${reason} |`);
}
generated.push("", "## Coverage still requiring verification", "",
  "An event can be listed before its exact trigger or implementation is known. Do not remove such entries merely because they are difficult to reconstruct. Conversely, do not declare the entire game inventoried while these gaps remain:", "",
  ...inventory.unresolved.map(gap => `- **${gap.id}:** ${gap.text}`), "",
  "## Sources and maintenance", "",
  "Source priority: original data and captures; retained source-backed project evidence; contemporary/firsthand guides; later walkthroughs. Project-authored scenes establish what our code does, not original-game truth. Guide-only rows deliberately avoid invented flag numbers, coordinates and precise schedules. Source disagreements remain visible rather than being resolved by guessing.", "",
  ...Object.entries(inventory.sources).map(([id, source]) => `- ${sourceRef(id)} — ${source.label}. ${source.kind}.`), "",
  "Rebuild and check from the repository root:", "", "```sh",
  "node tools/reference/generate_story_event_master.mjs",
  "node tools/reference/generate_story_event_master.mjs --check",
  "npm run docs:check", "```", "",
  "The retained source index makes these checks runnable without disc files. After changing voice evidence or the native corpus, rebuild that index first using the three locally extracted, hash-verified HUMANS archives and all-disc dialogue inventory:", "", "```sh",
  "python3 -m tools.reference.build_story_event_sources",
  "python3 -m tools.reference.build_story_event_sources --check", "```", "",
  "The generator checks unique IDs, source paths, subtitle evidence, native message references, route ownership, aliases, all taught/scroll moves and coverage of ordinary QTE segments. It fails when a new route or QTE segment is left unclassified. These checks establish inventory consistency, not historical completeness or rendered correctness. No gameplay data, server scripts, extracted assets or production services are modified.", "",
  "Use the [connected progression checklist](../design/story-event-template.md#connected-progression-checklist) for historical integration receipts and the [Story event template](../design/story-event-template.md#reusable-template) for implementation requirements. This master list owns event enumeration; those documents must not substitute for it.", "");

const content = generated.join("\n");
for (const [file, body] of [[output, content], [conversationOutput, renderConversations(conversations, source, inventory.reviewed)]]) {
  if (process.argv.includes("--check")) {
    assert.equal(fs.readFileSync(path.join(root, file), "utf8"), body, `${file} needs regeneration`);
  } else fs.writeFileSync(path.join(root, file), body);
}
console.log(`${named} main entries; ${families.length} expanded groups; ${JSON.stringify(counts)}; ${conversations.length} native conversation entries; ${assigned.size}/${routeList.length} routes; ${moves.length} moves. ${process.argv.includes("--check") ? "Current." : "Generated."}`);
