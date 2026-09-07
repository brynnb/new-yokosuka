import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = resolve(
  process.argv[2] || resolve(projectRoot, "../lucky-break"),
);
const vendorDirectory = resolve(projectRoot, "vendor");
const vendoredPackage = resolve(
  vendorDirectory,
  "lucky-break-engine.tgz",
);
const pendingVendoredPackage = resolve(
  vendorDirectory,
  ".lucky-break-engine.tgz.pending",
);

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: sourceRoot,
      stdio: "inherit",
      ...options,
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with status ${code}.`));
    });
  });
}

const temporaryDirectory = await mkdtemp(
  "/var/tmp/lucky-break-engine-",
);
try {
  const packageData = JSON.parse(
    await readFile(resolve(sourceRoot, "package.json"), "utf8"),
  );
  if (packageData.name !== "@brynnb/lucky-break-engine") {
    throw new Error(
      `${sourceRoot} is not the Lucky Break engine package.`,
    );
  }
  await run("npm", ["run", "build:engine"]);
  await run("npm", [
    "pack",
    "--pack-destination",
    temporaryDirectory,
    "--ignore-scripts",
  ]);
  const generatedName = (
    `${packageData.name.replace(/^@/, "").replace("/", "-")}`
    + `-${packageData.version}.tgz`
  );
  const generatedPackage = resolve(temporaryDirectory, generatedName);
  // Validate the exact archive before replacing our approved public dependency.
  await run("node", [
    resolve(projectRoot, "scripts/verify-lucky-break-package.mjs"),
    generatedPackage,
  ]);
  await mkdir(vendorDirectory, { recursive: true });
  await copyFile(generatedPackage, pendingVendoredPackage);
  await rename(pendingVendoredPackage, vendoredPackage);
  await run(
    "npm",
    ["update", "@brynnb/lucky-break-engine"],
    { cwd: projectRoot },
  );
  console.log(
    `Synced and installed ${basename(vendoredPackage)} from ${sourceRoot} `
    + `(${packageData.version}). Bump the engine package version before `
    + "syncing behavior changes so npm cannot reuse a cached tarball.",
  );
} finally {
  await rm(pendingVendoredPackage, { force: true });
  await rm(temporaryDirectory, { recursive: true, force: true });
}
