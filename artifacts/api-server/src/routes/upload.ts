import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth } from "../lib/auth";

const router = Router();

// Use a persistent directory at the workspace root where possible, fall back to /tmp/uploads.
let uploadDir = path.resolve(process.cwd(), "../../uploads");
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch {
  uploadDir = "/tmp/uploads";
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

const serveFile = (req: any, filename: string) => {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["host"] || "localhost";
  return `${protocol}://${host}/api/uploads/${filename}`;
};

router.post("/upload/image", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  res.json({
    url: serveFile(req, req.file.filename),
    filename: req.file.filename,
  });
});

router.post("/upload/audio", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  res.json({
    url: serveFile(req, req.file.filename),
    filename: req.file.filename,
  });
});

router.post("/upload/video", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  res.json({
    url: serveFile(req, req.file.filename),
    filename: req.file.filename,
  });
});

router.post("/upload/student-recording", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  res.json({
    url: serveFile(req, req.file.filename),
    filename: req.file.filename,
  });
});

router.get("/uploads/:filename", (req, res) => {
  const filename = req.params["filename"];
  const filepath = path.join(uploadDir, filename);
  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.sendFile(filepath);
});

export default router;
