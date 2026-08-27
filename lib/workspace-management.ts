export type WorkspaceManagementAction = "rename" | "archive" | "restore";

export function canManageWorkspaceAction(role: string, action: WorkspaceManagementAction) {
  return action === "rename" ? role === "OWNER" || role === "ADMIN" : role === "OWNER";
}

export function workspaceLifecycleChange(action: Exclude<WorkspaceManagementAction, "rename">) {
  return action === "archive"
    ? { lifecycleStatus: "ARCHIVED" as const, archivedAt: new Date(), suspendedAt: null }
    : { lifecycleStatus: "ACTIVE" as const, archivedAt: null, suspendedAt: null, deleteAfter: null };
}
