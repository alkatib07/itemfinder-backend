// =======================
// 1. الاستيرادات
// =======================
import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import pkg from "pg";




// =======================
// 2. الإعدادات العامة
// =======================
dotenv.config();
const DEBUG = false;
const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== "production";

// =======================
//  3. إعدادات CORS و JSON
// =======================
app.use(express.json());
app.use(
  cors({
    origin: isDev
      ? ["http://localhost:8081", "http://localhost:19006"] // أثناء التطوير
      : ["https://itemfinder-frontend.onrender.com"],        // بعد النشر
    credentials: true,
  })
);
app.get("/", (req, res) => { res.json({ message: "ItemFinder Backend Running", env: process.env.NODE_ENV, }); }); 
app.listen(PORT, () => {console.log(`🚀 Server running on port ${PORT} (${process.env.NODE_ENV})`); });

// =======================
// 4. الاتصال بقاعدة البيانات
// =======================
const { Client } = pkg;
let db; // PostgreSQL client
async function initializeDatabase() {
  try {
    db = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    await db.connect();
    if (DEBUG) console.log("Connected to PostgreSQL on Render");
  } catch (error) {
    console.error(" Database connection failed:", error.message);
    process.exit(1);
  }
}
initializeDatabase();

// =======================
//  5. إعداد Gemini API
// =======================
if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY missing in .env file");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const upload = multer({ storage: multer.memoryStorage() });

// =======================
// 6. متغير مؤقت للنتائج
// =======================
let tempResults = [];

// =======================
//  7. تحليل الصور
// =======================
app.post("/analyze", upload.array("images"), async (req, res) => {
  try {
    if (!req.files?.length) {
      return res.status(400).json({ success: false, message: "No images uploaded" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const allResults = [];

    for (const file of req.files) {
      try {
        const base64 = file.buffer.toString("base64");
        const prompt = `
        Analyze this product image and extract product information.
        Return ONLY valid JSON array in this exact format:
        [
          { "category": "product category", "name": "product name without numbers or weights" }
        ]`;

        const result = await model.generateContent({
          contents: [
            {
              parts: [
                { inlineData: { mimeType: file.mimetype, data: base64 } },
                { text: prompt },
              ],
            },
          ],
        });

        let responseText = result.response.text().trim();
        responseText = responseText.replace(/```json|```/g, "").trim();

        try {
          const parsed = JSON.parse(responseText);
          if (Array.isArray(parsed)) {
            parsed.forEach((item) => {
              if (item.category && item.name) {
                allResults.push({
                  category: item.category.trim(),
                  name: item.name.trim(),
                  imageName: file.originalname,
                });
              }
            });
          }
        } catch {
          allResults.push({
            category: "Unknown",
            name: "Could not extract product",
            imageName: file.originalname,
          });
        }
      } catch {
        allResults.push({
          category: "Error",
          name: `Failed to process ${file.originalname}`,
          imageName: file.originalname,
        });
      }
    }

    tempResults = allResults;
    res.json({
      success: true,
      message: `Analysis complete. Processed ${allResults.length} products.`,
      results: allResults,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =======================
//  8. عرض النتائج
// =======================
app.get("/results", (req, res) => {
  res.json({ success: true, count: tempResults.length, results: tempResults });
});

// =======================
//  9. مطابقة النتائج مع قاعدة البيانات
// =======================
app.get("/match-items", async (req, res) => {
  try {
    if (!tempResults.length)
      return res.status(400).json({ success: false, message: "No analysis results available" });
    if (!db)
      return res.status(500).json({ success: false, message: "Database not connected" });

    const categories = tempResults.map((r) => r.category);
    const result = await db.query(
      "SELECT category, aisle FROM queens243 WHERE category = ANY($1)",
      [categories]
    );
    const rows = result.rows;

    const merged = tempResults.map((tempItem) => {
      const match = rows.find(
        (dbItem) => dbItem.category.toLowerCase() === tempItem.category.toLowerCase()
      );
      return {
        analyzedCategory: tempItem.category,
        analyzedName: tempItem.name,
        aisle: match ? match.aisle : "Not found in database",
        imageName: tempItem.imageName,
        matched: !!match,
      };
    });

    res.json({
      success: true,
      matchedCount: merged.filter((item) => item.matched).length,
      results: merged,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =======================
//  10. مطابقة aisles
// =======================
app.post("/match-aisles", express.json(), async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ success: false, message: "No items provided" });
    }

    const results = [];
    for (const item of items) {
      const result = await db.query(
        `SELECT category, aisle  FROM queens243 WHERE category ILIKE $1  LIMIT 1`, [`%${item.category}%`] );

      results.push({
        category: item.category,
        name: item.name,
        aisle: result.rows.length ? result.rows[0].aisle : "Not found",
        matched: !!result.rows.length,
      });
    }

    res.json({ success: true, processed: results.length, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =======================
//  11. إضافة وتحديث الأصناف
// =======================
app.post("/add-item", async (req, res) => {
  try {
    const { category, aisle } = req.body;
    if (!category || !aisle)
      return res.status(400).json({ success: false, message: "Missing category or aisle" });

    const result = await db.query(
      "INSERT INTO queens243 (category, aisle) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id",
      [category, aisle]
    );

    res.json({
      success: true,
      message: "Item added successfully",
      id: result.rows.length ? result.rows[0].id : null,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/update-aisle", async (req, res) => {
  try {
    const { category, aisle } = req.body;
    if (!category || !aisle)
      return res.status(400).json({ success: false, message: "Missing category or aisle" });

    const result = await db.query(
      "UPDATE queens243 SET aisle = $1 WHERE category = $2",
      [aisle, category]
    );

    res.json({
      success: true,
      message: "Aisle updated successfully",
      affected: result.rowCount,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =======================
// 12. صفحة اختبار وتشغيل السيرفر
// =======================
app.get("/", (req, res) => {
  res.json({
    message: " Product Analysis API is running successfully!",
    endpoints: {
      analyze: "POST /analyze",
      results: "GET /results",
      matchItems: "GET /match-items",
      matchAisles: "POST /match-aisles",
    },
  });
});