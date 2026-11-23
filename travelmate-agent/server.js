import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTravelAgent } from "./agent/travelAgent.js";

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "TravelMate Agent" });
});

app.post("/api/plan", async (req, res) => {
  try {
    const { message, history = [] } = req.body ?? {};

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Please enter a travel request." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is missing. Add it to your .env file and restart the server."
      });
    }

    const result = await runTravelAgent(message.trim(), history);
    res.json(result);
  } catch (error) {
    console.error("TravelMate error:", error);
    res.status(500).json({
      error: error.message || "Something went wrong while planning your trip."
    });
  }
});

app.listen(PORT, () => {
  console.log(`TravelMate is running at http://localhost:${PORT}`);
});