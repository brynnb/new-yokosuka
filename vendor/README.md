# Vendored Lucky Break engine

`lucky-break-engine.tgz` is generated from the Lucky Break repository. Update
it from a local checkout with:

```sh
# Bump the Lucky Break package version for behavior changes first.
npm run sync:lucky-break-engine -- /path/to/lucky-break
```

The command also updates the installed dependency and lockfile. The tarball
keeps New Yokosuka builds reproducible before an engine release is published.
Each behavior-changing package must have a new version so npm does not reuse a
cached tarball. Once `@brynnb/lucky-break-engine` is available from a registry
or a tagged Git commit, replace the `file:` dependency with that pinned release.

The engine implementation stays private. Public packages contain compiled ESM,
type declarations and metadata only: no source maps, embedded source, or original
TypeScript implementation files. The sync command verifies the archive before
installing it; `tests/LuckyBreakPackage.test.js` checks the checked-in package.
New Yokosuka's public source maps can contain the distributed compiled engine
JavaScript, but must not include its upstream TypeScript sources.
