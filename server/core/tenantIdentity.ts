/**
 * @file server/core/tenantIdentity.ts
 * Canonical Tenant Identity & Backward-Compatible Alias Resolution (R2.1C)
 *
 * Evidence & Rationale:
 * - Backend runtime, `server/db/seed.ts` (`DEMO_ORG_ID`), all seeded users/customers/tickets,
 *   `run-enterprise-audit.ts`, and SHA-256 `auditEvents` hash chains use `org-madar-enterprise-001`
 *   as the canonical primary organization identifier.
 * - `firestore.rules` (`isDesignatedBootstrapOrg`) and the 39 JVM Firestore Emulator tests
 *   (`server/test/firestore-rules-audit.ts`) use `org-madar-001`.
 * - Blindly renaming either identifier would break either the SHA-256 audit hash chain or
 *   deployed Firestore security rules. Therefore:
 *   1. `org-madar-enterprise-001` is the canonical runtime primary organization ID.
 *   2. `org-madar-001` is preserved as an explicit, non-destructive legacy/Firestore alias.
 *   3. Backup/audit restore paths NEVER silently rewrite `organizationId` (preserving `[P1-06]`).
 */

export const CANONICAL_PRIMARY_ORG_ID = 'org-madar-enterprise-001';
export const LEGACY_FIRESTORE_BOOTSTRAP_ORG_ID = 'org-madar-001';

export const TENANT_ALIAS_MAP: ReadonlyMap<string, string> = new Map<string, string>([
  [LEGACY_FIRESTORE_BOOTSTRAP_ORG_ID, CANONICAL_PRIMARY_ORG_ID],
]);

export interface TenantResolutionResult {
  ok: boolean;
  requestedOrgId: string;
  canonicalOrgId: string;
  isLegacyAlias: boolean;
  aliasedFrom?: string;
  errorCode?: string;
}

/**
 * Resolves a tenant identifier to its canonical runtime ID without mutating persisted records
 * or bypassing organization registration checks.
 */
export function resolveCanonicalTenantId(
  requestedOrgId: unknown,
  options?: {
    allowLegacyAlias?: boolean;
    registeredOrganizations?: { has(id: string): boolean };
  }
): TenantResolutionResult {
  const raw = typeof requestedOrgId === 'string' ? requestedOrgId.trim() : '';
  if (!raw) {
    return {
      ok: false,
      requestedOrgId: raw,
      canonicalOrgId: '',
      isLegacyAlias: false,
      errorCode: 'INVALID_ORGANIZATION_ID',
    };
  }

  const registry = options?.registeredOrganizations;
  if (registry && registry.has(raw)) {
    return {
      ok: true,
      requestedOrgId: raw,
      canonicalOrgId: raw,
      isLegacyAlias: false,
    };
  }

  if (options?.allowLegacyAlias && TENANT_ALIAS_MAP.has(raw)) {
    const mapped = TENANT_ALIAS_MAP.get(raw)!;
    if (!registry || registry.has(mapped)) {
      return {
        ok: true,
        requestedOrgId: raw,
        canonicalOrgId: mapped,
        isLegacyAlias: true,
        aliasedFrom: raw,
      };
    }
  }

  if (registry && !registry.has(raw)) {
    return {
      ok: false,
      requestedOrgId: raw,
      canonicalOrgId: '',
      isLegacyAlias: false,
      errorCode: 'UNREGISTERED_ORGANIZATION_ID',
    };
  }

  return {
    ok: true,
    requestedOrgId: raw,
    canonicalOrgId: raw,
    isLegacyAlias: false,
  };
}

/**
 * Enforces strict tenant isolation at storage and service boundaries.
 */
export function assertTenantBoundary(actorOrganizationId: string, targetOrganizationId: string): void {
  if (
    !actorOrganizationId ||
    !targetOrganizationId ||
    actorOrganizationId !== targetOrganizationId
  ) {
    throw Object.assign(
      new Error(`Cross-tenant access denied: [${actorOrganizationId}] cannot access [${targetOrganizationId}]`),
      { status: 403, code: 'CROSS_TENANT_ACCESS_FORBIDDEN' }
    );
  }
}
