# astro-course-anu

Companion package to
[`astro-theme-anu`](../astro-theme-anu) for course-site authoring.

Provides a typed content-graph layer over your own Astro collections,
schemas for the `news` and `people` collections (which need
package-level wiring around `reference()` and `image()`), a topic
assembler for composing lecture decks out of reusable chunks, and a
build-time Astro integration that validates the graph and emits a
static JSON API.

The package is theme-agnostic — it handles data and validation, while
`astro-theme-anu` handles visual presentation. Consumers of a course
site typically install both.

## Install

```sh
pnpm add astro-course-anu
```

Requires `astro ^6.0.0` as a peer dependency.

## Minimal consumer config

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import anuTheme from "astro-theme-anu";
import courseGraph from "astro-course-anu";

export default defineConfig({
  integrations: [
    anuTheme(),
    courseGraph({
      collections: [
        { key: "topics", dir: "topics", type: "topic" },
        { key: "labs", dir: "labs", type: "lab" },
        { key: "assessments", dir: "assessments", type: "assessment" },
      ],
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

const loader = (dir: string) => glob({ pattern: "**/*.{md,mdx}", base: `src/content/${dir}` });

export const collections = {
  topics: defineCollection({
    loader: loader("topics"),
    schema: courseNodeSchema.passthrough(),
  }),
  labs: defineCollection({
    loader: loader("labs"),
    schema: courseNodeSchema.extend({ week: z.coerce.number().int().min(1).max(13) }).passthrough(),
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

At build time, `courseGraph()` walks the configured directories under
`src/content/`, validates the `related` edges (undirected thematic
links with cross-type references via `type/slug` syntax), and emits a
static JSON API at `/api/index.json` + `/api/<type>/<slug>.json` for
each node.

The `key` field in each collection entry is the Astro collection name
(used by `getPublishedCollection(key)`); `dir` is the directory under
`src/content/` to walk; `type` is the singular graph node type that
becomes the URL segment under `/api/` and the cross-type prefix in
`related: ["<type>/<slug>"]` edges.

## Entry points

- `astro-course-anu` — default export is `courseGraph(options)`; named
  exports for `readCourseNodes`, `writeCourseApi`, `resolveGraph`,
  `generateIndexJson`, `generateNodeJson`, plus the types
  `ContentNode`, `GraphEdge`, `GraphError`, `ResolvedGraph`,
  `CourseCollection`, `CourseGraphOptions`, `CourseApiResult`
- `astro-course-anu/schemas` — `courseNodeSchema` (the bare graph-node
  Zod shape that consumers extend), plus `defineNewsCollection` and
  `definePeopleCollection`
- `astro-course-anu/content` — `getPublishedCollection(name, filter?)`
- `astro-course-anu/topic-assembler` — _deprecated._ `assembleTopics`
  replaces `<!-- topic: slug -->` markers in pre-MDX `.deck.md` decks.
  The current astromotion pipeline uses `.deck.mdx` with the
  `@include` directive (which strips yaml frontmatter), so this helper
  is no longer required. Kept exported for backward compatibility

## Status

Early development — the API may change between minor versions.

## Licence

MIT — see the `LICENSE` file at the repo root.
