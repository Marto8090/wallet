import { PoolClient } from "pg";
import { pool } from "../db";

export type LockedWalletRecord = {
  id: number;
  userId: number;
  currencyCode: string;
  isArchived: boolean;
};

export type TransferLedgerEntryRecord = {
  id: number;
  walletId: number;
  transactionType: "transfer_out" | "transfer_in";
  amount: string;
  description: string | null;
  transferReference: string;
  occurredAt: Date;
  createdAt: Date;
};

type RawLockedWalletRecord = {
  id: string | number;
  user_id: string | number;
  currency_code: string;
  is_archived: boolean;
};

type RawBalanceRecord = {
  amount: string;
};

type RawTransferLedgerEntryRecord = {
  id: string | number;
  wallet_id: string | number;
  transaction_type: "transfer_out" | "transfer_in";
  amount: string;
  description: string | null;
  transfer_reference: string;
  occurred_at: Date;
  created_at: Date;
};

type CreateTransferLedgerEntryInput = {
  walletId: number;
  transactionType: "transfer_out" | "transfer_in";
  amount: string;
  description: string | null;
  transferReference: string;
};

const normalizeLockedWallet = (
  row: RawLockedWalletRecord
): LockedWalletRecord => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  currencyCode: row.currency_code,
  isArchived: row.is_archived,
});

const normalizeTransferLedgerEntry = (
  row: RawTransferLedgerEntryRecord
): TransferLedgerEntryRecord => ({
  id: Number(row.id),
  walletId: Number(row.wallet_id),
  transactionType: row.transaction_type,
  amount: row.amount,
  description: row.description,
  transferReference: row.transfer_reference,
  occurredAt: row.occurred_at,
  createdAt: row.created_at,
});

export const withTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const lockWalletById = async (
  client: PoolClient,
  walletId: number
): Promise<LockedWalletRecord | null> => {
  const result = await client.query<RawLockedWalletRecord>(
    `
      SELECT id, user_id, currency_code, is_archived
      FROM wallets
      WHERE id = $1
      FOR UPDATE
    `,
    [walletId]
  );

  const row = result.rows[0];

  return row ? normalizeLockedWallet(row) : null;
};

export const calculateWalletBalanceForUpdate = async (
  client: PoolClient,
  walletId: number
): Promise<string> => {
  const result = await client.query<RawBalanceRecord>(
    `
      SELECT
        (
          w.initial_balance
          + COALESCE(
            SUM(
              CASE
                WHEN t.transaction_type IN ('deposit', 'transfer_in') THEN t.amount
                WHEN t.transaction_type IN ('withdraw', 'transfer_out') THEN -t.amount
                ELSE 0
              END
            ),
            0
          )
        )::NUMERIC(18,2)::TEXT AS amount
      FROM wallets w
      LEFT JOIN transactions t ON t.wallet_id = w.id
      WHERE w.id = $1
      GROUP BY w.id, w.initial_balance
      LIMIT 1
    `,
    [walletId]
  );

  return result.rows[0].amount;
};

export const createTransferLedgerEntry = async (
  client: PoolClient,
  input: CreateTransferLedgerEntryInput
): Promise<TransferLedgerEntryRecord> => {
  const result = await client.query<RawTransferLedgerEntryRecord>(
    `
      INSERT INTO transactions (
        wallet_id,
        transaction_type,
        amount,
        transfer_reference,
        description
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        wallet_id,
        transaction_type,
        amount,
        description,
        transfer_reference,
        occurred_at,
        created_at
    `,
    [
      input.walletId,
      input.transactionType,
      input.amount,
      input.transferReference,
      input.description,
    ]
  );

  return normalizeTransferLedgerEntry(result.rows[0]);
};
