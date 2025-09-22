// backend/routes/payments.js
const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const authMiddleware = require("../middleware/auth"); // your JWT auth
const pool = require("../db"); // postgres or supabase client

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Public endpoint for frontend
router.get("/key", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

// ✅ Create order — protected
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount, ebookId, affiliateCode } = req.body;
    const userId = req.user.id; // from authMiddleware

    // Optional: fetch affiliate_id from code if provided
    let affiliateId = null;
    if (affiliateCode) {
      const aff = await pool.query(
        "SELECT id FROM affiliates WHERE code=$1",
        [affiliateCode]
      );
      if (aff.rows.length) affiliateId = aff.rows[0].id;
    }

    // If no affiliate, you can choose to allow null or block
    if (!affiliateId) affiliateId = null; // or assign default

    const options = {
      amount: amount * 100, // in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    // Save transaction in DB
    const orderRes = await pool.query(
      `INSERT INTO transactions (affiliate_id, user_id, amount, currency, razorpay_order_id, status)
       VALUES ($1,$2,$3,$4,$5,'created') RETURNING *`,
      [affiliateId, userId, amount, "INR", razorpayOrder.id]
    );

    res.json({
      success: true,
      razorpayOrder,
      order: orderRes.rows[0],
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Verify payment — protected
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    // Verify signature
    const crypto = require("crypto");
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature)
      return res.json({ success: false, error: "Invalid signature" });

    // Update transaction as paid
    await pool.query(
      "UPDATE transactions SET status='paid', razorpay_payment_id=$1 WHERE id=$2",
      [razorpay_payment_id, orderId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
