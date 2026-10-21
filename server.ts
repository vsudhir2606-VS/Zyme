import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for larger sheets
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API endpoint to save database/data sheet to the codebase local storage
  app.post("/api/save-datasheet", (req, res) => {
    try {
      const { referenceData, referenceFileName } = req.body;
      const dataToSave = {
        referenceData: referenceData || null,
        referenceFileName: referenceFileName || null,
        updatedAt: new Date().toISOString(),
      };
      
      const utilsDir = path.join(process.cwd(), "utils");
      if (!fs.existsSync(utilsDir)) {
        fs.mkdirSync(utilsDir, { recursive: true });
      }

      const filePath = path.join(utilsDir, "preloadedDataSheet.json");
      fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), "utf-8");
      
      res.json({ success: true, fileName: referenceFileName });
    } catch (err: any) {
      console.error("Failed to save datasheet:", err);
      res.status(500).json({ error: err.message || "Failed to save datasheet" });
    }
  });

  // API endpoint to retrieve the preloaded/saved datasheet
  app.get("/api/get-datasheet", (req, res) => {
    try {
      const filePath = path.join(process.cwd(), "utils", "preloadedDataSheet.json");
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        res.json(JSON.parse(fileContent));
      } else {
        res.json({ referenceData: null, referenceFileName: null });
      }
    } catch (err: any) {
      console.error("Failed to read datasheet:", err);
      res.status(500).json({ error: err.message || "Failed to read datasheet" });
    }
  });

  // API endpoint to save SPL CC comments archive to persistent filesystem
  app.post("/api/save-splcc", (req, res) => {
    try {
      const { comments } = req.body;
      const utilsDir = path.join(process.cwd(), "utils");
      if (!fs.existsSync(utilsDir)) {
        fs.mkdirSync(utilsDir, { recursive: true });
      }
      const filePath = path.join(utilsDir, "savedSplCcComments.json");
      fs.writeFileSync(filePath, JSON.stringify(comments || [], null, 2), "utf-8");
      res.json({ success: true, count: Array.isArray(comments) ? comments.length : 0 });
    } catch (err: any) {
      console.error("Failed to save SPL CC comments to disk:", err);
      res.status(500).json({ error: err.message || "Failed to save SPL CC comments" });
    }
  });

  // API endpoint to retrieve SPL CC comments archive
  app.get("/api/get-splcc", (req, res) => {
    try {
      const filePath = path.join(process.cwd(), "utils", "savedSplCcComments.json");
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        res.json({ comments: JSON.parse(fileContent) });
      } else {
        res.json({ comments: [] });
      }
    } catch (err: any) {
      console.error("Failed to read SPL CC comments from disk:", err);
      res.status(500).json({ error: err.message || "Failed to read SPL CC comments" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
