export { default as courseGraph } from "./course-graph-integration.js";
export { default } from "./course-graph-integration.js";
export type { CourseGraphOptions } from "./course-graph-integration.js";

export {
  resolveEdgeTarget,
  parseEmbedRefs,
  resolveGraph,
  generateIndexJson,
  generateNodeJson,
} from "./course-graph.js";
export type {
  ContentNode,
  ExternalLink,
  GraphEdge,
  GraphError,
  ResolvedGraph,
} from "./course-graph.js";

export { readCourseNodes, writeCourseApi } from "./course-content.js";
export type { CourseApiResult, CourseCollection } from "./course-content.js";
