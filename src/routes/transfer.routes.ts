import { Router } from "express";
import { transfer } from "../controllers/transfer.controller";
import { requireAuth, requireNonAdmin } from "../middleware/auth.middleware";

const router = Router();

router.post("/", requireAuth, requireNonAdmin, transfer);

export default router;
