import { PoolClient } from "pg";

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
  created_at: Date;
  updated_at: Date;
};

type CreateOrLockIdempotencyKeyInput = {
  userId: number;
  endpoint: string;
  idempotencyKey: string;
  requestHash: string;
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
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createOrLockIdempotencyKey = async (
  client: PoolClient,
  input: CreateOrLockIdempotencyKeyInput
): Promise<LockedIdempotencyRecord> => {
  const insertResult = await client.query<RawIdempotencyRecord>(
    `
      INSERT INTO idempotency_keys (
        user_id,
        endpoint,
        idempotency_key,
        request_hash,
        status
      )
      VALUES ($1, $2, $3, $4, 'in_progress')
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
        created_at,
        updated_at
    `,
    [input.userId, input.endpoint, input.idempotencyKey, input.requestHash]
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
        created_at,
        updated_at
    `,
    [input.id, input.responseStatusCode, input.responseBody]
  );

  return normalizeIdempotencyRecord(result.rows[0]);
};
