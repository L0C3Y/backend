const express = require("express");
const router = express.Router();

router.get("/razorpay", (req, res) => {
  const key = process.env.RAZORPAY_KEY_ID;

  if (!key) {
    return res.status(500).json({ error: "Razorpay key not configured." });
  }

  res.json({ key });
});

module.exports = router;