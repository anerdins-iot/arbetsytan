/**
 * Central registry of AI tools for scheduling and discovery.
 * Used so the AI knows which actions can be scheduled (e.g. reminders, deferred tasks).
 */

export type ToolCategory =
  | "task"
  | "comment"
  | "time"
  | "file"
  | "note"
  | "member"
  | "notification"
  | "project"
  | "report"
  | "automation";

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "date" | "enum" | "object";
  required: boolean;
  description: string;
  enumValues?: string[];
}

export interface ToolDefinition {
  name: string;
  category: ToolCategory;
  description: string;
  availableIn: ("project" | "personal")[];
  requiresProjectId: boolean;
  parameters: ToolParameter[];
}

/** Tools that can be run at a scheduled time (e.g. reminders, deferred creates). */
const SCHEDULABLE_TOOL_NAMES = new Set([
  "notify",
  "createTask",
  "createTimeEntry",
  "createComment",
  "createNote",
  "createPersonalNote",
]);

export const TOOL_REGISTRY: ToolDefinition[] = [
  // ─── Task ─────────────────────────────────────────────
  {
    name: "createTask",
    category: "task",
    description: "Create a new task in a project. Provide title, optional description, priority (LOW, MEDIUM, HIGH, URGENT), optional deadline (ISO date). In project context can assign via assigneeMembershipId.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID (required in personal context; implicit in project context)" },
      { name: "title", type: "string", required: true, description: "Task title" },
      { name: "description", type: "string", required: false, description: "Task description" },
      { name: "priority", type: "enum", required: false, description: "Priority", enumValues: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
      { name: "deadline", type: "date", required: false, description: "Deadline in ISO format YYYY-MM-DD" },
      { name: "assigneeMembershipId", type: "string", required: false, description: "Membership ID to assign (project context only); sends message to personal AI" },
    ],
  },
  {
    name: "updateTask",
    category: "task",
    description: "Update an existing task. Provide taskId and fields to change (title, description, status, priority, deadline).",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID (required in personal context; implicit in project context)" },
      { name: "taskId", type: "string", required: true, description: "Task ID" },
      { name: "title", type: "string", required: false, description: "New title" },
      { name: "description", type: "string", required: false, description: "New description" },
      { name: "status", type: "enum", required: false, description: "Status", enumValues: ["TODO", "IN_PROGRESS", "DONE"] },
      { name: "priority", type: "enum", required: false, description: "Priority", enumValues: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
      { name: "deadline", type: "date", required: false, description: "New deadline or null" },
    ],
  },
  {
    name: "deleteTask",
    category: "task",
    description: "Permanently delete a task and its assignments. Requires confirmDeletion: true.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID (required in personal context; implicit in project context)" },
      { name: "taskId", type: "string", required: true, description: "Task ID to delete" },
      { name: "confirmDeletion", type: "boolean", required: true, description: "Must be true to confirm permanent deletion" },
    ],
  },
  {
    name: "assignTask",
    category: "task",
    description: "Assign a task to a project member. Provide taskId and membershipId (from getProjectMembers). Sends a message to the assignee's personal AI.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID (required in personal context; implicit in project context)" },
      { name: "taskId", type: "string", required: true, description: "Task ID" },
      { name: "membershipId", type: "string", required: true, description: "Membership ID of assignee (from getProjectMembers)" },
    ],
  },
  {
    name: "unassignTask",
    category: "task",
    description: "Remove a task assignment from a project member. Provide taskId and membershipId.",
    availableIn: ["project"],
    requiresProjectId: false,
    parameters: [
      { name: "taskId", type: "string", required: true, description: "Task ID" },
      { name: "membershipId", type: "string", required: true, description: "Membership ID to unassign" },
    ],
  },
  // ─── Comment ──────────────────────────────────────────
  {
    name: "createComment",
    category: "comment",
    description: "Add a comment to a task. Used for status updates, questions, or information about the task.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID (required in personal context; implicit in project context)" },
      { name: "taskId", type: "string", required: true, description: "Task ID to comment on" },
      { name: "content", type: "string", required: true, description: "Comment content (1–5000 chars)" },
    ],
  },
  {
    name: "updateComment",
    category: "comment",
    description: "Update an existing comment. Only the comment author can update.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID (required in personal context; implicit in project context)" },
      { name: "commentId", type: "string", required: true, description: "Comment ID" },
      { name: "content", type: "string", required: true, description: "New content (1–5000 chars)" },
    ],
  },
  {
    name: "deleteComment",
    category: "comment",
    description: "Delete a comment. Only the comment author can delete.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID (required in personal context; implicit in project context)" },
      { name: "commentId", type: "string", required: true, description: "Comment ID to delete" },
    ],
  },
  // ─── Time ─────────────────────────────────────────────
  {
    name: "createTimeEntry",
    category: "time",
    description: "Create a time entry for a task. Provide taskId, minutes or hours, date (YYYY-MM-DD), and optional description.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID (required in personal context; implicit in project context)" },
      { name: "taskId", type: "string", required: true, description: "Task ID" },
      { name: "minutes", type: "number", required: false, description: "Duration in minutes (use minutes or hours)" },
      { name: "hours", type: "number", required: false, description: "Duration in hours (converted to minutes)" },
      { name: "date", type: "date", required: true, description: "Date in YYYY-MM-DD format" },
      { name: "description", type: "string", required: false, description: "Optional description of work done" },
    ],
  },
  {
    name: "updateTimeEntry",
    category: "time",
    description: "Update an existing time entry. Only the user who created it can update.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID (required in personal context; implicit in project context)" },
      { name: "timeEntryId", type: "string", required: true, description: "Time entry ID" },
      { name: "taskId", type: "string", required: false, description: "New task (if moving entry)" },
      { name: "minutes", type: "number", required: false, description: "New duration in minutes" },
      { name: "hours", type: "number", required: false, description: "New duration in hours" },
      { name: "date", type: "date", required: false, description: "New date YYYY-MM-DD" },
      { name: "description", type: "string", required: false, description: "New description" },
    ],
  },
  {
    name: "deleteTimeEntry",
    category: "time",
    description: "Delete a time entry. Only the user who created it can delete.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID (required in personal context; implicit in project context)" },
      { name: "timeEntryId", type: "string", required: true, description: "Time entry ID to delete" },
    ],
  },
  // ─── Note (project) ────────────────────────────────────
  {
    name: "createNote",
    category: "note",
    description: "Create a project note (decisions, technical info, customer requests, etc.).",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID (required in personal context; implicit in project context)" },
      { name: "content", type: "string", required: true, description: "Note content" },
      { name: "title", type: "string", required: false, description: "Optional title" },
      { name: "category", type: "enum", required: false, description: "Category", enumValues: ["beslut", "teknisk_info", "kundönskemål", "viktig_info", "övrigt"] },
    ],
  },
  {
    name: "updateNote",
    category: "note",
    description: "Update an existing project note.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID (required in personal context; implicit in project context)" },
      { name: "noteId", type: "string", required: true, description: "Note ID" },
      { name: "content", type: "string", required: false, description: "New content" },
      { name: "title", type: "string", required: false, description: "New title" },
      { name: "category", type: "enum", required: false, description: "New category", enumValues: ["beslut", "teknisk_info", "kundönskemål", "viktig_info", "övrigt"] },
    ],
  },
  {
    name: "deleteNote",
    category: "note",
    description: "Delete a project note.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID (required in personal context; implicit in project context)" },
      { name: "noteId", type: "string", required: true, description: "Note ID to delete" },
    ],
  },
  // ─── Personal note ────────────────────────────────────
  {
    name: "createPersonalNote",
    category: "note",
    description: "Create a personal note (not linked to any project). For personal thoughts, ideas, or information.",
    availableIn: ["personal"],
    requiresProjectId: false,
    parameters: [
      { name: "content", type: "string", required: true, description: "Note content" },
      { name: "title", type: "string", required: false, description: "Optional title" },
      { name: "category", type: "enum", required: false, description: "Category", enumValues: ["beslut", "teknisk_info", "kundönskemål", "viktig_info", "övrigt"] },
    ],
  },
  {
    name: "updatePersonalNote",
    category: "note",
    description: "Update a personal note.",
    availableIn: ["personal"],
    requiresProjectId: false,
    parameters: [
      { name: "noteId", type: "string", required: true, description: "Note ID" },
      { name: "content", type: "string", required: false, description: "New content" },
      { name: "title", type: "string", required: false, description: "New title" },
      { name: "category", type: "enum", required: false, description: "New category", enumValues: ["beslut", "teknisk_info", "kundönskemål", "viktig_info", "övrigt"] },
    ],
  },
  {
    name: "deletePersonalNote",
    category: "note",
    description: "Delete a personal note.",
    availableIn: ["personal"],
    requiresProjectId: false,
    parameters: [
      { name: "noteId", type: "string", required: true, description: "Note ID to delete" },
    ],
  },
  // ─── Report ───────────────────────────────────────────
  {
    name: "generateProjectReport",
    category: "report",
    description: "Generate an AI-written project report (tasks, status, time entries, members). Saved as PDF in the project files.",
    availableIn: ["project"],
    requiresProjectId: false,
    parameters: [
      { name: "fileName", type: "string", required: false, description: "PDF filename, e.g. projektrapport.pdf; default: projektrapport-[date].pdf" },
      { name: "includeTimeReport", type: "boolean", required: false, description: "Include time reports in the report (default true)" },
    ],
  },
  // ─── Notification ──────────────────────────────────────
  {
    name: "notify",
    category: "notification",
    description: "Send a notification to the user (e.g. reminder, alert). Use for scheduled reminders.",
    availableIn: ["project", "personal"],
    requiresProjectId: false,
    parameters: [
      { name: "message", type: "string", required: true, description: "Notification message to show the user" },
      { name: "title", type: "string", required: false, description: "Optional notification title" },
    ],
  },
  // ─── Automation ────────────────────────────────────────
  {
    name: "createAutomation",
    category: "automation",
    description:
      "Create a scheduled automation that runs an action at a specific time or on a recurring schedule. Use natural language for schedule: 'tomorrow at 8', 'in 2 hours', 'every day at 9', 'every Monday at 8'.",
    availableIn: ["project", "personal"],
    requiresProjectId: false,
    parameters: [
      { name: "name", type: "string", required: true, description: "Name of the automation" },
      { name: "description", type: "string", required: false, description: "Optional description" },
      { name: "schedule", type: "string", required: true, description: "When to run: 'tomorrow at 8', 'in 2 hours', 'every day at 9', etc." },
      { name: "actionTool", type: "string", required: true, description: "Tool to execute: createTask, notify, updateTask, etc." },
      { name: "actionParams", type: "object", required: true, description: "Parameters for the tool (key-value object)" },
      { name: "projectId", type: "string", required: false, description: "Project ID (personal context only; required for project-scoped automation)" },
    ],
  },
  {
    name: "listAutomations",
    category: "automation",
    description: "List scheduled automations. In personal context optionally filter by projectId.",
    availableIn: ["project", "personal"],
    requiresProjectId: false,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID to filter by (personal context only)" },
    ],
  },
  {
    name: "deleteAutomation",
    category: "automation",
    description: "Delete a scheduled automation. Provide automationId from listAutomations.",
    availableIn: ["project", "personal"],
    requiresProjectId: false,
    parameters: [
      { name: "automationId", type: "string", required: true, description: "Automation ID to delete" },
    ],
  },
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

export function getToolsForContext(context: "project" | "personal"): ToolDefinition[] {
  return TOOL_REGISTRY.filter((t) => t.availableIn.includes(context));
}

export function getSchedulableTools(): ToolDefinition[] {
  return TOOL_REGISTRY.filter((t) => SCHEDULABLE_TOOL_NAMES.has(t.name));
}
