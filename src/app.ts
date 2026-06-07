import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes";
import healthRoutes from "./routes/health.routes";
import transferRoutes from "./routes/transfer.routes";
import walletRoutes from "./routes/wallet.routes";

const app = express();
const skipRateLimit = (): boolean => process.env.NODE_ENV === "test";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimit,
  message: { error: "Too many authentication attempts, try again later" },
});

const moneyOperationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimit,
  message: { error: "Too many wallet requests, try again later" },
});

app.use(helmet());
app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));

app.use("/auth", authLimiter, authRoutes);
app.use("/health", healthRoutes);
app.use("/transfers", moneyOperationLimiter, transferRoutes);
app.use("/wallets", moneyOperationLimiter, walletRoutes);

export default app;
