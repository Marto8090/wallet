import { Router } from "express";
import {
  deleteExpiredAuditLogs,
  getAuditLogs,
} from "../controllers/admin.controller";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.get("/audit-logs", requireAuth, requireAdmin, getAuditLogs);
router.delete(
  "/audit-logs/expired",
  requireAuth,
  requireAdmin,
  deleteExpiredAuditLogs
);

export default router;
