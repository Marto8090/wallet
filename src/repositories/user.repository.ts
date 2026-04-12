import { QueryResult } from "pg";
import { pool } from "../db";

type RawUserRecord = {
  id: string | number;
  email: string;
  display_name: string;
  base_currency_code: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
};

export type UserRecord = {
  id: number;
  email: string;
  display_name: string;
  base_currency_code: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
};

export type CreateUserInput = {
  email: string;
  displayName: string;
  baseCurrencyCode: string;
  passwordHash: string;
};

const userSelect = `
  SELECT
    id,
    email,
    display_name,
    base_currency_code,
    password_hash,
    created_at,
    updated_at
  FROM users
`;

const normalizeUser = (row: RawUserRecord): UserRecord => ({
  ...row,
  id: Number(row.id),
});

const mapUser = (result: QueryResult<RawUserRecord>): UserRecord | null => {
  const row = result.rows[0];

  return row ? normalizeUser(row) : null;
};

export const findUserByEmail = async (
  email: string
): Promise<UserRecord | null> => {
  const result = await pool.query<RawUserRecord>(
    `${userSelect} WHERE email = $1 LIMIT 1`,
    [email]
  );

  return mapUser(result);
};

export const findUserById = async (id: number): Promise<UserRecord | null> => {
  const result = await pool.query<RawUserRecord>(
    `${userSelect} WHERE id = $1 LIMIT 1`,
    [id]
  );

  return mapUser(result);
};

export const createUser = async (
  input: CreateUserInput
): Promise<UserRecord> => {
  const result = await pool.query<RawUserRecord>(
    `
      INSERT INTO users (email, display_name, base_currency_code, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        email,
        display_name,
        base_currency_code,
        password_hash,
        created_at,
        updated_at
    `,
    [
      input.email,
      input.displayName,
      input.baseCurrencyCode,
      input.passwordHash,
    ]
  );

  return normalizeUser(result.rows[0]);
};
