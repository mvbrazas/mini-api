import express from "express";
import rateLimit from "express-rate-limit";
import { authorizeProfile, getProfile, refreshSession, silentLogin } from "../Application/AuthApplication";
import { clientDiagnostic } from "../Application/DiagnosticApplication";

const router = express.Router();
const clientDiagnosticLimit = rateLimit({
	windowMs: 60 * 1000,
	limit: 10,
	standardHeaders: true,
	legacyHeaders: false,
});

router.post("/silent-login", silentLogin);
router.get("/profile", getProfile);
router.post("/profile/authorize", authorizeProfile);
router.post("/refresh", refreshSession);
router.post("/client-error", clientDiagnosticLimit, clientDiagnostic);

export default router;
