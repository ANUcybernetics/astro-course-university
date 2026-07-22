import { getCollection } from "astro:content";
import type { CollectionEntry, CollectionKey } from "astro:content";
import { resolveEdgeTarget, parseEmbedRefs } from "./course-graph.js";

/**
 * Drop-in replacement for `getCollection` that filters out entries with
 * `published: false`. The three course schemas from
 * `astro-course-anu/schemas` all default `published` to `true`, so any
 * entry that has been explicitly marked unpublished is excluded.
 *
 * The filter only applies to production builds: the dev server includes
 * unpublished entries so work-in-progress content stays previewable
 * locally, matching astromotion's treatment of unpublished decks.
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
 * Safe to use on collections whose schema does not define `published` —
 * missing fields are treated as published.
 */
export async function getPublishedCollection<C extends CollectionKey>(
  collection: C,
  filter?: (entry: CollectionEntry<C>) => boolean,
): Promise<CollectionEntry<C>[]> {
  return getCollection(collection, (entry) => {
    const data = entry.data as { published?: boolean };
    if (import.meta.env.PROD && data.published === false) return false;
    return filter ? filter(entry) : true;
  });
}

/** The minimal entry shape `getRelatedEntries` reads and returns — a
 *  structural subset of Astro's `CollectionEntry`. */
export interface GraphEntry {
  collection: string;
  id: string;
  data: { title: string; related?: string[]; published?: boolean; description?: string | null };
  body?: string;
}

function refsOf(entry: GraphEntry): string[] {
  const declared = (entry.data.related ?? []).map((r) => resolveEdgeTarget(entry.collection, r));
  const embedded = parseEmbedRefs(entry.body ?? "").map((r) =>
    resolveEdgeTarget(entry.collection, r),
  );
  return [...declared, ...embedded];
}

/**
 * Render-time counterpart of the build-time graph: every published node
 * connected to `entry`, in either direction (in dev, unpublished nodes
 * are included too, mirroring `getPublishedCollection`). `related` is
 * undirected —
 * declare (or embed) on whichever side is convenient and both pages
 * show the connection. Outgoing refs come first, in declaration order
 * (embeds after declared `related`), then incoming.
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
    for (const e of await getCollection(collection as CollectionKey)) {
      const candidate = e as unknown as GraphEntry;
      if (import.meta.env.PROD && candidate.data.published === false) continue;
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
