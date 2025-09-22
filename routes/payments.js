// backend/routes/payments.js
const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const authMiddleware = require("../middleware/auth"); // JWT auth
const { supabase } = require("../db"); // your Supabase client
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Public endpoint for frontend
router.get("/key", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

// Create order — protected
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount, ebookId, affiliateCode } = req.body;
    const userId = req.user.id;

    // Fetch affiliate_id from Supabase if code exists
    let affiliateId = null;
    if (affiliateCode) {
      const { data: affData, error: affError } = await supabase
        .from("affiliates")
        .select("id")
        .eq("code", affiliateCode)
        .single();

      if (affError) console.error("Affiliate fetch error:", affError.message);
      if (affData) affiliateId = affData.id;
    }

    const options = {
      amount: amount * 100, // in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    // Save transaction in Supabase
    const { data: transData, error: transError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        affiliate_id: affiliateId,
        amount,
        currency: "INR",
        razorpay_order_id: razorpayOrder.id,
        status: "created",
      })
      .select()
      .single();

    if (transError) throw new Error(transError.message);

    res.json({
      success: true,
      razorpayOrder,
      order: transData,
    });
  } catch (err) {
    console.error("Create order error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verify payment — protected
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

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

    if (error) throw new Error(error.message);

    res.json({ success: true });
  } catch (err) {
    console.error("Verify payment error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
