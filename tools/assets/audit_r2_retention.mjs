import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { auditRuntimeRetention, listRuntimeObjects } from "../lib/R2AssetRetentionAudit.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2), commits = [];
let report;
for (const arg of args) {
  if (arg.startsWith("--retained-commit=")) {
    const commit = arg.slice("--retained-commit=".length);
    if (!/^[a-f0-9]{40}$/.test(commit)) throw Error("Retained commits must be full Git commit IDs");
    commits.push(commit);
  } else if (arg.startsWith("--report=")) report = arg.slice("--report=".length);
  else throw Error(`Unknown argument: ${arg}. This audit has no apply/delete mode.`);
}
const retained = [{ label: "local working manifest (pending protection)",
  manifest: JSON.parse(await readFile(new URL("../../src/runtime-assets.generated.json", import.meta.url))) }];
for (const commit of new Set(commits)) retained.push({ label: `commit:${commit}`,
  manifest: JSON.parse(execFileSync("git", ["show", `${commit}:src/runtime-assets.generated.json`],
    { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 ** 2 })) });
const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) throw Error("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required");
const bucket = "newyokosuka";
const client = new S3Client({ region: "auto",
  endpoint: process.env.R2_ENDPOINT || "https://7eb36bc15f5604ad933e364f40bee6b6.r2.cloudflarestorage.com",
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  maxAttempts: 4, requestHandler: { connectionTimeout: 10_000, requestTimeout: 120_000 },
});
try {
  const objects = await listRuntimeObjects(command => client.send(command), ListObjectsV2Command, bucket);
  const audit = auditRuntimeRetention({ objects, retained });
  const result = { version: 1, at: new Date().toISOString(), bucket, ...audit };
  if (report) await writeFile(report, JSON.stringify(result, null, 2) + "\n");
  console.table(audit.manifests);
  console.log(JSON.stringify(audit.summary, null, 2));
  console.log(`Missing references: ${audit.missingReferences.length}; size mismatches: ${audit.sizeMismatches.length}; unknown keys retained: ${audit.unknownKeys.length}`);
  console.log("Read-only audit: nothing deleted. Verify that supplied commits cover live/rollback clients before considering cleanup.");
  console.log("Model libraries, dialogue voices, media, and arcade objects are outside this audit's scope.");
  if (audit.missingReferences.length || audit.sizeMismatches.length || audit.unknownKeys.length) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { client.destroy(); }
