import { pool } from "../db";

export type AuditLogStatus = "success" | "failure";

export type RecordAuditLogInput = {
  userId?: number | null;
  eventType: string;
  status: AuditLogStatus;
  entityType?: string | null;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
};

export const recordAuditLog = async (
  input: RecordAuditLogInput
): Promise<void> => {
  await pool.query(
    `
      INSERT INTO audit_logs (
        user_id,
        event_type,
        status,
        entity_type,
        entity_id,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      input.userId ?? null,
      input.eventType,
      input.status,
      input.entityType ?? null,
      input.entityId === undefined || input.entityId === null
        ? null
        : input.entityId.toString(),
      input.metadata ?? {},
    ]
  );
};
