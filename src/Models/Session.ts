import { model, Schema } from "mongoose";

export interface Session {
    openId: string;
    encryptedAccessToken: string;
    encryptedRefreshToken: string;
    accessTokenExpiresAt: Date;
    refreshTokenExpiresAt: Date;
    scope: string;
    tokenType: string;
    reauthenticationRequired: boolean;
}

const SessionSchema = new Schema<Session>({
    openId: { type: String, required: true, unique: true },
    encryptedAccessToken: { type: String, required: true, select: false },
    encryptedRefreshToken: { type: String, required: true, select: false },
    accessTokenExpiresAt: { type: Date, required: true },
    refreshTokenExpiresAt: { type: Date, required: true },
    scope: { type: String, default: "" },
    tokenType: { type: String, default: "Bearer" },
    reauthenticationRequired: { type: Boolean, default: false },
}, { timestamps: true, collection: "Session" });

export default model<Session>("Session", SessionSchema);