# astro-course-anu

Companion package to [`astro-theme-anu`](../astro-theme-anu) for course-site
authoring.

Provides a typed content-graph layer over your own Astro collections, schemas
for the `news` and `people` collections (which need package-level wiring around
`reference()` and `image()`), and a build-time Astro integration that validates
the graph and emits a static JSON API.

The package is theme-agnostic — it handles data and validation, while
`astro-theme-anu` handles visual presentation. Consumers of a course site
typically install both.

## Install

```sh
pnpm add astro-course-anu
```

Requires `astro ^6.0.0` as a peer dependency.

## Minimal consumer config

```js
// astro.config.ts
import { defineConfig } from "astro/config";
import anuTheme from "astro-theme-anu";
import courseGraph from "astro-course-anu";

export default defineConfig({
  integrations: [
    anuTheme(),
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

At build time, `courseGraph()` walks the configured directories, validates the
graph, and emits a static JSON API at `/api/index.json` +
`/api/<collection>/<slug>.json` for each node. Index entries carry
`{id, type, title, description, tags, related, meta}` (`meta` is the node's
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

## Entry points

- `astro-course-anu` — default export is `courseGraph(options)`; named exports
  for `readCourseNodes`, `writeCourseApi`, `resolveGraph`, `parseEmbedRefs`,
  `generateIndexJson`, `generateNodeJson`, plus the types `ContentNode`,
  `ExternalLink`, `GraphEdge`, `GraphError`, `ResolvedGraph`,
  `CourseCollection`, `CourseGraphOptions`, `CourseApiResult`
- `astro-course-anu/schemas` — `courseNodeSchema` (the bare graph-node Zod shape
  that consumers extend), plus `defineNewsCollection` and
  `definePeopleCollection`
- `astro-course-anu/content` — `getPublishedCollection(name, filter?)` and
  `getRelatedEntries(entry, collections)` (the render-time counterpart of the
  build-time graph: every published entry connected to `entry` in either
  direction)
- `astro-course-anu/components/RelatedContent.astro` — drop-in related-content
  block for detail pages: internal related entries plus external `links`,
  rendering nothing when the node has neither

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
