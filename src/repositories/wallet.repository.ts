import { QueryResult } from "pg";
import { pool } from "../db";

type RawWalletRecord = {
  id: string | number;
  user_id: string | number;
  is_archived: boolean;
};

type RawCreatedWalletRecord = {
  id: string | number;
  user_id: string | number;
  name: string;
  currency_code: string;
  wallet_type: string;
  initial_balance: string;
  is_archived: boolean;
  created_at: Date;
};

export type WalletRecord = {
  id: number;
  userId: number;
  isArchived: boolean;
};

export type CreatedWalletRecord = {
  id: number;
  userId: number;
  name: string;
  currencyCode: string;
  walletType: string;
  initialBalance: string;
  isArchived: boolean;
  createdAt: Date;
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

type RawBalanceRecord = {
  wallet_id: string | number;
  amount: string;
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

export type BalanceRecord = {
  walletId: number;
  amount: string;
};

type CreateDepositInput = {
  walletId: number;
  amount: string;
  description: string | null;
};

type CreateWalletInput = {
  userId: number;
  name: string;
  currencyCode: string;
  walletType: string;
  initialBalance: string;
};

const normalizeWallet = (row: RawWalletRecord): WalletRecord => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  isArchived: row.is_archived,
});

const normalizeCreatedWallet = (
  row: RawCreatedWalletRecord
): CreatedWalletRecord => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  name: row.name,
  currencyCode: row.currency_code,
  walletType: row.wallet_type,
  initialBalance: row.initial_balance,
  isArchived: row.is_archived,
  createdAt: row.created_at,
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

const normalizeBalance = (row: RawBalanceRecord): BalanceRecord => ({
  walletId: Number(row.wallet_id),
  amount: row.amount,
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

export const createWallet = async (
  input: CreateWalletInput
): Promise<CreatedWalletRecord> => {
  const result = await pool.query<RawCreatedWalletRecord>(
    `
      INSERT INTO wallets (
        user_id,
        name,
        currency_code,
        wallet_type,
        initial_balance
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        user_id,
        name,
        currency_code,
        wallet_type,
        initial_balance,
        is_archived,
        created_at
    `,
    [
      input.userId,
      input.name,
      input.currencyCode,
      input.walletType,
      input.initialBalance,
    ]
  );

  return normalizeCreatedWallet(result.rows[0]);
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

export const calculateWalletBalance = async (
  walletId: number
): Promise<BalanceRecord> => {
  const result = await pool.query<RawBalanceRecord>(
    `
      SELECT
        w.id AS wallet_id,
        TO_CHAR(
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
          ),
          'FM9999999999999999990.00'
        ) AS amount
      FROM wallets w
      LEFT JOIN transactions t ON t.wallet_id = w.id
      WHERE w.id = $1
      GROUP BY w.id, w.initial_balance
      LIMIT 1
    `,
    [walletId]
  );

  return normalizeBalance(result.rows[0]);
};
