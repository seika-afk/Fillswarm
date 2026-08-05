import express, { type Response } from "express";
import type { Server } from "http";
import { closeBrowser, ensureBrowser } from "../shared/browser";
import { runClickFlow } from "../f1/Click_feature/clickQuery";
import { runFillFlow } from "../f2/fill_form/fill_form";
import multer from "multer"
import fs from "fs/promises";
import os from "os";
import path from "path";



type JsonRecord = Record<string, unknown>;

const app = express();
app.use(express.json({ limit: "5mb" }));

function getRequiredString(body: JsonRecord, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing or invalid "${key}"`);
  }

  return value.trim();
}

// SETTING UP MULTER TO RECIEVE FORM DATA WITH PDF
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB cap
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF files are allowed"));
      return;
    }
    cb(null, true);
  },
});

function sendError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = message.startsWith("Missing or invalid") ? 400 : 500;

  res.status(status).json({
    ok: false,
    error: message,
  });
}

app.get("/health", async (_req, res) => {
  await ensureBrowser();
  res.json({
    ok: true,
    browserReady: true,
  });
});

app.post("/api/fill-form", upload.single("resume"),async (req, res) => {
 // console.log("req.file:", req.file);
 // console.log("req.body:", req.body);
  try {
    const body = req.body as JsonRecord;
    const url = getRequiredString(body, "url");
    const fieldData = getRequiredString(body, "fieldData");
    const finalQuery = getRequiredString(body, "finalQuery");

    const resumeFile = req.file;
    const resumePath = resumeFile?.path;

   // console.log("resume upload metadata:", resumeFile);
    const result = await runFillFlow(url, fieldData, finalQuery,resumePath);
// ---------- FOR NOW DELETING THE RESUME , when looping remove ts
    if (resumePath) {
      await fs.unlink(resumePath).catch(() => {});
    }

    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    sendError(res, error);
  }
});

let server: Server | undefined;

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down.`);
  await new Promise<void>((resolve) => {
    if (!server) {
      resolve();
      return;
    }

    server.close(() => resolve());
  });
  await closeBrowser();
  process.exit(0);
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await ensureBrowser();

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

server = app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});
