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
