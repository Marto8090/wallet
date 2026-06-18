import { Response } from "express";
import { HttpError } from "../errors/http-error";
import {
  cleanupExpiredAuditLogs,
  listAuditEvents,
} from "../services/audit.service";
import { AuthenticatedRequest } from "../types/auth";

const sendError = (res: Response, error: unknown): void => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
};

export const getAuditLogs = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const result = await listAuditEvents(req.query);

    res.status(200).json({
      auditLogs: result.auditLogs,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (error) {
    sendError(res, error);
  }
};

export const deleteExpiredAuditLogs = async (
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const result = await cleanupExpiredAuditLogs();

    res.status(200).json(result);
  } catch (error) {
    sendError(res, error);
  }
};
