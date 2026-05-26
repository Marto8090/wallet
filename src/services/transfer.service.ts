import { randomUUID } from "crypto";
import { PoolClient } from "pg";
import { HttpError } from "../errors/http-error";
import {
  calculateWalletBalanceForUpdate,
  createTransferLedgerEntry,
  lockWalletById,
  LockedWalletRecord,
  TransferLedgerEntryRecord,
  withTransaction,
} from "../repositories/transfer.repository";

type CreateTransferInput = {
  userId: number;
  fromWalletId: unknown;
  toWalletId: unknown;
  amount: unknown;
  description: unknown;
};

export type PublicTransfer = {
  transferReference: string;
  fromWalletId: number;
  toWalletId: number;
  amount: string;
  description: string | null;
  transferOutTransactionId: number;
  transferInTransactionId: number;
  occurredAt: Date;
};

const DECIMAL_REGEX = /^\d+(\.\d{1,2})?$/;

const parseWalletId = (walletId: unknown, fieldName: string): number => {
  if (typeof walletId === "number") {
    if (!Number.isSafeInteger(walletId) || walletId <= 0) {
      throw new HttpError(400, `${fieldName} must be a positive integer`);
    }

    return walletId;
  }

  if (typeof walletId !== "string" || !/^\d+$/.test(walletId)) {
    throw new HttpError(400, `${fieldName} must be a positive integer`);
  }

  const parsedWalletId = Number(walletId);

  if (!Number.isSafeInteger(parsedWalletId) || parsedWalletId <= 0) {
    throw new HttpError(400, `${fieldName} must be a positive integer`);
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

const decimalToCents = (amount: string): bigint => {
  const sign = amount.startsWith("-") ? -1n : 1n;
  const unsignedAmount = amount.replace("-", "");
  const [wholePart, decimalPart = ""] = unsignedAmount.split(".");
  const centsText = decimalPart.padEnd(2, "0").slice(0, 2);

  return sign * (BigInt(wholePart) * 100n + BigInt(centsText));
};

const getLockedWallets = async (
  client: PoolClient,
  fromWalletId: number,
  toWalletId: number
): Promise<{
  fromWallet: LockedWalletRecord | null;
  toWallet: LockedWalletRecord | null;
}> => {
  const lockOrder = [fromWalletId, toWalletId].sort((first, second) => first - second);
  const firstWallet = await lockWalletById(client, lockOrder[0]);
  const secondWallet = await lockWalletById(client, lockOrder[1]);
  const wallets = [firstWallet, secondWallet];

  return {
    fromWallet: wallets.find((wallet) => wallet?.id === fromWalletId) ?? null,
    toWallet: wallets.find((wallet) => wallet?.id === toWalletId) ?? null,
  };
};

const toPublicTransfer = (
  transferOut: TransferLedgerEntryRecord,
  transferIn: TransferLedgerEntryRecord
): PublicTransfer => ({
  transferReference: transferOut.transferReference,
  fromWalletId: transferOut.walletId,
  toWalletId: transferIn.walletId,
  amount: transferOut.amount,
  description: transferOut.description,
  transferOutTransactionId: transferOut.id,
  transferInTransactionId: transferIn.id,
  occurredAt: transferOut.occurredAt,
});

export const createTransfer = async (
  input: CreateTransferInput
): Promise<PublicTransfer> => {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) {
    throw new HttpError(401, "Invalid or expired token");
  }

  const fromWalletId = parseWalletId(input.fromWalletId, "fromWalletId");
  const toWalletId = parseWalletId(input.toWalletId, "toWalletId");

  if (fromWalletId === toWalletId) {
    throw new HttpError(400, "fromWalletId and toWalletId must be different");
  }

  const amount = normalizeAmount(input.amount);
  const description = normalizeDescription(input.description);
  const transferReference = randomUUID();

  return withTransaction(async (client) => {
    const { fromWallet, toWallet } = await getLockedWallets(
      client,
      fromWalletId,
      toWalletId
    );

    if (!fromWallet || fromWallet.isArchived || fromWallet.userId !== input.userId) {
      throw new HttpError(404, "Sender wallet not found");
    }

    if (!toWallet || toWallet.isArchived) {
      throw new HttpError(404, "Receiver wallet not found");
    }

    if (fromWallet.currencyCode !== toWallet.currencyCode) {
      throw new HttpError(400, "Wallet currency codes must match");
    }

    const balance = await calculateWalletBalanceForUpdate(client, fromWalletId);

    if (decimalToCents(amount) > decimalToCents(balance)) {
      throw new HttpError(400, "Insufficient balance");
    }

    const transferOut = await createTransferLedgerEntry(client, {
      walletId: fromWalletId,
      transactionType: "transfer_out",
      amount,
      description,
      transferReference,
    });

    const transferIn = await createTransferLedgerEntry(client, {
      walletId: toWalletId,
      transactionType: "transfer_in",
      amount,
      description,
      transferReference,
    });

    return toPublicTransfer(transferOut, transferIn);
  });
};
