export const ATLAS_PUBLICATION_AUTHORITY_SCHEMA_VERSION = 1 as const;
export const ATLAS_PUBLICATION_AUTHORITY_SCOPE =
  "atlas-public-seed-approval-authority-v1" as const;

export const ATLAS_AUTHORITY_ID_GRAMMAR =
  "authority:<1-64 lowercase ASCII letters, digits, dots, underscores, or hyphens>";
export const ATLAS_GOVERNANCE_PRINCIPAL_ID_GRAMMAR =
  "principal:<1-64 lowercase ASCII letters, digits, dots, underscores, or hyphens>";

declare const authorityIdBrand: unique symbol;
declare const governancePrincipalIdBrand: unique symbol;

export type AtlasAuthorityId = string & {
  readonly [authorityIdBrand]: true;
};
export type AtlasGovernancePrincipalId = string & {
  readonly [governancePrincipalIdBrand]: true;
};

export interface AtlasPublicationAuthority {
  readonly authorityId: AtlasAuthorityId;
  readonly approverIds: readonly AtlasGovernancePrincipalId[];
}

export interface AtlasPublicationAuthorityContractV1 {
  readonly schemaVersion: typeof ATLAS_PUBLICATION_AUTHORITY_SCHEMA_VERSION;
  readonly scope: typeof ATLAS_PUBLICATION_AUTHORITY_SCOPE;
  readonly authorities: readonly AtlasPublicationAuthority[];
}

export type AtlasPublicationAuthorityContractParseResult =
  | {
      readonly ok: true;
      readonly value: AtlasPublicationAuthorityContractV1;
    }
  | { readonly ok: false; readonly reason: string };

const AUTHORITY_ID_PATTERN =
  /^authority:[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const GOVERNANCE_PRINCIPAL_ID_PATTERN =
  /^principal:[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

function isExactRecord(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => keys.includes(key))
  );
}

export function isAtlasAuthorityId(value: unknown): value is AtlasAuthorityId {
  return typeof value === "string" && AUTHORITY_ID_PATTERN.test(value);
}

export function isAtlasGovernancePrincipalId(
  value: unknown,
): value is AtlasGovernancePrincipalId {
  return (
    typeof value === "string" && GOVERNANCE_PRINCIPAL_ID_PATTERN.test(value)
  );
}

export function parseAtlasPublicationAuthorityContract(
  value: unknown,
): AtlasPublicationAuthorityContractParseResult {
  if (
    !isExactRecord(value, ["schemaVersion", "scope", "authorities"]) ||
    value.schemaVersion !== ATLAS_PUBLICATION_AUTHORITY_SCHEMA_VERSION ||
    value.scope !== ATLAS_PUBLICATION_AUTHORITY_SCOPE ||
    !Array.isArray(value.authorities)
  ) {
    return { ok: false, reason: "invalid authority contract envelope" };
  }

  const authorityIds = new Set<string>();
  const approverIds = new Set<string>();
  const authorities: AtlasPublicationAuthority[] = [];

  for (const authority of value.authorities) {
    if (
      !isExactRecord(authority, ["authorityId", "approverIds"]) ||
      !isAtlasAuthorityId(authority.authorityId) ||
      !Array.isArray(authority.approverIds) ||
      authority.approverIds.length === 0
    ) {
      return { ok: false, reason: "invalid authority entry" };
    }
    if (authorityIds.has(authority.authorityId)) {
      return { ok: false, reason: "duplicate authority id" };
    }

    const parsedApproverIds: AtlasGovernancePrincipalId[] = [];
    for (const approverId of authority.approverIds) {
      if (!isAtlasGovernancePrincipalId(approverId)) {
        return { ok: false, reason: "invalid approver principal id" };
      }
      if (approverIds.has(approverId)) {
        return { ok: false, reason: "duplicate approver principal id" };
      }
      approverIds.add(approverId);
      parsedApproverIds.push(approverId);
    }

    authorityIds.add(authority.authorityId);
    authorities.push({
      authorityId: authority.authorityId,
      approverIds: parsedApproverIds,
    });
  }

  return {
    ok: true,
    value: {
      schemaVersion: ATLAS_PUBLICATION_AUTHORITY_SCHEMA_VERSION,
      scope: ATLAS_PUBLICATION_AUTHORITY_SCOPE,
      authorities,
    },
  };
}

export function isEligibleAtlasPublicationApprover(
  contractValue: unknown,
  authorityId: unknown,
  approverId: unknown,
  maintenanceOwnerId: unknown,
): boolean {
  const contract = parseAtlasPublicationAuthorityContract(contractValue);
  if (
    !contract.ok ||
    !isAtlasAuthorityId(authorityId) ||
    !isAtlasGovernancePrincipalId(approverId) ||
    !isAtlasGovernancePrincipalId(maintenanceOwnerId) ||
    approverId === maintenanceOwnerId
  ) {
    return false;
  }

  return contract.value.authorities.some(
    (authority) =>
      authority.authorityId === authorityId &&
      authority.approverIds.includes(approverId),
  );
}

/**
 * Coordinator-owned eligibility roster for public seed approval signers.
 *
 * Roster membership only makes a principal eligible to sign a separate E1
 * approval that is bound to an exact site, source, song catalog, and hash. It
 * never grants seed GO or permission to publish, merge, push, or deploy.
 */
export const ATLAS_PUBLICATION_AUTHORITY_CONTRACT = Object.freeze({
  schemaVersion: ATLAS_PUBLICATION_AUTHORITY_SCHEMA_VERSION,
  scope: ATLAS_PUBLICATION_AUTHORITY_SCOPE,
  authorities: Object.freeze([
    Object.freeze({
      authorityId: "authority:atlas-public-seed-review" as AtlasAuthorityId,
      approverIds: Object.freeze([
        "principal:atlas-product-owner" as AtlasGovernancePrincipalId,
      ]),
    }),
  ]),
}) satisfies AtlasPublicationAuthorityContractV1;

export function isConfiguredAtlasPublicationApprover(
  authorityId: unknown,
  approverId: unknown,
  maintenanceOwnerId: unknown,
): boolean {
  return isEligibleAtlasPublicationApprover(
    ATLAS_PUBLICATION_AUTHORITY_CONTRACT,
    authorityId,
    approverId,
    maintenanceOwnerId,
  );
}
