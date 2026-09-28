import { model, Schema } from "mongoose";

export interface TikTokUser {
    openId: string;
    encryptedAccessToken: string;
    encryptedRefreshToken: string;
    accessTokenExpiresAt: Date;
    refreshTokenExpiresAt: Date;
    scope: string;
    tokenType: string;
    reauthenticationRequired: boolean;
}

const TikTokUserSchema = new Schema<TikTokUser>({
    openId: { type: String, required: true, unique: true },
    encryptedAccessToken: { type: String, required: true, select: false },
    encryptedRefreshToken: { type: String, required: true, select: false },
    accessTokenExpiresAt: { type: Date, required: true },
    refreshTokenExpiresAt: { type: Date, required: true },
    scope: { type: String, default: "" },
    tokenType: { type: String, default: "Bearer" },
    reauthenticationRequired: { type: Boolean, default: false },
}, { timestamps: true });

export default model<TikTokUser>("TikTokUser", TikTokUserSchema);
