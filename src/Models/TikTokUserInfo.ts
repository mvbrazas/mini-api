import { model, Schema } from "mongoose";

export interface TikTokUserInfo {
    openId: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    email: string | null;
}

const TikTokUserInfoSchema = new Schema<TikTokUserInfo>({
    openId: { type: String, required: true, unique: true },
    username: { type: String },
    displayName: { type: String },
    avatarUrl: { type: String },
    email: { type: String, default: null },
}, { timestamps: true, collection: "tiktokuserInfos" });

export default model<TikTokUserInfo>("TikTokUserInfo", TikTokUserInfoSchema);