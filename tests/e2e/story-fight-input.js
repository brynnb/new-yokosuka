import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

// Real keyboard play, never a health/AI override or injected result. Keep the
// selected opponent in range and use the arena's open space to regroup. Use
// earned starting moves, including their real directional command sequences;
// repeatedly tapping J/K is not representative of the available repertoire.
export async function fightStoryAmbush(page, testInfo, { nextButton = "Ask about Charlie", artifactPrefix = "ambush" } = {}) {
  await page.locator("#renderCanvas").focus();
  const held = new Set();
  const keys = async next => {
    for (const key of held) if (!next.includes(key)) { await page.keyboard.up(key); held.delete(key); }
    for (const key of next) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
  };
  let escape = null;
  const samples = [];
  await page.evaluate(() => {
    const e = window.storyProbe.combatRuntime.encounter, update = e.update.bind(e);
    window.storyProbe.fightEvents = [];
    e.update = dt => {
      const events = update(dt);
      window.storyProbe.fightEvents.push(...events.map(event => ({ at: performance.now(), ...event })));
      return events;
    };
  });
  try {
    for (let step = 0; step < 1600; step++) {
      const state = await page.evaluate(() => {
        const r = window.storyProbe.combatRuntime, e = r?.encounter;
        // No target/yaw is valid after the last opponent falls, even while
        // Ryo finishes his final animation before Story settles the result.
        // Stop input here; the UI assertion below still requires real victory.
        if (!e || r.active.outcome || e.enemiesDefeated) return null;
        // Vector3 serializes its private _x/_z storage, not the public getters.
        const position = actor => { const p = actor.position(); return { x: p.x, z: p.z }; };
        return { p: position(e.playerActor), target: position(e.enemyActor), yaw: e.playerTargetYaw(),
          locked: e.playerMovementLocked, bounds: r.active.definition.bounds, b: r.active.input.getBindings(),
          health: e.player.health, opponents: e.opponents.map(o => ({ id: o.id, hp: o.combatant.health })),
          enemies: e.opponents.filter(o => !o.combatant.defeated).map(o => position(o.actor)) };
      });
      if (!state) break;
      const { p, target, yaw, locked, bounds: b, b: key, enemies } = state;
      expect([p.x, p.z, target.x, target.z, yaw].every(Number.isFinite), "combat probe coordinates").toBe(true);
      if (step % 12 === 0) samples.push({ step, ...state, escape });
      if (locked) { await keys([key.guard]); await page.waitForTimeout(80); continue; }
      const distance = Math.hypot(p.x-target.x,p.z-target.z);
      const nearest = Math.min(...enemies.map(e => Math.hypot(p.x-e.x,p.z-e.z)));
      if (escape && Math.hypot(p.x-escape.x,p.z-escape.z) < .8) escape = null;
      if (!escape && (step === 0 || (state.health < 30 && nearest < 1))) {
        const candidates = [b.minX+1,b.maxX-1].flatMap(x => [b.minZ+1,b.maxZ-1].map(z => ({x,z})));
        escape = candidates.sort((a,c) => {
          const score = q => Math.min(...enemies.map(e => Math.hypot(q.x-e.x,q.z-e.z))) - .1*Math.hypot(q.x-p.x,q.z-p.z);
          return score(c)-score(a);
        })[0];
      }
      if (!escape && distance <= 1.6) {
        await keys([]);
        // Elbow Assault (W,W,J) can hit several opponents in front. Low sweep
        // (S,K) interrupts a close crowd. Neither requires a learned move or
        // calls the simulation's move/result methods directly.
        if (distance < 1) {
          await page.keyboard.press(key.down);
          await page.keyboard.press(key.leg);
        } else {
          await page.keyboard.press(key.up);
          await page.keyboard.press(key.up);
          await page.keyboard.press(key.hand);
        }
        await keys([key.guard]);
        await page.waitForTimeout(120);
        continue;
      }
      const aim = escape || target, dx = aim.x-p.x, dz = aim.z-p.z, length = Math.max(.01,Math.hypot(dx,dz));
      const x = dx/length, z = dz/length;
      const forward = Math.sin(yaw)*x+Math.cos(yaw)*z, right = Math.cos(yaw)*x-Math.sin(yaw)*z;
      await keys([key.guard, ...(escape ? [key.run] : []),
        Math.abs(forward)>.25 ? (forward>0 ? key.up : key.down) : null,
        Math.abs(right)>.25 ? (right>0 ? key.right : key.left) : null].filter(Boolean));
      await page.waitForTimeout(80);
    }
  } finally {
    await keys([]);
    await writeFile(testInfo.outputPath(`${artifactPrefix}-keyboard-samples.json`), JSON.stringify(samples));
    await writeFile(testInfo.outputPath(`${artifactPrefix}-keyboard-events.json`), JSON.stringify(await page.evaluate(() => window.storyProbe.fightEvents)));
  }
  const view = await page.evaluate(() => window.storyProbe.lastCombatView);
  await testInfo.attach("ambush-final-combat-view", { body: JSON.stringify(view), contentType: "application/json" });
  console.info("Ambush fight outcome", JSON.stringify(view));
  if (nextButton) await expect(page.getByRole("button", {name:nextButton,exact:true})).toBeVisible({timeout:15_000});
}
