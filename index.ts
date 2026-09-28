import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import AuthRouter from "./src/Routers/AuthRouter";
import HealthCheckRouter from "./src/Routers/HealthCheckRouter";
import { connectToMongoDB } from "./src/Application/Mongoose";

dotenv.config();

const requiredSettings = [
    "MONGODB_URI",
    "TIKTOK_MINIS_CLIENT_KEY",
    "TIKTOK_MINIS_CLIENT_SECRET",
    "MINI_API_SESSION_SECRET",
    "TIKTOK_TOKEN_ENCRYPTION_KEY",
];

const missingSettings = requiredSettings.filter((setting) => !process.env[setting]);
if (missingSettings.length > 0) {
    throw new Error(`Missing required configuration: ${missingSettings.join(", ")}`);
}

if ((process.env.MINI_API_SESSION_SECRET as string).length < 32) {
    throw new Error("MINI_API_SESSION_SECRET must contain at least 32 characters");
}
if (Buffer.from(process.env.TIKTOK_TOKEN_ENCRYPTION_KEY as string, "base64").length !== 32) {
    throw new Error("TIKTOK_TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
}

const allowedOrigins = (process.env.MINI_WEB_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: allowedOrigins, methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.use(express.json({ limit: "10kb" }));

app.use(async (request, response, next) => {
    try {
        await connectToMongoDB();
        next();
    } catch {
        if (request.path === "/healthCheck") {
            next();
            return;
        }
        response.status(503).json({ statusCode: 503, message: "Database unavailable" });
    }
});

app.use(HealthCheckRouter);
app.use("/auth", AuthRouter);

export = app;
