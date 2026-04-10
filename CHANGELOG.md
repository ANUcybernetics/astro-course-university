# Changelog

All notable changes to the `astro-course-anu` package. For monorepo-wide
history see the root `CHANGELOG.md`.

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
