import { model, Schema } from "mongoose";

export interface TikTokUserInfo {
    openId: string;
    username: string | null;
    usernameSource: "tiktok" | "user_provided" | null;
    displayName: string | null;
    avatarUrl: string | null;
    email: string | null;
}

const TikTokUserInfoSchema = new Schema<TikTokUserInfo>({
    openId: { type: String, required: true, unique: true },
    username: { type: String, default: null },
    usernameSource: { type: String, enum: ["tiktok", "user_provided", null], default: null },
    displayName: { type: String, default: null },
    avatarUrl: { type: String, default: null },
    email: { type: String, default: null },
}, { timestamps: true, collection: "tiktokuserInfos" });

export default model<TikTokUserInfo>("TikTokUserInfo", TikTokUserInfoSchema);