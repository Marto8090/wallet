import { Router } from "express";
import { transfer } from "../controllers/transfer.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/", requireAuth, transfer);

export default router;
