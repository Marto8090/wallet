import { Request, Response } from "express";
import { pool } from "../db";

export const getHealth = async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.status(200).json({
      status: "ok",
      db: "connected",
      time: result.rows[0].now,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      db: "not connected",
    });
  }
};