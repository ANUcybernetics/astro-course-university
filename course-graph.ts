export interface ContentNode {
  id: string;
  type: string;
  slug: string;
  title: string;
  description?: string;
  tags: string[];
  related: string[];
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

export function resolveEdgeTarget(fromType: string, rawRef: string): string {
  return rawRef.includes("/") ? rawRef : `${fromType}/${rawRef}`;
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
      meta: node.meta,
      body: node.body,
    },
    null,
    2,
  );
}
