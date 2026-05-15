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

const router: IRouter = Router();

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

export default router;
