export interface ExternalLink {
  label: string;
  url: string;
}

/**
 * Course-level metadata: the facts about the course as a whole that the
 * course record states and every course site restates — emitted as a
 * `course` block on `/api/index.json` so the graph API is self-describing.
 * Dates are bare ISO `YYYY-MM-DD` strings, interpreted in the site
 * `timezone` like every other frontmatter date (never rewritten to UTC
 * offsets). Validated by `courseMetaSchema` at config time.
 */
export interface CourseMeta {
  code: string;
  title: string;
  session: string;
  year?: number;
  level?: number;
  startDate: string;
  endDate: string;
  description: string;
  tags: string[];
  learningOutcomes: string[];
}

/** Version of the catalogue-facing `/api/index.json` contract. */
export const COURSE_API_SCHEMA_VERSION = 1;

export interface ContentNode {
  id: string;
  type: string;
  slug: string;
  title: string;
  description?: string;
  tags: string[];
  related: string[];
  links: ExternalLink[];
  /**
   * The deliverable's contract, as plain sentences: what the markers
   * will be considering when judging whether submitted work matches
   * what was required. Some lines may be machine-checkable, many need
   * human judgement — never an input to automatic grading. Empty for
   * nodes that don't get a mark.
   */
  spec: string[];
  meta: Record<string, unknown>;
  body: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphError {
  type: "dangling-ref" | "self-ref";
  node: string;
  ref: string;
  detail: string;
}

export interface ResolvedGraph {
  nodes: ContentNode[];
  edges: GraphEdge[];
  errors: GraphError[];
}

/**
 * Resolve a content ref against the collection it was declared in. A ref
 * is `<collection>/<slug>` — the one address format shared by `related:`
 * entries, `{/* embed: ... *\/}` directives, graph node ids, site URLs
 * (`/<collection>/<slug>/`) and API paths (`/api/<collection>/<slug>.json`).
 * A bare slug is shorthand for "same collection as the declaring node".
 */
export function resolveEdgeTarget(fromCollection: string, rawRef: string): string {
  return rawRef.includes("/") ? rawRef : `${fromCollection}/${rawRef}`;
}

/**
 * Extract content refs from `{/* embed: <ref> *\/}` transclusion
 * directives in a raw markdown/MDX body. An embed implies a `related`
 * edge, so consumers never declare the same connection twice. Any
 * `#section` fragment is stripped — the graph links whole nodes.
 * Returned refs are deduplicated but unresolved (bare slugs pass
 * through); resolve them with `resolveEdgeTarget`.
 */
const EMBED_DIRECTIVE = /\{\s*\/\*\s*embed:\s*([^\s*]+)/g;

export function parseEmbedRefs(body: string): string[] {
  const refs = new Set<string>();
  for (const match of body.matchAll(EMBED_DIRECTIVE)) {
    const ref = match[1].split("#")[0];
    if (ref) refs.add(ref);
  }
  return [...refs];
}

export function resolveGraph(nodes: ContentNode[]): ResolvedGraph {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: GraphEdge[] = [];
  const errors: GraphError[] = [];

  for (const node of nodes) {
    for (const ref of node.related) {
      if (ref === node.id) {
        errors.push({
          type: "self-ref",
          node: node.id,
          ref,
          detail: `${node.id} lists itself as related`,
        });
        continue;
      }
      if (!nodeIds.has(ref)) {
        errors.push({
          type: "dangling-ref",
          node: node.id,
          ref,
          detail: `${node.id} has related "${ref}" which does not exist`,
        });
        continue;
      }
      edges.push({ from: node.id, to: ref });
    }
  }

  return { nodes, edges, errors };
}

interface IndexEntry {
  id: string;
  type: string;
  title: string;
  description?: string;
  tags: string[];
  related: string[];
  spec?: string[];
  meta?: Record<string, unknown>;
}

/**
 * Per-node `related` lists as rendered on the site: declared refs first
 * (in declaration order), then incoming edges from nodes that declared
 * the connection from their side. The API matches the RelatedContent
 * block, so "what relates to X" is answerable from X's node alone.
 */
export function symmetriseRelated(graph: ResolvedGraph): Map<string, string[]> {
  const related = new Map<string, string[]>(graph.nodes.map((n) => [n.id, [...n.related]]));
  for (const edge of graph.edges) {
    const back = related.get(edge.to);
    if (back && !back.includes(edge.from)) back.push(edge.from);
  }
  return related;
}

export function generateIndexJson(
  graph: ResolvedGraph,
  timezone?: string,
  course?: CourseMeta,
  canonicalUrl?: string,
): string {
  const related = symmetriseRelated(graph);
  const entries: IndexEntry[] = graph.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    title: node.title,
    ...(node.description && { description: node.description }),
    tags: node.tags,
    related: related.get(node.id) ?? node.related,
    ...(node.spec.length > 0 && { spec: node.spec }),
    ...(Object.keys(node.meta).length > 0 && { meta: node.meta }),
  }));

  return JSON.stringify(
    {
      schemaVersion: COURSE_API_SCHEMA_VERSION,
      ...(canonicalUrl && { canonicalUrl }),
      ...(course && { course }),
      ...(timezone && { timezone }),
      nodes: entries,
      edges: graph.edges,
    },
    null,
    2,
  );
}

export function generateNodeJson(
  node: ContentNode,
  related: string[] = node.related,
  timezone?: string,
): string {
  return JSON.stringify(
    {
      id: node.id,
      type: node.type,
      title: node.title,
      ...(node.description && { description: node.description }),
      tags: node.tags,
      related,
      links: node.links,
      ...(node.spec.length > 0 && { spec: node.spec }),
      meta: node.meta,
      ...(timezone && { timezone }),
      body: node.body,
    },
    null,
    2,
  );
}
