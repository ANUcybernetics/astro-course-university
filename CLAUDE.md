# astro-course-anu

A small companion package to `astro-theme-anu` that provides course-site
authoring primitives: a typed content-graph layer, reusable Zod schemas for the
`news` and `people` collections, a topic assembler for composing lecture decks
out of reusable topic chunks, and a build-time Astro integration that validates
the graph and emits a static JSON API.

The package is theme-agnostic — it handles data and validation, the theme
handles visual presentation. Consumers of a course site typically install both
packages.

## Public API

Root entry (`astro-course-anu`):

- default export / `courseGraph({ collections })` — Astro integration that reads
  course content at build time, validates the DAG, and writes `/api/index.json`
  plus `/api/<collection>/<slug>.json` for each node. The required `collections`
  option is a list of `{ key, dir?, suffix? }` entries naming each
  graph-participating collection: `key` doubles as the node type and ref prefix,
  `dir` (relative to `src/`, default `content/<key>`) and `suffix` (e.g.
  `".deck.mdx"`) let collections outside `src/content/` join the graph.
- `readCourseNodes(srcDir, collections)` — collect `ContentNode[]` from the
  configured directories under the project `src/` dir.
- `writeCourseApi(srcDir, distDir, collections)` — compose `readCourseNodes` +
  `resolveGraph` + file writes for the static API
- `resolveGraph(nodes)` — pure function that returns a `ResolvedGraph` (nodes,
  edges, validation errors)
- `resolveEdgeTarget(fromCollection, ref)` — convert a bare slug like
  `variables` (same-collection) or a qualified `topics/variables` into a node id
- `parseEmbedRefs(body)` — extract refs from `{/* embed: <ref> */}` transclusion
  directives in a raw body (fragments stripped, deduped); these merge into the
  node's `related` refs so an embed implies an edge
- `generateIndexJson(graph)` / `generateNodeJson(node)` — JSON serialisers

Schemas subpath (`astro-course-anu/schemas`):

- `courseNodeSchema` — bare Zod object covering the graph-participating fields
  (`title`, `summary`, `tags`, `related`, `links`, `published`). Consumers
  compose collections by `extend`ing this with type-specific fields and passing
  the result to `defineCollection` themselves. `links` is external URLs as
  `{ label, url }` pairs — rendered alongside related content and exposed in the
  API, never graph edges.
- `defineNewsCollection`, `definePeopleCollection` — the two collections that
  genuinely need package-level wiring (`reference("people")` and `image()`
  respectively), so they stay as factories.

Content subpath (`astro-course-anu/content`):

- `getPublishedCollection(name, filter?)` — drop-in replacement for
  `getCollection` that filters out entries with `published: false`. Accepts an
  optional secondary filter applied after the published check. Safe on
  collections whose schema doesn't define `published` — missing fields are
  treated as published.
- `getRelatedEntries(entry, collections)` — render-time counterpart of the
  build-time graph: every published entry connected to `entry` in either
  direction (declared `related`, embed directives, or incoming from other
  nodes). `collections` must list every graph-participating collection key.

Components subpath (`astro-course-anu/components/*`):

- `RelatedContent.astro` — drop-in related-content block for detail pages:
  internal related entries as `/<collection>/<slug>/` links plus external
  `links`, rendering nothing when the node has neither. Assumes the site's
  detail routes live at `/<collection>/<slug>/`.

Lecture decks (embed directives):

Course sites splice node content into astromotion `.deck.mdx` decks with a
site-level remark plugin that resolves `{/* embed: <ref>[#section] */}`
directives — the package ships no deck preprocessor, but `parseEmbedRefs` reads
those same directives out of node bodies at build time and merges them into the
node's `related` refs, so transclusion and graph stay in sync with a single
declaration (and a dangling embed target fails the build). Plain astromotion
`{/* @include path.mdx */}` remains available for non-collection partials.

## Content graph model

Every content file under a configured collection directory contributes a
`ContentNode`:

```ts
interface ContentNode {
  id: string; // ref: "<collection>/<slug>", e.g. "topics/variables"
  type: string; // the collection key
  slug: string;
  title: string;
  description?: string;
  tags: string[];
  related: string[]; // resolved refs like "topics/functions"
  links: ExternalLink[]; // external { label, url } pairs — not edges
  meta: Record<string, unknown>; // type-specific fields (week, due, etc.)
  body: string; // raw markdown body
}
```

Edges are defined through an undirected `related` field in frontmatter, plus any
`{/* embed: ... */}` directives in the body. Bare slugs resolve to the same
collection (`related: [variables]` in a topic resolves to `topics/variables`);
use `<collection>/<slug>` for cross-collection references
(`related: [topics/functions]` in a crit). The build fails on dangling
references or self-references.

The package no longer hardcodes a vocabulary. Consumers pick the collection keys
that fit their course — the historical `topics` / `labs` / `assessments` shape
is one configuration among many.

## News and people (non-graph collections)

Two further collections sit alongside the graph collections but are deliberately
kept out of the content graph:

- **news** — dated announcements and guest-lecture posts. Required fields:
  `title`, `date` (coerced), `author` (a `reference("people")`). Optional:
  `summary`, `tags`, `pinned`, `published`. News is ephemeral and chronological,
  not a reusable pedagogical unit — cross-references from news to other content
  are plain markdown links, not graph edges.
- **people** — the cast of the course: convenor, TAs, guest lecturers. `title`
  is the required display name; `affiliation`, `role`
  (`convenor`/`ta`/`guest`/`other`), `email`, `url`, and `photo` (via Astro's
  `image()`) are optional. The markdown body is an optional bio.

Neither collection contributes `ContentNode`s to the graph and neither has a
`related:` field. The `news.author` reference is a **typed foreign key**
(validated by Astro's `reference()`), not a `related:` edge.

**Reference validation caveat.** Astro's `reference()` emits a build-time
_warning_ when a reference resolves to no entry — the build still succeeds and
`getEntry()` returns `undefined`. Consumer byline code must handle undefined
author gracefully (fall back to no link). A missing required `author` field, by
contrast, fails the build via Zod validation.

## Typical consumer setup

```ts
// astro.config.ts
import { defineConfig } from "astro/config";
import anuTheme from "astro-theme-anu";
import courseGraph from "astro-course-anu";

export default defineConfig({
  integrations: [
    anuTheme(),
    courseGraph({
      collections: [{ key: "topics" }, { key: "labs" }, { key: "assessments" }],
    }),
  ],
});
```

```ts
// src/content.config.ts
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import {
  courseNodeSchema,
  defineNewsCollection,
  definePeopleCollection,
} from "astro-course-anu/schemas";

const loader = (dir: string) =>
  glob({ pattern: "**/*.{md,mdx}", base: `src/content/${dir}` });

export const collections = {
  topics: defineCollection({
    loader: loader("topics"),
    schema: courseNodeSchema.passthrough(),
  }),
  labs: defineCollection({
    loader: loader("labs"),
    schema: courseNodeSchema
      .extend({ week: z.coerce.number().int().min(1).max(13) })
      .passthrough(),
  }),
  assessments: defineCollection({
    loader: loader("assessments"),
    schema: courseNodeSchema
      .extend({
        week: z.coerce.number().int().min(1).max(13),
        due: z.coerce.date().nullish(),
        weight: z.coerce.number().nullish(),
      })
      .passthrough(),
  }),
  news: defineNewsCollection(),
  people: definePeopleCollection(),
};
```

## Tests

Unit tests live next to the sources:

- `course-graph.test.ts` — pure graph resolution (bare slugs, cross-type
  references, dangling/self-ref detection)
- `course-content.test.ts` — filesystem reader + end-to-end graph + API writer,
  exercised against an explicit collections config
- `schemas.test.ts` — `courseNodeSchema` plus the `news` and `people` factories
  exercised directly (valid frontmatter, defaults, required-field rejection,
  role/email/url validation, passthrough behaviour). Uses a `vi.mock` shim for
  `astro:content` and `astro/loaders` so the schema factories can be invoked
  without an Astro build.

Cross-package integration tests live in `tests/` at the repo root:

- `tests/examples.test.ts` — builds each example end-to-end
- `tests/course-references.test.ts` — reference-validation integration: a
  dangling `news.author` surfaces Astro's warning, and a missing `author:` field
  fails the build

Run with `pnpm --filter astro-course-anu test` for package tests, or `pnpm test`
/ `pnpm test:examples` from the repo root for the full suite.
