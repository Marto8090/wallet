import { Router } from "express";
import {
  createWallet,
  deposit,
  getBalance,
} from "../controllers/wallet.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/", requireAuth, createWallet);
router.post("/:walletId/deposits", requireAuth, deposit);
router.get("/:walletId/balance", requireAuth, getBalance);

export default router;
