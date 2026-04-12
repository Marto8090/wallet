import { Router } from "express";
import {
  createWallet,
  deposit,
  getBalance,
  withdraw,
} from "../controllers/wallet.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/", requireAuth, createWallet);
router.post("/:walletId/deposits", requireAuth, deposit);
router.post("/:walletId/withdrawals", requireAuth, withdraw);
router.get("/:walletId/balance", requireAuth, getBalance);

export default router;
