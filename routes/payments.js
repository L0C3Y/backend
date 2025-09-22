// backend/routes/payments.js
const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const authMiddleware = require("../middleware/auth"); // JWT auth
const { supabase } = require("../db"); // Supabase client
const crypto = require("crypto");

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ---------------------
// Public: Get Razorpay key
// ---------------------
router.get("/key", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

// ---------------------
// Create Order
// ---------------------
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount, ebookId, affiliateCode } = req.body;
    const userId = req.user.id;

    // 1️⃣ Get affiliate ID if code provided
    let affiliateId = null;
    if (affiliateCode) {
      const { data, error } = await supabase
        .from("affiliates")
        .select("id")
        .eq("code", affiliateCode)
        .single();
      if (error && error.code !== "PGRST116") throw error; // ignore no rows error
      if (data) affiliateId = data.id;
    }

    // 2️⃣ Create Razorpay order
    const options = {
      amount: amount * 100, // in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    };
    const razorpayOrder = await razorpay.orders.create(options);

    // 3️⃣ Save transaction in Supabase
    const { data: orderData, error: insertError } = await supabase
      .from("transactions")
      .insert([
        {
          user_id: userId,
          ebook_id: ebookId,
          affiliate_id: affiliateId,
          amount,
          currency: "INR",
          razorpay_order_id: razorpayOrder.id,
          status: "created",
        },
      ])
      .select()
      .single();
    if (insertError) throw insertError;

    res.json({ success: true, razorpayOrder, order: orderData });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------
// Verify Payment
// ---------------------
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } =
      req.body;

    // 1️⃣ Verify signature
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature)
      return res.json({ success: false, error: "Invalid signature" });

    // 2️⃣ Update transaction status
    const { error: updateError, data: updated } = await supabase
      .from("transactions")
      .update({ status: "paid", razorpay_payment_id })
      .eq("id", orderId)
      .select()
      .single();
    if (updateError) throw updateError;

    // 3️⃣ Optionally calculate affiliate commission
    if (updated.affiliate_id) {
      // Fetch affiliate commission rate
      const { data: aff, error: affError } = await supabase
        .from("affiliates")
        .select("commission_rate")
        .eq("id", updated.affiliate_id)
        .single();
      if (affError) throw affError;

      const commission = updated.amount * (aff.commission_rate || 0.3); // default 30%
      await supabase
        .from("transactions")
        .update({ affiliate_commission: commission })
        .eq("id", orderId);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
