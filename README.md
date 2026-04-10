# astro-course-anu

Companion package to
[`astro-theme-anu`](../astro-theme-anu) for course-site authoring.

Provides a typed content-graph model (topics, labs, assessments,
procedures, admin), reusable Zod schemas for the five standard course
collections, a topic assembler for composing lecture decks out of
reusable chunks, and a build-time Astro integration that validates the
graph and emits a static JSON API.

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
  integrations: [anuTheme(), courseGraph()],
});
```

```ts
// src/content.config.ts
import { defineCourseCollections } from "astro-course-anu/schemas";
export const collections = defineCourseCollections();
```

At build time, `courseGraph()` walks `src/content/{topics,labs,
assessments,procedures,admin}`, validates the `related` edges (undirected
thematic links with cross-type references via `type/slug` syntax), and
emits a static JSON API at `/api/index.json` + `/api/<type>/<slug>.json`
for each node.

## Entry points

- `astro-course-anu` — default export is `courseGraph()`; named exports
  for `readCourseNodes`, `resolveGraph`, `generateIndexJson`, and graph
  types (`ContentNode`, `GraphEdge`, `GraphError`, `ResolvedGraph`)
- `astro-course-anu/schemas` — `defineTopicsCollection`,
  `defineLabsCollection`, `defineAssessmentsCollection`,
  `defineProceduresCollection`, `defineAdminCollection`, plus the
  `defineCourseCollections()` convenience helper that returns all five
- `astro-course-anu/topic-assembler` — `assembleTopics` markdown
  transformer used by the astromotion preprocess hook to splice topic
  content into lecture decks via `<!-- topic: slug -->` markers

## Status

Early development — the API may change between minor versions.

## Licence

MIT — see the `LICENSE` file at the repo root.
