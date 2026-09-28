import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
    const encodedKey = process.env.TIKTOK_TOKEN_ENCRYPTION_KEY;
    if (!encodedKey) throw new Error("TIKTOK_TOKEN_ENCRYPTION_KEY is required");

    const key = Buffer.from(encodedKey, "base64");
    if (key.length !== 32) throw new Error("TIKTOK_TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
    return key;
}

export function encryptToken(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptToken(value: string) {
    const [encodedIv, encodedTag, encodedData] = value.split(".");
    if (!encodedIv || !encodedTag || !encodedData) throw new Error("Stored TikTok token is invalid");

    const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    return Buffer.concat([
        decipher.update(Buffer.from(encodedData, "base64url")),
        decipher.final(),
    ]).toString("utf8");
}
