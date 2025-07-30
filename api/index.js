import app from "../app.js";
import { dbConnection } from "../config/dbConnection.js";

let isConnected = false;

export default async function handler(req, res) {
  if (!isConnected) {
    await dbConnection();
    isConnected = true;
  }

  return app.handle(req, res);
}
