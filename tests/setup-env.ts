import dotenv from "dotenv";

dotenv.config({ quiet: true });

process.env.NODE_ENV = "test";
process.env.PORT ??= "3000";
process.env.DB_HOST ??= "localhost";
process.env.DB_PORT ??= "5432";
process.env.DB_USER ??= "wallet_user";
process.env.DB_PASSWORD ??= "wallet_password";
process.env.DB_NAME = process.env.TEST_DB_NAME ?? "wallet_test_db";
process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.JWT_EXPIRES_IN_SECONDS ??= "3600";
