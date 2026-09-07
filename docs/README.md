# Documentation

Start with the [project README](../README.md) to run New Yokosuka. Choose a
section here by what you want to learn:

- [Guides](guides/README.md): restore assets, extract disc data, author scripts,
  or investigate the original games.
- [Implementation](implementation/README.md): how the current application
  loads worlds, renders characters, runs events, and communicates with its server.
- [Research](research/README.md): our findings about the original games,
  supporting evidence, hypotheses, and unresolved behavior.
- [Reference](reference/README.md): native identifier tables and generated lookups.
- [External references](reference/external/README.md): preserved material from
  other sources, kept distinct from our findings.
- [Design](design/README.md): proposed behavior and intentional adaptations,
  not a claim that a feature is implemented.

Runnable extraction and analysis code remains in [tools](../tools/README.md).
[Deployment](../DEPLOYMENT.md) remains a root-level operational entry point.

## Where new documentation belongs

Keep one maintained explanation per subject and link to it from other guides.
Separate native evidence, our implementation, and proposals even when a topic
touches all three. Use shared research pages for behavior common to both games;
use `research/shenmue1/` and `research/shenmue2/` for game-specific findings.
Do not split a cohesive topic just to meet a line-count target.

Use lowercase-kebab-case filenames, with `README.md` for section indexes.
Generated references retain `.generated.md` and their canonical producer.
External imports retain their source text and provenance; do not silently
rewrite them as project-authored conclusions or apply the project license to them.

Small self-contained tools may have a local README. General guides belong here,
not in a second `tools/docs/` or `research/docs/` library. Machine-readable
evidence stays under `tools/evidence/`; runtime data stays with its consumers.
Raw captures, work plans, and historical handoffs belong in ignored local
storage such as `internal-docs/`, not the public documentation index.

Run `npm run docs:check` after moving or linking documents. When a path is also
recorded by a generator, update the producer and regenerate its affected outputs.
