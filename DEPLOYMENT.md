# Frontend deployment

This repository deploys only the New Yokosuka browser client. The Go backend,
database migrations, and service configuration are owned by the separate
[`new-yokosuka-server`](https://github.com/brynnb/new-yokosuka-server)
repository and must be released independently.

Pushing this repository's `main` branch runs
`.github/workflows/deploy.yml`. The workflow installs exact npm dependencies,
tests the multiplayer client and release script, builds Vite, stages an atomic
frontend release, confirms that the existing backend is healthy, and then
activates the client.

## Production contract

- Application directory: the `DEPLOY_APP_DIR` repository variable
- Frontend releases: `$DEPLOY_APP_DIR/releases`
- Active frontend symlink: `$DEPLOY_APP_DIR/dist`
- Internal backend address: `127.0.0.1:8084`
- Public site: `https://www.newyokosuka.com`
- Hosted assets: `https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev`

The backend's install path is intentionally not part of the client deployment
contract. Caddy only needs to proxy the same-origin `/ws`, `/api/*`, and
`/healthz` routes to it. See
[`deploy/Caddyfile.client.example`](deploy/Caddyfile.client.example).

## Repository deployment settings

GitHub Actions expects `DEPLOY_SSH_KEY` to contain the complete private key for
the deployment account, including its `BEGIN` and `END` lines. Never commit the
key. GitHub does not allow reading a stored secret back; use `gh secret list`
to confirm that the name exists.

Configure these GitHub Actions repository variables:

- `DEPLOY_HOST`: DNS name or IP address of the deployment host;
- `DEPLOY_USER`: SSH deployment account;
- `DEPLOY_APP_DIR`: absolute application directory on that host; and
- `DEPLOY_KNOWN_HOSTS`: a verified OpenSSH `known_hosts` line for
  `DEPLOY_HOST`.

Obtain the host-key fingerprint from the hosting provider or another trusted
channel before adding the `known_hosts` line. Do not trust a key collected from
an unauthenticated first connection. The workflow checks that the configured
entry names `DEPLOY_HOST` and uses strict host-key verification for every SSH
and SCP operation.

## Pre-deployment checks

Review every unpublished commit, not just the dirty worktree:

```sh
git fetch origin
git status --short
git rev-list --count origin/main..main
git log --oneline origin/main..main
git diff --stat origin/main...main
```

Run the client checks:

```sh
npm test
npm run build
```

If `src/runtime-assets.generated.json` changed, publish and verify those
versioned objects before deploying the client. See [runtime assets](docs/guides/runtime-assets.md).
The upload command validates local hashes and verifies remote writes; a Git
diff alone is not evidence that assets have been published.

Server checks belong in its checkout:

```sh
cd ../new-yokosuka-server
go test ./...
```

## Release behavior

The workflow builds with hosted assets and a 4 GiB Node heap, stages the
complete `dist` output under the commit SHA, and validates the persistent
motion banks before activation. It installs the Caddy cache policy, verifies
the separately deployed backend at `http://127.0.0.1:8084/healthz`, and changes
the live `dist` symlink atomically.

HTML revalidates on every visit while content-hashed assets are cached for a
year. After activation, the workflow verifies those public cache headers. A
new release also retains the two previous builds' asset, audio, and music files using hard links,
so already-open clients can finish lazy loads after the switch. Each release
records its own asset inventory to keep this retention bounded. A failed public
verification rolls the frontend symlink back to the preceding
release. The live release and two rollback releases are retained.

The workflow does not build, install, restart, migrate, or roll back the Go
server. That separation prevents a client commit from silently deploying
backend code from a different repository history.

## Verification

After deployment:

```sh
curl --fail --silent https://www.newyokosuka.com/healthz
curl --location --fail --silent --output /dev/null \
  --write-out '%{http_code} %{url_effective}\n' \
  https://www.newyokosuka.com/play
curl --head --fail --silent https://www.newyokosuka.com/play/ \
  | grep -i '^cache-control: no-cache, must-revalidate'
```

The bare `/play` URL may redirect to `/play/`; use `--location` or request the
canonical trailing-slash URL directly.

## Frontend rollback

Prefer reverting the bad client commit and pushing the revert so the normal
tested workflow publishes the correction. During infrastructure recovery, the
repository's `deploy/frontend-release.sh rollback` operation can switch the
frontend symlink back to the previously recorded release. Backend rollback is
documented and performed from the server repository.
