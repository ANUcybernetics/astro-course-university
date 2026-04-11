# astro-course-anu

A small companion package to `astro-theme-anu` that provides course-site
authoring primitives: a typed content-graph system, reusable Zod schemas for
the three standard course collections, a topic assembler for composing lecture
decks out of reusable topic chunks, and a build-time Astro integration that
validates the graph and emits a static JSON API.

The package is theme-agnostic — it handles data and validation, the theme
handles visual presentation. Consumers of a course site typically install
both packages.

## Public API

Root entry (`astro-course-anu`):

- default export / `courseGraph()` — Astro integration that reads course
  content at build time, validates the DAG, and writes `/api/index.json`
  plus `/api/<type>/<slug>.json` for each node
- `readCourseNodes(contentDir)` — collect `ContentNode[]` from a filesystem
  directory containing the standard `topics/`, `labs/`, `assessments/`
  subdirectories
- `writeCourseApi(contentDir, distDir)` — compose `readCourseNodes` +
  `resolveGraph` + file writes for the static API
- `resolveGraph(nodes)` — pure function that returns a `ResolvedGraph`
  (nodes, edges, validation errors)
- `resolveEdgeTarget(fromType, ref)` — convert a bare slug like
  `variables` (same-type) or a qualified `topic/variables` into a node id
- `generateIndexJson(graph)` / `generateNodeJson(node)` — JSON serialisers

Schemas subpath (`astro-course-anu/schemas`):

- `defineTopicsCollection`, `defineLabsCollection`,
  `defineAssessmentsCollection` — single-collection factories that wrap
  `defineCollection` + `glob` + Zod schema
- `defineCourseCollections()` — returns all three at once so a consumer's
  `content.config.ts` is a one-liner

Topic assembler subpath (`astro-course-anu/topic-assembler`):

- `assembleTopics(source, topicsDict)` — the underlying markdown
  transformation used by the deck preprocessor in the course example.
  Replaces `<!-- topic: slug -->` HTML comments with the contents of the
  matching topic file, stripping its frontmatter.
- `parseTopicDirective(html)` — parse a single HTML comment and return
  the topic slug, or `null` if it isn't a topic directive

## Content graph model

Every content file that lives in one of the three standard directories
contributes a `ContentNode`:

```ts
interface ContentNode {
  id: string; // "topic/variables"
  type: string; // "topic" | "lab" | "assessment"
  slug: string; // "variables"
  title: string;
  description?: string;
  tags: string[];
  related: string[]; // resolved ids like "topic/functions"
  meta: Record<string, unknown>; // type-specific fields (week, due, etc.)
  body: string; // raw markdown body
}
```

Edges are defined through an undirected `related` field in frontmatter.
Bare slugs resolve to the same collection type (`related: [variables]` in
a topic resolves to `topic/variables`); use `type/slug` for cross-type
references (`related: [topic/functions]` in a lab). The build fails on
dangling references or self-references.

The collection set is intentionally small. Only things with genuinely
distinct frontmatter schemas get their own collection: labs need `week`,
assessments need `week` + `due` + `weight`, topics are everything else.
Policy pages, how-to guides, admin content, and any other "informational"
material belongs in topics with a tag (e.g. `admin`, `practice`) —
consumers then render tag-filtered listing pages at routes like `/admin/`
that link back into `/topics/<slug>/`.

## Typical consumer setup

```ts
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

```js
// src/deck-preprocess.mjs
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { assembleTopics } from "astro-course-anu/topic-assembler";
// ...
```

## Tests

Unit tests live next to the sources:

- `course-graph.test.ts` — pure graph resolution (bare slugs, cross-type
  references, dangling/self-ref detection)
- `course-content.test.ts` — filesystem reader + end-to-end graph +
  API writer
- `topic-assembler.test.ts` — topic directive parsing + assembly

Run with `pnpm --filter astro-course-anu test`.
