import { describe, expect, it } from "vitest";
import { canManageWorkspaceAction, workspaceLifecycleChange } from "@/lib/workspace-management";
import { canAssignManualPlan } from "@/lib/licenses";
import { canCreateWorkspaceInOrganization, chooseDefaultOrganization } from "@/lib/default-organization";
import { classifyOwnedOrganizations, validInternalOwner } from "@/lib/lifecycle-policy";

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

describe("manual plan and lifetime access", () => {
  it("requires lifetime access to be revoked before assigning a commercial plan", () => {
    expect(canAssignManualPlan(true, "TEAM")).toBe(false);
    expect(canAssignManualPlan(true, "LIFETIME")).toBe(true);
    expect(canAssignManualPlan(false, "TEAM")).toBe(true);
  });
});

describe("default organization provisioning policy", () => {
  it("keeps the current default or selects the first organization created by the user", () => {
    expect(chooseDefaultOrganization({id:"current"},[{id:"first"}])).toEqual({id:"current"});
    expect(chooseDefaultOrganization(null,[{id:"first"},{id:"second"}])).toEqual({id:"first"});
    expect(chooseDefaultOrganization(null,[])).toBeNull();
  });

  it("always allows creation in the default organization and requires an admin role elsewhere", () => {
    expect(canCreateWorkspaceInOrganization("primary","primary","MEMBER")).toBe(true);
    expect(canCreateWorkspaceInOrganization("primary","shared","ADMIN")).toBe(true);
    expect(canCreateWorkspaceInOrganization("primary","shared","MEMBER")).toBe(false);
  });
});

describe("user archival ownership policy", () => {
  const owned=[{id:"primary",legalType:"PERSONAL"},{id:"studio",legalType:"BUSINESS"},{id:"secondary",legalType:"PERSONAL"}];

  it("archives the default and personal organizations but transfers business organizations", () => {
    const result=classifyOwnedOrganizations("primary",owned);
    expect(result.businessToTransfer.map(item=>item.id)).toEqual(["studio"]);
    expect(result.organizationsToArchive.map(item=>item.id)).toEqual(["primary","secondary"]);
  });

  it("accepts only a different active Support or Superadmin as replacement owner", () => {
    expect(validInternalOwner({id:"support",platformRole:"SUPPORT",lifecycleStatus:"ACTIVE"},"user")).toBe(true);
    expect(validInternalOwner({id:"admin",platformRole:"SUPERADMIN",lifecycleStatus:"ACTIVE"},"user")).toBe(true);
    expect(validInternalOwner({id:"user",platformRole:"SUPERADMIN",lifecycleStatus:"ACTIVE"},"user")).toBe(false);
    expect(validInternalOwner({id:"member",platformRole:"USER",lifecycleStatus:"ACTIVE"},"user")).toBe(false);
  });
});
