import express from "express";
import puppeteer from "puppeteer";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// Serve static files from uploads directory
app.use("/uploads", express.static("uploads"));

// Helper function to generate file path
const getFilePath = (format) => {
  const fileName = `diagram-${Date.now()}.${format}`;
  return {
    fileName,
    filePath: path.join(uploadsDir, fileName),
  };
};

// Function to generate diagram using Mermaid and Puppeteer
async function generateDiagram(mermaidCode, format) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  // HTML template with Mermaid
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
  let result;

  if (format === "png") {
    result = await element.screenshot({
      type: "png",
      omitBackground: true,
    });
  } else {
    result = await page.evaluate(() => {
      const svg = document.querySelector(".mermaid svg");
      return svg.outerHTML;
    });
  }

  await browser.close();
  return result;
}

// Route to generate diagram
app.post("/generate-diagram", async (req, res) => {
  try {
    const { mermaidCode, format = "png" } = req.body;

    if (!mermaidCode) {
      return res.status(400).json({ error: "Mermaid code is required" });
    }

    const diagram = await generateDiagram(mermaidCode, format);
    const { fileName, filePath } = getFilePath(format);

    // Save the diagram to file
    if (format === "png") {
      await fs.writeFile(filePath, diagram);
    } else {
      await fs.writeFile(filePath, diagram, "utf-8");
    }

    // Return the file information
    res.json({
      success: true,
      format,
      fileName,
      filePath: `/uploads/${fileName}`, // Return the public URL path
      contentType: format === "png" ? "image/png" : "image/svg+xml",
      // Example usage in HTML
      htmlExample:
        format === "png"
          ? `<img src="/uploads/${fileName}" alt="Mermaid Diagram">`
          : `<div>${diagram}</div>`,
    });
  } catch (error) {
    console.error("Error generating diagram:", error);
    res.status(500).json({ error: "Failed to generate diagram" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
