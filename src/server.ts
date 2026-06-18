import app from "./app";
import { env } from "./config/env";
import { ensureSchema } from "./db/schema";
import { cleanupExpiredIdempotencyKeys } from "./repositories/idempotency.repository";
import { cleanupExpiredAuditLogs } from "./services/audit.service";

const startServer = async (): Promise<void> => {
  await ensureSchema();
  await cleanupExpiredIdempotencyKeys();
  await cleanupExpiredAuditLogs();

  app.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
