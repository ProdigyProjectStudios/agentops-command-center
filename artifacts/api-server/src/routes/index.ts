import { Router, type IRouter } from "express";
import healthRouter from "./health";
import companiesRouter from "./companies";
import requestsRouter from "./requests";
import workflowsRouter from "./workflows";
import approvalsRouter from "./approvals";
import agentsRouter from "./agents";
import knowledgeRouter from "./knowledge";
import toolCallsRouter from "./tool-calls";
import dashboardRouter from "./dashboard";
import systemRouter from "./system";
import workerRouter from "./worker";

import proofRouter from "./proof";
import { proofRuntimeRouter } from "../lib/proof-runtime";

const router: IRouter = Router();
router.use(proofRuntimeRouter);
router.use(proofRouter);

router.use(healthRouter);
router.use(dashboardRouter);
router.use(companiesRouter);
router.use(requestsRouter);
router.use(workflowsRouter);
router.use(approvalsRouter);
router.use(agentsRouter);
router.use(knowledgeRouter);
router.use(toolCallsRouter);
router.use(systemRouter);
router.use(workerRouter);

export default router;
