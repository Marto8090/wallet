import express from "express";
import { pool } from "./db";

const app = express();

app.get("/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      status: "ok",
      db: "connected",
      time: result.rows[0].now,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      db: "not connected",
    });
  }
});

app.listen(3000, async () => {
  try {
    await pool.query("SELECT NOW()");
    console.log("DB connected");
  } catch (err) {
    console.error("DB failed", err);
  }
});