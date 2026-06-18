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

type RawAuditLogRecord = {
  id: string | number;
  user_id: string | number | null;
  event_type: string;
  status: AuditLogStatus;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export type AuditLogRecord = {
  id: number;
  userId: number | null;
  eventType: string;
  status: AuditLogStatus;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ListAuditLogsFilters = {
  userId?: number;
  eventType?: string;
  status?: AuditLogStatus;
  entityType?: string;
  entityId?: string;
  search?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
};

export type ListAuditLogsResult = {
  auditLogs: AuditLogRecord[];
  total: number;
};

const normalizeAuditLog = (row: RawAuditLogRecord): AuditLogRecord => ({
  id: Number(row.id),
  userId: row.user_id === null ? null : Number(row.user_id),
  eventType: row.event_type,
  status: row.status,
  entityType: row.entity_type,
  entityId: row.entity_id,
  metadata: row.metadata,
  createdAt: row.created_at.toISOString(),
});

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

export const listAuditLogs = async (
  filters: ListAuditLogsFilters
): Promise<ListAuditLogsResult> => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  const addValue = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  if (filters.userId !== undefined) {
    conditions.push(`user_id = ${addValue(filters.userId)}`);
  }

  if (filters.eventType !== undefined) {
    conditions.push(`event_type = ${addValue(filters.eventType)}`);
  }

  if (filters.status !== undefined) {
    conditions.push(`status = ${addValue(filters.status)}`);
  }

  if (filters.entityType !== undefined) {
    conditions.push(`entity_type = ${addValue(filters.entityType)}`);
  }

  if (filters.entityId !== undefined) {
    conditions.push(`entity_id = ${addValue(filters.entityId)}`);
  }

  if (filters.from !== undefined) {
    conditions.push(`created_at >= ${addValue(filters.from)}`);
  }

  if (filters.to !== undefined) {
    conditions.push(`created_at <= ${addValue(filters.to)}`);
  }

  if (filters.search !== undefined) {
    const searchValue = `%${filters.search}%`;
    const placeholder = addValue(searchValue);
    conditions.push(
      `(
        event_type ILIKE ${placeholder}
        OR COALESCE(entity_type, '') ILIKE ${placeholder}
        OR COALESCE(entity_id, '') ILIKE ${placeholder}
        OR metadata::text ILIKE ${placeholder}
      )`
    );
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM audit_logs ${whereClause}`,
    values
  );

  const auditLogResult = await pool.query<RawAuditLogRecord>(
    `
      SELECT
        id,
        user_id,
        event_type,
        status,
        entity_type,
        entity_id,
        metadata,
        created_at
      FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ${addValue(filters.limit)}
      OFFSET ${addValue(filters.offset)}
    `,
    values
  );

  return {
    auditLogs: auditLogResult.rows.map(normalizeAuditLog),
    total: Number(totalResult.rows[0]?.count ?? 0),
  };
};

export const deleteAuditLogsOlderThan = async (
  retentionDays: number
): Promise<number> => {
  const result = await pool.query(
    `
      DELETE FROM audit_logs
      WHERE created_at < NOW() - ($1::INTEGER * INTERVAL '1 day')
    `,
    [retentionDays]
  );

  return result.rowCount ?? 0;
};
