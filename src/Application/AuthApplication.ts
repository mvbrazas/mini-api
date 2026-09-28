import { Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import TikTokUserDB from "../Models/TikTokUser";
import { exchangeAuthorizationCode, refreshUserTokens, TikTokAuthError } from "../Service/TikTokAuthService";

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

function sendAuthError(response: Response, error: unknown) {
    if (error instanceof TikTokAuthError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
    }
    console.error("TikTok authentication request failed");
    response.status(500).json({ message: "Sign-in could not be completed. Please try again." });
}

export async function silentLogin(request: Request, response: Response) {
    const code = request.body?.code;
    if (typeof code !== "string" || code.length === 0 || code.length > 2048) {
        response.status(400).json({ message: "A valid authorization code is required." });
        return;
    }

    try {
        const openId = await exchangeAuthorizationCode(code);
        response.json({ authenticated: true, sessionToken: createSessionToken(openId) });
    } catch (error) {
        sendAuthError(response, error);
    }
}

export async function refreshSession(request: Request, response: Response) {
    const openId = getSessionOpenId(request);
    if (!openId) {
        response.status(401).json({ message: "Your session has expired. Please sign in again." });
        return;
    }

    try {
        const user = await TikTokUserDB.findOne({ openId }).select("_id").exec();
        if (!user) {
            response.status(401).json({ message: "Your TikTok account was not found. Please sign in again." });
            return;
        }
        await refreshUserTokens(openId);
        response.json({ authenticated: true, sessionToken: createSessionToken(openId) });
    } catch (error) {
        sendAuthError(response, error);
    }
}
