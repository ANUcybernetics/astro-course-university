# Changelog

All notable changes to the `astro-course-anu` package. For monorepo-wide history
see the root `CHANGELOG.md`.

## 2026-07-22 — dev server previews unpublished entries

`getPublishedCollection` and `getRelatedEntries` now apply the
`published: false` filter only in production builds (`import.meta.env.PROD`).
The dev server includes unpublished entries — they appear in listings, related
blocks, and detail routes locally — matching astromotion's existing treatment of
unpublished decks, so a whole staged-but-unpublished term is previewable with
`astro dev` while production output is unchanged.

## 2026-07-12 — course metadata block

`courseGraph()` accepts an optional `course` — the course-record facts every
course site restates: `code`, `title`, `session`, teaching `startDate`/`endDate`
(bare ISO `YYYY-MM-DD` strings, local to `timezone`), a one-paragraph
`description`, and optional `learningOutcomes`. Validated at config time by the
new `courseMetaSchema` (exported from the package root, alongside the
`CourseMeta`/`CourseMetaInput` types); the schema is strict, so a typo'd field
name fails the build — the template contract for spinning up new course sites
with the same shape. When set, it is emitted as a `course` block at the top of
`/api/index.json`, making the graph API self-describing; per-node JSON is
unchanged. `writeCourseApi` and `generateIndexJson` gain a matching optional
trailing parameter. Omitted, nothing changes.

## 2026-07-12 — spec: the deliverable's contract as plain sentences

`courseNodeSchema` gains a `spec` field (array of strings, defaults to empty):
what the markers will be considering when they judge whether submitted work
matches what was required. Some lines may be machine-checkable, many need human
judgement — never an input to automatic grading. Declare it on anything that
gets a mark.

`readCourseNodes` plucks `spec` out of frontmatter into its own field on
`ContentNode` (it no longer lands in `meta`), and the JSON API emits it as a
top-level `spec` on index entries and per-node JSON, omitted when empty. New
`SpecList.astro` component renders the lines on detail pages (nothing when
empty; preamble is a slot with a course-neutral default). Extracted from
comp4020-agentic-coding-studio, where the field was piloted consumer-side.

TypeScript note: `ContentNode` gains a required `spec: string[]` — code
constructing nodes by hand needs the extra field; content and config need
nothing.

## 2026-07-11 — site timezone in the API

`courseGraph()` accepts an optional `timezone` (IANA zone name, e.g.
`"Australia/Canberra"`, validated at config time). When set, it is emitted as a
`timezone` field on `/api/index.json` and every per-node JSON, giving consumers
the zone that bare frontmatter dates (`due: 2026-08-17`) are local to. Dates are
never rewritten to UTC offsets — a zone name stays correct across DST
transitions where a baked offset would not. `writeCourseApi`,
`generateIndexJson` and `generateNodeJson` gain matching optional trailing
parameters. Omitted, nothing changes.

## 2026-07-07 — people role: ta → tutor

**Breaking**: the `people` collection's `role` enum renames `ta` → `tutor`,
matching the Australian term for teaching staff. Update `role: ta` to
`role: tutor` in people content when bumping.

## 2026-07-07 — one vocabulary: description; draft promoted to the shared schema

**Breaking**: `courseNodeSchema` (and the news schema) rename `summary` →
`description`, matching astromotion deck frontmatter and HTML
`<meta name="description">` — one name for the one-line blurb across the
ecosystem. `readCourseNodes` no longer falls back to `summary:` frontmatter;
rename the field in content when bumping.

`draft: boolean` (default `false`) is promoted into `courseNodeSchema` — it was
already consumed by the theme's llms.txt generation and declared ad hoc by
consumers. `published` and `draft` are documented as orthogonal axes: visibility
vs finality.

## 2026-07-03 — API self-sufficiency: index meta, symmetric related

Two changes that let an agent answer more from fewer fetches, closing the gap
between the JSON API and the rendered site:

- **`meta` on index nodes.** `/api/index.json` entries now carry the same `meta`
  object as the per-node JSON (omitted when empty), so structured facts —
  `week`, `due`, `weight`, `draft` — are answerable from the index alone instead
  of one fetch per node. Draft status in particular was previously invisible at
  the index level.
- **Symmetric `related`.** A node's `related` list (index and per-node JSON) now
  includes incoming edges as well as declared ones — declared refs first, then
  nodes that declared the connection from their side. This matches what the
  RelatedContent block renders on the page, so "what relates to X" no longer
  needs a scan of every node's declarations. The top-level `edges` array still
  records declared direction. New `symmetriseRelated(graph)` export;
  `generateNodeJson` takes an optional second `related` argument.

Released as `astro-course-anu@v0.4.1`.

## 2026-07-03 — Refs everywhere: plural types, embed edges, external links (breaking)

One address format — the **ref**, `<collection>/<slug>` — now names a node in
`related:` entries, `{/* embed: ... */}` transclusion directives, graph node
ids, API paths, and (by the site's own convention) page URLs. A bare slug is
shorthand for "same collection as the declaring node".

**Breaking**

- `CourseCollection` is now `{ key: string; dir?: string; suffix?: string }`.
  The `type` field is gone: the collection `key` **is** the graph node type, the
  `/api/<key>/<slug>.json` path segment, and the cross-collection ref prefix.
  `dir` is now relative to `src/` (not `src/content/`) and defaults to
  `content/<key>`, so most entries collapse to `{ key: "topics" }`.
- `readCourseNodes` and `writeCourseApi` take `srcDir` (the project `src/` dir)
  as their first argument instead of the content dir.
- API output moves from singular to plural segments: `/api/topic/<slug>.json` →
  `/api/topics/<slug>.json`, and node ids/refs follow (`topic/x` → `topics/x`).
  Existing content with bare same-collection `related` slugs needs no changes;
  qualified cross-type refs must be pluralised.

**Added**

- **Embed-derived edges.** `{/* embed: <ref>[#section] */}` directives in a
  node's body (the deck transclusion syntax) merge into its `related` refs
  automatically — transcluding a node never needs a second declaration, and a
  dangling embed target now fails the build like any dangling ref.
  `parseEmbedRefs(body)` is exported.
- **`links` frontmatter field** on `courseNodeSchema` — external URLs as
  `{ label, url }` pairs. Rendered alongside related content, exposed on
  per-node API JSON, never graph edges. New `ExternalLink` type.
- **`suffix` collection option** (e.g. `".deck.mdx"`) so non-content collections
  like astromotion decks can join the graph:
  `{ key: "lectures", dir: "decks", suffix: ".deck.mdx" }`.
- **`getRelatedEntries(entry, collections)`** in `astro-course-anu/content` —
  the render-time counterpart of the build-time graph: every published entry
  connected to `entry` in either direction (declared, embedded, or incoming), so
  `related` is genuinely undirected — declare on whichever side is convenient
  and both pages show the connection.
- **`RelatedContent.astro`** component (new `./components/*` export) — a drop-in
  related-content block for detail pages: internal related entries as
  `/<collection>/<slug>/` links plus external `links`, rendering nothing when
  the node has neither.

**Migration**

```diff
 courseGraph({
   collections: [
-    { key: "topics", dir: "topics", type: "topic" },
-    { key: "crits", dir: "crits", type: "crit" },
-    { key: "assessments", dir: "assessments", type: "assessment" },
+    { key: "topics" },
+    { key: "crits" },
+    { key: "assessments" },
+    { key: "lectures", dir: "decks", suffix: ".deck.mdx" },
   ],
 })
```

Then pluralise any qualified refs in frontmatter (`related: [topic/x]` →
`related: [topics/x]`) and any consumers of `/api/<type>/` paths.

## 2026-06-23 — Breaking: require Astro 7

The `astro` peer dependency now requires `^7` (was `^6`). The build-time
`courseGraph()` integration uses only stable integration hooks and the
content-collections API, so no code changes are required; this is a peer-range
bump and consumers must move to Astro 7 in lockstep.

## 2026-05-29 — Remove deprecated `topic-assembler`

- Removed the `astro-course-anu/topic-assembler` subpath export and its
  `assembleTopics` / `parseTopicDirective` helpers (and the `AssembleResult`
  type). They implemented the pre-MDX `<!-- topic: slug -->` `.deck.md`
  preprocessor, which astromotion's `.deck.mdx` `@include` directive superseded;
  nothing consumed them. Also dropped the now-unused `remark`,
  `remark-frontmatter`, and `unist-util-visit` dependencies and the
  `@types/mdast` dev dependency.
- No change to the content graph: `courseGraph()`, `courseNodeSchema`, the
  `news` / `people` schema factories, `related` edges, and the `/api/*.json`
  output are unaffected. Topics still compose into decks via astromotion
  `@include`.

## 2026-04-29

### Refactor to a graph layer (breaking)

The package no longer hardcodes the `topics` / `labs` / `assessments`
vocabulary. The schema layer and the graph integration now treat
"graph-participating collection" as the abstraction; consumers pick the
collection keys, directories, and singular type names that fit their course.

**Removed**

- `defineTopicsCollection`, `defineLabsCollection`,
  `defineAssessmentsCollection` — these baked in directory names, an Astro
  collection key, and (for labs/assessments) a hardcoded `weekSchema` (range
  1-12).
- `defineCourseCollections()` and its `DefineCourseCollectionsOptions`.
- The `DIR_TO_TYPE` constant in `course-content.ts`. `courseGraph()` no longer
  auto-discovers `src/content/{topics,labs,assessments}`.

**Added**

- `courseNodeSchema` — the bare Zod shape for any node that participates in the
  graph (`title`, `summary`, `tags`, `related`, `published`). Consumers compose
  collections by `extend`ing this and passing the result to `defineCollection`
  themselves.
- `CourseCollection` type — `{ key: string; dir: string; type: string }`.
- `CourseGraphOptions` type — `{ collections: CourseCollection[] }`.
  `courseGraph()` is now invoked as `courseGraph({ collections: [...] })`.
- `readCourseNodes(contentDir, collections)` and
  `writeCourseApi(contentDir, distPath, collections)` take the collections
  config explicitly. Only the configured `dir` values are walked, and each node
  is assigned the configured `type`.

**Kept**

- `defineNewsCollection` and `definePeopleCollection` — these bake in
  `reference("people")` and `image()` respectively, so they stay as factories
  rather than as bare schemas.

**Side benefit**

- The `weekSchema` hardcoded 1-12 range is gone. Consumers pick their own week
  range, unblocking 13-week and module-based courses.

**Migration**

`src/content.config.ts`:

```diff
-import { defineCourseCollections } from "astro-course-anu/schemas";
-export const collections = defineCourseCollections();
+import { defineCollection } from "astro:content";
+import { glob } from "astro/loaders";
+import { z } from "astro/zod";
+import {
+  courseNodeSchema,
+  defineNewsCollection,
+  definePeopleCollection,
+} from "astro-course-anu/schemas";
+
+const loader = (dir) =>
+  glob({ pattern: "**/*.{md,mdx}", base: `src/content/${dir}` });
+
+export const collections = {
+  topics: defineCollection({
+    loader: loader("topics"),
+    schema: courseNodeSchema.passthrough(),
+  }),
+  labs: defineCollection({
+    loader: loader("labs"),
+    schema: courseNodeSchema
+      .extend({ week: z.coerce.number().int().min(1).max(13) })
+      .passthrough(),
+  }),
+  assessments: defineCollection({
+    loader: loader("assessments"),
+    schema: courseNodeSchema
+      .extend({
+        week: z.coerce.number().int().min(1).max(13),
+        due: z.coerce.date().nullish(),
+        weight: z.coerce.number().nullish(),
+      })
+      .passthrough(),
+  }),
+  news: defineNewsCollection(),
+  people: definePeopleCollection(),
+};
```

`astro.config.mjs`:

```diff
 integrations: [
   anuTheme(),
-  courseGraph(),
+  courseGraph({
+    collections: [
+      { key: "topics", dir: "topics", type: "topic" },
+      { key: "labs", dir: "labs", type: "lab" },
+      { key: "assessments", dir: "assessments", type: "assessment" },
+    ],
+  }),
 ],
```

The `key` is the Astro collection name (used by `getPublishedCollection(key)`),
`dir` is the directory under `src/content/` to walk, and `type` is the singular
graph node type (becomes the `/api/<type>/<slug>.json` segment and the
cross-type prefix in `related: ["<type>/<slug>"]` edges). Renaming a collection
is now an honest one-place change: rename the directory, update
`dir`/`type`/`key` in the config, and the graph follows.

## 2026-04-15

### Add `news` and `people` collections

Two new schema factories in `astro-course-anu/schemas`:

- **`defineNewsCollection`** — dated announcements and guest-lecture posts.
  Required fields: `title`, `date` (coerced), and `author` (a
  `reference("people")`). Optional: `summary`, `tags`, `pinned`, `published`.
  Intentionally kept out of the content graph: news is ephemeral and
  chronological, not a reusable pedagogical unit. Cross-references from news to
  other content are plain markdown links.
- **`definePeopleCollection`** — the cast of the course: convenor, TAs, guest
  lecturers, and anyone else who gets a byline. `title` is the required display
  name; `affiliation`, `role` (`convenor`/`ta`/`guest`/`other`), `email`, `url`,
  and `photo` (via Astro's `image()`) are optional. The markdown body is an
  optional bio. Referenced by `news.author`.

`defineCourseCollections()` now returns all five collections (`topics`, `labs`,
`assessments`, `news`, `people`). If a consumer doesn't create a matching
directory under `src/content/`, Astro's glob loader simply matches nothing and
the collection is empty — so this is a safe drop-in for existing consumers.

**Reference validation caveat.** Astro's `reference("people")` validates at
build time by emitting a warning (not an error) when a reference resolves to no
entry — builds still succeed, and `getEntry` returns `undefined` for the
dangling reference. Consumer byline code should fall back gracefully when
`author` can't be resolved (the course-benswift example does this at
`src/pages/news/[slug].astro`). A missing required `author` field (as opposed to
a bad reference) does fail the build via Zod validation.

## 2026-04-13

### Add `getPublishedCollection` helper

New `astro-course-anu/content` subpath exports
`getPublishedCollection(name, filter?)` — a drop-in replacement for
`getCollection` that filters out entries with `published: false`. An optional
secondary filter is applied after the published check, so existing call sites
can collapse from:

```ts
const topics = (await getCollection("topics")).filter(
  (t) => t.data.published && t.data.tags.includes("admin"),
);
```

to:

```ts
const topics = await getPublishedCollection("topics", (t) =>
  t.data.tags.includes("admin"),
);
```

Motivation: the three course schemas all default `published` to `true`, so every
`getCollection` call site in a consumer needed to remember to add
`.filter(e => e.data.published)` to avoid leaking unpublished entries to public
URLs. The fix in 84c0e7c added that filter to each `[slug].astro` in the
course-benswift example, but the duplication across seven call sites was a
signal that the filter belonged in the package. Now consumers get the behaviour
for free.

Safe to use on collections whose schema doesn't define `published` — missing
fields are treated as published.

## 2026-04-12

### Collapse five collections to three (breaking)

The `procedures` and `admin` collections have been removed. The content model
now has three collections, distinguished by genuinely different frontmatter
schemas:

- **topics** — general reusable content, free-form tags and `related`
- **labs** — adds `week` (weekly-indexed exercises)
- **assessments** — adds `week`, `due`, `weight` (graded work)

Anything that used to be a procedure or an admin page is now a topic with a tag
(`practice` for how-to guides, `admin` for policy pages). Consumers render
tag-filtered listing pages at routes like `/admin/` and `/procedures/` that link
back into `/topics/<slug>/`. The topic detail pages own the canonical URL.

**Removed from the public API:**

- `defineProceduresCollection` (drop the import, migrate files to topics)
- `defineAdminCollection` (ditto)
- `procedures` and `admin` keys on `defineCourseCollections()`
- `"procedure"` and `"admin"` as valid `ContentNode.type` values
- `procedures/` and `admin/` as recognised subdirectories of the `courseGraph()`
  content scan (files in those directories are silently ignored, same as any
  other unknown directory)

**Migration:**

1. move `src/content/procedures/*.md` into `src/content/topics/`, adding
   `tags: [practice]` (or whichever tag best fits) to each file
2. move `src/content/admin/*.md` into `src/content/topics/`, adding
   `tags: [admin]` to each file
3. delete `src/pages/procedures/` entirely
4. rewrite `src/pages/admin/index.astro` to filter topics by tag:
   ```astro
   const admin = (await getCollection("topics"))
     .filter((t) => t.data.published && t.data.tags.includes("admin"));
   ```
5. delete `src/pages/admin/[slug].astro` — topic detail pages at
   `/topics/<slug>/` own that content now
6. update any `related:` frontmatter entries that reference `procedure/<slug>`
   or `admin/<slug>` to `topic/<slug>` (or a bare slug if the referring file is
   itself a topic)
7. update navigation links and CardGrid home pages as needed — the `/admin/`
   route still exists as a tag-filtered listing, but `/procedures/` is gone by
   default (consumers can add a `/practice/` route or similar if they want)
8. add `admin` (and any other structural tags) to your `src/tags.ts` registry so
   the listing pages show a proper label

## 2026-04-11

### Extract `astro-course-anu` package

The course-authoring machinery (content graph, topic assembler, reusable Zod
schemas, and the `courseGraph()` build-time integration) has moved out of
`examples/course-benswift` and into a new `packages/astro-course-anu` workspace
package. The example is now a thin starter that installs both `astro-theme-anu`
and `astro-course-anu` — the library code lives in a versioned package with its
own tests and CLAUDE.md.

Package entry points:

- `astro-course-anu` — default export is `courseGraph()`, plus named exports for
  `readCourseNodes`, `resolveGraph`, graph types, etc.
- `astro-course-anu/schemas` — `defineTopicsCollection`, `defineLabsCollection`,
  `defineAssessmentsCollection`, `defineProceduresCollection`,
  `defineAdminCollection`, and `defineCourseCollections()` which returns all
  five at once so a consumer's `content.config.ts` is a one-liner
- `astro-course-anu/topic-assembler` — `assembleTopics` markdown transformer
  (moved from `astro-theme-anu`, which no longer exposes it)

## 2026-04-10

### Course content graph API

The course-benswift template (subsequently extracted into this package) gained a
`courseGraph()` Astro integration that generates a static JSON API under `/api/`
at build time:

- `/api/index.json` — all nodes (topics, labs, assessments, procedures, admin)
  with edges and tags
- `/api/<type>/<slug>.json` — per-node JSON with the full markdown body

Content nodes are linked via an undirected `related` field in frontmatter. Bare
slugs resolve to the same collection type (e.g. `related: [variables]` in a
topic resolves to `topic/variables`); use `type/slug` for cross-type references.
The build fails on dangling references or self-references.

### Procedures content collection

New `procedures` collection alongside topics, labs, assessments, and admin — for
step-by-step how-to guides (submitting work, setting up tools, etc.). Same shape
as topics: `title`, `summary`, `tags`, `related`, `published`.

## 2026-04-07

### Topic assembler for composing slide decks

The astromotion deck preprocess hook can splice topic content into lecture decks
by replacing `<!-- topic: slug -->` HTML comments with the body of the matching
topic file (stripping its frontmatter). Originally landed in the course-benswift
template; now exported as `astro-course-anu/topic-assembler`.

## 2026-04-06

### Free-form tags on topics

Replaced the fixed `kind` enum on topics with free-form string tags, letting
course authors group content however they like.
