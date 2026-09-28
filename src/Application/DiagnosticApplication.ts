import { Request, Response } from "express";
import { redactClientMessage, writeErrorLog } from "../Helpers/errorLogging";

const ALLOWED_STAGES = new Set([
    "minis_sdk_missing",
    "minis_login",
    "api_request",
    "api_response",
    "api_refresh",
]);

export async function clientDiagnostic(request: Request, response: Response) {
    const { stage, message, status } = request.body ?? {};
    if (
        typeof stage !== "string" || !ALLOWED_STAGES.has(stage)
        || typeof message !== "string" || message.length === 0
    ) {
        response.status(400).json({ message: "A supported stage and error message are required." });
        return;
    }

    const httpStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
    await writeErrorLog(
        "TikTok Minis client login",
        stage,
        redactClientMessage(message),
        {
            origin: request.get("origin") || "unknown",
            httpStatus,
            userAgent: (request.get("user-agent") || "unknown").slice(0, 250),
        },
    );
    response.status(202).json({ logged: true });
}