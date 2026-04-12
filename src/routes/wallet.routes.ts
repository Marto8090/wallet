import { Router } from "express";
import { deposit } from "../controllers/wallet.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/:walletId/deposits", requireAuth, deposit);

export default router;
