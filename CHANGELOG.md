# Changelog

All notable changes to the `astro-course-anu` package. For monorepo-wide
history see the root `CHANGELOG.md`.

## 2026-04-13

### Add `getPublishedCollection` helper

New `astro-course-anu/content` subpath exports
`getPublishedCollection(name, filter?)` — a drop-in replacement for
`getCollection` that filters out entries with `published: false`. An
optional secondary filter is applied after the published check, so
existing call sites can collapse from:

```ts
const topics = (await getCollection("topics")).filter(
  (t) => t.data.published && t.data.tags.includes("admin"),
);
```

to:

```ts
const topics = await getPublishedCollection("topics", (t) => t.data.tags.includes("admin"));
```

Motivation: the three course schemas all default `published` to `true`,
so every `getCollection` call site in a consumer needed to remember to
add `.filter(e => e.data.published)` to avoid leaking unpublished
entries to public URLs. The fix in 84c0e7c added that filter to each
`[slug].astro` in the course-benswift example, but the duplication
across seven call sites was a signal that the filter belonged in the
package. Now consumers get the behaviour for free.

Safe to use on collections whose schema doesn't define `published` —
missing fields are treated as published.

## 2026-04-12

### Collapse five collections to three (breaking)

The `procedures` and `admin` collections have been removed. The content
model now has three collections, distinguished by genuinely different
frontmatter schemas:

- **topics** — general reusable content, free-form tags and `related`
- **labs** — adds `week` (weekly-indexed exercises)
- **assessments** — adds `week`, `due`, `weight` (graded work)

Anything that used to be a procedure or an admin page is now a topic
with a tag (`practice` for how-to guides, `admin` for policy pages).
Consumers render tag-filtered listing pages at routes like `/admin/`
and `/procedures/` that link back into `/topics/<slug>/`. The topic
detail pages own the canonical URL.

**Removed from the public API:**

- `defineProceduresCollection` (drop the import, migrate files to topics)
- `defineAdminCollection` (ditto)
- `procedures` and `admin` keys on `defineCourseCollections()`
- `"procedure"` and `"admin"` as valid `ContentNode.type` values
- `procedures/` and `admin/` as recognised subdirectories of the
  `courseGraph()` content scan (files in those directories are silently
  ignored, same as any other unknown directory)

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
6. update any `related:` frontmatter entries that reference
   `procedure/<slug>` or `admin/<slug>` to `topic/<slug>` (or a bare
   slug if the referring file is itself a topic)
7. update navigation links and CardGrid home pages as needed — the
   `/admin/` route still exists as a tag-filtered listing, but
   `/procedures/` is gone by default (consumers can add a
   `/practice/` route or similar if they want)
8. add `admin` (and any other structural tags) to your `src/tags.ts`
   registry so the listing pages show a proper label

## 2026-04-11

### Extract `astro-course-anu` package

The course-authoring machinery (content graph, topic assembler,
reusable Zod schemas, and the `courseGraph()` build-time integration)
has moved out of `examples/course-benswift` and into a new
`packages/astro-course-anu` workspace package. The example is now a
thin starter that installs both `astro-theme-anu` and
`astro-course-anu` — the library code lives in a versioned package
with its own tests and CLAUDE.md.

Package entry points:

- `astro-course-anu` — default export is `courseGraph()`, plus named
  exports for `readCourseNodes`, `resolveGraph`, graph types, etc.
- `astro-course-anu/schemas` — `defineTopicsCollection`,
  `defineLabsCollection`, `defineAssessmentsCollection`,
  `defineProceduresCollection`, `defineAdminCollection`, and
  `defineCourseCollections()` which returns all five at once so a
  consumer's `content.config.ts` is a one-liner
- `astro-course-anu/topic-assembler` — `assembleTopics` markdown
  transformer (moved from `astro-theme-anu`, which no longer exposes
  it)

## 2026-04-10

### Course content graph API

The course-benswift template (subsequently extracted into this
package) gained a `courseGraph()` Astro integration that generates
a static JSON API under `/api/` at build time:

- `/api/index.json` — all nodes (topics, labs, assessments,
  procedures, admin) with edges and tags
- `/api/<type>/<slug>.json` — per-node JSON with the full markdown
  body

Content nodes are linked via an undirected `related` field in
frontmatter. Bare slugs resolve to the same collection type (e.g.
`related: [variables]` in a topic resolves to `topic/variables`);
use `type/slug` for cross-type references. The build fails on
dangling references or self-references.

### Procedures content collection

New `procedures` collection alongside topics, labs, assessments, and
admin — for step-by-step how-to guides (submitting work, setting up
tools, etc.). Same shape as topics: `title`, `summary`, `tags`,
`related`, `published`.

## 2026-04-07

### Topic assembler for composing slide decks

The astromotion deck preprocess hook can splice topic content into
lecture decks by replacing `<!-- topic: slug -->` HTML comments with
the body of the matching topic file (stripping its frontmatter).
Originally landed in the course-benswift template; now exported as
`astro-course-anu/topic-assembler`.

## 2026-04-06

### Free-form tags on topics

Replaced the fixed `kind` enum on topics with free-form string tags,
letting course authors group content however they like.
