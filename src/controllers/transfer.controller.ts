import { Response } from "express";
import { HttpError } from "../errors/http-error";
import {
  getAuditErrorMessage,
  getAuditStatusCode,
  hashAuditValue,
  recordAuditEvent,
} from "../services/audit.service";
import { createTransfer } from "../services/transfer.service";
import { AuthenticatedRequest } from "../types/auth";

const sendError = (res: Response, error: unknown): void => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
};

export const transfer = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = Number(req.user?.sub);
    const result = await createTransfer({
      userId,
      idempotencyKey: req.header("Idempotency-Key"),
      fromWalletIban: req.body?.fromWalletIban,
      toWalletIban: req.body?.toWalletIban,
      amount: req.body?.amount,
      description: req.body?.description,
    });

    res.status(result.statusCode).json(result.body);
  } catch (error) {
    const errorMessage = getAuditErrorMessage(error);

    if (
      errorMessage !==
      "Idempotency-Key was already used with a different request"
    ) {
      const idempotencyKey = req.header("Idempotency-Key");

      await recordAuditEvent({
        userId: Number(req.user?.sub) || null,
        eventType: "transfer.create.failure",
        status: "failure",
        entityType: "transfer",
        metadata: {
          fromWalletIban: req.body?.fromWalletIban,
          toWalletIban: req.body?.toWalletIban,
          amount: req.body?.amount,
          idempotencyKeyHash:
            typeof idempotencyKey === "string"
              ? hashAuditValue(idempotencyKey)
              : null,
          errorMessage,
          statusCode: getAuditStatusCode(error),
        },
      });
    }

    sendError(res, error);
  }
};
