/**
 * Tool definitions - metadata only.
 * Safe to import from client components.
 * Executors are in tool-executors.ts (server-only)
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
  | "automation"
  | "email";

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
  schedulable: boolean;
  parameters: ToolParameter[];
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // ─── Task ─────────────────────────────────────────────
  {
    name: "createTask",
    category: "task",
    description: "Create a new task in a project. Provide title, optional description, priority (LOW, MEDIUM, HIGH, URGENT), optional deadline (ISO date).",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    schedulable: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID (required in personal context)" },
      { name: "title", type: "string", required: true, description: "Task title" },
      { name: "description", type: "string", required: false, description: "Task description" },
      { name: "priority", type: "enum", required: false, description: "Priority", enumValues: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
      { name: "deadline", type: "date", required: false, description: "Deadline in ISO format YYYY-MM-DD" },
    ],
  },
  {
    name: "updateTask",
    category: "task",
    description: "Update an existing task. Provide taskId and fields to change.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    schedulable: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID" },
      { name: "taskId", type: "string", required: true, description: "Task ID" },
      { name: "title", type: "string", required: false, description: "New title" },
      { name: "description", type: "string", required: false, description: "New description" },
      { name: "status", type: "enum", required: false, description: "Status", enumValues: ["TODO", "IN_PROGRESS", "DONE"] },
      { name: "priority", type: "enum", required: false, description: "Priority", enumValues: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
      { name: "deadline", type: "date", required: false, description: "New deadline" },
    ],
  },
  {
    name: "deleteTask",
    category: "task",
    description: "Permanently delete a task. Requires confirmDeletion: true.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    schedulable: false,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID" },
      { name: "taskId", type: "string", required: true, description: "Task ID" },
      { name: "confirmDeletion", type: "boolean", required: true, description: "Must be true" },
    ],
  },
  {
    name: "assignTask",
    category: "task",
    description: "Assign a task to a project member.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    schedulable: false,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID" },
      { name: "taskId", type: "string", required: true, description: "Task ID" },
      { name: "membershipId", type: "string", required: true, description: "Membership ID of assignee" },
    ],
  },
  {
    name: "unassignTask",
    category: "task",
    description: "Remove a task assignment.",
    availableIn: ["project"],
    requiresProjectId: false,
    schedulable: false,
    parameters: [
      { name: "taskId", type: "string", required: true, description: "Task ID" },
      { name: "membershipId", type: "string", required: true, description: "Membership ID" },
    ],
  },
  // ─── Comment ──────────────────────────────────────────
  {
    name: "createComment",
    category: "comment",
    description: "Add a comment to a task.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    schedulable: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID" },
      { name: "taskId", type: "string", required: true, description: "Task ID" },
      { name: "content", type: "string", required: true, description: "Comment content" },
    ],
  },
  {
    name: "updateComment",
    category: "comment",
    description: "Update an existing comment.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    schedulable: false,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID" },
      { name: "commentId", type: "string", required: true, description: "Comment ID" },
      { name: "content", type: "string", required: true, description: "New content" },
    ],
  },
  {
    name: "deleteComment",
    category: "comment",
    description: "Delete a comment.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    schedulable: false,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID" },
      { name: "commentId", type: "string", required: true, description: "Comment ID" },
    ],
  },
  // ─── Time ─────────────────────────────────────────────
  {
    name: "createTimeEntry",
    category: "time",
    description: "Create a time entry for a task.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    schedulable: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID" },
      { name: "taskId", type: "string", required: false, description: "Task ID" },
      { name: "minutes", type: "number", required: false, description: "Duration in minutes" },
      { name: "hours", type: "number", required: false, description: "Duration in hours" },
      { name: "date", type: "date", required: true, description: "Date YYYY-MM-DD" },
      { name: "description", type: "string", required: false, description: "Description" },
    ],
  },
  {
    name: "updateTimeEntry",
    category: "time",
    description: "Update a time entry.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    schedulable: false,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID" },
      { name: "timeEntryId", type: "string", required: true, description: "Time entry ID" },
      { name: "taskId", type: "string", required: false, description: "New task" },
      { name: "minutes", type: "number", required: false, description: "New duration" },
      { name: "hours", type: "number", required: false, description: "New duration in hours" },
      { name: "date", type: "date", required: false, description: "New date" },
      { name: "description", type: "string", required: false, description: "New description" },
    ],
  },
  {
    name: "deleteTimeEntry",
    category: "time",
    description: "Delete a time entry.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    schedulable: false,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID" },
      { name: "timeEntryId", type: "string", required: true, description: "Time entry ID" },
    ],
  },
  // ─── Note ─────────────────────────────────────────────
  {
    name: "createNote",
    category: "note",
    description: "Create a project note.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    schedulable: true,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID" },
      { name: "content", type: "string", required: true, description: "Note content" },
      { name: "title", type: "string", required: false, description: "Title" },
      { name: "category", type: "enum", required: false, description: "Category", enumValues: ["beslut", "teknisk_info", "kundönskemål", "viktig_info", "övrigt"] },
    ],
  },
  {
    name: "updateNote",
    category: "note",
    description: "Update a project note.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    schedulable: false,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID" },
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
    schedulable: false,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Project ID" },
      { name: "noteId", type: "string", required: true, description: "Note ID" },
    ],
  },
  // ─── Personal Note ────────────────────────────────────
  {
    name: "createPersonalNote",
    category: "note",
    description: "Create a personal note (not linked to project).",
    availableIn: ["personal"],
    requiresProjectId: false,
    schedulable: true,
    parameters: [
      { name: "content", type: "string", required: true, description: "Note content" },
      { name: "title", type: "string", required: false, description: "Title" },
      { name: "category", type: "enum", required: false, description: "Category", enumValues: ["beslut", "teknisk_info", "kundönskemål", "viktig_info", "övrigt"] },
    ],
  },
  {
    name: "updatePersonalNote",
    category: "note",
    description: "Update a personal note.",
    availableIn: ["personal"],
    requiresProjectId: false,
    schedulable: false,
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
    schedulable: false,
    parameters: [
      { name: "noteId", type: "string", required: true, description: "Note ID" },
    ],
  },
  // ─── Files ────────────────────────────────────────────
  {
    name: "getPersonalFiles",
    category: "file",
    description: "Get user's personal files.",
    availableIn: ["personal"],
    requiresProjectId: false,
    schedulable: false,
    parameters: [
      { name: "limit", type: "number", required: false, description: "Max files (default 50)" },
    ],
  },
  {
    name: "analyzePersonalFile",
    category: "file",
    description: "Get OCR text for a personal file.",
    availableIn: ["personal"],
    requiresProjectId: false,
    schedulable: false,
    parameters: [
      { name: "fileId", type: "string", required: true, description: "File ID" },
    ],
  },
  {
    name: "movePersonalFileToProject",
    category: "file",
    description: "Move a personal file to a project.",
    availableIn: ["personal"],
    requiresProjectId: false,
    schedulable: false,
    parameters: [
      { name: "fileId", type: "string", required: true, description: "File ID" },
      { name: "projectId", type: "string", required: true, description: "Target project ID" },
      { name: "deleteOriginal", type: "boolean", required: false, description: "Delete original after copy" },
    ],
  },
  // ─── Report ───────────────────────────────────────────
  {
    name: "generateProjectReport",
    category: "report",
    description: "Generate an AI-written project report as PDF.",
    availableIn: ["project"],
    requiresProjectId: false,
    schedulable: false, // Complex, handled separately
    parameters: [
      { name: "fileName", type: "string", required: false, description: "PDF filename" },
      { name: "includeTimeReport", type: "boolean", required: false, description: "Include time reports" },
    ],
  },
  // ─── Notification ─────────────────────────────────────
  {
    name: "notify",
    category: "notification",
    description: "Send a notification to the user via in-app, email, and push (based on user preferences).",
    availableIn: ["project", "personal"],
    requiresProjectId: false,
    schedulable: true,
    parameters: [
      { name: "message", type: "string", required: true, description: "Notification message" },
      { name: "title", type: "string", required: false, description: "Notification title" },
      { name: "sendEmail", type: "boolean", required: false, description: "Also send via email (default: true if user has email enabled)" },
      { name: "sendPush", type: "boolean", required: false, description: "Also send push notification (default: true if user has push enabled)" },
    ],
  },
  // ─── Automation ───────────────────────────────────────
  {
    name: "createAutomation",
    category: "automation",
    description: "Create a scheduled automation. Use natural language: 'tomorrow at 8', 'every Monday at 9'.",
    availableIn: ["project", "personal"],
    requiresProjectId: false,
    schedulable: false, // Meta - creates automations, not scheduled itself
    parameters: [
      { name: "name", type: "string", required: true, description: "Automation name" },
      { name: "description", type: "string", required: false, description: "Description" },
      { name: "schedule", type: "string", required: true, description: "When to run" },
      { name: "actionTool", type: "string", required: true, description: "Tool to execute" },
      { name: "actionParams", type: "object", required: true, description: "Tool parameters" },
      { name: "projectId", type: "string", required: false, description: "Project ID" },
    ],
  },
  {
    name: "listAutomations",
    category: "automation",
    description: "List scheduled automations.",
    availableIn: ["project", "personal"],
    requiresProjectId: false,
    schedulable: false,
    parameters: [
      { name: "projectId", type: "string", required: false, description: "Filter by project" },
    ],
  },
  {
    name: "deleteAutomation",
    category: "automation",
    description: "Delete a scheduled automation.",
    availableIn: ["project", "personal"],
    requiresProjectId: false,
    schedulable: false,
    parameters: [
      { name: "automationId", type: "string", required: true, description: "Automation ID" },
    ],
  },
  // ─── Member ───────────────────────────────────────────
  {
    name: "listMembers",
    category: "member",
    description: "Get list of members in a project.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    schedulable: false,
    parameters: [
      { name: "projectId", type: "string", required: true, description: "Project ID" },
    ],
  },
  {
    name: "getAvailableMembers",
    category: "member",
    description: "Get list of company members that can be added to a project.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    schedulable: false,
    parameters: [
      { name: "projectId", type: "string", required: true, description: "Project ID" },
    ],
  },
  {
    name: "addMember",
    category: "member",
    description: "Add a member to a project.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    schedulable: false,
    parameters: [
      { name: "projectId", type: "string", required: true, description: "Project ID" },
      { name: "membershipId", type: "string", required: true, description: "Membership ID to add" },
    ],
  },
  {
    name: "removeMember",
    category: "member",
    description: "Remove a member from a project.",
    availableIn: ["project", "personal"],
    requiresProjectId: true,
    schedulable: false,
    parameters: [
      { name: "projectId", type: "string", required: true, description: "Project ID" },
      { name: "membershipId", type: "string", required: true, description: "Membership ID to remove" },
    ],
  },
  // ─── Email ─────────────────────────────────────────────
  {
    name: "prepareEmailToExternalRecipients",
    category: "email",
    description: "Prepare an email to external recipients. Returns a preview for user confirmation before sending.",
    availableIn: ["personal"],
    requiresProjectId: false,
    schedulable: false,
    parameters: [
      { name: "recipients", type: "string", required: true, description: "Comma-separated list of email addresses" },
      { name: "subject", type: "string", required: true, description: "Email subject" },
      { name: "body", type: "string", required: true, description: "Email body text" },
      { name: "replyTo", type: "string", required: false, description: "Optional reply-to address" },
    ],
  },
  {
    name: "prepareEmailToTeamMembers",
    category: "email",
    description: "Prepare an email to team members. Returns a preview for user confirmation before sending.",
    availableIn: ["personal"],
    requiresProjectId: false,
    schedulable: false,
    parameters: [
      { name: "memberIds", type: "string", required: true, description: "Comma-separated list of member IDs" },
      { name: "subject", type: "string", required: true, description: "Email subject" },
      { name: "body", type: "string", required: true, description: "Email body text" },
    ],
  },
  {
    name: "getTeamMembersForEmailTool",
    category: "email",
    description: "Get list of all company team members that can receive emails.",
    availableIn: ["personal"],
    requiresProjectId: false,
    schedulable: false,
    parameters: [],
  },
  {
    name: "getProjectMembersForEmailTool",
    category: "email",
    description: "Get list of members in a specific project that can receive emails.",
    availableIn: ["personal", "project"],
    requiresProjectId: false,
    schedulable: false,
    parameters: [
      { name: "projectId", type: "string", required: true, description: "Project ID to get members from" },
    ],
  },
  {
    name: "getProjectsForEmailTool",
    category: "email",
    description: "Get list of projects with member counts that the user has access to.",
    availableIn: ["personal"],
    requiresProjectId: false,
    schedulable: false,
    parameters: [],
  },
  {
    name: "prepareEmailToProjectMembers",
    category: "email",
    description: "Prepare an email to project members. Returns a preview for user confirmation before sending.",
    availableIn: ["personal", "project"],
    requiresProjectId: false,
    schedulable: false,
    parameters: [
      { name: "projectId", type: "string", required: true, description: "Project ID" },
      { name: "memberIds", type: "string", required: false, description: "Comma-separated member IDs (optional - all project members if omitted)" },
      { name: "subject", type: "string", required: true, description: "Email subject" },
      { name: "body", type: "string", required: true, description: "Email body text" },
    ],
  },
];

// ─────────────────────────────────────────
// Helper Functions (client-safe)
// ─────────────────────────────────────────

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

export function getToolsForContext(context: "project" | "personal"): ToolDefinition[] {
  return TOOL_DEFINITIONS.filter((t) => t.availableIn.includes(context));
}

export function getSchedulableTools(): ToolDefinition[] {
  return TOOL_DEFINITIONS.filter((t) => t.schedulable);
}
