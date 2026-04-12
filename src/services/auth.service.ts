import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { HttpError } from "../errors/http-error";
import {
  createUser,
  findUserByEmail,
  findUserById,
  UserRecord,
} from "../repositories/user.repository";

type RegisterInput = {
  email: unknown;
  displayName: unknown;
  baseCurrencyCode: unknown;
  password: unknown;
};

type LoginInput = {
  email: unknown;
  password: unknown;
};

export type PublicUser = {
  id: number;
  email: string;
  displayName: string;
  baseCurrencyCode: string;
};

export type AuthResponse = {
  token: string;
  user: PublicUser;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/;
const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_SALT_ROUNDS = 12;

const requireString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} is required`);
  }

  return value;
};

const toPublicUser = (user: UserRecord): PublicUser => ({
  id: user.id,
  email: user.email,
  displayName: user.display_name,
  baseCurrencyCode: user.base_currency_code,
});

const createToken = (user: UserRecord): string =>
  jwt.sign(
    {
      email: user.email,
    },
    env.jwtSecret,
    {
      subject: user.id.toString(),
      expiresIn: env.jwtExpiresInSeconds,
    }
  );

export const registerUser = async (
  input: RegisterInput
): Promise<AuthResponse> => {
  const email = requireString(input.email, "Email").trim().toLowerCase();
  const displayName = requireString(input.displayName, "Display name").trim();
  const baseCurrencyCode = requireString(
    input.baseCurrencyCode,
    "Base currency code"
  )
    .trim()
    .toUpperCase();
  const password = requireString(input.password, "Password");

  if (!EMAIL_REGEX.test(email)) {
    throw new HttpError(400, "A valid email is required");
  }

  if (displayName.length < 2) {
    throw new HttpError(400, "Display name must be at least 2 characters long");
  }

  if (!CURRENCY_CODE_REGEX.test(baseCurrencyCode)) {
    throw new HttpError(400, "Base currency code must be a 3-letter ISO code");
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(
      400,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`
    );
  }

  const existingUser = await findUserByEmail(email);

  if (existingUser) {
    throw new HttpError(409, "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
  const user = await createUser({
    email,
    displayName,
    baseCurrencyCode,
    passwordHash,
  });

  return {
    token: createToken(user),
    user: toPublicUser(user),
  };
};

export const loginUser = async (input: LoginInput): Promise<AuthResponse> => {
  const email = requireString(input.email, "Email").trim().toLowerCase();
  const password = requireString(input.password, "Password");

  if (!EMAIL_REGEX.test(email)) {
    throw new HttpError(400, "Email and password are required");
  }

  const user = await findUserByEmail(email);

  if (!user) {
    throw new HttpError(401, "Invalid email or password");
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    throw new HttpError(401, "Invalid email or password");
  }

  return {
    token: createToken(user),
    user: toPublicUser(user),
  };
};

export const getUserById = async (userId: number): Promise<PublicUser> => {
  const user = await findUserById(userId);

  if (!user) {
    throw new HttpError(404, "User not found");
  }

  return toPublicUser(user);
};
