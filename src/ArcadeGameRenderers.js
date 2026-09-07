import {
  QTE_DIFFICULTIES,
  clamp,
  qteDifficulty,
} from "./ArcadeGameCatalog.js";

function circle(context, x, y, radius, color) {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
}

function renderHangOn(game) {
  const { context: c, canvas, state: s } = game;
  const w = canvas.width;
  const h = canvas.height;
  const horizon = h * 0.28;
  c.fillStyle = "#69b5df";
  c.fillRect(0, 0, w, horizon);
  c.fillStyle = "#376e32";
  c.fillRect(0, horizon, w, h - horizon);
  c.beginPath();
  c.moveTo(w * 0.39, horizon);
  c.lineTo(w * 0.08, h);
  c.lineTo(w * 0.92, h);
  c.lineTo(w * 0.61, horizon);
  c.fillStyle = "#303036";
  c.fill();
  c.strokeStyle = "#fff";
  c.lineWidth = Math.max(2, w * 0.005);
  c.setLineDash([h * 0.05, h * 0.04]);
  c.beginPath();
  c.moveTo(w * 0.5, horizon);
  c.lineTo(w * 0.5, h);
  c.stroke();
  c.setLineDash([]);
  for (const obstacle of s.obstacles) {
    const depth = clamp(obstacle.depth, 0, 1);
    const scale = 1 - depth;
    const roadHalf = 0.11 + scale * 0.31;
    const x = w * (0.5 + obstacle.x * roadHalf);
    const y = horizon + scale * (h - horizon);
    const size = w * (0.018 + scale * 0.055);
    c.fillStyle = "#ef3b2d";
    c.fillRect(x - size / 2, y - size, size, size);
  }
  const riderX = w * (0.5 + s.riderX * 0.34);
  c.fillStyle = "#d82028";
  c.fillRect(riderX - w * 0.025, h * 0.78, w * 0.05, h * 0.13);
  circle(c, riderX - w * 0.018, h * 0.91, w * 0.014, "#111");
  circle(c, riderX + w * 0.018, h * 0.91, w * 0.014, "#111");
}

function renderHarrier(game) {
  const { context: c, canvas, state: s } = game;
  const w = canvas.width;
  const h = canvas.height;
  const gradient = c.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "#102d71");
  gradient.addColorStop(0.6, "#6d4aa0");
  gradient.addColorStop(1, "#d08377");
  c.fillStyle = gradient;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = "rgba(255,255,255,.18)";
  for (let row = 0; row < 12; row++) {
    const y = h * (0.45 + row * row / 240);
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
  }
  for (const shot of s.shots) {
    c.fillStyle = "#fff36a";
    c.fillRect(shot.x * w - 2, shot.y * h - 8, 4, 16);
  }
  for (const enemy of s.enemies) {
    circle(c, enemy.x * w, enemy.y * h, w * 0.027, "#f05a43");
    circle(c, enemy.x * w, enemy.y * h, w * 0.012, "#ffe364");
  }
  const px = s.playerX * w;
  const py = s.playerY * h;
  c.fillStyle = "#f8f4e8";
  c.beginPath();
  c.moveTo(px, py - h * 0.045);
  c.lineTo(px - w * 0.032, py + h * 0.035);
  c.lineTo(px + w * 0.032, py + h * 0.035);
  c.closePath();
  c.fill();
}

function renderQte(game) {
  const { context: c, canvas, state: s } = game;
  const w = canvas.width;
  const h = canvas.height;
  c.fillStyle = "#050609";
  c.fillRect(0, 0, w, h);
  if (s.phase === "title") {
    const artwork = game.qteTitleArtwork;
    if (artwork?.complete && artwork.naturalWidth > 0) {
      const scale = Math.min(
        (w * 0.78) / artwork.naturalWidth,
        (h * 0.6) / artwork.naturalHeight,
      );
      const width = Math.round(artwork.naturalWidth * scale);
      const height = Math.round(artwork.naturalHeight * scale);
      c.imageSmoothingEnabled = false;
      c.drawImage(
        artwork,
        Math.round((w - width) / 2),
        Math.round(h * 0.1),
        width,
        height,
      );
    }
    const retroFont = "ui-monospace, SFMono-Regular, Menlo, monospace";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `700 ${Math.round(h * 0.045)}px ${retroFont}`;
    c.fillStyle = "#f1f1ed";
    c.fillText("1 PLAY 1 COIN", w * 0.5, h * 0.77);
    if (Math.floor(s.elapsed * 2) % 2 === 0) {
      c.fillStyle = "#df3d29";
      c.fillText("PRESS START", w * 0.5, h * 0.87);
    }
    return;
  }
  if (s.phase === "difficulty") {
    const artwork = game.qteTitleArtwork;
    if (artwork?.complete && artwork.naturalWidth > 0) {
      const scale = Math.min(
        (w * 0.55) / artwork.naturalWidth,
        (h * 0.28) / artwork.naturalHeight,
      );
      const width = Math.round(artwork.naturalWidth * scale);
      const height = Math.round(artwork.naturalHeight * scale);
      c.imageSmoothingEnabled = false;
      c.drawImage(
        artwork,
        Math.round((w - width) / 2),
        Math.round(h * 0.055),
        width,
        height,
      );
    }
    const retroFont = "ui-monospace, SFMono-Regular, Menlo, monospace";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#f1f1ed";
    c.font = `700 ${Math.round(h * 0.052)}px ${retroFont}`;
    c.fillText("SELECT DIFFICULTY", w * 0.5, h * 0.37);
    QTE_DIFFICULTIES.forEach((difficulty, index) => {
      const selected = index === s.difficultyIndex;
      const y = h * (0.48 + index * 0.1);
      if (selected) {
        c.fillStyle = "#df3d29";
        c.fillRect(w * 0.28, y - h * 0.037, w * 0.44, h * 0.074);
      }
      c.fillStyle = selected ? "#fff126" : "#f1f1ed";
      c.font = `700 ${Math.round(h * 0.05)}px ${retroFont}`;
      c.fillText(difficulty.label, w * 0.5, y);
    });
    c.fillStyle = "#9d9d98";
    c.font = `700 ${Math.round(h * 0.027)}px ${retroFont}`;
    c.fillText("↑ ↓ SELECT     ENTER START", w * 0.5, h * 0.91);
    return;
  }
  const labels = {
    ArrowUp: "↑",
    ArrowRight: "→",
    ArrowDown: "↓",
    ArrowLeft: "←",
    KeyA: "A",
    KeyB: "B",
  };
  const retroFont = "ui-monospace, SFMono-Regular, Menlo, monospace";

  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `700 ${Math.round(h * 0.047)}px ${retroFont}`;
  c.fillStyle = "#da3e25";
  c.fillText("HI-SCORE", w * 0.5, h * 0.08);
  c.fillStyle = "#f1f1ed";
  c.font = `700 ${Math.round(h * 0.072)}px ${retroFont}`;
  c.fillText(
    String(Math.max(s.highScore, s.score)).padStart(6, "0"),
    w * 0.5,
    h * 0.145,
  );

  c.font = `700 ${Math.round(h * 0.043)}px ${retroFont}`;
  c.fillStyle = "#e34a2d";
  c.fillText("SCORE", w * 0.3, h * 0.22);
  c.fillText("LAST-SCORE", w * 0.7, h * 0.22);
  c.fillStyle = "#f1f1ed";
  c.font = `700 ${Math.round(h * 0.065)}px ${retroFont}`;
  c.fillText(String(s.score).padStart(6, "0"), w * 0.3, h * 0.285);
  c.fillText(
    String(s.lastScore).padStart(6, "0"),
    w * 0.7,
    h * 0.285,
  );

  if (s.phase === "prompt") {
    c.fillStyle = "#f4f1e8";
    c.font = `800 ${Math.round(h * 0.19)}px ${retroFont}`;
    c.fillText(labels[s.prompt], w * 0.5, h * 0.49);
  }

  const timerFraction = s.phase === "prompt"
    ? clamp(s.promptLeft / s.promptDuration, 0, 1)
    : s.frozenTimerFraction;
  const segmentCount = 12;
  const litSegments = Math.ceil(timerFraction * segmentCount);
  const segmentWidth = w * 0.021;
  const segmentGap = w * 0.007;
  const timerWidth = (
    segmentCount * segmentWidth
    + (segmentCount - 1) * segmentGap
  );
  const timerStartX = w * 0.5 - timerWidth / 2;
  const timerY = h * 0.64;
  for (let index = 0; index < segmentCount; index++) {
    c.fillStyle = index < litSegments ? "#fff126" : "#403d12";
    c.fillRect(
      timerStartX + index * (segmentWidth + segmentGap),
      timerY,
      segmentWidth,
      h * 0.055,
    );
  }
  if (s.phase === "result") {
    c.textAlign = "left";
    c.fillStyle = s.resultPoints > 0 ? "#f4f1e8" : "#e34a2d";
    c.font = `800 ${Math.round(h * 0.07)}px ${retroFont}`;
    c.fillText(
      s.resultPoints > 0 ? `+ ${s.resultPoints}` : "MISS",
      timerStartX + timerWidth + w * 0.035,
      timerY + h * 0.027,
    );
    c.textAlign = "center";
  }

  const difficulty = qteDifficulty(s.difficultyIndex).label;
  c.fillStyle = "#fff126";
  c.font = `700 ${Math.round(h * 0.075)}px ${retroFont}`;
  c.fillText(difficulty, w * 0.5, h * 0.78);

  const lifeSpacing = w * 0.055;
  const lifeStart = w * 0.5 - (2 * lifeSpacing) / 2;
  const lifeArtwork = game.qteLifeArtwork;
  for (let index = 0; index < 3; index++) {
    const x = lifeStart + index * lifeSpacing;
    const active = index < s.lives;
    if (lifeArtwork?.complete && lifeArtwork.naturalWidth > 0) {
      const height = Math.round(h * 0.052);
      const width = Math.round(
        height * lifeArtwork.naturalWidth / lifeArtwork.naturalHeight,
      );
      c.save();
      c.globalAlpha = active ? 1 : 0.2;
      c.imageSmoothingEnabled = false;
      c.drawImage(
        lifeArtwork,
        Math.round(x - width / 2),
        Math.round(h * 0.885 - height / 2),
        width,
        height,
      );
      c.restore();
    }
  }
}

function renderDarts(game) {
  const { context: c, canvas, state: s } = game;
  const w = canvas.width;
  const h = canvas.height;
  c.fillStyle = "#17130e";
  c.fillRect(0, 0, w, h);
  const centerX = w / 2;
  const centerY = h / 2;
  const radius = Math.min(w, h) * 0.37;
  for (let ring = 5; ring >= 1; ring--) {
    circle(
      c,
      centerX,
      centerY,
      radius * ring / 5,
      ring % 2 ? "#e7dfc1" : "#222",
    );
  }
  circle(c, centerX, centerY, radius * 0.3, "#168b45");
  circle(c, centerX, centerY, radius * 0.14, "#bf262c");
  const aimX = Math.sin(s.aimTime * 2.17) * 0.72;
  const aimY = Math.sin(s.aimTime * 2.83 + 0.8) * 0.72;
  const drawMarker = (x, y, color, size) => {
    const px = centerX + x * radius;
    const py = centerY + y * radius;
    c.strokeStyle = color;
    c.lineWidth = Math.max(2, radius * 0.018);
    c.beginPath();
    c.moveTo(px - size, py);
    c.lineTo(px + size, py);
    c.moveTo(px, py - size);
    c.lineTo(px, py + size);
    c.stroke();
  };
  if (s.lastThrow) {
    drawMarker(
      s.lastThrow.x,
      s.lastThrow.y,
      "#f5d442",
      radius * 0.045,
    );
  }
  drawMarker(aimX, aimY, "#fff", radius * 0.065);
  if (s.lastThrow) {
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.font = `700 ${Math.round(h * 0.06)}px sans-serif`;
    c.fillText(`+${s.lastThrow.points}`, centerX, h * 0.95);
  }
}

export function renderArcadeGame(game) {
  const { context, canvas } = game;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (game.game.id === "hangon") renderHangOn(game);
  else if (game.game.id === "harrier") renderHarrier(game);
  else if (game.game.id === "qte") renderQte(game);
  else renderDarts(game);
  if (game.state.over) {
    context.fillStyle = "rgba(0, 0, 0, 0.62)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#fff";
    context.textAlign = "center";
    context.font = `700 ${Math.round(canvas.height * 0.06)}px sans-serif`;
    context.fillText(
      game.state.message,
      canvas.width / 2,
      canvas.height / 2,
    );
  }
}
