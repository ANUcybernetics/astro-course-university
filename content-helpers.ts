import { getCollection } from "astro:content";
import type { CollectionEntry, CollectionKey } from "astro:content";
import { resolveEdgeTarget } from "./course-graph.js";

function hasFlag(data: unknown, key: "published" | "unlisted", value: boolean): boolean {
  return typeof data === "object" && data !== null && Reflect.get(data, key) === value;
}

/**
 * Drop-in replacement for `getCollection` that returns the entries fit to
 * list: it drops `published: false` and `unlisted: true`. The course schemas
 * from `astro-course-university/schemas` default `published` to `true` and
 * `unlisted` to `false`, so only an explicit opt-out is excluded.
 *
 * The `published` filter applies to production builds only: the dev server
 * includes unpublished entries so work-in-progress content stays previewable
 * locally, matching astromotion's treatment of unpublished decks. `unlisted`
 * applies everywhere, since it is a permanent property of the entry rather
 * than a stage it passes through — a listing that showed it in dev would be
 * lying about what the built site does.
 *
 * Accepts an optional secondary filter with the same signature as the
 * second argument to `getCollection`, applied after the published check.
 *
 * ```ts
 * // replace:
 * const topics = (await getCollection("topics")).filter(t => t.data.published);
 * // with:
 * const topics = await getPublishedCollection("topics");
 *
 * // with an extra filter:
 * const admin = await getPublishedCollection("topics", (t) =>
 *   t.data.tags.includes("admin"),
 * );
 * ```
 *
 * Safe to use on collections whose schema defines neither field — missing
 * fields are treated as published and listed.
 */
export async function getPublishedCollection<C extends CollectionKey>(
  collection: C,
  filter?: (entry: CollectionEntry<C>) => boolean,
): Promise<CollectionEntry<C>[]> {
  return getCollection(collection, (entry: CollectionEntry<C>) => {
    if (import.meta.env.PROD && hasFlag(entry.data, "published", false)) return false;
    if (hasFlag(entry.data, "unlisted", true)) return false;
    return filter ? filter(entry) : true;
  });
}

/**
 * `getStaticPaths` for a detail route over a graph collection: one page per
 * listable entry (`getPublishedCollection` rules), keyed by the entry id and
 * carrying the entry as a prop.
 *
 * ```astro
 * ---
 * // src/pages/labs/[slug].astro
 * import { getCourseStaticPaths } from "astro-course-university/content";
 * export const getStaticPaths = () => getCourseStaticPaths("labs");
 * const { entry } = Astro.props;
 * ---
 * ```
 */
export async function getCourseStaticPaths<C extends CollectionKey>(
  collection: C,
): Promise<{ params: { slug: string }; props: { entry: CollectionEntry<C> } }[]> {
  const entries = await getPublishedCollection(collection);
  return entries.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}

/** The minimal entry shape `getRelatedEntries` reads and returns — a
 *  structural subset of Astro's `CollectionEntry`. */
export interface GraphEntry {
  collection: string;
  id: string;
  data: {
    title: string;
    related?: string[];
    published?: boolean;
    unlisted?: boolean;
    description?: string | null;
  };
}

function isGraphEntry(e: unknown): e is GraphEntry {
  if (typeof e !== "object" || e === null) return false;
  if (!("collection" in e) || typeof e.collection !== "string") return false;
  if (!("id" in e) || typeof e.id !== "string") return false;
  if (!("data" in e) || typeof e.data !== "object" || e.data === null) return false;
  if (!("title" in e.data) || typeof e.data.title !== "string") return false;
  if (!("related" in e.data) || e.data.related === undefined) return true;
  return Array.isArray(e.data.related) && e.data.related.every((r) => typeof r === "string");
}

function refsOf(entry: GraphEntry): string[] {
  return (entry.data.related ?? []).map((r) => resolveEdgeTarget(entry.collection, r));
}

/**
 * Render-time counterpart of the build-time graph: every listable node
 * connected to `entry`, in either direction (in dev, unpublished nodes
 * are included too, and unlisted ones never are — mirroring
 * `getPublishedCollection`). `related` is undirected —
 * declare on whichever side is convenient and both pages
 * show the connection. Outgoing refs come first, in declaration order
 * then incoming.
 *
 * `collections` must list every graph-participating collection (the
 * same keys passed to `courseGraph()`), since incoming links can come
 * from any of them.
 */
export async function getRelatedEntries(
  entry: GraphEntry,
  collections: string[],
): Promise<GraphEntry[]> {
  const selfId = `${entry.collection}/${entry.id}`;
  const pool = new Map<string, GraphEntry>();
  for (const collection of collections) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the generated key union cannot be enumerated at runtime; callers pass the same keys as courseGraph()
    for (const e of await getCollection(collection as CollectionKey)) {
      if (!isGraphEntry(e)) {
        throw new Error(
          `getRelatedEntries: entry in collection "${collection}" is not a graph entry (needs string collection and id, and data.title as a string)`,
        );
      }
      const candidate = e;
      if (import.meta.env.PROD && candidate.data.published === false) continue;
      if (candidate.data.unlisted === true) continue;
      pool.set(`${collection}/${candidate.id}`, candidate);
    }
  }

  const result = new Map<string, GraphEntry>();
  for (const ref of refsOf(entry)) {
    const target = pool.get(ref);
    if (target && ref !== selfId) result.set(ref, target);
  }
  for (const [id, candidate] of pool) {
    if (id === selfId || result.has(id)) continue;
    if (refsOf(candidate).includes(selfId)) result.set(id, candidate);
  }

  return [...result.values()];
}
