import { Response } from "express";
import { HttpError } from "../errors/http-error";
import {
  createDeposit,
  createUserWallet,
  createWithdraw,
  getWalletBalance,
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
      walletType: req.body?.walletType,
      initialBalance: req.body?.initialBalance,
    });

    res.status(201).json({ wallet });
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
      walletId: req.params.walletId,
      amount: req.body?.amount,
      description: req.body?.description,
    });

    res.status(201).json({ transaction });
  } catch (error) {
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
      walletId: req.params.walletId,
      amount: req.body?.amount,
      description: req.body?.description,
    });

    res.status(201).json({ transaction });
  } catch (error) {
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
      walletId: req.params.walletId,
    });

    res.status(200).json({ balance });
  } catch (error) {
    sendError(res, error);
  }
};
