import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildUploadPlan,
  parseArguments,
  usage,
} from "./lib/R2AssetUploadPlan.js";
import {
  S3AssetUploadTransport,
  WorkerAssetUploadTransport,
} from "./lib/R2AssetUploadTransport.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");

function loadLocalEnvironment() {
  const environmentPath = path.join(repositoryRoot, ".env");
  if (typeof process.loadEnvFile === "function" && fs.existsSync(environmentPath)) {
    process.loadEnvFile(environmentPath);
  }
}

function requireR2Configuration() {
  const names = [
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_ENDPOINT",
    "R2_BUCKET_NAME",
  ];
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing R2 configuration: ${missing.join(", ")}`);
  }
  return {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    endpoint: process.env.R2_ENDPOINT,
    bucket: process.env.R2_BUCKET_NAME,
  };
}

function hashFile(filename) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const input = fs.createReadStream(filename);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

async function uploadTask(transport, item, force) {
  let sha256;
  if (!force) {
    const remote = await transport.head(item.key);
    if (remote?.size === item.size && remote.sha256) {
      sha256 = await hashFile(item.filePath);
      if (remote.sha256 === sha256) return "skipped";
    }
  }

  sha256 ??= await hashFile(item.filePath);
  await transport.put(item, sha256);
  const verified = await transport.head(item.key);
  if (verified?.size !== item.size || verified?.sha256 !== sha256) {
    throw new Error(`Post-upload verification failed: ${item.key}`);
  }
  return "uploaded";
}

async function runPhase(transport, items, options, totals) {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(options.concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        try {
          const result = await uploadTask(transport, item, options.force);
          totals[result] += 1;
        } catch (error) {
          totals.failed += 1;
          console.error(`Failed ${item.key}: ${error.message}`);
        }
        totals.processed += 1;
        if (totals.processed % 50 === 0 || totals.processed === totals.total) {
          console.log(
            `Progress ${totals.processed}/${totals.total}: `
            + `${totals.uploaded} uploaded, ${totals.skipped} unchanged, ${totals.failed} failed`,
          );
        }
      }
    },
  );
  await Promise.all(workers);
}

function formatBytes(bytes) {
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unit = units[0];
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(unit === "B" ? 0 : 1)} ${unit}`;
}

function printPlan(plan, options) {
  const bytes = plan.reduce((sum, item) => sum + item.size, 0);
  console.log(
    `${options.dryRun ? "Dry run" : "Publishing"}: ${plan.length} objects, ${formatBytes(bytes)}`,
  );
  for (const game of ["s1", "s2", "runtime"]) {
    const selected = plan.filter((item) => item.game === game);
    if (selected.length === 0) continue;
    const gameBytes = selected.reduce((sum, item) => sum + item.size, 0);
    console.log(`- ${game.toUpperCase()}: ${selected.length} objects, ${formatBytes(gameBytes)}`);
  }
  console.log(`- Prefix: ${options.prefix}/`);
  console.log("- Catalogs publish last; remote objects are never deleted");
}

export async function run(argv = process.argv.slice(2)) {
  loadLocalEnvironment();
  const options = parseArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const plan = buildUploadPlan(options);
  printPlan(plan, options);
  if (options.dryRun) return;

  const transport = options.workerUrl
    ? new WorkerAssetUploadTransport(options.workerUrl, { requestTimeoutMs: options.requestTimeoutMs })
    : new S3AssetUploadTransport(requireR2Configuration());
  const totals = {
    total: plan.length,
    processed: 0,
    uploaded: 0,
    skipped: 0,
    failed: 0,
  };
  const content = plan.filter((item) => item.phase === "content");
  const catalogs = plan.filter((item) => item.phase === "catalog");

  await runPhase(transport, content, options, totals);
  if (totals.failed > 0) {
    throw new Error("Content upload failed; catalogs were not published");
  }
  await runPhase(transport, catalogs, { ...options, concurrency: 1 }, totals);
  if (totals.failed > 0) throw new Error("Catalog upload failed");

  console.log(`Upload complete: ${totals.uploaded} uploaded, ${totals.skipped} unchanged`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(`Asset upload failed: ${error.message}`);
    process.exitCode = 1;
  });
}
