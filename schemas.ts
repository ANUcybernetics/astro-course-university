import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

export interface DefineCourseCollectionOptions {
  /** Base directory for the content glob. Defaults to a per-collection convention. */
  base?: string;
  /** Glob pattern for content files. Defaults to `**\/*.{md,mdx}`. */
  pattern?: string;
  /** Allow arbitrary additional frontmatter fields (default: true). */
  passthrough?: boolean;
}

function loader(base: string, pattern = "**/*.{md,mdx}") {
  return glob({ pattern, base });
}

function maybePassthrough<S extends z.ZodRawShape>(schema: z.ZodObject<S>, passthrough: boolean) {
  return passthrough ? schema.loose() : schema;
}

/**
 * Shared Zod shape for any collection that participates in the course
 * content graph (`courseGraph()` integration). Consumers compose their
 * own collections by extending this with type-specific fields and
 * passing the result to Astro's `defineCollection`:
 *
 * ```ts
 * import { defineCollection } from "astro:content";
 * import { glob } from "astro/loaders";
 * import { courseNodeSchema } from "astro-course-university/schemas";
 *
 * export const collections = {
 *   crits: defineCollection({
 *     loader: glob({ pattern: "**\/*.{md,mdx}", base: "src/content/crits" }),
 *     schema: courseNodeSchema.extend({
 *       week: z.number().int().min(1).max(13),
 *       repo: z.url().nullish(),
 *     }).loose(),
 *   }),
 * };
 * ```
 *
 * The shape fields are the ones `courseGraph()` reads when walking
 * content: `title` and `description` flow into the JSON API (the same
 * `description` astromotion decks put in `<meta name="description">` —
 * one name for the concept across the ecosystem), `tags` drives
 * tag-filtered listings, `related` drives the undirected graph edges
 * (refs to content within the site, `<collection>/<slug>` or a bare
 * same-collection slug), and `links` carries external URLs (rendered
 * alongside related content but never graph edges).
 *
 * `spec` is the deliverable's contract, as plain sentences: what the
 * markers will be considering when they judge whether submitted work
 * matches what was required. Some lines may be machine-checkable (a
 * starter repo's conformance suite can assert them), many need human
 * judgement — it is never an input to automatic grading. Declare it on
 * anything that gets a mark (crits, assessments, labs); leave it empty
 * elsewhere. It flows through the JSON API as a top-level `spec` field
 * and renders via the `SpecList` component.
 *
 * `published`, `unlisted` and `draft` are three orthogonal axes, not one
 * lifecycle. `published: false` is visibility: it keeps the node out of the
 * graph, listings, and llms.txt entirely (the page still builds at its URL,
 * except for astromotion decks, which are dropped from a production build).
 * `unlisted: true` is reach: the node is live and stays live, but nothing
 * points at it — out of listings, the graph and llms.txt, and the theme's
 * layout adds `noindex` and a Pagefind ignore. It is the flag for a page
 * meant for whoever holds the link and nobody else, and unlike `published`
 * it is a permanent property rather than a stage, so it applies in dev too.
 * `draft: true` is finality: the node stays visible everywhere but
 * consumers render it with a not-yet-final marker (llms.txt does this
 * automatically). The combinations are all coherent — an unpublished draft
 * is a preview reachable by URL, banner intact.
 */
export const courseNodeSchema = z.object({
  title: z.string(),
  description: z.string().nullish(),
  tags: z.array(z.string()).default([]),
  related: z.array(z.string()).default([]),
  links: z.array(z.object({ label: z.string(), url: z.url() })).default([]),
  spec: z.array(z.string()).default([]),
  published: z.coerce.boolean().default(true),
  unlisted: z.coerce.boolean().default(false),
  draft: z.coerce.boolean().default(false),
});

/**
 * `people` collection — the cast of the course: convenor, TAs, guest
 * lecturers, and anyone else who gets a byline. Entries may be referenced
 * by `author` fields on other collections. The markdown body is an optional bio.
 *
 * Photos use Astro's `image()` helper so they go through the image
 * pipeline like every other image in the theme. That `image()` wiring
 * is the reason this still ships as a factory rather than as a bare
 * schema like `courseNodeSchema`.
 */
export function definePeopleCollection(options: DefineCourseCollectionOptions = {}) {
  const { base = "src/content/people", pattern, passthrough = true } = options;
  return defineCollection({
    loader: loader(base, pattern),
    schema: ({ image }) =>
      maybePassthrough(
        z.object({
          title: z.string(),
          affiliation: z.string().nullish(),
          role: z.enum(["convenor", "tutor", "guest", "other"]).nullish(),
          email: z.email().nullish(),
          url: z.url().nullish(),
          photo: image().nullish(),
          published: z.coerce.boolean().default(true),
        }),
        passthrough,
      ),
  });
}
