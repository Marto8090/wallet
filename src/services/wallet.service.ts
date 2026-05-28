import { randomInt } from "crypto";
import { HttpError } from "../errors/http-error";
import {
  BalanceRecord,
  calculateWalletBalance,
  createDepositTransaction,
  createWallet,
  createWithdrawTransaction,
  CreatedWalletRecord,
  findWalletByIban,
  findWalletByUserIdAndName,
  listWalletsByUserId,
  TransactionRecord,
  WalletSummaryRecord,
} from "../repositories/wallet.repository";

type CreateDepositInput = {
  userId: number;
  walletIban: unknown;
  amount: unknown;
  description: unknown;
};

type CreateWithdrawInput = {
  userId: number;
  walletIban: unknown;
  amount: unknown;
  description: unknown;
};

type CreateWalletInput = {
  userId: number;
  name: unknown;
  currencyCode: unknown;
  initialBalance: unknown;
};

export type PublicWallet = {
  id: number;
  userId: number;
  iban: string;
  name: string;
  currencyCode: string;
  initialBalance: string;
  isArchived: boolean;
  createdAt: Date;
};

export type PublicWalletSummary = PublicWallet & {
  balance: string;
};

export type PublicTransaction = {
  id: number;
  walletId: number;
  transactionType: string;
  amount: string;
  description: string | null;
  occurredAt: Date;
  createdAt: Date;
};

export type PublicBalance = {
  walletId: number;
  walletIban: string;
  amount: string;
};

const DECIMAL_REGEX = /^\d+(\.\d{1,2})?$/;
const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/;
const WALLET_IBAN_REGEX = /^[A-Z0-9]{6}$/;
const ALLOWED_WALLET_CURRENCY_CODES = ["USD", "EUR", "GBP"] as const;
const WALLET_IBAN_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const WALLET_IBAN_GENERATION_ATTEMPTS = 10;

const toPublicWallet = (wallet: CreatedWalletRecord): PublicWallet => ({
  id: wallet.id,
  userId: wallet.userId,
  iban: wallet.iban,
  name: wallet.name,
  currencyCode: wallet.currencyCode,
  initialBalance: wallet.initialBalance,
  isArchived: wallet.isArchived,
  createdAt: wallet.createdAt,
});

const toPublicWalletSummary = (
  wallet: WalletSummaryRecord
): PublicWalletSummary => ({
  ...toPublicWallet(wallet),
  balance: wallet.balance,
});

const toPublicTransaction = (
  transaction: TransactionRecord
): PublicTransaction => ({
  id: transaction.id,
  walletId: transaction.walletId,
  transactionType: transaction.transactionType,
  amount: transaction.amount,
  description: transaction.description,
  occurredAt: transaction.occurredAt,
  createdAt: transaction.createdAt,
});

const toPublicBalance = (balance: BalanceRecord): PublicBalance => ({
  walletId: balance.walletId,
  walletIban: balance.walletIban,
  amount: balance.amount,
});

const createWalletIbanCandidate = (): string => {
  let iban = "";

  for (let index = 0; index < 6; index += 1) {
    iban += WALLET_IBAN_CHARACTERS[randomInt(WALLET_IBAN_CHARACTERS.length)];
  }

  return iban;
};

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "23505";

const getUniqueViolationConstraint = (error: unknown): string | null => {
  if (!isUniqueViolation(error)) {
    return null;
  }

  const constraint = (error as { constraint?: unknown }).constraint;

  return typeof constraint === "string" ? constraint : null;
};

const parseWalletIban = (walletIban: unknown): string => {
  if (typeof walletIban !== "string") {
    throw new HttpError(400, "A valid walletIban is required");
  }

  const normalizedWalletIban = walletIban.trim().toUpperCase();

  if (!WALLET_IBAN_REGEX.test(normalizedWalletIban)) {
    throw new HttpError(
      400,
      "walletIban must be 6 letters and numbers"
    );
  }

  return normalizedWalletIban;
};

const normalizeRequiredString = (
  value: unknown,
  fieldName: string
): string => {
  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} is required`);
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new HttpError(400, `${fieldName} is required`);
  }

  return trimmedValue;
};

const normalizeCurrencyCode = (currencyCode: unknown): string => {
  const normalizedCurrencyCode = normalizeRequiredString(
    currencyCode,
    "Currency code"
  ).toUpperCase();

  if (!CURRENCY_CODE_REGEX.test(normalizedCurrencyCode)) {
    throw new HttpError(400, "Currency code must be a 3-letter ISO code");
  }

  if (!ALLOWED_WALLET_CURRENCY_CODES.includes(
    normalizedCurrencyCode as (typeof ALLOWED_WALLET_CURRENCY_CODES)[number]
  )) {
    throw new HttpError(400, "Currency code must be one of USD, EUR, or GBP");
  }

  return normalizedCurrencyCode;
};

const normalizeAmount = (amount: unknown): string => {
  if (typeof amount !== "string" && typeof amount !== "number") {
    throw new HttpError(400, "Amount must be a positive decimal");
  }

  const amountText = amount.toString().trim();

  if (!DECIMAL_REGEX.test(amountText)) {
    throw new HttpError(400, "Amount must be a positive decimal");
  }

  const numericAmount = Number(amountText);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new HttpError(400, "Amount must be greater than zero");
  }

  return numericAmount.toFixed(2);
};

const normalizeInitialBalance = (initialBalance: unknown): string => {
  if (initialBalance === undefined || initialBalance === null) {
    return "0.00";
  }

  if (
    typeof initialBalance !== "string" &&
    typeof initialBalance !== "number"
  ) {
    throw new HttpError(400, "Initial balance must be a non-negative decimal");
  }

  const initialBalanceText = initialBalance.toString().trim();

  if (!DECIMAL_REGEX.test(initialBalanceText)) {
    throw new HttpError(400, "Initial balance must be a non-negative decimal");
  }

  const numericInitialBalance = Number(initialBalanceText);

  if (!Number.isFinite(numericInitialBalance) || numericInitialBalance < 0) {
    throw new HttpError(400, "Initial balance must be greater than or equal to zero");
  }

  return numericInitialBalance.toFixed(2);
};

const normalizeDescription = (description: unknown): string | null => {
  if (description === undefined || description === null) {
    return null;
  }

  if (typeof description !== "string") {
    throw new HttpError(400, "Description must be a string");
  }

  const trimmedDescription = description.trim();

  return trimmedDescription.length > 0 ? trimmedDescription : null;
};

export const createUserWallet = async (
  input: CreateWalletInput
): Promise<PublicWallet> => {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) {
    throw new HttpError(401, "Invalid or expired token");
  }

  const name = normalizeRequiredString(input.name, "Name");
  const currencyCode = normalizeCurrencyCode(input.currencyCode);
  const initialBalance = normalizeInitialBalance(input.initialBalance);
  const existingWalletWithName = await findWalletByUserIdAndName(
    input.userId,
    name
  );

  if (existingWalletWithName) {
    throw new HttpError(400, "You already have a wallet with this name");
  }

  let wallet: CreatedWalletRecord | null = null;

  for (let attempt = 0; attempt < WALLET_IBAN_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      wallet = await createWallet({
        userId: input.userId,
        iban: createWalletIbanCandidate(),
        name,
        currencyCode,
        initialBalance,
      });
      break;
    } catch (error) {
      const uniqueConstraint = getUniqueViolationConstraint(error);

      if (uniqueConstraint === "wallets_user_name_unique") {
        throw new HttpError(400, "You already have a wallet with this name");
      }

      if (uniqueConstraint !== "wallets_iban_unique") {
        throw error;
      }
    }
  }

  if (!wallet) {
    throw new HttpError(500, "Could not generate a unique wallet IBAN");
  }

  return toPublicWallet(wallet);
};

export const listUserWallets = async (input: {
  userId: number;
}): Promise<PublicWalletSummary[]> => {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) {
    throw new HttpError(401, "Invalid or expired token");
  }

  const wallets = await listWalletsByUserId(input.userId);

  return wallets.map(toPublicWalletSummary);
};

export const createDeposit = async (
  input: CreateDepositInput
): Promise<PublicTransaction> => {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) {
    throw new HttpError(401, "Invalid or expired token");
  }

  const walletIban = parseWalletIban(input.walletIban);
  const amount = normalizeAmount(input.amount);
  const description = normalizeDescription(input.description);
  const wallet = await findWalletByIban(walletIban);

  if (!wallet || wallet.isArchived || wallet.userId !== input.userId) {
    throw new HttpError(404, "Wallet not found");
  }

  const transaction = await createDepositTransaction({
    walletId: wallet.id,
    amount,
    description,
  });

  return toPublicTransaction(transaction);
};

export const createWithdraw = async (
  input: CreateWithdrawInput
): Promise<PublicTransaction> => {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) {
    throw new HttpError(401, "Invalid or expired token");
  }

  const walletIban = parseWalletIban(input.walletIban);
  const amount = normalizeAmount(input.amount);
  const description = normalizeDescription(input.description);
  const wallet = await findWalletByIban(walletIban);

  if (!wallet || wallet.isArchived || wallet.userId !== input.userId) {
    throw new HttpError(404, "Wallet not found");
  }

  const balance = await calculateWalletBalance(wallet.id);

  if (Number(amount) > Number(balance.amount)) {
    throw new HttpError(400, "Insufficient balance");
  }

  const transaction = await createWithdrawTransaction({
    walletId: wallet.id,
    amount,
    description,
  });

  return toPublicTransaction(transaction);
};

export const getWalletBalance = async (input: {
  userId: number;
  walletIban: unknown;
}): Promise<PublicBalance> => {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) {
    throw new HttpError(401, "Invalid or expired token");
  }

  const walletIban = parseWalletIban(input.walletIban);
  const wallet = await findWalletByIban(walletIban);

  if (!wallet || wallet.isArchived || wallet.userId !== input.userId) {
    throw new HttpError(404, "Wallet not found");
  }

  const balance = await calculateWalletBalance(wallet.id);

  return toPublicBalance(balance);
};
