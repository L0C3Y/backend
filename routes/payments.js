// backend/routes/payments.js
const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const authMiddleware = require("../middleware/auth"); // your JWT auth middleware
const { supabase } = require("../db"); // Supabase client
const crypto = require("crypto");

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Public endpoint for frontend: get Razorpay key
router.get("/key", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

// ✅ Create order (protected)
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount, ebookId, affiliateCode } = req.body;
    const userId = req.user.id; // from JWT auth

    // Optional: get affiliate_id from code
    let affiliateId = null;
    if (affiliateCode) {
      const { data: affData, error: affErr } = await supabase
        .from("affiliates")
        .select("id")
        .eq("code", affiliateCode)
        .single();

      if (affErr) console.log("Affiliate fetch error:", affErr.message);
      if (affData) affiliateId = affData.id;
    }

    // Create Razorpay order
    const options = {
      amount: amount * 100, // paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    };
    const razorpayOrder = await razorpay.orders.create(options);

    // Insert transaction in Supabase
    const { data: orderRes, error } = await supabase
      .from("transactions")
      .insert([
        {
          affiliate_id: affiliateId,
          user_id: userId,
          ebook_id: ebookId,
          amount,
          currency: "INR",
          razorpay_order_id: razorpayOrder.id,
          status: "created",
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      razorpayOrder,
      order: orderRes,
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Verify payment (protected)
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    // Verify Razorpay signature
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature)
      return res.json({ success: false, error: "Invalid signature" });

    // Update transaction as paid
    const { error } = await supabase
      .from("transactions")
      .update({ status: "paid", razorpay_payment_id })
      .eq("id", orderId);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
