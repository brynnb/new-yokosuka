// Usage: node scripts/prepare-landing-screenshots.mjs /path/to/screenshots [workers]
// Preserve numbered originals; ship small thumbnails and larger lightbox images.
import { execFile } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const input = process.argv[2];
const workers = Number(process.argv[3] || 4);
if (!input || !Number.isInteger(workers) || workers < 1 || workers > 6) {
  throw new Error("Usage: node scripts/prepare-landing-screenshots.mjs <input-directory> [workers: 1..6]");
}
const output = fileURLToPath(new URL("../public/screenshots/", import.meta.url));
const sources = Array.from({ length: 9 }, (_, i) => path.resolve(input, `${i + 1}.png`));
await Promise.all(sources.map(file => stat(file)));
await mkdir(output, { recursive: true });
let next = 0;
await Promise.all(Array.from({ length: workers }, async () => {
  while (next < sources.length) {
    const index = next++;
    await run("magick", ["-limit", "thread", "1", sources[index], "-strip",
      "(", "+clone", "-resize", "768x768>", "-quality", "82", "-write", path.join(output, `${index + 1}-thumb.webp`), "+delete", ")",
      "-resize", "2560x2560>", "-quality", "90", path.join(output, `${index + 1}.webp`),
    ]);
  }
}));
console.log("Prepared screenshots 1–9 with thumbnails; source PNGs unchanged.");
