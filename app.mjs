import express from "express";
import puppeteer from "puppeteer";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// Serve static files from uploads directory
app.use("/uploads", express.static("uploads"));

// MongoDB Schema
const diagramSchema = new mongoose.Schema({
  mermaidCode: { type: String, required: true },
  imageData: { type: Buffer, required: true },
  createdAt: { type: Date, default: Date.now },
});

const Diagram = mongoose.model("Diagram", diagramSchema);

app.get("/", (req, res) => {
  res.json({ message: "Server is running" });
});

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

    // Save to MongoDB with the actual image data
    const newDiagram = new Diagram({
      mermaidCode,
      imageData: diagram, // Store the actual image buffer
    });

    await newDiagram.save();

    // Return the diagram ID
    res.json({
      success: true,
      diagramId: newDiagram._id,
    });
  } catch (error) {
    console.error("Error generating diagram:", error);
    res.status(500).json({ error: "Failed to generate diagram" });
  }
});

// Route to get all diagrams
app.get("/diagrams", async (req, res) => {
  try {
    const diagrams = await Diagram.find().sort({ createdAt: -1 });
    res.json(diagrams);
  } catch (error) {
    console.error("Error fetching diagrams:", error);
    res.status(500).json({ error: "Failed to fetch diagrams" });
  }
});

// Route to get a specific diagram
app.get("/diagrams/:id", async (req, res) => {
  try {
    const diagram = await Diagram.findById(req.params.id);
    if (!diagram) {
      return res.status(404).json({ error: "Diagram not found" });
    }

    // Set the content type to image/png
    res.setHeader("Content-Type", "image/png");
    // Send the image data directly
    res.send(diagram.imageData);
  } catch (error) {
    console.error("Error fetching diagram:", error);
    res.status(500).json({ error: "Failed to fetch diagram" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
