/**
 * Tool Registry - Server-side aggregator.
 * Re-exports from tool-definitions (client-safe) and tool-executors (server-only).
 *
 * For client components: import from "./tool-definitions"
 * For server code: import from "./tool-registry" or "./tool-executors"
 */

// Re-export everything from definitions (types and metadata)
export {
  type ToolCategory,
  type ToolParameter,
  type ToolDefinition,
  TOOL_DEFINITIONS,
  getToolDefinition,
  getToolsForContext,
  getSchedulableTools,
} from "./tool-definitions";

// Re-export execution functions (server-only)
export {
  type ToolContext,
  type ToolResult,
  type ToolExecutor,
  executeTool,
  hasExecutor,
} from "./tool-executors";

// Legacy alias for backwards compatibility
export { TOOL_DEFINITIONS as TOOL_REGISTRY } from "./tool-definitions";
