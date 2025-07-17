import express from "express";
import mongoose from "mongoose";
import "dotenv/config";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { dbConnection } from "./config/dbConnection.js";
import { logger } from "./middleware/logger.js";

const app = express();
const PORT = process.env.PORT || 5000;

/* ---------------------------- Core Middlewares ---------------------------- */

// Security headers
app.use(helmet());

// Compress responses
app.use(compression());

// JSON + URL-encoded parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting for API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, try again later",
});
app.use("/api", apiLimiter);

// Basic logging (optional)
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

/* ---------------------------- Routes ---------------------------- */
import healthRoute from "./routes/health.js";
app.use("/api/health", healthRoute);

// Example route
app.get("/", (req, res) => {
  res.send("API is running...");
});

/* -------------------------- Graceful Shutdown -------------------------- */
process.on("SIGINT", async () => {
  console.log("🔌 SIGINT received. Closing MongoDB...");
  await mongoose.connection.close();
  console.log("✅ MongoDB disconnected");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🔌 SIGTERM received. Closing MongoDB...");
  await mongoose.connection.close();
  console.log("✅ MongoDB disconnected");
  process.exit(0);
});

/* ------------------------- Global Error Catchers ------------------------- */
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Promise Rejection:", err);
  process.exit(1);
});

/* ---------------------------- Start Server ---------------------------- */
dbConnection().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server started on port ${PORT}`));
});
