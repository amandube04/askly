import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, db, eq, gt, isNull } from "@repo/database";
import { authSessionsTable } from "@repo/database/schema";

const ACCESS_TTL_MS = 1000 * 60 * 30; // 30 minutes
const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export const ASKLY_SESSION_COOKIE = "askly_session";
export const ASKLY_REFRESH_COOKIE = "askly_refresh";
export const ASKLY_CSRF_COOKIE = "askly_csrf";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateOpaqueToken(): string {
  return `${randomUUID()}-${randomBytes(16).toString("hex")}`;
}

export interface SessionIssueParams {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface IssuedSessionPayload {
  sessionToken: string;
  refreshToken: string;
  csrfToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
}

export async function issueSession(params: SessionIssueParams): Promise<IssuedSessionPayload> {
  const sessionToken = generateOpaqueToken();
  const refreshToken = generateOpaqueToken();
  const csrfToken = generateOpaqueToken();

  const expiresAt = new Date(Date.now() + ACCESS_TTL_MS);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  await db.insert(authSessionsTable).values({
    userId: params.userId,
    accessTokenHash: hashToken(sessionToken),
    refreshTokenHash: hashToken(refreshToken),
    csrfTokenHash: hashToken(csrfToken),
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
    expiresAt,
    refreshExpiresAt,
  });

  return {
    sessionToken,
    refreshToken,
    csrfToken,
    expiresAt,
    refreshExpiresAt,
  };
}

export async function resolveSessionUserId(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);

  const [session] = await db
    .select({
      userId: authSessionsTable.userId,
    })
    .from(authSessionsTable)
    .where(
      and(
        eq(authSessionsTable.accessTokenHash, tokenHash),
        gt(authSessionsTable.expiresAt, new Date()),
        isNull(authSessionsTable.revokedAt),
      ),
    )
    .limit(1);

  return session?.userId ?? null;
}

export async function revokeSessionToken(token: string | null | undefined) {
  if (!token) return;
  const tokenHash = hashToken(token);

  await db
    .update(authSessionsTable)
    .set({
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(authSessionsTable.accessTokenHash, tokenHash));
}

export async function rotateAccessTokenFromRefreshToken(
  refreshToken: string | null | undefined,
  metadata?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<{ sessionToken: string; refreshToken: string; csrfToken: string; expiresAt: Date } | null> {
  if (!refreshToken) return null;
  const refreshTokenHash = hashToken(refreshToken);

  const [session] = await db
    .select({
      id: authSessionsTable.id,
      ipAddress: authSessionsTable.ipAddress,
      userAgent: authSessionsTable.userAgent,
      previousRefreshTokenHash: authSessionsTable.previousRefreshTokenHash,
      refreshExpiresAt: authSessionsTable.refreshExpiresAt,
      revokedAt: authSessionsTable.revokedAt,
    })
    .from(authSessionsTable)
    .where(eq(authSessionsTable.refreshTokenHash, refreshTokenHash))
    .limit(1);

  if (!session) {
    const [reusedSession] = await db
      .select({
        id: authSessionsTable.id,
      })
      .from(authSessionsTable)
      .where(and(eq(authSessionsTable.previousRefreshTokenHash, refreshTokenHash), isNull(authSessionsTable.revokedAt)))
      .limit(1);

    if (reusedSession) {
      await db
        .update(authSessionsTable)
        .set({
          revokedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(authSessionsTable.id, reusedSession.id));
    }
    return null;
  }
  if (session.revokedAt) return null;
  if (session.refreshExpiresAt.getTime() <= Date.now()) return null;
  if (session.userAgent && metadata?.userAgent && session.userAgent !== metadata.userAgent) {
    await db
      .update(authSessionsTable)
      .set({
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(authSessionsTable.id, session.id));
    return null;
  }
  if (session.ipAddress && metadata?.ipAddress && session.ipAddress !== metadata.ipAddress) {
    await db
      .update(authSessionsTable)
      .set({
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(authSessionsTable.id, session.id));
    return null;
  }

  const sessionToken = generateOpaqueToken();
  const nextRefreshToken = generateOpaqueToken();
  const csrfToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + ACCESS_TTL_MS);

  await db
    .update(authSessionsTable)
    .set({
      accessTokenHash: hashToken(sessionToken),
      previousRefreshTokenHash: refreshTokenHash,
      refreshTokenHash: hashToken(nextRefreshToken),
      csrfTokenHash: hashToken(csrfToken),
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(authSessionsTable.id, session.id));

  return {
    sessionToken,
    refreshToken: nextRefreshToken,
    csrfToken,
    expiresAt,
  };
}

export async function validateCsrfToken(
  sessionToken: string | null | undefined,
  csrfToken: string | null | undefined,
) {
  if (!sessionToken || !csrfToken) return false;
  const sessionTokenHash = hashToken(sessionToken);
  const csrfTokenHash = hashToken(csrfToken);

  const [session] = await db
    .select({
      id: authSessionsTable.id,
    })
    .from(authSessionsTable)
    .where(
      and(
        eq(authSessionsTable.accessTokenHash, sessionTokenHash),
        eq(authSessionsTable.csrfTokenHash, csrfTokenHash),
        gt(authSessionsTable.expiresAt, new Date()),
        isNull(authSessionsTable.revokedAt),
      ),
    )
    .limit(1);

  return !!session;
}
