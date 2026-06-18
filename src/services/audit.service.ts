import { createHash } from "crypto";
import { env } from "../config/env";
import { HttpError } from "../errors/http-error";
import {
  AuditLogStatus,
  deleteAuditLogsOlderThan,
  listAuditLogs,
  ListAuditLogsResult,
  recordAuditLog,
  RecordAuditLogInput,
} from "../repositories/audit.repository";

type RecordAuditEventInput = RecordAuditLogInput & {
  status: AuditLogStatus;
};

export type ListAuditEventsInput = {
  userId?: unknown;
  eventType?: unknown;
  status?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  search?: unknown;
  from?: unknown;
  to?: unknown;
  limit?: unknown;
  offset?: unknown;
};

export type AuditCleanupResult = {
  retentionDays: number;
  deletedCount: number;
};

const MAX_AUDIT_LOG_LIMIT = 100;

export const recordAuditEvent = async (
  input: RecordAuditEventInput
): Promise<void> => {
  try {
    await recordAuditLog(input);
  } catch (error) {
    console.error("Failed to write audit log", error);
  }
};

export const getAuditErrorMessage = (error: unknown): string => {
  if (error instanceof HttpError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
};

export const getAuditStatusCode = (error: unknown): number => {
  if (error instanceof HttpError) {
    return error.statusCode;
  }

  return 500;
};

export const hashAuditValue = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 16);

export const normalizeAuditEmail = (email: unknown): string | null => {
  if (typeof email !== "string") {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();

  return normalizedEmail || null;
};

const parseOptionalText = (
  value: unknown,
  fieldName: string
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be a string`);
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : undefined;
};

const parseOptionalInteger = (
  value: unknown,
  fieldName: string
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    throw new HttpError(400, `${fieldName} must be a number`);
  }

  const parsedValue = Number(value);

  if (!Number.isSafeInteger(parsedValue) || parsedValue < 0) {
    throw new HttpError(400, `${fieldName} must be a non-negative integer`);
  }

  return parsedValue;
};

const parseOptionalDate = (
  value: unknown,
  fieldName: string
): Date | undefined => {
  const valueText = parseOptionalText(value, fieldName);

  if (valueText === undefined) {
    return undefined;
  }

  const parsedDate = new Date(valueText);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new HttpError(400, `${fieldName} must be a valid date`);
  }

  return parsedDate;
};

const parseAuditStatus = (value: unknown): AuditLogStatus | undefined => {
  const status = parseOptionalText(value, "status");

  if (status === undefined) {
    return undefined;
  }

  if (status !== "success" && status !== "failure") {
    throw new HttpError(400, "status must be success or failure");
  }

  return status;
};

const parseLimit = (value: unknown): number => {
  const parsedLimit = parseOptionalInteger(value, "limit") ?? 50;

  if (parsedLimit < 1) {
    throw new HttpError(400, "limit must be at least 1");
  }

  return Math.min(parsedLimit, MAX_AUDIT_LOG_LIMIT);
};

export const listAuditEvents = async (
  input: ListAuditEventsInput
): Promise<ListAuditLogsResult & { limit: number; offset: number }> => {
  const limit = parseLimit(input.limit);
  const offset = parseOptionalInteger(input.offset, "offset") ?? 0;

  const result = await listAuditLogs({
    userId: parseOptionalInteger(input.userId, "userId"),
    eventType: parseOptionalText(input.eventType, "eventType"),
    status: parseAuditStatus(input.status),
    entityType: parseOptionalText(input.entityType, "entityType"),
    entityId: parseOptionalText(input.entityId, "entityId"),
    search: parseOptionalText(input.search, "search"),
    from: parseOptionalDate(input.from, "from"),
    to: parseOptionalDate(input.to, "to"),
    limit,
    offset,
  });

  return {
    ...result,
    limit,
    offset,
  };
};

export const cleanupExpiredAuditLogs = async (
  retentionDays = env.auditLogRetentionDays
): Promise<AuditCleanupResult> => {
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1) {
    throw new Error("AUDIT_LOG_RETENTION_DAYS must be a positive integer");
  }

  const deletedCount = await deleteAuditLogsOlderThan(retentionDays);

  return {
    retentionDays,
    deletedCount,
  };
};
