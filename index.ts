export { default as courseGraph } from "./course-graph-integration.js";
export { default } from "./course-graph-integration.js";
export { courseMetaSchema } from "./course-graph-integration.js";
export type { CourseGraphOptions, CourseMetaInput } from "./course-graph-integration.js";
export { COURSE_API_SCHEMA_VERSION } from "./course-graph.js";

export {
  resolveEdgeTarget,
  parseEmbedRefs,
  resolveGraph,
  symmetriseRelated,
  generateIndexJson,
  generateNodeJson,
} from "./course-graph.js";
export type {
  ContentNode,
  CourseMeta,
  ExternalLink,
  GraphEdge,
  GraphError,
  ResolvedGraph,
} from "./course-graph.js";

export { readCourseNodes, writeCourseApi } from "./course-content.js";
export type { CourseApiResult, CourseCollection } from "./course-content.js";
