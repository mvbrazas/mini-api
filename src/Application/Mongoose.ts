import mongoose from "mongoose";

let connectionPromise: Promise<typeof mongoose> | null = null;

export function connectToMongoDB() {
    if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose);

    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) return Promise.reject(new Error("MONGODB_URI is required"));

    if (!connectionPromise) {
        connectionPromise = mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
            maxPoolSize: 10,
        }).catch((error: unknown) => {
            connectionPromise = null;
            throw error;
        });
    }

    return connectionPromise;
}