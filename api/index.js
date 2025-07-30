import app from "../app.js";
import { dbConnection } from "../config/dbConnection.js";
import { createServer } from "http";
import { parse } from "url";

let isConnected = false;

export default async function handler(req, res) {
  if (!isConnected) {
    await dbConnection();
    isConnected = true;
  }

  const parsedUrl = parse(req.url, true);

  // Let Express handle the request
  return app.handle(req, res);
}
