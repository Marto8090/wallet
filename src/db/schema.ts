import { pool } from ".";

export const ensureSchema = async (): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      base_currency_code CHAR(3) NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT users_base_currency_code_format
        CHECK (base_currency_code ~ '^[A-Z]{3}$')
    );
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN;
  `);

  await pool.query(`
    UPDATE users
    SET is_admin = FALSE
    WHERE is_admin IS NULL;
  `);

  await pool.query(`
    ALTER TABLE users
    ALTER COLUMN is_admin SET DEFAULT FALSE;
  `);

  await pool.query(`
    ALTER TABLE users
    ALTER COLUMN is_admin SET NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      endpoint TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      response_status_code INTEGER,
      response_body JSONB,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT idempotency_keys_status_allowed
        CHECK (status IN ('in_progress', 'completed')),
      CONSTRAINT idempotency_keys_key_not_empty
        CHECK (LENGTH(idempotency_key) > 0),
      CONSTRAINT idempotency_keys_key_max_length
        CHECK (LENGTH(idempotency_key) <= 255),
      CONSTRAINT idempotency_keys_user_endpoint_key_unique
        UNIQUE (user_id, endpoint, idempotency_key)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT audit_logs_status_allowed
        CHECK (status IN ('success', 'failure')),
      CONSTRAINT audit_logs_event_type_not_empty
        CHECK (LENGTH(event_type) > 0)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS audit_logs_user_id_created_at_idx
    ON audit_logs (user_id, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS audit_logs_event_type_created_at_idx
    ON audit_logs (event_type, created_at DESC);
  `);

  await pool.query(`
    ALTER TABLE idempotency_keys
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
  `);

  await pool.query(`
    UPDATE idempotency_keys
    SET expires_at = created_at + INTERVAL '24 hours'
    WHERE expires_at IS NULL;
  `);

  await pool.query(`
    ALTER TABLE idempotency_keys
    ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '24 hours');
  `);

  await pool.query(`
    ALTER TABLE idempotency_keys
    ALTER COLUMN expires_at SET NOT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idempotency_keys_expires_at_idx
    ON idempotency_keys (expires_at);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      iban TEXT NOT NULL,
      name TEXT NOT NULL,
      currency_code CHAR(3) NOT NULL,
      initial_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT wallets_iban_unique
        UNIQUE (iban),
      CONSTRAINT wallets_iban_format
        CHECK (iban ~ '^[A-Z0-9]{6}$'),
      CONSTRAINT wallets_currency_code_format
        CHECK (currency_code ~ '^[A-Z]{3}$'),
      CONSTRAINT wallets_initial_balance_non_negative
        CHECK (initial_balance >= 0)
    );
  `);

  await pool.query(`
    ALTER TABLE wallets
    DROP COLUMN IF EXISTS wallet_type;
  `);

  await pool.query(`
    ALTER TABLE wallets
    ADD COLUMN IF NOT EXISTS iban TEXT;
  `);

  await pool.query(`
    UPDATE wallets
    SET iban = UPPER(LPAD(id::TEXT, 6, '0'))
    WHERE iban IS NULL;
  `);

  await pool.query(`
    ALTER TABLE wallets
    ALTER COLUMN iban SET NOT NULL;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'wallets_iban_unique'
      ) THEN
        ALTER TABLE wallets
        ADD CONSTRAINT wallets_iban_unique UNIQUE (iban);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'wallets_iban_format'
      ) THEN
        ALTER TABLE wallets
        ADD CONSTRAINT wallets_iban_format
        CHECK (iban ~ '^[A-Z0-9]{6}$');
      END IF;
    END $$;
  `);

  await pool.query(`
    WITH duplicate_wallets AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY user_id, LOWER(name)
          ORDER BY id
        ) AS duplicate_index
      FROM wallets
    )
    UPDATE wallets w
    SET name = CONCAT(w.name, ' #', w.id)
    FROM duplicate_wallets d
    WHERE w.id = d.id
      AND d.duplicate_index > 1;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_name_unique
    ON wallets (user_id, LOWER(name));
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
