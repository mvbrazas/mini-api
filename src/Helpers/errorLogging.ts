import ErrorLogDB from "../Models/ErrorLog";

function redact(value: string) {
    return value
        .replace(/["']?\b(client_secret|access_token|refresh_token|authorization|code)["']?\s*[:=]\s*["']?[^\s,"'&}]+/gi, "$1=[REDACTED]")
        .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[DATABASE_URI]")
        .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, "[TOKEN]")
        .slice(0, 400);
}

export async function writeErrorLog(
    functionName: string,
    errorCode: string,
    errorResponse: string,
    parameters: Record<string, unknown>,
) {
    try {
        await ErrorLogDB.create({
            createdBy: "Mini Drama",
            updatedBy: "Mini Drama",
            functionName,
            errorCode,
            errorResponse: redact(errorResponse),
            parameters,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    } catch {
        console.error("Unable to persist Mini Drama error log", { functionName, errorCode });
    }
}

export function redactClientMessage(message: string) {
    return redact(message);
}