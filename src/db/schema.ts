import { pool } from ".";

export const ensureSchema = async (): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      base_currency_code CHAR(3) NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT users_base_currency_code_format
        CHECK (base_currency_code ~ '^[A-Z]{3}$')
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      currency_code CHAR(3) NOT NULL,
      wallet_type TEXT NOT NULL,
      initial_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT wallets_currency_code_format
        CHECK (currency_code ~ '^[A-Z]{3}$'),
      CONSTRAINT wallets_initial_balance_non_negative
        CHECK (initial_balance >= 0)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id BIGSERIAL PRIMARY KEY,
      wallet_id BIGINT NOT NULL REFERENCES wallets(id),
      transaction_type TEXT NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      transfer_reference UUID,
      description TEXT,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT transactions_type_allowed
        CHECK (transaction_type IN ('deposit', 'withdraw', 'transfer_in', 'transfer_out')),
      CONSTRAINT transactions_amount_positive
        CHECK (amount > 0)
    );
  `);
};
