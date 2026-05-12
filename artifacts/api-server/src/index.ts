import { createServer } from "http";
import app from "./app";
import { setupSignaling } from "./lib/signaling";
import { startKeepAlive } from "./lib/keepalive";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);
setupSignaling(httpServer);

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
  startKeepAlive(port);
});

httpServer.on("error", (err) => {
  logger.error({ err }, "HTTP server error");
  process.exit(1);
});
