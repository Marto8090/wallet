import { PoolClient } from "pg";
import { pool } from "../db";

export type IdempotencyStatus = "in_progress" | "completed";

export type IdempotencyRecord = {
  id: number;
  userId: number;
  endpoint: string;
  idempotencyKey: string;
  requestHash: string;
  status: IdempotencyStatus;
  responseStatusCode: number | null;
  responseBody: unknown;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type LockedIdempotencyRecord = {
  record: IdempotencyRecord;
  isNew: boolean;
};

type RawIdempotencyRecord = {
  id: string | number;
  user_id: string | number;
  endpoint: string;
  idempotency_key: string;
  request_hash: string;
  status: IdempotencyStatus;
  response_status_code: string | number | null;
  response_body: unknown;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
};

type CreateOrLockIdempotencyKeyInput = {
  userId: number;
  endpoint: string;
  idempotencyKey: string;
  requestHash: string;
  ttlSeconds: number;
};

type CompleteIdempotencyKeyInput = {
  id: number;
  responseStatusCode: number;
  responseBody: unknown;
};

const idempotencySelect = `
  SELECT
    id,
    user_id,
    endpoint,
    idempotency_key,
    request_hash,
    status,
    response_status_code,
    response_body,
    expires_at,
    created_at,
    updated_at
  FROM idempotency_keys
`;

const normalizeIdempotencyRecord = (
  row: RawIdempotencyRecord
): IdempotencyRecord => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  endpoint: row.endpoint,
  idempotencyKey: row.idempotency_key,
  requestHash: row.request_hash,
  status: row.status,
  responseStatusCode:
    row.response_status_code === null ? null : Number(row.response_status_code),
  responseBody: row.response_body,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const cleanupExpiredIdempotencyKeys = async (): Promise<number> => {
  const result = await pool.query(
    `
      DELETE FROM idempotency_keys
      WHERE expires_at <= NOW()
    `
  );

  return result.rowCount ?? 0;
};

export const createOrLockIdempotencyKey = async (
  client: PoolClient,
  input: CreateOrLockIdempotencyKeyInput
): Promise<LockedIdempotencyRecord> => {
  await client.query(
    `
      DELETE FROM idempotency_keys
      WHERE user_id = $1
        AND endpoint = $2
        AND idempotency_key = $3
        AND expires_at <= NOW()
    `,
    [input.userId, input.endpoint, input.idempotencyKey]
  );

  const insertResult = await client.query<RawIdempotencyRecord>(
    `
      INSERT INTO idempotency_keys (
        user_id,
        endpoint,
        idempotency_key,
        request_hash,
        status,
        expires_at
      )
      VALUES ($1, $2, $3, $4, 'in_progress', NOW() + ($5 * INTERVAL '1 second'))
      ON CONFLICT (user_id, endpoint, idempotency_key) DO NOTHING
      RETURNING
        id,
        user_id,
        endpoint,
        idempotency_key,
        request_hash,
        status,
        response_status_code,
        response_body,
        expires_at,
        created_at,
        updated_at
    `,
    [
      input.userId,
      input.endpoint,
      input.idempotencyKey,
      input.requestHash,
      input.ttlSeconds,
    ]
  );

  const insertedRow = insertResult.rows[0];

  if (insertedRow) {
    return {
      record: normalizeIdempotencyRecord(insertedRow),
      isNew: true,
    };
  }

  const lockResult = await client.query<RawIdempotencyRecord>(
    `
      ${idempotencySelect}
      WHERE user_id = $1
        AND endpoint = $2
        AND idempotency_key = $3
      FOR UPDATE
    `,
    [input.userId, input.endpoint, input.idempotencyKey]
  );

  return {
    record: normalizeIdempotencyRecord(lockResult.rows[0]),
    isNew: false,
  };
};

export const completeIdempotencyKey = async (
  client: PoolClient,
  input: CompleteIdempotencyKeyInput
): Promise<IdempotencyRecord> => {
  const result = await client.query<RawIdempotencyRecord>(
    `
      UPDATE idempotency_keys
      SET
        status = 'completed',
        response_status_code = $2,
        response_body = $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        user_id,
        endpoint,
        idempotency_key,
        request_hash,
        status,
        response_status_code,
        response_body,
        expires_at,
        created_at,
        updated_at
    `,
    [input.id, input.responseStatusCode, input.responseBody]
  );

  return normalizeIdempotencyRecord(result.rows[0]);
};
