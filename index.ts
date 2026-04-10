export { default as courseGraph } from "./course-graph-integration.js";
export { default } from "./course-graph-integration.js";

export {
  resolveEdgeTarget,
  resolveGraph,
  generateIndexJson,
  generateNodeJson,
} from "./course-graph.js";
export type { ContentNode, GraphEdge, GraphError, ResolvedGraph } from "./course-graph.js";

export { readCourseNodes, writeCourseApi } from "./course-content.js";
export type { CourseApiResult } from "./course-content.js";

export { parseTopicDirective, assembleTopics } from "./topic-assembler.js";
export type { AssembleResult } from "./topic-assembler.js";
