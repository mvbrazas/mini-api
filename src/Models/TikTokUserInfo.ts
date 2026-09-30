import { model, Schema } from "mongoose";

export interface TikTokUserInfo {
    openId: string;
    displayName: string | null;
    avatarUrl: string | null;
    username: string | null;
}

const TikTokUserInfoSchema = new Schema<TikTokUserInfo>({
    openId: { type: String, required: true, unique: true },
    displayName: { type: String, default: null },
    avatarUrl: { type: String, default: null },
    username: { type: String, default: null },
}, { timestamps: true, collection: "tiktokuserInfos" });

export default model<TikTokUserInfo>("TikTokUserInfo", TikTokUserInfoSchema);