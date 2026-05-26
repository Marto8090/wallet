import { Pool } from "pg";

const validateDatabaseName = (databaseName: string): void => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(databaseName)) {
    throw new Error(`Unsafe test database name: ${databaseName}`);
  }
};

const createTestDatabase = async (): Promise<void> => {
  const testDatabaseName = process.env.DB_NAME ?? "wallet_test_db";
  validateDatabaseName(testDatabaseName);

  const adminPool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.TEST_DB_ADMIN_DATABASE ?? "postgres",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    const existingDatabase = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [testDatabaseName]
    );

    if (existingDatabase.rowCount === 0) {
      await adminPool.query(`CREATE DATABASE ${testDatabaseName}`);
    }
  } finally {
    await adminPool.end();
  }
};

beforeAll(async () => {
  await createTestDatabase();

  const { ensureSchema } = await import("../src/db/schema");
  await ensureSchema();
});

beforeEach(async () => {
  const { pool } = await import("../src/db");
  await pool.query("TRUNCATE TABLE transactions, wallets, users RESTART IDENTITY CASCADE");
});

afterAll(async () => {
  const { pool } = await import("../src/db");
  await pool.end();
});
