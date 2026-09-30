import TikTokUserDB from "../Models/TikTokUser";
import TikTokUserInfoDB from "../Models/TikTokUserInfo";
import { writeErrorLog } from "../Helpers/errorLogging";
import { decryptToken, encryptToken } from "../Helpers/tokenEncryption";

const TOKEN_ENDPOINT = "https://open.tiktokapis.com/v2/oauth/token/";
const USER_INFO_ENDPOINT = "https://open.tiktokapis.com/v2/user/info/";
const REFRESH_EARLY_MS = 30 * 60 * 1000;

interface TikTokTokenResponse {
    open_id?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
}

interface TikTokUserInfoResponse {
    data?: {
        user?: {
            display_name?: string;
            avatar_url?: string;
            username?: string;
        };
    };
    error?: {
        code?: string;
    };
}

export interface TikTokBasicProfile {
    displayName: string;
    avatarUrl: string;
    username: string;
}

export class TikTokAuthError extends Error {
    readonly statusCode: number;
    readonly diagnosticCode?: string;

    constructor(message: string, statusCode: number, diagnosticCode?: string) {
        super(message);
        this.name = "TikTokAuthError";
        this.statusCode = statusCode;
        this.diagnosticCode = diagnosticCode;
    }
}

async function requestToken(parameters: URLSearchParams): Promise<TikTokTokenResponse> {
    parameters.set("client_key", process.env.TIKTOK_MINIS_CLIENT_KEY as string);
    parameters.set("client_secret", process.env.TIKTOK_MINIS_CLIENT_SECRET as string);

    let response: Response;
    try {
        response = await fetch(TOKEN_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: parameters,
            signal: AbortSignal.timeout(10_000),
        });
    } catch {
        throw new TikTokAuthError("TikTok authentication is temporarily unavailable", 502);
    }

    const data = await response.json().catch(() => null) as TikTokTokenResponse | null;
    if (!response.ok || !data || data.error) {
        const providerCode = typeof data?.error === "string" && /^[a-z0-9_-]{1,80}$/i.test(data.error)
            ? data.error
            : `http_${response.status}`;
        const description = typeof data?.error_description === "string"
            ? `: ${data.error_description}`
            : "";
        throw new TikTokAuthError(`TikTok token endpoint rejected the request${description}`, response.ok ? 401 : 502, providerCode);
    }
    return data;
}

function tokenExpiry(seconds: number | undefined, name: string) {
    if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
        throw new TikTokAuthError(`TikTok returned an invalid ${name}`, 502);
    }
    return new Date(Date.now() + seconds * 1000);
}

async function persistTokens(
    openId: string,
    data: TikTokTokenResponse,
    previousRefreshToken?: string,
    preserveExistingScopes = true,
) {
    if (!data.access_token || !data.refresh_token && !previousRefreshToken) {
        throw new TikTokAuthError("TikTok returned an incomplete token response", 502);
    }

    const existing = await TikTokUserDB.findOne({ openId }).select("+encryptedRefreshToken").exec();
    const refreshExpiry = data.refresh_expires_in
        ? tokenExpiry(data.refresh_expires_in, "refresh token expiry")
        : existing?.refreshTokenExpiresAt;
    if (!refreshExpiry) throw new TikTokAuthError("TikTok returned an invalid refresh token expiry", 502);

    const returnedScopes = new Set((data.scope || "").split(/[\s,]+/).filter(Boolean));
    if (preserveExistingScopes) {
        for (const existingScope of (existing?.scope || "").split(/[\s,]+/).filter(Boolean)) {
            returnedScopes.add(existingScope);
        }
    }
    const scope = preserveExistingScopes
        ? Array.from(returnedScopes).join(",") || existing?.scope || ""
        : data.scope || "";
    await TikTokUserDB.findOneAndUpdate({ openId }, {
        $set: {
            encryptedAccessToken: encryptToken(data.access_token),
            encryptedRefreshToken: encryptToken(data.refresh_token || previousRefreshToken as string),
            accessTokenExpiresAt: tokenExpiry(data.expires_in, "access token expiry"),
            refreshTokenExpiresAt: refreshExpiry,
            scope,
            tokenType: data.token_type || existing?.tokenType || "Bearer",
            reauthenticationRequired: false,
        },
    }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
    return scope;
}

async function fetchTikTokBasicProfile(openId: string, accessToken: string): Promise<TikTokBasicProfile | null> {
    try {
        const url = new URL(USER_INFO_ENDPOINT);
        url.searchParams.set("fields", "display_name,avatar_url,username");
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(10_000),
        });
        const result = await response.json().catch(() => null) as TikTokUserInfoResponse | null;
        const user = result?.data?.user;
        console.log("Fetched TikTok user info:", user);
        if (!response.ok || !user || result?.error?.code && result.error.code !== "ok") {
            await writeErrorLog("fetchTikTokBasicProfile", result?.error?.code || String(response.status), "TikTok basic profile lookup failed", {
                stage: "profile_lookup",
            });
            return null;
        }

        const profile = {
            displayName: user.display_name || "",
            avatarUrl: user.avatar_url || "",
            username: user.username || "",
        };
        if (!profile.displayName && !profile.avatarUrl) return null;

        await TikTokUserInfoDB.findOneAndUpdate({ openId }, {
            $set: profile,
            $setOnInsert: { openId },
        }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
        return profile;
    } catch {
        await writeErrorLog("fetchTikTokBasicProfile", "profile_lookup_failed", "TikTok basic profile lookup request failed", {
            stage: "profile_lookup",
        });
        return null;
    }
}

export async function exchangeAuthorizationCode(code: string, requestBasicProfile = false) {
    const data = await requestToken(new URLSearchParams({ code, grant_type: "authorization_code" }));
    if (!data.open_id) throw new TikTokAuthError("TikTok did not return a user identity", 502);
    const grantedScopes = new Set((data.scope || "").split(/[\s,]+/).filter(Boolean));
    if (requestBasicProfile && !grantedScopes.has("user.info.basic")) {
        throw new TikTokAuthError("TikTok did not grant user.info.basic", 403, "profile_scope_missing");
    }
    const scope = await persistTokens(data.open_id, data);
    const profile = requestBasicProfile
        ? await fetchTikTokBasicProfile(data.open_id, data.access_token as string)
        : null;
    return { openId: data.open_id, scope, profile };
}

export async function refreshUserTokens(openId: string) {
    const user = await TikTokUserDB.findOne({ openId }).select("+encryptedRefreshToken").exec();
    if (!user) throw new TikTokAuthError("TikTok account was not found", 401);
    if (user.reauthenticationRequired || user.refreshTokenExpiresAt <= new Date()) {
        throw new TikTokAuthError("TikTok sign-in must be completed again", 401);
    }
    if (user.accessTokenExpiresAt.getTime() > Date.now() + REFRESH_EARLY_MS) return;

    const refreshToken = decryptToken(user.encryptedRefreshToken);
    try {
        const data = await requestToken(new URLSearchParams({
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }));
        await persistTokens(openId, data, refreshToken);
    } catch (error) {
        if (error instanceof TikTokAuthError && error.statusCode === 401) {
            await TikTokUserDB.updateOne({ openId }, { $set: { reauthenticationRequired: true } }).exec();
        }
        throw error;
    }
}
