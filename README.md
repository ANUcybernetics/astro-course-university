# astro-course-university

Brand-neutral course-site infrastructure for Astro. It deliberately knows
nothing about a university's visual identity, legal text, logos, or other brand
assets; pair it with whichever theme and brand layer a site chooses.

Provides a typed content-graph layer over your own Astro collections, schemas
for the `people` collection (which need package-level wiring around
`reference()` and `image()`), and a build-time Astro integration that validates
the graph and emits a static JSON API.

The package is theme-agnostic: it handles data and validation while the
consumer's chosen theme handles visual presentation.

## Install

```sh
pnpm add astro-course-university
```

Requires `astro ^7.0.0` as a peer dependency.

## Minimal consumer config

```js
// astro.config.ts
import { defineConfig } from "astro/config";
import courseGraph from "astro-course-university";

export default defineConfig({
  integrations: [
    courseGraph({
      collections: [
        { key: "topics" },
        { key: "labs" },
        { key: "assessments" },
        // collections outside src/content/ can join the graph too, e.g.
        // astromotion decks: { key: "lectures", dir: "decks", suffix: ".deck.mdx" }
      ],
      // optional: IANA zone the site's bare frontmatter dates are local to
      timezone: "Australia/Canberra",
      // optional: course-record facts, emitted as a `course` block on
      // /api/index.json (validated at config time by courseMetaSchema)
      course: {
        code: "COMP1234",
        title: "Example Course",
        session: "Semester 2, 2026",
        year: 2026,
        level: 1,
        startDate: "2026-07-27",
        endDate: "2026-10-30",
        description: "A one-paragraph description of the course.",
        tags: ["examples", "teaching"],
        learningOutcomes: ["explain examples", "produce examples"],
      },
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
  definePeopleCollection,
} from "astro-course-university/schemas";

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
  people: definePeopleCollection(),
};
```

At build time, `courseGraph()` walks the configured directories, validates the
graph, and emits a static JSON API at `/api/index.json` +
`/api/<collection>/<slug>.json` for each node. The index declares
`schemaVersion: 1` and a `canonicalUrl`. By default this comes from Astro's
`site` and deployment base path; pass `canonicalUrl` to `courseGraph()` when a
stable catalogue URL differs from the source deployment. Index entries carry
`{id, type, title, description, tags, related, spec, meta}` (`spec` is the
deliverable's contract — see below — omitted when empty; `meta` is the node's
leftover frontmatter — `week`, `due`, `draft`, and so on — omitted when empty);
per-node JSON adds `links` and the full markdown `body`. A node's `related` list
includes incoming edges as well as declared ones, matching what `RelatedContent`
renders on the page; the top-level `edges` array records declared direction.

If the integration is given a `timezone` (an IANA zone name, validated at config
time), it is emitted verbatim as a `timezone` field on the index and on every
per-node JSON, so consumers can interpret bare frontmatter dates like
`due: 2026-08-17` without guessing. The dates themselves are never rewritten to
UTC offsets — a zone _name_ stays correct across DST transitions where a baked
offset would not.

If the integration is given a `course` (validated at config time by
`courseMetaSchema`, exported from the package root), it is emitted as a `course`
block at the top of `/api/index.json`, making the API self-describing: `code`,
`title`, `session`, teaching `startDate`/`endDate` (bare ISO `YYYY-MM-DD`
strings, local to `timezone` like every other date), a one-paragraph
`description`, and optional `year`, numeric `level`, `tags`, and
`learningOutcomes`. The schema is strict — an unknown field name fails the build
— which is the template contract: a new course site built from an existing one
won't build until the required facts are filled in.

## Refs

One address format — the **ref**, `<collection>/<slug>` — names a node
everywhere: `related:` frontmatter entries, `{/* embed: ... */}` transclusion
directives, graph node ids, API paths, and (by the site's own routing
convention) page URLs at `/<collection>/<slug>/`. A bare slug is shorthand for
"same collection as the declaring node". The collection `key` is the whole
story: collection name = node type = ref prefix = API path segment; `dir`
(relative to `src/`, default `content/<key>`) and `suffix` (e.g. `".deck.mdx"`)
only exist so collections outside `src/content/` can join the graph.

Nodes connect two ways, both undirected and both build-validated (dangling or
self refs fail the build):

- **`related:`** frontmatter — refs to other nodes in the site
- **`{/* embed: <ref>[#section] */}`** body directives — the deck transclusion
  syntax; an embed implies a related edge, so transcluding a node never needs a
  second declaration

External URLs live in the separate **`links:`** frontmatter field
(`{ label, url }` pairs) — rendered alongside related content and exposed in the
API, but never graph edges.

## Specs

Anything that gets a mark (an assignment, a weekly lab or crit) can declare a
**`spec:`** — an array of plain sentences articulating what the markers will be
considering when they judge whether the submitted work matches what was
required. Some lines may be machine-checkable (a starter repo's conformance
suite can assert them); many need human judgement. It is deliberately _not_ an
input to automatic grading — it articulates the contract, it doesn't score it.

The field is part of `courseNodeSchema`, flows through the JSON API as a
top-level `spec` field on index entries and per-node JSON (omitted when empty),
and renders on detail pages via the `SpecList` component:

```astro
---
import SpecList from "astro-course-university/components/SpecList.astro";
---

<SpecList spec={entry.data.spec} />
```

The preamble sentence is a slot with a course-neutral default; the heading
defaults to "The spec".

## Entry points

- `astro-course-university` — default export is `courseGraph(options)`; named
  exports for `courseMetaSchema`, `readCourseNodes`, `writeCourseApi`,
  `resolveGraph`, `parseEmbedRefs`, `generateIndexJson`, `generateNodeJson`,
  plus the types `ContentNode`, `CourseMeta`, `CourseMetaInput`, `ExternalLink`,
  `GraphEdge`, `GraphError`, `ResolvedGraph`, `CourseCollection`,
  `CourseGraphOptions`, `CourseApiResult`
- `astro-course-university/schemas` — `courseNodeSchema` (the bare graph-node
  Zod shape that consumers extend), plus `definePeopleCollection`
- `astro-course-university/content` — `getPublishedCollection(name, filter?)`
  and `getRelatedEntries(entry, collections)` (the render-time counterpart of
  the build-time graph: every listable entry connected to `entry` in either
  direction). Both filter `published: false` entries in production builds only —
  the dev server includes them so staged content stays previewable — and
  `unlisted: true` entries everywhere, that flag being a permanent property of
  the entry rather than a stage
- `astro-course-university/components/RelatedContent.astro` — drop-in
  related-content block for detail pages: internal related entries plus external
  `links`, rendering nothing when the node has neither
- `astro-course-university/components/SpecList.astro` — drop-in spec block for
  detail pages: the deliverable's `spec:` lines as a list, rendering nothing
  when the entry declares none

## Lecture decks

This package doesn't process slide decks — the consumer site's remark plugin
resolves `{/* embed: <ref>[#section] */}` directives in `.deck.mdx` files by
splicing the referenced node's body (or just one `#section` of it) into the
deck. What this package contributes is the graph side: those same embed
directives are parsed out of node bodies at build time and become validated
related edges, so the deck→topic mapping maintains itself.

## Status

Early development — the API may change between minor versions.

## Licence

MIT — see the `LICENSE` file at the repo root.
