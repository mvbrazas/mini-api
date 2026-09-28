import { model, Schema } from "mongoose";

const ErrorLogSchema = new Schema({
    createdBy: { type: String, default: "Mini Drama" },
    updatedBy: { type: String, default: "Mini Drama" },
    errorResponse: { type: String, required: true },
    functionName: { type: String, required: true },
    errorCode: { type: String, required: true },
    parameters: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
}, { collection: "ErrorLogs", strict: false });

export default model("ErrorLogs", ErrorLogSchema);