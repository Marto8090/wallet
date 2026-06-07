import { PoolClient, QueryResult } from "pg";
import { pool } from "../db";

type RawWalletRecord = {
  id: string | number;
  user_id: string | number;
  iban: string;
  is_archived: boolean;
};

type RawCreatedWalletRecord = {
  id: string | number;
  user_id: string | number;
  iban: string;
  name: string;
  currency_code: string;
  initial_balance: string;
  is_archived: boolean;
  created_at: Date;
};

export type WalletRecord = {
  id: number;
  userId: number;
  iban: string;
  isArchived: boolean;
};

export type CreatedWalletRecord = {
  id: number;
  userId: number;
  iban: string;
  name: string;
  currencyCode: string;
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
  wallet_iban: string;
  amount: string;
};

type RawWalletSummaryRecord = {
  id: string | number;
  user_id: string | number;
  iban: string;
  name: string;
  currency_code: string;
  initial_balance: string;
  is_archived: boolean;
  created_at: Date;
  balance: string;
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
  walletIban: string;
  amount: string;
};

export type WalletSummaryRecord = CreatedWalletRecord & {
  balance: string;
};

type CreateDepositInput = {
  walletId: number;
  amount: string;
  description: string | null;
};

type CreateWithdrawInput = {
  client?: PoolClient;
  walletId: number;
  amount: string;
  description: string | null;
};

type CreateWalletInput = {
  userId: number;
  iban: string;
  name: string;
  currencyCode: string;
  initialBalance: string;
};

const normalizeWallet = (row: RawWalletRecord): WalletRecord => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  iban: row.iban,
  isArchived: row.is_archived,
});

const normalizeCreatedWallet = (
  row: RawCreatedWalletRecord
): CreatedWalletRecord => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  iban: row.iban,
  name: row.name,
  currencyCode: row.currency_code,
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
  walletIban: row.wallet_iban,
  amount: row.amount,
});

const normalizeWalletSummary = (
  row: RawWalletSummaryRecord
): WalletSummaryRecord => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  iban: row.iban,
  name: row.name,
  currencyCode: row.currency_code,
  initialBalance: row.initial_balance,
  isArchived: row.is_archived,
  createdAt: row.created_at,
  balance: row.balance,
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
      SELECT id, user_id, iban, is_archived
      FROM wallets
      WHERE id = $1
      LIMIT 1
    `,
    [walletId]
  );

  return mapWallet(result);
};

export const findWalletByIban = async (
  walletIban: string
): Promise<WalletRecord | null> => {
  const result = await pool.query<RawWalletRecord>(
    `
      SELECT id, user_id, iban, is_archived
      FROM wallets
      WHERE iban = $1
      LIMIT 1
    `,
    [walletIban]
  );

  return mapWallet(result);
};

export const findWalletByUserIdAndName = async (
  userId: number,
  name: string
): Promise<WalletRecord | null> => {
  const result = await pool.query<RawWalletRecord>(
    `
      SELECT id, user_id, iban, is_archived
      FROM wallets
      WHERE user_id = $1
        AND LOWER(name) = LOWER($2)
      LIMIT 1
    `,
    [userId, name]
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
        iban,
        name,
        currency_code,
        initial_balance
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        user_id,
        iban,
        name,
        currency_code,
        initial_balance,
        is_archived,
        created_at
    `,
    [
      input.userId,
      input.iban,
      input.name,
      input.currencyCode,
      input.initialBalance,
    ]
  );

  return normalizeCreatedWallet(result.rows[0]);
};

export const listWalletsByUserId = async (
  userId: number
): Promise<WalletSummaryRecord[]> => {
  const result = await pool.query<RawWalletSummaryRecord>(
    `
      SELECT
        w.id,
        w.user_id,
        w.iban,
        w.name,
        w.currency_code,
        w.initial_balance,
        w.is_archived,
        w.created_at,
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
        ) AS balance
      FROM wallets w
      LEFT JOIN transactions t ON t.wallet_id = w.id
      WHERE w.user_id = $1
        AND w.is_archived = FALSE
      GROUP BY
        w.id,
        w.user_id,
        w.iban,
        w.name,
        w.currency_code,
        w.initial_balance,
        w.is_archived,
        w.created_at
      ORDER BY w.created_at DESC, w.id DESC
    `,
    [userId]
  );

  return result.rows.map(normalizeWalletSummary);
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

export const createWithdrawTransaction = async (
  input: CreateWithdrawInput
): Promise<TransactionRecord> => {
  const queryClient = input.client ?? pool;
  const result = await queryClient.query<RawTransactionRecord>(
    `
      INSERT INTO transactions (wallet_id, transaction_type, amount, description)
      VALUES ($1, 'withdraw', $2, $3)
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
        w.iban AS wallet_iban,
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
      GROUP BY w.id, w.iban, w.initial_balance
      LIMIT 1
    `,
    [walletId]
  );

  return normalizeBalance(result.rows[0]);
};
