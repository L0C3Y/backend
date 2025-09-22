// backend/routes/payments.js
const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const authMiddleware = require("../middleware/auth"); // JWT auth
const { supabase } = require("../db"); // Supabase client

// ------------------------
// Razorpay instance
// ------------------------
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ------------------------
// Public endpoint: get Razorpay key
// ------------------------
router.get("/key", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

// ------------------------
// Create order (protected)
// ------------------------
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount, ebookId, affiliateCode } = req.body;
    const userId = req.user.id;

    // Fetch affiliate data
    let affiliateId = null;
    let commissionRate = 0.3; // default 30%
    if (affiliateCode) {
      const { data: affData, error: affError } = await supabase
        .from("affiliates")
        .select("id, commission_rate")
        .eq("referral_code", affiliateCode)
        .single();

      if (!affError && affData) {
        affiliateId = affData.id;
        commissionRate = affData.commission_rate ?? 0.3;
      }
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100, // ₹ in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    });

    // Insert transaction
    const { data: orderRes, error: insertError } = await supabase
      .from("transactions")
      .insert([{
        affiliate_id: affiliateId,
        user_id: userId,
        ebook_id: ebookId,
        amount,
        currency: "INR",
        razorpay_order_id: razorpayOrder.id,
        status: "created",
        commission_rate: commissionRate,
      }])
      .select()
      .single();

    if (insertError) throw insertError;

    res.json({ success: true, razorpayOrder, order: orderRes });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ------------------------
// Verify payment (protected)
// ------------------------
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    // Verify Razorpay signature
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generated_signature !== razorpay_signature)
      return res.status(400).json({ success: false, error: "Invalid signature" });

    // Update transaction as paid
    const { error: updateError } = await supabase
      .from("transactions")
      .update({ status: "paid", razorpay_payment_id })
      .eq("id", orderId);

    if (updateError) throw updateError;

    res.json({ success: true });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;