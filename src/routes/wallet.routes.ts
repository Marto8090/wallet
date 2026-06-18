import { Router } from "express";
import {
  createWallet,
  deposit,
  getBalance,
  listWallets,
  withdraw,
} from "../controllers/wallet.controller";
import { requireAuth, requireNonAdmin } from "../middleware/auth.middleware";

const router = Router();

router.post("/", requireAuth, requireNonAdmin, createWallet);
router.get("/", requireAuth, requireNonAdmin, listWallets);
router.post("/:walletIban/deposits", requireAuth, requireNonAdmin, deposit);
router.post("/:walletIban/withdrawals", requireAuth, requireNonAdmin, withdraw);
router.get("/:walletIban/balance", requireAuth, requireNonAdmin, getBalance);

export default router;
