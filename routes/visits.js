const express = require("express");
const router = express.Router();
const { recordVisit } = require("../models/visits");

// POST /api/visits
router.post("/", async (req, res) => {
  try {
    const { affiliateCode, ip, userAgent, referrer, landingPath } = req.body;

    if (!affiliateCode) {
      return res.status(400).json({ success: false, error: "affiliateCode is required" });
    }

    const visit = await recordVisit(affiliateCode, ip, userAgent, referrer, landingPath);
    res.json({ success: true, visit });
  } catch (err) {
    console.error("Visit recording error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
