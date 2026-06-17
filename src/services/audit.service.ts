import { createHash } from "crypto";
import { HttpError } from "../errors/http-error";
import {
  AuditLogStatus,
  recordAuditLog,
  RecordAuditLogInput,
} from "../repositories/audit.repository";

type RecordAuditEventInput = RecordAuditLogInput & {
  status: AuditLogStatus;
};

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
