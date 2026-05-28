import { Router } from "express";
import {
  createWallet,
  deposit,
  getBalance,
  listWallets,
  withdraw,
} from "../controllers/wallet.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/", requireAuth, createWallet);
router.get("/", requireAuth, listWallets);
router.post("/:walletIban/deposits", requireAuth, deposit);
router.post("/:walletIban/withdrawals", requireAuth, withdraw);
router.get("/:walletIban/balance", requireAuth, getBalance);

export default router;
