import { logger } from "./logger";

const PING_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes
const MAX_BACKOFF_MS = 30 * 1000;        // 30 seconds max back-off

/**
 * Self-ping keep-alive.
 * Hits /api/healthz on a fixed schedule so the Replit container
 * does not enter sleep mode during extended idle periods.
 * Uses exponential back-off if the server is temporarily unavailable.
 */
export function startKeepAlive(port: number): void {
  const url = `http://localhost:${port}/api/healthz`;
  let consecutiveFailures = 0;

  const ping = async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) {
        if (consecutiveFailures > 0) {
          logger.info({ url }, "Keep-alive recovered after failures");
        }
        consecutiveFailures = 0;
        logger.debug({ url }, "Keep-alive ping OK");
      } else {
        consecutiveFailures++;
        logger.warn(
          { url, status: res.status, consecutiveFailures },
          "Keep-alive ping returned non-200",
        );
      }
    } catch (err) {
      consecutiveFailures++;
      const backoff = Math.min(
        1_000 * Math.pow(2, consecutiveFailures),
        MAX_BACKOFF_MS,
      );
      logger.warn(
        { url, consecutiveFailures, nextRetryMs: backoff },
        "Keep-alive ping failed",
      );
    }
  };

  // Initial ping after 30 s, then on a fixed schedule
  setTimeout(() => {
    ping();
    setInterval(ping, PING_INTERVAL_MS);
  }, 30_000);

  logger.info(
    { intervalMs: PING_INTERVAL_MS, url },
    "Keep-alive scheduler started",
  );
}
