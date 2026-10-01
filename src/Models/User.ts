import { model, Schema } from "mongoose";

export interface User {
    openId: string;
    displayName: string | null;
    avatarUrl: string | null;
}

const UserSchema = new Schema<User>({
    openId: { type: String, required: true, unique: true },
    displayName: { type: String, default: null },
    avatarUrl: { type: String, default: null },
}, { timestamps: true, collection: "User" });

export default model<User>("User", UserSchema);