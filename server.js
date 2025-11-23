const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public")); // ✅ serve index.html

// ✅ Google Sheets Auth: Support Env Var (Production) or Local File (Dev)
const authConfig = {
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
};

if (process.env.GOOGLE_SERVICE_ACCOUNT) {
  // Production: Use environment variable
  let credentials;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_BASE64) {
    // Option 1: Base64 Encoded (Safest for copy-paste)
    const decoded = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
    credentials = JSON.parse(decoded);
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    // Option 2: Direct JSON
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  }

  // FIX: Handle private_key newline issues common in some hosting envs
  if (credentials && credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }
  authConfig.credentials = credentials;
} else {
  // Development: Use local file
  authConfig.keyFile = "service-account.json";
}

const auth = new google.auth.GoogleAuth(authConfig);

// ✅ YOUR Spreadsheet ID
const spreadsheetId = "1qYr-LJjqsRs6QZQKvVOtl3ua2V12BBZXZiMUoaJWOCs";

// ✅ REGISTER USER
app.post("/register", async (req, res) => {
  const { name, phone, email, company } = req.body;

  if (!name || !phone || !email || !company) {
    return res.status(400).json({ success: false, error: "All fields are required" });
  }

  try {
    const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Sheet1!A:E",
      valueInputOption: "RAW",
      resource: {
        values: [[name, phone, email, company, "✔ CHECKED IN"]],
      },
    });

    res.json({ success: true, message: "User registered & checked in" });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ success: false, error: err.toString() });
  }
});

// ✅ MULTI RESULT SEARCH
app.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim().toLowerCase();
  if (!q) return res.json({ found: false, users: [] });

  try {
    const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });

    const data = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:E",
    });

    const rows = data.data.values || [];

    const matches = rows
      .slice(1)
      .filter(row => {
        const name = (row[0] || "").toLowerCase();
        const phone = (row[1] || "");
        const email = (row[2] || "").toLowerCase();
        const company = (row[3] || "").toLowerCase();

        return (
          name.includes(q) ||
          phone.includes(q) ||
          email.includes(q) ||
          company.includes(q)
        );
      })
      .map(row => ({
        name: row[0] || "",
        phone: row[1] || "",
        email: row[2] || "",
        company: row[3] || "",
        checkin: row[4] || "",
      }));

    if (matches.length === 0) {
      return res.json({ found: false, users: [] });
    }

    res.json({ found: true, users: matches });
  } catch (err) {
    console.error("SEARCH ERROR:", err);
    res.status(500).json({ found: false, users: [], error: err.toString() });
  }
});

// ✅ CHECK-IN USER
app.post("/checkin", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ success: false, error: "phone required" });

  try {
    const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });

    const data = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:E",
    });

    const rows = data.data.values || [];

    const rowIndex = rows.findIndex((row, idx) => idx > 0 && row[1] === phone);

    if (rowIndex === -1) {
      return res.json({ success: false, error: "User not found" });
    }

    rows[rowIndex][4] = "✔ CHECKED IN";

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Sheet1!A${rowIndex + 1}:E${rowIndex + 1}`,
      valueInputOption: "RAW",
      resource: {
        values: [rows[rowIndex]],
      },
    });

    res.json({ success: true, message: "Check-in updated" });
  } catch (err) {
    console.error("CHECKIN ERROR:", err);
    res.status(500).json({ success: false, error: err.toString() });
  }
});

// ✅ SERVE FRONTEND FOR ALL ROUTES (Railway requirement)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ PORT for Railway / Local
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log("✅ Server running on port " + PORT));
