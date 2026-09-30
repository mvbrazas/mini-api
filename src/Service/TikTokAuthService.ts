import TikTokUserDB from "../Models/TikTokUser";
import TikTokUserInfoDB, { TikTokUserInfo } from "../Models/TikTokUserInfo";
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
            open_id?: string;
            union_id?: string;
            avatar_url?: string;
            avatar_url_100?: string;
            avatar_large_url?: string;
            display_name?: string;
            bio_description?: string;
            profile_deep_link?: string;
            is_verified?: boolean;
            username?: string;
            follower_count?: number;
            following_count?: number;
            likes_count?: number;
            video_count?: number;
        };
    };
    error?: {
        code?: string;
    };
}

type TikTokApiUser = NonNullable<NonNullable<TikTokUserInfoResponse["data"]>["user"]>;

type TikTokProfileFields = Pick<TikTokUserInfo,
    | "unionId"
    | "avatarUrl"
    | "avatarUrl100"
    | "avatarLargeUrl"
    | "displayName"
    | "bioDescription"
    | "profileDeepLink"
    | "isVerified"
    | "username"
    | "followerCount"
    | "followingCount"
    | "likesCount"
    | "videoCount"
>;

function mapTikTokUserFields(user: TikTokApiUser): Partial<TikTokProfileFields> {
    const profile: Partial<TikTokProfileFields> = {};
    if (typeof user.union_id === "string") profile.unionId = user.union_id;
    if (typeof user.avatar_url === "string") profile.avatarUrl = user.avatar_url;
    if (typeof user.avatar_url_100 === "string") profile.avatarUrl100 = user.avatar_url_100;
    if (typeof user.avatar_large_url === "string") profile.avatarLargeUrl = user.avatar_large_url;
    if (typeof user.display_name === "string") profile.displayName = user.display_name;
    if (typeof user.bio_description === "string") profile.bioDescription = user.bio_description;
    if (typeof user.profile_deep_link === "string") profile.profileDeepLink = user.profile_deep_link;
    if (typeof user.is_verified === "boolean") profile.isVerified = user.is_verified;
    if (typeof user.username === "string") profile.username = user.username;
    if (typeof user.follower_count === "number" && Number.isFinite(user.follower_count)) profile.followerCount = user.follower_count;
    if (typeof user.following_count === "number" && Number.isFinite(user.following_count)) profile.followingCount = user.following_count;
    if (typeof user.likes_count === "number" && Number.isFinite(user.likes_count)) profile.likesCount = user.likes_count;
    if (typeof user.video_count === "number" && Number.isFinite(user.video_count)) profile.videoCount = user.video_count;
    return profile;
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

async function syncTikTokUserInfo(
    openId: string,
    accessToken: string,
    scope: string,
    explicitAuthorization = false,
): Promise<Partial<TikTokProfileFields> | null> {
    const grantedScopes = new Set(scope.split(/[\s,]+/).filter(Boolean));
    const fields: string[] = [];
    if (grantedScopes.has("user.info.basic")) {
        fields.push("open_id", "union_id", "avatar_url", "avatar_url_100", "avatar_large_url", "display_name");
    }
    if (grantedScopes.has("user.info.profile")) {
        fields.push("bio_description", "profile_deep_link", "is_verified", "username");
    }
    if (grantedScopes.has("user.info.stats")) {
        fields.push("follower_count", "following_count", "likes_count", "video_count");
    }
    const legacyProfile = await TikTokUserInfoDB.collection.findOne({ openId }) as { usernameSource?: string } | null;
    await TikTokUserInfoDB.collection.updateOne({ openId }, {
        $unset: {
            email: "",
            usernameSource: "",
            ...(legacyProfile?.usernameSource === "user_provided" ? { username: "" } : {}),
        },
    });
    await TikTokUserInfoDB.findOneAndUpdate({ openId }, {
        $setOnInsert: {
            openId,
            unionId: null,
            avatarUrl: null,
            avatarUrl100: null,
            avatarLargeUrl: null,
            displayName: null,
            bioDescription: null,
            profileDeepLink: null,
            isVerified: null,
            username: null,
            followerCount: null,
            followingCount: null,
            likesCount: null,
            videoCount: null,
        },
    }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();

    if (fields.length === 0) {
        console.info("TikTok profile sync skipped", {
            reason: "no_supported_scopes",
            grantedScopes: Array.from(grantedScopes),
        });
        if (explicitAuthorization) {
            await writeErrorLog("syncTikTokUserInfo", "profile_scope_missing", "TikTok did not grant profile information scopes", {
                stage: "profile_lookup_scope",
                grantedScopes: Array.from(grantedScopes),
            });
        }
        return null;
    }

    try {
        const fetchUserInfo = async (requestedFields: string[]) => {
            const url = new URL(USER_INFO_ENDPOINT);
            url.searchParams.set("fields", requestedFields.join(","));
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(10_000),
            });
            const result = await response.json().catch(() => null) as TikTokUserInfoResponse | null;
            const returnedFields = result?.data?.user
                ? Object.entries(result.data.user)
                    .filter(([, value]) => value !== undefined && value !== null)
                    .map(([field]) => field)
                : [];
            console.info("TikTok User Info response", {
                httpStatus: response.status,
                requestedFields,
                returnedFields,
                grantedScopes: Array.from(grantedScopes),
                providerErrorCode: result?.error?.code || null,
            });
            return { response, result };
        };

        let requestedFields = fields;
        let { response, result } = await fetchUserInfo(requestedFields);
        if ((!response.ok || !result?.data?.user || result.error?.code && result.error.code !== "ok") && fields.includes("username")) {
            requestedFields = fields.filter((field) => field !== "username");
            ({ response, result } = await fetchUserInfo(requestedFields));
        }
        if (!response.ok || !result?.data?.user || result.error?.code && result.error.code !== "ok") {
            await writeErrorLog("syncTikTokUserInfo", result?.error?.code || String(response.status), "TikTok profile lookup failed", {
                stage: "profile_lookup",
                requestedFields,
                grantedScopes: Array.from(grantedScopes),
            });
            return null;
        }

        const profile = mapTikTokUserFields(result.data.user);
        if (Object.keys(profile).length === 0) return null;

        await TikTokUserInfoDB.findOneAndUpdate({ openId }, {
            $set: profile,
            $setOnInsert: { openId },
        }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
        console.info("TikTok profile fields saved", { fields: Object.keys(profile) });
        return profile;
    } catch {
        await writeErrorLog("syncTikTokUserInfo", "profile_lookup_failed", "TikTok profile lookup request failed", {
            stage: "profile_lookup",
            requestedFields: fields,
            grantedScopes: Array.from(grantedScopes),
        });
        return null;
    }
}

export async function exchangeAuthorizationCode(code: string, replaceExistingScopes = false) {
    const data = await requestToken(new URLSearchParams({ code, grant_type: "authorization_code" }));
    if (!data.open_id) throw new TikTokAuthError("TikTok did not return a user identity", 502);
    const scope = await persistTokens(data.open_id, data, undefined, !replaceExistingScopes);
    await syncTikTokUserInfo(data.open_id, data.access_token as string, scope, replaceExistingScopes);
    return { openId: data.open_id, scope };
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
        const scope = await persistTokens(openId, data, refreshToken);
        await syncTikTokUserInfo(openId, data.access_token as string, scope);
    } catch (error) {
        if (error instanceof TikTokAuthError && error.statusCode === 401) {
            await TikTokUserDB.updateOne({ openId }, { $set: { reauthenticationRequired: true } }).exec();
        }
        throw error;
    }
}

export async function fetchTikTokUserInfo(openId: string) {
    await refreshUserTokens(openId);
    const user = await TikTokUserDB.findOne({ openId }).select("+encryptedAccessToken").exec();
    if (!user) throw new TikTokAuthError("TikTok account was not found", 401);

    const accessToken = decryptToken(user.encryptedAccessToken);
    const fieldGroups = [
        ["open_id", "union_id", "avatar_url", "avatar_url_100", "avatar_large_url", "display_name"],
        ["bio_description", "profile_deep_link", "is_verified", "username"],
        ["follower_count", "following_count", "likes_count", "video_count"],
    ];
    const profile: Partial<TikTokProfileFields> = {};

    for (const requestedFields of fieldGroups) {
        try {
            const url = new URL(USER_INFO_ENDPOINT);
            url.searchParams.set("fields", requestedFields.join(","));
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(10_000),
            });
            const result = await response.json().catch(() => null) as TikTokUserInfoResponse | null;
            const userInfo = result?.data?.user;
            const returnedFields = userInfo
                ? Object.entries(userInfo)
                    .filter(([, value]) => value !== undefined && value !== null)
                    .map(([field]) => field)
                : [];
            console.info("TikTok live profile field group", {
                httpStatus: response.status,
                requestedFields,
                returnedFields,
                providerErrorCode: result?.error?.code || null,
            });

            if (!response.ok || !userInfo || result?.error?.code && result.error.code !== "ok") {
                await writeErrorLog("fetchTikTokUserInfo", result?.error?.code || String(response.status), "TikTok profile field group request failed", {
                    stage: "profile_field_group",
                    requestedFields,
                });
                continue;
            }

            Object.assign(profile, mapTikTokUserFields(userInfo));
        } catch {
            await writeErrorLog("fetchTikTokUserInfo", "profile_lookup_failed", "TikTok profile field group request failed", {
                stage: "profile_field_group",
                requestedFields,
            });
        }
    }

    const legacyProfile = await TikTokUserInfoDB.collection.findOne({ openId }) as { usernameSource?: string } | null;
    await TikTokUserInfoDB.collection.updateOne({ openId }, {
        $unset: {
            email: "",
            usernameSource: "",
            ...(legacyProfile?.usernameSource === "user_provided" ? { username: "" } : {}),
        },
    });

    if (Object.keys(profile).length > 0) {
        await TikTokUserInfoDB.findOneAndUpdate({ openId }, {
            $set: profile,
            $setOnInsert: { openId },
        }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
        console.info("TikTok live profile fields saved", { fields: Object.keys(profile) });
    }

    return Object.keys(profile).length > 0 ? profile : null;
}
