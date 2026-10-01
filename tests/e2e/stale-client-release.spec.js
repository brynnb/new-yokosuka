import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

test("an already-open browser can load its old lazy chunk after an atomic release switch", async ({ page }) => {
  const root = mkdtempSync("/var/tmp/new-yokosuka-browser-release-");
  const app = path.join(root, "app");
  const script = path.resolve("deploy/frontend-release.sh");
  let server;
  try {
    mkdirSync(path.join(app, "assets"), { recursive: true });
    for (const name of ["MOTION.BIN", "M_FGT1.BIN"]) writeFileSync(path.join(app, "assets", name), "fixture");
    const stage = id => {
      const source = path.join(root, id);
      mkdirSync(path.join(source, "assets"), { recursive: true });
      const lazy = `export default ${JSON.stringify(id)};`;
      const filename = `lazy-${createHash("sha256").update(lazy).digest("hex").slice(0, 16)}.js`;
      writeFileSync(path.join(source, "assets", filename), lazy);
      writeFileSync(path.join(source, "index.html"), `<!doctype html><title>${id}</title>
        <button id="lazy">Load delayed feature</button><output id="result"></output>
        <script type="module">document.querySelector('#lazy').onclick = async () => {
          document.querySelector('#result').textContent = (await import('/assets/${filename}')).default;
        };</script>`);
      const archive = execFileSync("tar", ["czf", "-", "."], { cwd: source });
      execFileSync(script, ["stage", app, id], { input: archive });
      execFileSync(script, ["activate", app, id]);
      execFileSync(script, ["prune", app, id, "3"]);
    };
    stage("one");
    server = createServer((request, response) => {
      const pathname = new URL(request.url, "http://localhost").pathname;
      const relative = pathname === "/" ? "index.html" : pathname.slice(1);
      if (relative.includes("..")) { response.writeHead(400).end(); return; }
      try {
        const bytes = readFileSync(path.join(app, "dist", relative));
        response.writeHead(200, { "Content-Type": relative.endsWith(".js") ? "application/javascript" : "text/html",
          "Cache-Control": relative.endsWith(".js") ? "public,max-age=31536000,immutable" : "no-store" }).end(bytes);
      } catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url);
    await expect(page).toHaveTitle("one");
    stage("two");
    // This page keeps release one's HTML. It has not requested the lazy module
    // yet, so success cannot come from the browser's previous module cache.
    await page.locator("#lazy").click();
    await expect(page.locator("#result")).toHaveText("one");
    await page.reload();
    await expect(page).toHaveTitle("two");
    await page.locator("#lazy").click();
    await expect(page.locator("#result")).toHaveText("two");
    expect(errors).toEqual([]);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
});
