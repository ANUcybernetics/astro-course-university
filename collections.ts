import type { z } from "astro/zod";
import type { CourseCollection } from "./course-content.js";
import type { courseNodeSchema } from "./node-schema.js";

/**
 * One graph collection, declared once and read from two places: the
 * `astro:content` side (`defineCourseCollections()` turns the spec into
 * Astro collections) and the config side (`courseGraph({ collections })`
 * takes the same object). Keeping a single declaration is the point — the
 * key is the node type, the ref prefix, the API path segment and, by the
 * site's routing convention, the URL segment, so the two halves must agree.
 */
export interface CourseCollectionSpec<
  S extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>,
> {
  /** Directory to walk, relative to `src/`. Defaults to `content/<key>`. */
  dir?: string;
  /** Filename suffix to match (e.g. `".deck.mdx"`). Defaults to `.md`/`.mdx`. */
  suffix?: string;
  /**
   * Extend the shared node schema with the collection's own fields, e.g.
   * `(node) => node.extend({ week: z.number().int() })`. Omit for the bare
   * node shape.
   */
  schema?: (node: typeof courseNodeSchema) => S;
  /**
   * Set to `false` for a key that joins the graph but is not an Astro
   * collection — astromotion decks under `src/decks/`, or a collection the
   * site defines by hand.
   */
  collection?: boolean;
}

/** The whole declaration: collection key → spec. */
export type CourseCollectionsSpec = Record<string, CourseCollectionSpec<any>>;

/** Normalise a spec object (or an already-explicit list) to the list form
 *  the graph reader walks. */
export function toCourseCollections(
  collections: CourseCollection[] | CourseCollectionsSpec,
): CourseCollection[] {
  if (Array.isArray(collections)) return collections;
  return Object.entries(collections).map(([key, spec]) => ({
    key,
    ...(spec.dir ? { dir: spec.dir } : {}),
    ...(spec.suffix ? { suffix: spec.suffix } : {}),
  }));
}
