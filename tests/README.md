# Tests

All test suites live here, with separate runners for JavaScript, Python, and
browser tests. Run commands from the repository root.

| Location | Contents | Command |
| --- | --- | --- |
| `*.test.js` | JavaScript unit, integration, and evidence checks | `npm test` |
| `test_*.py` | Python extractor and research checks | `python3 -m unittest discover -s tests -p 'test_*.py'` |
| [e2e/](e2e/) | Playwright browser tests and their helpers | `npm run test:e2e` |
| [fixtures/](fixtures/) | Shared test inputs and captured animation fixtures | Used by the suites above |
| `reports/` | Local browser reports, screenshots, and traces | Generated and ignored by Git |

Some tests require local disc extracts, generated captures, or restored runtime
assets. See the [development setup](../README.md#quick-start) and
[runtime asset guide](../docs/guides/runtime-assets.md) for prerequisites.
Missing source data does not mean a fresh hosted client build is broken.

Use `*.test.js` for Node tests and `*.spec.js` for Playwright tests so `npm test`
does not execute browser tests. To check browser-test discovery without starting
a browser or server, run `npm run test:e2e -- --list`. Docker-based browser runs
are available through `npm run test:e2e:docker`.

## Resource safety

Use the npm launchers, not bare `node --test` or `npx playwright test`. The
launchers enforce these budgets for the entire test process tree:

| Run | RAM ceiling | Swap | Additional limit |
| --- | --- | --- | --- |
| Node tests and animation checks | 2 GiB | None | 1 GiB JavaScript heap; one test-file worker |
| Host or Docker browser tests | 8 GiB | None | One Playwright worker by default |

Node/host-browser launchers require Linux, `flock`, cgroup v2, and a working
systemd user session (`systemctl --user`). The Docker launcher requires Linux,
`flock`, Docker memory/swap-limit support, and the documented GPU setup. Missing
prerequisites fail the run; do not retry without limits. Existing external dev
servers and GPU video memory are not included in these test RAM ceilings.

All launchers share one per-user lock across worktrees. An overlapping run exits
with code 75 instead of starting another workload; wait and retry. Ctrl-C or
SIGTERM cleans up only the exact transient user service or Docker container
created by that run. Never stop Chrome DevTools MCP servers or other tasks'
browser processes. Docker uses private 512 MiB shared memory, not host IPC.
Core dumps are disabled so an allocation failure cannot produce a huge dump.

Focused checks use the same protections:

```sh
npm test -- tests/CharacterRuntime.test.js
npm run test:e2e:docker -- tests/e2e/gpu-renderer.setup.js --project=renderer-preflight
```

To check the built landing page and public menu while the usual development
port is occupied, start `npm run preview` on a free local port, then run:

```sh
E2E_APP_URL=http://localhost:5173 \
NY_E2E_RELEASE_PREVIEW_URL=http://127.0.0.1:5191 \
npm run test:e2e:docker -- tests/e2e/landing.spec.js tests/e2e/public-play-menu.spec.js
```

Those two suites route only their own page requests to the preview. The browser
retains the existing R2-allowed localhost origin; no request reaches an unrelated
server on port 5173, and no production CORS changes are required.

Do not compare or log entire Babylon meshes, skeletons, scenes, or engines.
These objects link to large cyclic graphs; assertion diagnostics can consume
more memory than the test itself. For identity use `assert.ok(actual === expected,
"short explanation")`; for state compare selected scalar fields or bounded
arrays. `tests/TestResources.test.js` checks the real OS limits with a deliberately
small 128 MiB service and verifies overlap rejection.
