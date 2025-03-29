import express from "express";
import puppeteer from "puppeteer";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// Serve static files from uploads directory
app.use("/uploads", express.static("uploads"));

app.get("/", (req, res) => {
  res.json({ message: "Server is running" });
});

// Helper function to generate file path
const getFilePath = () => {
  const fileName = `diagram-${Date.now()}.png`;
  return {
    fileName,
    filePath: path.join(uploadsDir, fileName),
  };
};

// Function to generate diagram using Mermaid and Puppeteer
async function generateDiagram(mermaidCode) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
  });
  const page = await browser.newPage();

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
        <script>
          mermaid.initialize({ startOnLoad: true });
        </script>
      </head>
      <body>
        <div class="mermaid">
          ${mermaidCode}
        </div>
      </body>
    </html>
  `;

  await page.setContent(html);
  await page.waitForFunction('document.querySelector(".mermaid svg")');

  const element = await page.$(".mermaid");
  const result = await element.screenshot({
    type: "png",
    omitBackground: true,
  });

  await browser.close();
  return result;
}

// Route to generate diagram
app.post("/generate-diagram", async (req, res) => {
  try {
    const { mermaidCode } = req.body;

    if (!mermaidCode) {
      return res.status(400).json({ error: "Mermaid code is required" });
    }

    const diagram = await generateDiagram(mermaidCode);
    const { fileName, filePath } = getFilePath();

    // Save the image to the uploads directory
    await fs.writeFile(filePath, diagram);

    // Return the file path
    res.json({
      success: true,
      filePath: `/uploads/${fileName}`,
    });
  } catch (error) {
    console.error("Error generating diagram:", error);
    res.status(500).json({ error: "Failed to generate diagram" });
  }
});

// Route to delete a diagram by file path
app.delete("/diagrams", async (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: "File path is required" });
    }

    // Extract the file name from the path
    const fileName = path.basename(filePath);
    const fullPath = path.join(uploadsDir, fileName);

    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch (error) {
      return res.status(404).json({ error: "Diagram not found" });
    }

    // Delete the file
    await fs.unlink(fullPath);

    res.json({
      success: true,
      message: "Diagram deleted successfully",
      deletedFilePath: filePath,
    });
  } catch (error) {
    console.error("Error deleting diagram:", error);
    res.status(500).json({ error: "Failed to delete diagram" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
