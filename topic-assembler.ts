import type { Root, Html, RootContent } from "mdast";
import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import { visit } from "unist-util-visit";

const processor = remark().use(remarkFrontmatter);

export function parseTopicDirective(html: string): string | null {
  const trimmed = html.trim();
  if (!trimmed.startsWith("<!--") || !trimmed.endsWith("-->")) return null;
  const body = trimmed.slice(4, -3).trim();
  if (!body.startsWith("topic:")) return null;
  const slug = body.slice("topic:".length).trim().split(/\s/)[0];
  return slug || null;
}

export interface AssembleResult {
  markdown: string;
  warnings: string[];
}

export function assembleTopics(source: string, topics: Record<string, string>): AssembleResult {
  const warnings: string[] = [];
  const tree = processor.parse(source);

  const replacements: { index: number; parent: Root; nodes: RootContent[] }[] = [];

  visit(tree, "html", (node: Html, index, parent) => {
    if (index === undefined || parent === undefined) return;
    const slug = parseTopicDirective(node.value);
    if (!slug) return;
    const topicMarkdown = topics[slug];

    if (topicMarkdown === undefined) {
      warnings.push(`Topic not found: ${slug}`);
      return;
    }

    const topicTree = processor.parse(topicMarkdown);
    const contentNodes = topicTree.children.filter((n) => n.type !== "yaml");
    replacements.push({ index, parent: parent as Root, nodes: contentNodes });
  });

  for (const { index, parent, nodes } of replacements.reverse()) {
    parent.children.splice(index, 1, ...nodes);
  }

  const markdown = processor.stringify(tree);
  return { markdown, warnings };
}
