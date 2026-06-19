require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { runScan } = require("./scan");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "NØX Robô Regional 3x3",
    routes: ["/scan"]
  });
});
app.get("/scan", async (req, res) => {
  try {
    const result = await runScan();
    res.json({
      modo: "manual navegador",
      ok: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/scan", async (req, res) => {
  try {
    const result = await runScan();
    res.json({
      modo: "automatico cronjob",
      ok: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});
app.post("/scan", async (req, res) => {
  try {
    const result = await runScan();
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`NØX Robô Regional rodando na porta ${port}`));
