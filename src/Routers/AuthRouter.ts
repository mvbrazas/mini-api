import express from "express";
import rateLimit from "express-rate-limit";
import { getProfileInfo, refreshSession, saveProfileEmail, saveProfileUsername, silentLogin } from "../Application/AuthApplication";
import { clientDiagnostic } from "../Application/DiagnosticApplication";

const router = express.Router();
const clientDiagnosticLimit = rateLimit({
	windowMs: 60 * 1000,
	limit: 10,
	standardHeaders: true,
	legacyHeaders: false,
});

router.post("/silent-login", silentLogin);
router.post("/refresh", refreshSession);
router.put("/profile/email", saveProfileEmail);
router.put("/profile/username", saveProfileUsername);
router.get("/profile", getProfileInfo);
router.post("/client-error", clientDiagnosticLimit, clientDiagnostic);

export default router;
