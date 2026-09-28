import express from "express";
import { refreshSession, silentLogin } from "../Application/AuthApplication";

const router = express.Router();

router.post("/silent-login", silentLogin);
router.post("/refresh", refreshSession);

export default router;
