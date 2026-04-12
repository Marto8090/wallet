import app from "./app";
import { env } from "./config/env";
import { ensureSchema } from "./db/schema";

const startServer = async (): Promise<void> => {
  await ensureSchema();

  app.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
