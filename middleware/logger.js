// Import the Winston logging library
import winston from "winston";

// Create and export a logger instance
// Logs will be printed to the console with level "info" and above
export const logger = winston.createLogger({
  level: "info", // Logging level (info, warn, error, etc.)
  transports: [
    new winston.transports.Console() // Output logs to console
  ],
});
