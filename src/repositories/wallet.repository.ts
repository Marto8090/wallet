import { QueryResult } from "pg";
import { pool } from "../db";

type RawWalletRecord = {
  id: string | number;
  user_id: string | number;
  is_archived: boolean;
};

export type WalletRecord = {
  id: number;
  userId: number;
  isArchived: boolean;
};

type RawTransactionRecord = {
  id: string | number;
  wallet_id: string | number;
  transaction_type: string;
  amount: string;
  description: string | null;
  occurred_at: Date;
  created_at: Date;
};

export type TransactionRecord = {
  id: number;
  walletId: number;
  transactionType: string;
  amount: string;
  description: string | null;
  occurredAt: Date;
  createdAt: Date;
};

type CreateDepositInput = {
  walletId: number;
  amount: string;
  description: string | null;
};

const normalizeWallet = (row: RawWalletRecord): WalletRecord => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  isArchived: row.is_archived,
});

const normalizeTransaction = (
  row: RawTransactionRecord
): TransactionRecord => ({
  id: Number(row.id),
  walletId: Number(row.wallet_id),
  transactionType: row.transaction_type,
  amount: row.amount,
  description: row.description,
  occurredAt: row.occurred_at,
  createdAt: row.created_at,
});

const mapWallet = (result: QueryResult<RawWalletRecord>): WalletRecord | null => {
  const row = result.rows[0];

  return row ? normalizeWallet(row) : null;
};

export const findWalletById = async (
  walletId: number
): Promise<WalletRecord | null> => {
  const result = await pool.query<RawWalletRecord>(
    `
      SELECT id, user_id, is_archived
      FROM wallets
      WHERE id = $1
      LIMIT 1
    `,
    [walletId]
  );

  return mapWallet(result);
};

export const createDepositTransaction = async (
  input: CreateDepositInput
): Promise<TransactionRecord> => {
  const result = await pool.query<RawTransactionRecord>(
    `
      INSERT INTO transactions (wallet_id, transaction_type, amount, description)
      VALUES ($1, 'deposit', $2, $3)
      RETURNING
        id,
        wallet_id,
        transaction_type,
        amount,
        description,
        occurred_at,
        created_at
    `,
    [input.walletId, input.amount, input.description]
  );

  return normalizeTransaction(result.rows[0]);
};
