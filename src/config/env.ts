import dotenv from "dotenv";

dotenv.config();

const readString = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const readNumber = (key: string, fallback?: number): number => {
  const value = process.env[key] ?? fallback?.toString();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  const parsedValue = Number(value);

  if (Number.isNaN(parsedValue)) {
    throw new Error(`Environment variable ${key} must be a valid number`);
  }

  return parsedValue;
};

export const env = {
  port: readNumber("PORT", 3000),
  dbHost: readString("DB_HOST"),
  dbPort: readNumber("DB_PORT"),
  dbName: readString("DB_NAME"),
  dbUser: readString("DB_USER"),
  dbPassword: readString("DB_PASSWORD"),
  jwtSecret: readString("JWT_SECRET"),
  jwtExpiresInSeconds: readNumber("JWT_EXPIRES_IN_SECONDS", 3600),
};
