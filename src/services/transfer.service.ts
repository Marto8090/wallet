import { createHash, randomUUID } from "crypto";
import { PoolClient } from "pg";
import { env } from "../config/env";
import { HttpError } from "../errors/http-error";
import {
  completeIdempotencyKey,
  createOrLockIdempotencyKey,
} from "../repositories/idempotency.repository";
import {
  calculateWalletBalanceForUpdate,
  createTransferLedgerEntry,
  lockWalletByIban,
  LockedWalletRecord,
  TransferLedgerEntryRecord,
  withTransaction,
} from "../repositories/transfer.repository";

type CreateTransferInput = {
  userId: number;
  idempotencyKey: unknown;
  fromWalletIban: unknown;
  toWalletIban: unknown;
  amount: unknown;
  description: unknown;
};

type NormalizedTransferInput = {
  fromWalletIban: string;
  toWalletIban: string;
  amount: string;
  description: string | null;
};

export type PublicTransfer = {
  transferReference: string;
  fromWalletIban: string;
  toWalletIban: string;
  amount: string;
  description: string | null;
  transferOutTransactionId: number;
  transferInTransactionId: number;
  occurredAt: string;
};

type TransferResponseBody = {
  transfer: PublicTransfer;
};

export type TransferResponse = {
  statusCode: number;
  body: TransferResponseBody;
};

const DECIMAL_REGEX = /^\d+(\.\d{1,2})?$/;
const WALLET_IBAN_REGEX = /^[A-Z0-9]{6}$/;
const TRANSFER_ENDPOINT = "POST /transfers";

const parseWalletIban = (walletIban: unknown, fieldName: string): string => {
  if (typeof walletIban !== "string") {
    throw new HttpError(400, `${fieldName} must be 6 letters and numbers`);
  }

  const normalizedWalletIban = walletIban.trim().toUpperCase();

  if (!WALLET_IBAN_REGEX.test(normalizedWalletIban)) {
    throw new HttpError(400, `${fieldName} must be 6 letters and numbers`);
  }

  return normalizedWalletIban;
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

const normalizeIdempotencyKey = (idempotencyKey: unknown): string => {
  if (typeof idempotencyKey !== "string") {
    throw new HttpError(400, "Idempotency-Key header is required");
  }

  const trimmedIdempotencyKey = idempotencyKey.trim();

  if (!trimmedIdempotencyKey) {
    throw new HttpError(400, "Idempotency-Key header is required");
  }

  if (trimmedIdempotencyKey.length > 255) {
    throw new HttpError(
      400,
      "Idempotency-Key must be 255 characters or fewer"
    );
  }

  return trimmedIdempotencyKey;
};

const decimalToCents = (amount: string): bigint => {
  const sign = amount.startsWith("-") ? -1n : 1n;
  const unsignedAmount = amount.replace("-", "");
  const [wholePart, decimalPart = ""] = unsignedAmount.split(".");
  const centsText = decimalPart.padEnd(2, "0").slice(0, 2);

  return sign * (BigInt(wholePart) * 100n + BigInt(centsText));
};

const createRequestHash = (input: NormalizedTransferInput): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        fromWalletIban: input.fromWalletIban,
        toWalletIban: input.toWalletIban,
        amount: input.amount,
        description: input.description,
      })
    )
    .digest("hex");

const getLockedWallets = async (
  client: PoolClient,
  fromWalletIban: string,
  toWalletIban: string
): Promise<{
  fromWallet: LockedWalletRecord | null;
  toWallet: LockedWalletRecord | null;
}> => {
  const lockOrder = [fromWalletIban, toWalletIban].sort();
  const firstWallet = await lockWalletByIban(client, lockOrder[0]);
  const secondWallet = await lockWalletByIban(client, lockOrder[1]);
  const wallets = [firstWallet, secondWallet];

  return {
    fromWallet: wallets.find((wallet) => wallet?.iban === fromWalletIban) ?? null,
    toWallet: wallets.find((wallet) => wallet?.iban === toWalletIban) ?? null,
  };
};

const toPublicTransfer = (
  transferOut: TransferLedgerEntryRecord,
  transferIn: TransferLedgerEntryRecord,
  fromWalletIban: string,
  toWalletIban: string
): PublicTransfer => ({
  transferReference: transferOut.transferReference,
  fromWalletIban,
  toWalletIban,
  amount: transferOut.amount,
  description: transferOut.description,
  transferOutTransactionId: transferOut.id,
  transferInTransactionId: transferIn.id,
  occurredAt: transferOut.occurredAt.toISOString(),
});

export const createTransfer = async (
  input: CreateTransferInput
): Promise<TransferResponse> => {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) {
    throw new HttpError(401, "Invalid or expired token");
  }

  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const fromWalletIban = parseWalletIban(input.fromWalletIban, "fromWalletIban");
  const toWalletIban = parseWalletIban(input.toWalletIban, "toWalletIban");

  if (fromWalletIban === toWalletIban) {
    throw new HttpError(400, "fromWalletIban and toWalletIban must be different");
  }

  const amount = normalizeAmount(input.amount);
  const description = normalizeDescription(input.description);
  const normalizedTransferInput = {
    fromWalletIban,
    toWalletIban,
    amount,
    description,
  };
  const requestHash = createRequestHash(normalizedTransferInput);
  const transferReference = randomUUID();

  return withTransaction(async (client) => {
    const idempotency = await createOrLockIdempotencyKey(client, {
      userId: input.userId,
      endpoint: TRANSFER_ENDPOINT,
      idempotencyKey,
      requestHash,
      ttlSeconds: env.idempotencyKeyTtlSeconds,
    });

    if (idempotency.record.requestHash !== requestHash) {
      throw new HttpError(
        409,
        "Idempotency-Key was already used with a different request"
      );
    }

    if (
      !idempotency.isNew &&
      idempotency.record.status === "completed" &&
      idempotency.record.responseStatusCode !== null
    ) {
      return {
        statusCode: idempotency.record.responseStatusCode,
        body: idempotency.record.responseBody as TransferResponseBody,
      };
    }

    const { fromWallet, toWallet } = await getLockedWallets(
      client,
      fromWalletIban,
      toWalletIban
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

    const balance = await calculateWalletBalanceForUpdate(client, fromWallet.id);

    if (decimalToCents(amount) > decimalToCents(balance)) {
      throw new HttpError(400, "Insufficient balance");
    }

    const transferOut = await createTransferLedgerEntry(client, {
      walletId: fromWallet.id,
      transactionType: "transfer_out",
      amount,
      description,
      transferReference,
    });

    const transferIn = await createTransferLedgerEntry(client, {
      walletId: toWallet.id,
      transactionType: "transfer_in",
      amount,
      description,
      transferReference,
    });

    const response: TransferResponse = {
      statusCode: 201,
      body: {
        transfer: toPublicTransfer(
          transferOut,
          transferIn,
          fromWallet.iban,
          toWallet.iban
        ),
      },
    };

    await completeIdempotencyKey(client, {
      id: idempotency.record.id,
      responseStatusCode: response.statusCode,
      responseBody: response.body,
    });

    return response;
  });
};
