import { FormStatus, FormVisibility } from "@repo/types";

export interface FormAccessContext {
  visibility: FormVisibility;
  status: FormStatus;
  expiresAt?: Date | null;
  responseLimit?: number | null;
  responseCount?: number;
}

export function isPubliclyListed(visibility: FormVisibility): boolean {
  return visibility === "public";
}

export function canAccessViaDirectLink({
  visibility,
  status,
  expiresAt,
}: Pick<FormAccessContext, "visibility" | "status" | "expiresAt">): boolean {
  if (status !== "published") return false;
  if (visibility !== "public" && visibility !== "unlisted") return false;
  if (expiresAt && expiresAt.getTime() < Date.now()) return false;
  return true;
}

export function canAcceptResponse({
  visibility,
  status,
  expiresAt,
  responseLimit,
  responseCount = 0,
}: FormAccessContext): boolean {
  if (!canAccessViaDirectLink({ visibility, status, expiresAt })) return false;
  if (typeof responseLimit === "number" && responseCount >= responseLimit) return false;
  return true;
}
