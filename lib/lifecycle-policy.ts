export type OwnedOrganization = { id:string; legalType:string };

export function classifyOwnedOrganizations(defaultOrganizationId:string|null, organizations:OwnedOrganization[]) {
  const businessToTransfer = organizations.filter(organization=>organization.id!==defaultOrganizationId&&organization.legalType==="BUSINESS");
  return {
    businessToTransfer,
    organizationsToArchive: organizations.filter(organization=>!businessToTransfer.some(business=>business.id===organization.id)),
  };
}

export function validInternalOwner(candidate:{id:string;platformRole:string;lifecycleStatus:string}|null, archivedUserId:string) {
  return Boolean(candidate&&candidate.id!==archivedUserId&&candidate.lifecycleStatus==="ACTIVE"&&["SUPPORT","SUPERADMIN"].includes(candidate.platformRole));
}
