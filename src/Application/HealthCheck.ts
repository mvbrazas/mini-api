import { Response } from "express";
import mongoose from "mongoose";

const MONGOOSE_STATES: Record<number, string> = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
};

export const healthCheck = (_request: unknown, response: Response) => {
    const state = mongoose.connection.readyState;
    const dbStatus = MONGOOSE_STATES[state] ?? "unknown";
    const isHealthy = state === 1;
    const statusCode = isHealthy ? 200 : 503;

    response.status(statusCode).json({
        statusCode,
        version: "1.0.0",
        message: isHealthy ? "Health Check OK" : "Health Check Failed",
        dependencies: {
            mongoose: dbStatus,
        },
    });
};