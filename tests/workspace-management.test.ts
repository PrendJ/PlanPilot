import { describe, expect, it } from "vitest";
import { canManageWorkspaceAction, workspaceLifecycleChange } from "@/lib/workspace-management";
import { firstPersonalOrganization } from "@/lib/personal-organization";
import { canAssignManualPlan } from "@/lib/licenses";

describe("workspace management permissions", () => {
  it("allows owners to rename, archive and restore", () => {
    expect(canManageWorkspaceAction("OWNER", "rename")).toBe(true);
    expect(canManageWorkspaceAction("OWNER", "archive")).toBe(true);
    expect(canManageWorkspaceAction("OWNER", "restore")).toBe(true);
  });

  it("allows admins to rename but not change lifecycle", () => {
    expect(canManageWorkspaceAction("ADMIN", "rename")).toBe(true);
    expect(canManageWorkspaceAction("ADMIN", "archive")).toBe(false);
    expect(canManageWorkspaceAction("MEMBER", "rename")).toBe(false);
  });

  it("maps archive and restore to reversible lifecycle changes", () => {
    expect(workspaceLifecycleChange("archive")).toMatchObject({ lifecycleStatus:"ARCHIVED" });
    expect(workspaceLifecycleChange("restore")).toEqual({ lifecycleStatus:"ACTIVE", archivedAt:null, suspendedAt:null, deleteAfter:null });
  });
});

describe("personal organization selection", () => {
  const memberships = [
    { organization:{id:"business",createdById:"user-1",legalType:"BUSINESS"} },
    { organization:{id:"personal",createdById:"user-1",legalType:"PERSONAL"} },
    { organization:{id:"invited",createdById:"user-2",legalType:"PERSONAL"} },
  ];

  it("selects only the first personal organization created by the user", () => {
    expect(firstPersonalOrganization("user-1", memberships)?.organization.id).toBe("personal");
  });

  it("does not fall back to another user's organization", () => {
    expect(firstPersonalOrganization("missing", memberships)).toBeNull();
  });
});

describe("manual plan and lifetime access", () => {
  it("requires lifetime access to be revoked before assigning a commercial plan", () => {
    expect(canAssignManualPlan(true, "TEAM")).toBe(false);
    expect(canAssignManualPlan(true, "LIFETIME")).toBe(true);
    expect(canAssignManualPlan(false, "TEAM")).toBe(true);
  });
});
