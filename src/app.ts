import express from "express";
import authRoutes from "./routes/auth.routes";
import healthRoutes from "./routes/health.routes";
import walletRoutes from "./routes/wallet.routes";

const app = express();

app.use(express.json());

app.use("/auth", authRoutes);
app.use("/health", healthRoutes);
app.use("/wallets", walletRoutes);

export default app;
