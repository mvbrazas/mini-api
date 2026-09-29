import { Request, Response } from "express";
import { redactClientMessage, writeErrorLog } from "../Helpers/errorLogging";

const ALLOWED_STAGES = new Set([
    "minis_sdk_missing",
    "minis_login",
    "minis_authorize",
    "api_request",
    "api_response",
    "api_refresh",
]);
const ALLOWED_PROFILE_SCOPES = new Set([
    "user.info.basic",
    "user.info.profile",
    "user.info.stats",
]);

function sanitizeScopes(value: unknown) {
    const scopes = Array.isArray(value)
        ? value
        : typeof value === "string"
            ? value.split(/[\s,]+/)
            : [];
    return scopes
        .filter((scope): scope is string => typeof scope === "string" && ALLOWED_PROFILE_SCOPES.has(scope))
        .slice(0, ALLOWED_PROFILE_SCOPES.size);
}

export async function clientDiagnostic(request: Request, response: Response) {
    const { stage, message, status, diagnostics } = request.body ?? {};
    if (
        typeof stage !== "string" || !ALLOWED_STAGES.has(stage)
        || typeof message !== "string" || message.length === 0
    ) {
        response.status(400).json({ message: "A supported stage and error message are required." });
        return;
    }

    const httpStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
    const diagnosticData = diagnostics && typeof diagnostics === "object" && !Array.isArray(diagnostics)
        ? diagnostics as Record<string, unknown>
        : {};
    const requestedScopes = sanitizeScopes(diagnosticData.requestedScopes);
    const grantedScopes = sanitizeScopes(diagnosticData.grantedScopes);
    const providerErrorCode = typeof diagnosticData.providerErrorCode === "string"
        ? diagnosticData.providerErrorCode.slice(0, 80)
        : undefined;
    const providerErrorMessage = typeof diagnosticData.providerErrorMessage === "string"
        ? redactClientMessage(diagnosticData.providerErrorMessage).slice(0, 250)
        : undefined;
    const providerErrorFields = Array.isArray(diagnosticData.providerErrorFields)
        ? diagnosticData.providerErrorFields
            .filter((field): field is string => typeof field === "string")
            .map((field) => field.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80))
            .filter(Boolean)
            .slice(0, 20)
        : [];
    await writeErrorLog(
        "TikTok Minis client login",
        stage,
        redactClientMessage(message),
        {
            origin: request.get("origin") || "unknown",
            httpStatus,
            userAgent: (request.get("user-agent") || "unknown").slice(0, 250),
            requestedScopes,
            grantedScopes,
            providerErrorCode,
            providerErrorMessage,
            providerErrorFields,
        },
    );
    response.status(202).json({ logged: true });
}