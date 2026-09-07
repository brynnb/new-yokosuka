import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const sourcePath = process.argv[2] || "play/data/events/nativeEventPrograms.generated.json";
const sourceBytes = await readFile(sourcePath);
const pack = JSON.parse(sourceBytes);

function titleFor(program) {
  if (program.id.includes("phone-book")) return "D000 Telephone Book Controller";
  if (program.id.includes("selector-18")) return "D000 Selector 18 Automatic Event";
  return "D000 Hato and Room Entry";
}

function documentFor(program) {
  const functionIds = new Set(program.functions.map((fn) => fn.id));
  const nodes = program.functions.map((fn, index) => ({
    id: fn.id,
    type: "native_function",
    label: `${fn.id}${fn.dialogueRegion ? " · dialogue" : ""}`,
    position: { x: (index % 5) * 280, y: Math.floor(index / 5) * 150 },
    config: {
      kind: "recovered_native_function",
      nativeFunction: fn,
    },
  }));
  const edges = [];
  for (const fn of program.functions) {
    for (const block of fn.blocks) {
      for (const action of block.actions) {
        if (action.kind !== "directCall" && action.kind !== "childCoroutineLaunch") continue;
        const target = action.targetFileOffset;
        if (!functionIds.has(target)) continue;
        edges.push({
          id: `${fn.id}:${action.callFileOffset}:${edges.length}`,
          from: fn.id,
          to: target,
          port: action.kind === "childCoroutineLaunch" ? "coroutine" : "call",
        });
      }
    }
  }
  return {
    schema: "new-yokosuka-script-v1",
    entryNodeId: program.entryFunction,
    nodes,
    edges,
  };
}

const packHash = createHash("sha256").update(sourceBytes).digest("hex");
const imports = pack.programs.map((program) => {
  const document = documentFor(program);
  return {
    slug: program.id,
    title: titleFor(program),
    description: "Recovered original D000 program imported as a lossless native function graph.",
    sourceLocator: `${sourcePath}#${program.id}`,
    sourceHash: pack.generatedFrom?.nativeEventIrSha256 || packHash,
    documentHash: createHash("sha256").update(JSON.stringify(document)).digest("hex"),
    document,
    summary: `${program.summary.functionCount} recovered functions, ${program.summary.blockCount} blocks, and ${program.summary.actionCount} ordered actions.`,
  };
});

process.stdout.write(`${JSON.stringify(imports)}\n`);
