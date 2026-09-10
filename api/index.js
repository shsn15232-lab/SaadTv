const express = require("express");
const admin = require("firebase-admin");

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.raw({
  type: "application/octet-stream",
  limit: "16mb"
}));

const VCDN_API_BASE = "https://cdn.vcdn.me/api/v1";

const VCDN_API_KEY = process.env.VCDN_API_KEY;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const FIREBASE_SERVICE_ACCOUNT_JSON =
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!VCDN_API_KEY) {
  console.warn("WARNING: VCDN_API_KEY is missing");
}

if (!ADMIN_EMAIL) {
  console.warn("WARNING: ADMIN_EMAIL is missing");
}

if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.warn("WARNING: FIREBASE_SERVICE_ACCOUNT_JSON is missing");
} else {
  try {
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log("Firebase Admin initialized");
  } catch (error) {
    console.error("Firebase initialization failed:", error.message);
  }
}

async function verifyAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing Firebase ID token"
      });
    }

    const idToken = authHeader.substring(7).trim();

    if (!idToken) {
      return res.status(401).json({
        error: "Empty Firebase ID token"
      });
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken);

    const email = (decodedToken.email || "").trim().toLowerCase();

    if (!email || email !== ADMIN_EMAIL) {
      return res.status(403).json({
        error: "Admin access required"
      });
    }

    req.adminUser = decodedToken;

    next();
  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(401).json({
      error: "Invalid Firebase ID token"
    });
  }
}

async function vcdnRequest(path, options = {}) {
  const response = await fetch(`${VCDN_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${VCDN_API_KEY}`,
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch (_) {
    data = {
      raw: text
    };
  }

  if (!response.ok) {
    const error = new Error(
      data?.error ||
      data?.message ||
      `VCDN request failed: ${response.status}`
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

app.get("/", (req, res) => {
  res.json({
    app: "SaadTV VCDN Backend",
    status: "online"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok"
  });
});

app.post("/v1/upload/init", verifyAdmin, async (req, res) => {
  try {
    const filename = String(req.body?.filename || "").trim();
    const title = String(req.body?.title || filename).trim();

    if (!filename) {
      return res.status(400).json({
        error: "filename is required"
      });
    }

    const result = await vcdnRequest("/upload/init", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        filename,
        title
      })
    });

    return res.json(result);
  } catch (error) {
    console.error("VCDN init error:", error);

    return res.status(error.status || 500).json({
      error: error.message,
      details: error.data || null
    });
  }
});

app.post(
  "/v1/upload/:uploadId/chunk",
  verifyAdmin,
  async (req, res) => {
    try {
      const uploadId = String(req.params.uploadId || "").trim();

      if (!uploadId) {
        return res.status(400).json({
          error: "uploadId is required"
        });
      }

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({
          error: "Empty upload chunk"
        });
      }

      const result = await vcdnRequest(
        `/upload/${encodeURIComponent(uploadId)}/chunk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": String(req.body.length)
          },
          body: req.body
        }
      );

      return res.json(result);
    } catch (error) {
      console.error("VCDN chunk error:", error);

      return res.status(error.status || 500).json({
        error: error.message,
        details: error.data || null
      });
    }
  }
);

app.post("/v1/upload/complete", verifyAdmin, async (req, res) => {
  try {
    const uploadId = String(req.body?.upload_id || "").trim();

    if (!uploadId) {
      return res.status(400).json({
        error: "upload_id is required"
      });
    }

    const result = await vcdnRequest("/upload/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        upload_id: uploadId
      })
    });

    return res.json(result);
  } catch (error) {
    console.error("VCDN complete error:", error);

    return res.status(error.status || 500).json({
      error: error.message,
      details: error.data || null
    });
  }
});

app.use((error, req, res, next) => {
  console.error("Unhandled server error:", error);

  res.status(500).json({
    error: "Internal server error"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`SaadTV backend running on port ${PORT}`);
});
