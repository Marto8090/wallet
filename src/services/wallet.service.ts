import { HttpError } from "../errors/http-error";
import {
  BalanceRecord,
  calculateWalletBalance,
  createDepositTransaction,
  createWallet,
  createWithdrawTransaction,
  CreatedWalletRecord,
  findWalletById,
  TransactionRecord,
} from "../repositories/wallet.repository";

type CreateDepositInput = {
  userId: number;
  walletId: unknown;
  amount: unknown;
  description: unknown;
};

type CreateWithdrawInput = {
  userId: number;
  walletId: unknown;
  amount: unknown;
  description: unknown;
};

type CreateWalletInput = {
  userId: number;
  name: unknown;
  currencyCode: unknown;
  walletType: unknown;
  initialBalance: unknown;
};

export type PublicWallet = {
  id: number;
  userId: number;
  name: string;
  currencyCode: string;
  walletType: string;
  initialBalance: string;
  isArchived: boolean;
  createdAt: Date;
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
  amount: string;
};

const DECIMAL_REGEX = /^\d+(\.\d{1,2})?$/;
const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/;

const toPublicWallet = (wallet: CreatedWalletRecord): PublicWallet => ({
  id: wallet.id,
  userId: wallet.userId,
  name: wallet.name,
  currencyCode: wallet.currencyCode,
  walletType: wallet.walletType,
  initialBalance: wallet.initialBalance,
  isArchived: wallet.isArchived,
  createdAt: wallet.createdAt,
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
  amount: balance.amount,
});

const parseWalletId = (walletId: unknown): number => {
  if (typeof walletId !== "string" || !/^\d+$/.test(walletId)) {
    throw new HttpError(400, "A valid walletId is required");
  }

  const parsedWalletId = Number(walletId);

  if (!Number.isSafeInteger(parsedWalletId) || parsedWalletId <= 0) {
    throw new HttpError(400, "A valid walletId is required");
  }

  return parsedWalletId;
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
  const walletType = normalizeRequiredString(input.walletType, "Wallet type");
  const initialBalance = normalizeInitialBalance(input.initialBalance);

  const wallet = await createWallet({
    userId: input.userId,
    name,
    currencyCode,
    walletType,
    initialBalance,
  });

  return toPublicWallet(wallet);
};

export const createDeposit = async (
  input: CreateDepositInput
): Promise<PublicTransaction> => {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) {
    throw new HttpError(401, "Invalid or expired token");
  }

  const walletId = parseWalletId(input.walletId);
  const amount = normalizeAmount(input.amount);
  const description = normalizeDescription(input.description);
  const wallet = await findWalletById(walletId);

  if (!wallet || wallet.isArchived || wallet.userId !== input.userId) {
    throw new HttpError(404, "Wallet not found");
  }

  const transaction = await createDepositTransaction({
    walletId,
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

  const walletId = parseWalletId(input.walletId);
  const amount = normalizeAmount(input.amount);
  const description = normalizeDescription(input.description);
  const wallet = await findWalletById(walletId);

  if (!wallet || wallet.isArchived || wallet.userId !== input.userId) {
    throw new HttpError(404, "Wallet not found");
  }

  const balance = await calculateWalletBalance(walletId);

  if (Number(amount) > Number(balance.amount)) {
    throw new HttpError(400, "Insufficient balance");
  }

  const transaction = await createWithdrawTransaction({
    walletId,
    amount,
    description,
  });

  return toPublicTransaction(transaction);
};

export const getWalletBalance = async (input: {
  userId: number;
  walletId: unknown;
}): Promise<PublicBalance> => {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) {
    throw new HttpError(401, "Invalid or expired token");
  }

  const walletId = parseWalletId(input.walletId);
  const wallet = await findWalletById(walletId);

  if (!wallet || wallet.isArchived || wallet.userId !== input.userId) {
    throw new HttpError(404, "Wallet not found");
  }

  const balance = await calculateWalletBalance(walletId);

  return toPublicBalance(balance);
};
