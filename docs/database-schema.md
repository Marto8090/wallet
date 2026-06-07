# Database Schema

This project uses PostgreSQL as a ledger-based wallet database. Wallet balances are not stored as a mutable balance column. They are calculated from `wallets.initial_balance` plus the transaction history in `transactions`.

## users

Stores registered application users.

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `BIGSERIAL` | Primary key |
| `email` | `TEXT` | Required, unique |
| `display_name` | `TEXT` | Required |
| `base_currency_code` | `CHAR(3)` | Required, must match `^[A-Z]{3}$` |
| `password_hash` | `TEXT` | Required |
| `created_at` | `TIMESTAMPTZ` | Required, defaults to `NOW()` |
| `updated_at` | `TIMESTAMPTZ` | Required, defaults to `NOW()` |

## wallets

Stores wallets owned by users. Each wallet has a public 6-character IBAN-style code used by the API and frontend.

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `BIGSERIAL` | Primary key |
| `user_id` | `BIGINT` | Required, references `users(id)` |
| `iban` | `TEXT` | Required, unique, must match `^[A-Z0-9]{6}$` |
| `name` | `TEXT` | Required |
| `currency_code` | `CHAR(3)` | Required, must match `^[A-Z]{3}$` |
| `initial_balance` | `NUMERIC(18,2)` | Required, defaults to `0`, must be `>= 0` |
| `is_archived` | `BOOLEAN` | Required, defaults to `FALSE` |
| `created_at` | `TIMESTAMPTZ` | Required, defaults to `NOW()` |
| `updated_at` | `TIMESTAMPTZ` | Required, defaults to `NOW()` |

Indexes and constraints:

- `wallets_iban_unique`: every wallet IBAN must be unique.
- `wallets_user_name_unique`: wallet names are unique per user, case-insensitive.
- `wallets_initial_balance_non_negative`: initial balance cannot be negative.

## transactions

Stores ledger entries for deposits, withdrawals, and transfers.

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `BIGSERIAL` | Primary key |
| `wallet_id` | `BIGINT` | Required, references `wallets(id)` |
| `transaction_type` | `TEXT` | Required, must be `deposit`, `withdraw`, `transfer_in`, or `transfer_out` |
| `amount` | `NUMERIC(18,2)` | Required, must be greater than `0` |
| `transfer_reference` | `UUID` | Shared by paired transfer entries |
| `description` | `TEXT` | Optional |
| `occurred_at` | `TIMESTAMPTZ` | Required, defaults to `NOW()` |
| `created_at` | `TIMESTAMPTZ` | Required, defaults to `NOW()` |
| `updated_at` | `TIMESTAMPTZ` | Required, defaults to `NOW()` |

Balance calculation rules:

- `deposit` increases balance.
- `transfer_in` increases balance.
- `withdraw` decreases balance.
- `transfer_out` decreases balance.
- Transfers create two rows: one `transfer_out` and one `transfer_in` with the same `transfer_reference`.

## idempotency_keys

Stores transfer idempotency keys so repeated transfer requests do not create duplicate ledger entries.

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `BIGSERIAL` | Primary key |
| `user_id` | `BIGINT` | Required, references `users(id)` |
| `endpoint` | `TEXT` | Required |
| `idempotency_key` | `TEXT` | Required, length `1..255` |
| `request_hash` | `TEXT` | Required |
| `status` | `TEXT` | Required, must be `in_progress` or `completed` |
| `response_status_code` | `INTEGER` | Stored response status |
| `response_body` | `JSONB` | Stored response body |
| `expires_at` | `TIMESTAMPTZ` | Required, defaults to 24 hours after creation |
| `created_at` | `TIMESTAMPTZ` | Required, defaults to `NOW()` |
| `updated_at` | `TIMESTAMPTZ` | Required, defaults to `NOW()` |

Indexes and constraints:

- `idempotency_keys_user_endpoint_key_unique`: the same user cannot reuse the same idempotency key for the same endpoint with different stored state.
- `idempotency_keys_expires_at_idx`: supports cleanup of expired idempotency keys.

## Relationships

- One user can own many wallets.
- One user can own many idempotency key records.
- One wallet can have many transaction records.
- A transfer is represented by two transaction records linked by the same `transfer_reference`.
