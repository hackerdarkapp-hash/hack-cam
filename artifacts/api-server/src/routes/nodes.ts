import { Router, type IRouter } from "express";
import { getNodes, getSessions, getStats } from "../lib/signaling";

const router: IRouter = Router();

router.get("/nodes", (_req, res): void => {
  const nodes = getNodes().map(({ socketId: _s, ...rest }) => rest);
  res.json(nodes);
});

router.get("/sessions", (_req, res): void => {
  const sessions = getSessions();
  res.json(sessions);
});

router.get("/stats", (_req, res): void => {
  res.json(getStats());
});

export default router;
