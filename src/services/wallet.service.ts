import { HttpError } from "../errors/http-error";
import {
  createDepositTransaction,
  findWalletById,
  TransactionRecord,
} from "../repositories/wallet.repository";

type CreateDepositInput = {
  userId: number;
  walletId: unknown;
  amount: unknown;
  description: unknown;
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

const DECIMAL_REGEX = /^\d+(\.\d{1,2})?$/;

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
