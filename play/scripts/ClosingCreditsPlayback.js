import manifest from "../assets/ending/closing-credits/manifest.json" with { type: "json" };
import { runtimeAssetUrl } from "../../src/RuntimeAssets.js";

// 1ST_READ.BIN file offsets 0x16e126, 0x16e298, 0x16e342, 0x16e3ac and
// 0x16e498. The task sleeps for 90 ticks before advancing the first strip.
// It advances two pixels per task update and issues a strip every 256 ticks.
const ticksPerSecond = 30;
const pageWidth = 512;
const pageHeight = 512;
const firstPageTick = 90;
const lastPageTick = firstPageTick + (manifest.pageCount - 1) * 256;
const fadeTick = lastPageTick + 406;
const logoTick = fadeTick + 32;
export const closingCreditsEndTick = logoTick + 90 + 32 + 30;

const limit = value => Math.min(1, Math.max(0, value));
export function closingCreditsFrame(tick) {
  const pages = [];
  const rolling = Math.max(0, (tick - firstPageTick) * 2);
  if (tick >= firstPageTick && tick < logoTick) {
    // Once the final page has rolled to the top, its original task holds it
    // there while the remaining sprite tasks leave the visible area.
    const first = Math.max(1, Math.floor((rolling - 480) / pageHeight) + 1);
    const last = Math.min(manifest.pageCount, Math.floor(rolling / pageHeight) + 1);
    for (let n = first; n <= last; n++) {
      const y = 480 + (n - 1) * pageHeight - rolling;
      if (n < manifest.pageCount && y <= -pageHeight) continue;
      pages.push({n, y:n === manifest.pageCount ? Math.max(0, y) : y});
    }
    if (first > manifest.pageCount) pages.push({n:manifest.pageCount, y:0});
  }
  if (tick < firstPageTick) return {phase:"intro",pages,opacity:limit(tick / 30)};
  if (tick < logoTick) return {phase:tick >= lastPageTick + 240 ? "final-page" : "scroll",
    pages,opacity:limit(1 - (tick - fadeTick) / 30)};
  if (tick < logoTick + 122) return {phase:"logo",pages:[],opacity:
    Math.min(limit((tick - logoTick) / 30),limit((logoTick + 120 - tick) / 30))};
  return {phase:"outro",pages:[],opacity:0};
}

function draw(ctx, frame, sheets, logo) {
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 640, 480);
  ctx.globalAlpha = frame.opacity;
  if (frame.phase === "logo") {
    // Quad anchor mode 10 aligns the lower-right corner to (752,456).
    ctx.drawImage(logo, 752 - 512, 456 - 64);
  } else if (frame.phase !== "outro") {
    ctx.fillStyle = "#080820";
    ctx.fillRect(0, 0, 640, 480);
    for (const {n,y} of frame.pages) {
      const sheet = Math.floor((n - 1) / 8);
      const row = (n - 1) % 8;
      ctx.drawImage(sheets[sheet], 0, row * pageHeight, pageWidth, pageHeight, 64, y, pageWidth, pageHeight);
    }
  }
  ctx.globalAlpha = 1;
}

async function loadImage(asset, signal) {
  const res = await fetch(runtimeAssetUrl(asset.path), {signal});
  if (!res.ok) throw new Error("Cannot load closing credits image " + asset.path);
  const image = await createImageBitmap(await res.blob());
  if (signal.aborted || image.width !== asset.width || image.height !== asset.height) {
    image.close();
    throw new Error("Closing credits image was cancelled or has changed");
  }
  return image;
}

export function createClosingCreditsPlayback({document:doc = document, musicControls}) {
  const abort = new AbortController();
  const images = new Set();
  const owner = {};
  const previousFocus = doc.activeElement;
  const layer = doc.createElement("div");
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", "Closing credits");
  layer.dataset.phase = "loading";
  layer.style.cssText = "position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:black;isolation:isolate";
  const canvas = doc.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  canvas.setAttribute("aria-label","Shenmue closing credits");
  canvas.style.cssText = "display:block;width:min(100vw,133.333333vh);height:auto;max-width:100%;max-height:100%";
  const ctx = canvas.getContext("2d", {alpha:false});
  if (!ctx) throw new Error("Closing credits need a 2D canvas");
  const button = doc.createElement("button");
  button.textContent = "Skip credits";
  button.type = "button";
  button.style.cssText = "position:absolute;right:1rem;bottom:1rem;min-height:40px;padding:4px 12px;color:white;background:#15151bdd;border:1px solid #999;border-radius:4px;cursor:pointer";
  layer.append(canvas, button);
  doc.body.append(layer);
  button.focus({preventScroll:true});
  let frameHandle = 0, ended = false, hasMusic = false, resolve, reject;
  const finished = new Promise((yes,no) => { resolve=yes; reject=no; });
  function stop(accepted = false, error = null) {
    if (ended) return false;
    ended = true;
    abort.abort();
    cancelAnimationFrame(frameHandle);
    doc.removeEventListener("keydown", keydown, true);
    layer.remove();
    for (const image of images) image.close();
    images.clear();
    if (hasMusic) musicControls.stopTemporaryTrack(manifest.music.trackId, owner);
    if (previousFocus?.isConnected && (!doc.activeElement || doc.activeElement === doc.body)) {
      previousFocus.focus?.({preventScroll:true});
    }
    if (error) reject(error); else resolve(accepted);
    return true;
  }
  function keydown(event) {
    if (event.key.toLowerCase() === "x" || event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Tab") button.focus();
      else stop(event.key !== "Escape");
    }
  }
  doc.addEventListener("keydown", keydown, true);
  button.addEventListener("click", () => stop(true));
  async function start() {
    const decoded = await Promise.all([manifest.logo, ...manifest.sheets].map(async asset => {
      const image = await loadImage(asset, abort.signal);
      if (abort.signal.aborted) { image.close(); return null; }
      images.add(image);
      return image;
    }));
    if (ended) return;
    const [logo, ...sheets] = decoded;
    const startTime = performance.now();
    let nextMusicAttempt = 0, pendingSeek = 0;
    function render(now) {
      if (ended) return;
      try {
        const tick = Math.max(0, Math.floor((now - startTime) * ticksPerSecond / 1000));
        if (tick >= closingCreditsEndTick) { stop(true); return; }
        // The deck can load before an autoplay gesture or the music manifest.
        // Keep the artwork running and join the score at the same point once
        // the shared director can accept the track and its metadata has loaded.
        if (!hasMusic && tick >= nextMusicAttempt) {
          hasMusic = musicControls.playTemporaryTrack(manifest.music.trackId, {gain:1,loop:false}, owner);
          if (hasMusic) pendingSeek = tick / ticksPerSecond;
          nextMusicAttempt = tick + ticksPerSecond;
        }
        if (pendingSeek > 0 && musicControls.seekTemporaryBySeconds(pendingSeek)) pendingSeek = 0;
        const frame = closingCreditsFrame(tick);
        layer.dataset.phase = frame.phase;
        layer.dataset.frame = String(tick);
        draw(ctx, frame, sheets, logo);
        frameHandle = requestAnimationFrame(render);
      } catch (error) { stop(false, error); }
    }
    render(startTime);
  }
  start().catch(error => stop(false, error));
  return {finished,stop};
}
