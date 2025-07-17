import express from "express";
const app = express();

app.get("/api/test", (req, res) => {
  res.json({ message: "API working 🎉" });
});

export default app;
