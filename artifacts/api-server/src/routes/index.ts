import { Router, type IRouter } from "express";
import healthRouter from "./health";
import nodesRouter from "./nodes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(nodesRouter);

export default router;
