import { expect, test as base } from "@playwright/test";

// A built preview can run on a free local port while the browser keeps an
// already-allowed development origin for direct R2 requests. Routing only this
// test's page avoids touching the user's existing server or widening R2 CORS.
export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const previewURL = process.env.NY_E2E_RELEASE_PREVIEW_URL;
    if (previewURL) {
      const browserOrigin = new URL(baseURL).origin;
      await page.route(url => url.origin === browserOrigin, async route => {
        const incoming = new URL(route.request().url());
        const upstream = new URL(incoming.pathname + incoming.search, previewURL);
        await route.fulfill({ response: await route.fetch({ url: upstream.href }) });
      });
    }
    await use(page);
  },
});

export { expect };
