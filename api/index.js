const express = require("express");

const app = express();

app.use(express.json({ limit: "10mb" }));

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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`SaadTV backend running on port ${PORT}`);
});
