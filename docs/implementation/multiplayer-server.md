# Client and server integration

New Yokosuka's browser client and multiplayer server are separate projects:

- this repository owns rendering, controls, presentation, and browser data;
- [`new-yokosuka-server`](https://github.com/brynnb/new-yokosuka-server)
  owns accounts, persistence, shared-world authority, scheduled NPC simulation,
  chat, economy, and server-side scripted events.

The server repository's
[architecture guide](https://github.com/brynnb/new-yokosuka-server/blob/main/docs/implementation/multiplayer-server.md)
is the source of truth for its routes, configuration, database, and authority
boundaries. This page documents only how the browser connects to it.

## Local development

Clone the repositories beside each other:

```text
Code/
├── new-yokosuka/
└── new-yokosuka-server/
```

Then run this from the client checkout:

```sh
npm install
npm run dev:all
```

The launcher finds `../new-yokosuka-server`, starts its Go process, starts
Vite, selects free local ports, and configures Vite's development proxy. If
the server lives elsewhere, provide its path explicitly:

```sh
NEW_YOKOSUKA_SERVER_DIR=/path/to/new-yokosuka-server npm run dev:all
```

`npm run server`, `npm run server:test`, `npm run server:test:race`, the Yarn
import commands, and `npm run audit:server-npcs` use the same path resolution.
They fail with a clear setup message when the checkout is missing or is not the
expected Go module.

The development launcher reads `server.env` from the server checkout. Process
environment variables take precedence. When `DATABASE_URL` is absent and the
PostgreSQL development tools are installed, it creates a local development
cluster under this client's ignored `.dev/` directory. The default database is
`new_yokosuka_server`; set `DEV_POSTGRES_DATABASE` to use another lowercase
identifier. The older embedded server's `new_yokosuka` development database is
left untouched.

## Browser transport

The browser uses same-origin endpoints in production:

- `/ws` for the versioned realtime WebSocket protocol;
- `/api/*` for accounts, characters, world state, and other HTTP operations;
- `/healthz` for backend readiness.

Vite proxies those paths to the local server. Production Caddy configuration
does the same for the independently deployed backend; see
[`deploy/Caddyfile.client.example`](../../deploy/Caddyfile.client.example).

The default local server port is `8080`. `NEW_YOKOSUKA_DEV_SERVER_PORT`, set by
`npm run dev:all`, tells Vite which selected port to proxy. Ordinary browser
code therefore does not depend on a server checkout path or backend host name.

## Shared contracts

The repositories deliberately do not import files from one another at build
time. Client-owned snapshots needed synchronously by the browser live here:

- `src/data/vehicle-spawns.json` for shared forklift identities and placement;
- `play/data/server-command-registry.json` for the server-orchestrated
  presentation capability contract;
- browser-specific timed-access, vending, avatar, and scheduled-actor data
  under `play/data/`.

The server owns its corresponding embedded runtime data and deterministic
generators. A contract change that affects both sides must be committed to both
repositories and reviewed as one protocol change. Keeping each build
self-contained avoids hidden sibling-directory dependencies in CI and release
builds.

With both repositories checked out, verify the shared snapshots explicitly:

```sh
npm run server:check-contract
```

## Arcade results

Excite QTE, the paddle game, and each dartboard open a scrollable top-30
leaderboard after a completed game and cabinet camera restoration. Each row is
one character's best score on that machine, with the date it was achieved;
ties retain the earlier achievement. Emulated cabinets do not report scores.

`ArcadeScoreClient` submits the completed score, then reads
`GET /api/arcade-scores?machineId=...`. The response is
`{ machineId, entries: [{ characterId, playerName, score, achievedAt }] }`.
The existing unfiltered GET still returns the four machine records. Closing
the modal or changing worlds cancels the leaderboard read; network failures
show a retry action without resubmitting the score.

This requires the separate server's `003_arcade_leaderboards.sql` migration
(applied by its normal startup migration runner). Deploy that backend before
the client. Existing attributable machine records keep their original dates;
previously discarded non-record scores cannot be recovered.

## Capsule toy Collection

The sidebar's **Collection** button, below Inventory, opens the shared inventory
dialog in collection mode. It reads the selected character's saved inventory
from `GET /api/characters/{id}/state`, displays only `capsule_toy` entries, and
groups duplicate copies by quantity. The grid scrolls independently of the
heading. Failed reads offer Retry; closing the dialog aborts the read and late
responses cannot populate a different character's collection.

Clicking either capsule machine outside You Arcade approaches the machine,
requests an authoritative `capsule_purchase`, then plays the existing interaction
and opens a first-person held-toy inspection with an original Ryo reaction.
X or **Close inspection** restores the previous camera and releases movement;
the toy remains saved even if presentation loading fails. The server deducts ¥100 and saves the item
atomically, with a stable request ID preventing duplicate grants on retries.
The purchase result also updates the client's currency and inventory snapshot.
If the connection is lost after sending, check Collection before buying again:
the server may have committed the purchase even if its reply did not arrive.

This requires the separate server's `004_capsule_collection.sql` and
`005_capsule_native_pools.sql` migrations and capsule WebSocket handler. The
57 prize definitions include the two machine-specific pools plus shared toys
and button badges. Draws reproduce the recovered D000 rarity and ownership
checks inside the purchase transaction, using server-side secure randomness.
See [capsule prize selection and inspection](../research/shenmue1/capsule-prizes.md)
for original-code verification, asset preparation, and presentation approximations.
Earlier animation-only capsule interactions had no saved results to import.

## Deployment boundary

This repository's workflow builds and deploys only the frontend. It verifies
that the separately deployed backend is healthy before activating a new client
release. Backend builds, migrations, service configuration, and deployment
belong to the server repository.
