export interface ExternalLink {
  label: string;
  url: string;
}

export interface ContentNode {
  id: string;
  type: string;
  slug: string;
  title: string;
  description?: string;
  tags: string[];
  related: string[];
  links: ExternalLink[];
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
}

export function generateIndexJson(graph: ResolvedGraph): string {
  const entries: IndexEntry[] = graph.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    title: node.title,
    ...(node.description && { description: node.description }),
    tags: node.tags,
    related: node.related,
  }));

  return JSON.stringify({ nodes: entries, edges: graph.edges }, null, 2);
}

export function generateNodeJson(node: ContentNode): string {
  return JSON.stringify(
    {
      id: node.id,
      type: node.type,
      title: node.title,
      ...(node.description && { description: node.description }),
      tags: node.tags,
      related: node.related,
      links: node.links,
      meta: node.meta,
      body: node.body,
    },
    null,
    2,
  );
}
