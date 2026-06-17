import { Request, Response } from "express";
import { HttpError } from "../errors/http-error";
import {
  getAuditErrorMessage,
  getAuditStatusCode,
  normalizeAuditEmail,
  recordAuditEvent,
} from "../services/audit.service";
import { getUserById, loginUser, registerUser } from "../services/auth.service";
import { AuthenticatedRequest } from "../types/auth";

const sendError = (res: Response, error: unknown): void => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const authResponse = await registerUser({
      email: req.body.email,
      displayName: req.body.displayName,
      baseCurrencyCode: req.body.baseCurrencyCode,
      password: req.body.password,
    });

    await recordAuditEvent({
      userId: authResponse.user.id,
      eventType: "auth.register.success",
      status: "success",
      entityType: "user",
      entityId: authResponse.user.id,
      metadata: {
        email: authResponse.user.email,
        baseCurrencyCode: authResponse.user.baseCurrencyCode,
      },
    });

    res.status(201).json(authResponse);
  } catch (error) {
    await recordAuditEvent({
      eventType: "auth.register.failure",
      status: "failure",
      entityType: "user",
      metadata: {
        email: normalizeAuditEmail(req.body?.email),
        errorMessage: getAuditErrorMessage(error),
        statusCode: getAuditStatusCode(error),
      },
    });
    sendError(res, error);
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const authResponse = await loginUser({
      email: req.body.email,
      password: req.body.password,
    });

    await recordAuditEvent({
      userId: authResponse.user.id,
      eventType: "auth.login.success",
      status: "success",
      entityType: "user",
      entityId: authResponse.user.id,
      metadata: {
        email: authResponse.user.email,
      },
    });

    res.status(200).json(authResponse);
  } catch (error) {
    await recordAuditEvent({
      eventType: "auth.login.failure",
      status: "failure",
      entityType: "user",
      metadata: {
        email: normalizeAuditEmail(req.body?.email),
        errorMessage: getAuditErrorMessage(error),
        statusCode: getAuditStatusCode(error),
      },
    });
    sendError(res, error);
  }
};

export const getMe = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = Number(req.user?.sub);
    const user = await getUserById(userId);

    res.status(200).json({ user });
  } catch (error) {
    sendError(res, error);
  }
};
