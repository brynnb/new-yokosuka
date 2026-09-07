# Script debugging and validation

Status: canonical operator guide
Last reviewed: August 30, 2026

## Start the local stack

Run from the client repository root:

```bash
npm run dev:all
```

The configured PostgreSQL service and Yarn compiler must be available for
database-backed scripts. `dev:all` uses the adjacent standalone server checkout,
imports reviewed official scripts, and then starts the Go server and Vite. Set
`NEW_YOKOSUKA_SERVER_DIR` when that checkout is not at
`../new-yokosuka-server`. Check the server log for the database and Yarn runtime
status instead of assuming the default PostgreSQL port.

Open `/play` on `localhost` or `127.0.0.1`. Local debug controls are enabled
only in a Vite development build on a loopback hostname.

## Deterministic gameplay scenarios

The Local debug panel contains **Script test scenario** controls. A scenario
may set bounded temporary native dialogue state, load the required world, and
teleport the player to an authored pose. It does not persist those changes.

For the telephone book:

1. Select **Dobuita: phone book (ready)**.
2. Click **Apply & teleport**.
3. Interact with `TBK1` normally.
4. Finish or cancel the script before applying or restoring another scenario.
5. Click **Restore** to return to the original world, position, and state.

The scenario is declared in `play/scripts/ScriptDebugScenarios.js`. Its spawn
and state writes are evidence-backed and explicit. Do not add a generic “make
this branch pass” solver. A new scenario should name its exact source for every
state write and spawn.

The phone-book scenario currently writes temporary native dialogue bank 2
values 180 and 190 and teleports to the recovered TBK1 interaction pose. The
sandbox prevents these writes from becoming player progress.

## Script identity logging

Development builds log starts to the browser console:

```text
[Script started] { kind: "database", runId, scriptId, versionId, scriptSlug, ... }
[Script started] { kind: "native", area, programId, ownerEntryFunction, ... }
```

The database record identifies the selected immutable script version. The
native record identifies the actual room program, persistent owner,
interaction entry, actor, and object tag. Seeing both for the telephone book is
expected: Yarn owns selection and starts the registered native activity.

## Failure messages

Errors preserve a nested native reason chain. Read the first meaningful
unsupported boundary rather than only the outer “database script event
stopped” message.

| Message family | Meaning |
| --- | --- |
| `a script event is already active` | Another database event has not reached a terminal state |
| `specialized script activity is already active` | A native activity still owns its presentation resources |
| `script activity area ... is not active` | The world changed or the activity descriptor does not match the current area |
| `script activity requires selected object ...` | The command did not retain the exact selected scene object |
| `unresolved-branch-predicate` | A consequential native branch input is unavailable |
| `unsupported-operation` or semantic operation detail | The route reached an operation mode without a proven adapter |
| `selected native object action cannot be finalized` | Selected-object claim/release state is inconsistent |
| `... was rejected by its adapter` | A camera, motion, sequence, or activity binding could not accept exact presentation |
| `client-state-restore-failed` | Rollback could not restore the captured presentation-only snapshot |

Pressing the normal cancel control should release movement lock and settle both
the native and database owners. Treat a required manual reload as a cleanup
defect.

## Diagnostic ownership

When an event freezes or stops, inspect in this order:

1. Database script identity and pinned version.
2. Trigger context: area, actor/object, action, and selected scene object.
3. Native program identity, owner, and child entry.
4. Nested stop reason, location, call depth, and branch/operation offset.
5. Transaction owners: movement, camera, motion, dialogue, object action, and
   room state.
6. Whether cancellation or world teardown released every owner.

Do not solve a native gate by manually choosing its branch. Add the missing
state source or operation only after its native meaning and lifecycle are
proved.

## Focused validation

Run the smallest relevant tests while developing, then the complete suite and
build before merging.

Telephone-book and database boundary:

```bash
node --test \
  tests/NativePhoneBookControllerIntegration.test.js \
  tests/NativeRoomControllerLifecycle.test.js \
  tests/NativeScriptActivityRunner.test.js \
  tests/ScriptEventController.test.js \
  tests/ScriptEventPresentationRuntime.test.js

(cd ../new-yokosuka-server && \
  go test ./internal/officialscript ./internal/scriptevent ./internal/scriptruntime)
```

Repository-wide verification:

```bash
npm test
npm run build
npm run server:test
git diff --check
```

PostgreSQL/compiler integration tests require `NEW_YOKOSUKA_TEST_DATABASE_URL`
and `NEW_YOKOSUKA_YARN_COMPILER`. A skipped integration test is not equivalent
to a passing database execution test.

## Generated evidence freshness

When extraction or semantics change, regenerate the affected evidence and
bounded program pack before testing runtime behavior. Useful commands include:

```bash
npm run extract:scripted-event-control-flow
npm run compile:native-event-ir
npm run build:native-event-program-pack
npm run audit:script-translation-coverage
```

Review generated diffs for changed source hashes, routes, call counts, and
adapter status. Do not accept a large regenerated file merely because tests
still pass.

## Emulator use

Use static source evidence first. The actual emulator is appropriate only when
a consequential runtime value cannot be resolved statically. Observations must
follow natural execution and remain read-only: no guest RAM patches, forced
handler calls, or fabricated branch state.

Record the exact source hash, game conditions, addresses, raw observations,
bounded conclusion, and shutdown status in a dedicated evidence file. The
emulator validates research; it does not replace browser integration tests.
