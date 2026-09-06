# astro-course-university

A brand-neutral package of course-site authoring primitives: a typed
content-graph layer over the consumer's own Astro collections, reusable Zod
schemas, and a build-time integration that validates the graph and emits a
static JSON API. Data and validation live here; visual presentation lives in the
theme package, and a site typically installs both.

Keep the package free of institutional branding --- no university name, logos,
colours, legal or acknowledgement text, and no institution-specific defaults.
Examples use invented institutions and course codes. Brand assets belong in a
consumer's own brand layer.

`README.md` is the API reference: entry points, `courseGraph()` options
(`collections`, `timezone`, `course`, `canonicalUrl`), refs, specs and deck
embeds. Point at it rather than restating it here, and update it whenever the
public surface changes. Per-symbol contracts --- including the
`published`/`unlisted`/`draft` axes and `spec` --- live in the JSDoc on
`schemas.ts` and `course-graph.ts`.

Sources sit flat at the repo root, with `.astro` components in `components/`.
The `exports` map in `package.json` is the list of public entry points; a new
public module needs an entry there and in `files`, or it won't ship.

## Content graph

Edges come from the undirected `related:` frontmatter field plus any
`{/* embed: <ref> */}` directives in the body, so transclusion and the graph
stay in sync from one declaration. A bare slug resolves within the declaring
collection; `<collection>/<slug>` crosses collections. Dangling and self
references fail the build.

There is no fixed vocabulary of collections: `key` doubles as node type, ref
prefix and API path segment, and consumers choose their own. Don't reintroduce
hardcoded `topics` / `labs` / `assessments` handling.

## People

The `people` collection sits alongside the graph collections but is deliberately
outside the graph --- it contributes no `ContentNode`s and has no `related:`
field. An `author` field on another collection referencing it is a typed foreign
key (Astro's `reference()`), not an edge. Consumer byline code must tolerate an
`author` that resolves to nothing: Astro only warns on an unresolved reference,
so the build succeeds and `getEntry()` returns `undefined`.

## Tests

Unit tests sit next to their sources:

- `course-graph.test.ts` --- pure graph resolution (bare slugs, cross-collection
  refs, dangling/self-ref detection, `courseMetaSchema`)
- `course-content.test.ts` --- filesystem reader, end-to-end graph, and API
  writer, exercised against an explicit collections config
- `schemas.test.ts` --- schema shapes and the `people` factory, invoked through
  a `vi.mock` shim for `astro:content` and `astro/loaders` so no Astro build is
  needed

Run `pnpm check` (format check, lint, typecheck, tests) --- the same command CI
runs.
