import { Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { writeErrorLog } from "../Helpers/errorLogging";
import TikTokUserDB from "../Models/TikTokUser";
import { authorizeUserInfoProfile, exchangeAuthorizationCode, refreshUserTokens, TikTokAuthError } from "../Service/TikTokAuthService";

function createSessionToken(openId: string) {
    return jwt.sign({ sub: openId }, process.env.MINI_API_SESSION_SECRET as string, { expiresIn: "24h" });
}

function getSessionOpenId(request: Request) {
    const [scheme, token] = (request.header("authorization") || "").split(" ");
    if (scheme !== "Bearer" || !token) return null;

    try {
        const payload = jwt.verify(token, process.env.MINI_API_SESSION_SECRET as string) as JwtPayload;
        return typeof payload.sub === "string" ? payload.sub : null;
    } catch {
        return null;
    }
}

async function sendAuthError(request: Request, response: Response, error: unknown, functionName: string) {
    const stage = functionName === "silentLogin"
        ? "token_exchange_or_persist"
        : functionName === "authorizeProfile"
            ? "profile_authorization"
            : "token_refresh";
    if (error instanceof TikTokAuthError) {
        await writeErrorLog(functionName, error.diagnosticCode || String(error.statusCode), error.message, {
            stage,
            origin: request.get("origin") || "unknown",
        });
        response.status(error.statusCode).json({ message: error.message });
        return;
    }
    await writeErrorLog(functionName, "500", error instanceof Error ? error.message : "Unexpected authentication server error", {
        stage,
        errorName: error instanceof Error ? error.name.slice(0, 80) : "UnknownError",
        origin: request.get("origin") || "unknown",
    });
    response.status(500).json({ message: "Sign-in could not be completed. Please try again." });
}

export async function silentLogin(request: Request, response: Response) {
    const code = request.body?.code;
    if (typeof code !== "string" || code.length === 0 || code.length > 2048) {
        await writeErrorLog("silentLogin", "400", "Authorization code validation failed", {
            stage: "validate_authorization_code",
            codeProvided: typeof code === "string" && code.length > 0,
            origin: request.get("origin") || "unknown",
        });
        response.status(400).json({ message: "A valid authorization code is required." });
        return;
    }

    try {
        const { openId, scope } = await exchangeAuthorizationCode(code);
        response.json({
            authenticated: true,
            sessionToken: createSessionToken(openId),
            grantedScopes: scope,
        });
    } catch (error) {
        await sendAuthError(request, response, error, "silentLogin");
    }
}

export async function authorizeProfile(request: Request, response: Response) {
    const openId = getSessionOpenId(request);
    if (!openId) {
        await writeErrorLog("authorizeProfile", "401", "API session token is missing or invalid", {
            stage: "validate_api_session",
            origin: request.get("origin") || "unknown",
        });
        response.status(401).json({ message: "Your session has expired. Please sign in again." });
        return;
    }

    const code = request.body?.code;
    if (typeof code !== "string" || code.length === 0 || code.length > 2048) {
        await writeErrorLog("authorizeProfile", "400", "Profile authorization code validation failed", {
            stage: "validate_authorization_code",
            codeProvided: typeof code === "string" && code.length > 0,
            origin: request.get("origin") || "unknown",
        });
        response.status(400).json({ message: "A valid profile authorization code is required." });
        return;
    }

    try {
        const { profile, scope } = await authorizeUserInfoProfile(openId, code);
        await writeErrorLog("TikTok Minis explicit authorization", "explicit_authorization_success", "TikTok username retrieved", {
            stage: "profile_authorization",
            grantedScopes: scope,
            usernameReturned: Boolean(profile.username),
        });
        response.json({ profile, grantedScopes: scope });
    } catch (error) {
        await sendAuthError(request, response, error, "authorizeProfile");
    }
}

export async function refreshSession(request: Request, response: Response) {
    const openId = getSessionOpenId(request);
    if (!openId) {
        await writeErrorLog("refreshSession", "401", "API session token is missing or invalid", {
            stage: "validate_api_session",
            origin: request.get("origin") || "unknown",
        });
        response.status(401).json({ message: "Your session has expired. Please sign in again." });
        return;
    }

    try {
        const user = await TikTokUserDB.findOne({ openId }).select("_id").exec();
        if (!user) {
            await writeErrorLog("refreshSession", "401", "TikTok account record was not found", {
                stage: "find_tiktok_account",
                origin: request.get("origin") || "unknown",
            });
            response.status(401).json({ message: "Your TikTok account was not found. Please sign in again." });
            return;
        }
        await refreshUserTokens(openId);
        response.json({ authenticated: true, sessionToken: createSessionToken(openId) });
    } catch (error) {
        await sendAuthError(request, response, error, "refreshSession");
    }
}
