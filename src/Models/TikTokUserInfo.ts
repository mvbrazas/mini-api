import { model, Schema } from "mongoose";

export interface TikTokUserInfo {
    openId: string;
    unionId: string | null;
    avatarUrl: string | null;
    avatarUrl100: string | null;
    avatarLargeUrl: string | null;
    displayName: string | null;
    bioDescription: string | null;
    profileDeepLink: string | null;
    isVerified: boolean | null;
    username: string | null;
    followerCount: number | null;
    followingCount: number | null;
    likesCount: number | null;
    videoCount: number | null;
}

const TikTokUserInfoSchema = new Schema<TikTokUserInfo>({
    openId: { type: String, required: true, unique: true },
    unionId: { type: String, default: null },
    avatarUrl: { type: String, default: null },
    avatarUrl100: { type: String, default: null },
    avatarLargeUrl: { type: String, default: null },
    displayName: { type: String, default: null },
    bioDescription: { type: String, default: null },
    profileDeepLink: { type: String, default: null },
    isVerified: { type: Boolean, default: null },
    username: { type: String, default: null },
    followerCount: { type: Number, default: null },
    followingCount: { type: Number, default: null },
    likesCount: { type: Number, default: null },
    videoCount: { type: Number, default: null },
}, { timestamps: true, collection: "tiktokuserInfos" });

export default model<TikTokUserInfo>("TikTokUserInfo", TikTokUserInfoSchema);