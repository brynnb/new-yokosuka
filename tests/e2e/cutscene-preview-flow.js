import { expect } from "@playwright/test";

export async function runCutscenePreview({
  page,
  cutscene,
  completionTimeout,
}) {
  const browserErrors = [];
  const failedResources = [];
  page.on("pageerror", error => {
    browserErrors.push(`pageerror: ${error.message}`);
  });
  page.on("console", message => {
    if (message.type() !== "error") return;
    // The account shell polls its optional status endpoint. A plain Vite
    // preview deliberately has no backend, so this is not a cutscene failure.
    if (message.text().startsWith("Failed to load resource:")) return;
    // Babylon VideoTexture reports Chrome's expected AbortError as an error
    // when an attract-screen video is paused during world teardown. It is not
    // a thrown page error and is unrelated to cutscene playback.
    if (
      message.text().startsWith("BJS - ")
      && message.text().includes(
        "The play() request was interrupted by a call to pause().",
      )
    ) return;
    const location = message.location();
    const source = location.url
      ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})`
      : "";
    browserErrors.push(`console: ${message.text()}${source}`);
  });
  page.on("response", response => {
    if (
      response.status() >= 400 &&
      !response.url().endsWith("/api/status")
    ) {
      failedResources.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto("/play/");
  await expect(
    page.getByLabel("Open the New Yokosuka menu"),
  ).toBeVisible({ timeout: 120_000 });
  // The production prompt listens at window capture level and removes itself
  // immediately. Keyboard input exercises that path without retrying a click
  // against the intentionally disappearing element.
  await page.keyboard.press("Enter");
  // Previews are internal-only: enter the existing selector through the dev
  // module, without reintroducing a public button or a production debug hook.
  await page.evaluate(async () => {
    const { useAccountStore } = await import('/play/account/react/accountStore.js');
    useAccountStore.getState().controller.showCutscenes();
  });

  const cutsceneOption = page.locator(
    `[data-cutscene-id="${cutscene.id}"]`,
  );
  await expect(cutsceneOption).toHaveCount(1);
  await cutsceneOption.click();
  await page.locator(".account-footer-actions button.primary").click();

  const cutsceneMenu = page.locator(".account-shell-cutscenes");
  await expect(cutsceneMenu).toBeHidden({ timeout: 120_000 });
  await expect(cutsceneMenu).toBeVisible({ timeout: completionTimeout });

  const alerts = await page.locator('[role="alert"]').allTextContents();
  const cutsceneErrors = [...browserErrors, ...failedResources];
  expect(
    cutsceneErrors,
    `Browser errors while playing ${cutscene.id} — ${cutscene.label}:\n${[
      ...browserErrors,
      ...failedResources,
    ].join("\n")}`,
  ).toEqual([]);
  expect(
    alerts,
    `UI errors after playing ${cutscene.id} — ${cutscene.label}:\n${alerts.join("\n")}`,
  ).toEqual([]);
}
