import express from "express";
import { healthCheck } from "../Application/HealthCheck";

const router = express.Router();

router.get("/healthCheck", healthCheck);
router.post("/healthCheck", healthCheck);

export default router;