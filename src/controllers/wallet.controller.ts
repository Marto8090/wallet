import { Response } from "express";
import { HttpError } from "../errors/http-error";
import {
  getAuditErrorMessage,
  getAuditStatusCode,
  recordAuditEvent,
} from "../services/audit.service";
import {
  createDeposit,
  createUserWallet,
  createWithdraw,
  getWalletBalance,
  listUserWallets,
} from "../services/wallet.service";
import { AuthenticatedRequest } from "../types/auth";

const sendError = (res: Response, error: unknown): void => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
};

export const createWallet = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = Number(req.user?.sub);
    const wallet = await createUserWallet({
      userId,
      name: req.body?.name,
      currencyCode: req.body?.currencyCode,
      initialBalance: req.body?.initialBalance,
    });

    await recordAuditEvent({
      userId,
      eventType: "wallet.create.success",
      status: "success",
      entityType: "wallet",
      entityId: wallet.id,
      metadata: {
        walletIban: wallet.iban,
        currencyCode: wallet.currencyCode,
        initialBalance: wallet.initialBalance,
      },
    });

    res.status(201).json({ wallet });
  } catch (error) {
    await recordAuditEvent({
      userId: Number(req.user?.sub) || null,
      eventType: "wallet.create.failure",
      status: "failure",
      entityType: "wallet",
      metadata: {
        currencyCode: req.body?.currencyCode,
        initialBalance: req.body?.initialBalance,
        errorMessage: getAuditErrorMessage(error),
        statusCode: getAuditStatusCode(error),
      },
    });
    sendError(res, error);
  }
};

export const listWallets = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = Number(req.user?.sub);
    const wallets = await listUserWallets({ userId });

    res.status(200).json({ wallets });
  } catch (error) {
    sendError(res, error);
  }
};

export const deposit = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = Number(req.user?.sub);
    const transaction = await createDeposit({
      userId,
      walletIban: req.params.walletIban,
      amount: req.body?.amount,
      description: req.body?.description,
    });

    await recordAuditEvent({
      userId,
      eventType: "wallet.deposit.success",
      status: "success",
      entityType: "transaction",
      entityId: transaction.id,
      metadata: {
        walletIban: req.params.walletIban,
        walletId: transaction.walletId,
        amount: transaction.amount,
      },
    });

    res.status(201).json({ transaction });
  } catch (error) {
    await recordAuditEvent({
      userId: Number(req.user?.sub) || null,
      eventType: "wallet.deposit.failure",
      status: "failure",
      entityType: "transaction",
      metadata: {
        walletIban: req.params.walletIban,
        amount: req.body?.amount,
        errorMessage: getAuditErrorMessage(error),
        statusCode: getAuditStatusCode(error),
      },
    });
    sendError(res, error);
  }
};

export const withdraw = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = Number(req.user?.sub);
    const transaction = await createWithdraw({
      userId,
      walletIban: req.params.walletIban,
      amount: req.body?.amount,
      description: req.body?.description,
    });

    await recordAuditEvent({
      userId,
      eventType: "wallet.withdraw.success",
      status: "success",
      entityType: "transaction",
      entityId: transaction.id,
      metadata: {
        walletIban: req.params.walletIban,
        walletId: transaction.walletId,
        amount: transaction.amount,
      },
    });

    res.status(201).json({ transaction });
  } catch (error) {
    await recordAuditEvent({
      userId: Number(req.user?.sub) || null,
      eventType: "wallet.withdraw.failure",
      status: "failure",
      entityType: "transaction",
      metadata: {
        walletIban: req.params.walletIban,
        amount: req.body?.amount,
        errorMessage: getAuditErrorMessage(error),
        statusCode: getAuditStatusCode(error),
      },
    });
    sendError(res, error);
  }
};

export const getBalance = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = Number(req.user?.sub);
    const balance = await getWalletBalance({
      userId,
      walletIban: req.params.walletIban,
    });

    res.status(200).json({ balance });
  } catch (error) {
    sendError(res, error);
  }
};
