// backend/routes/payments.js
const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const authMiddleware = require("../middleware/auth");
const { supabase } = require("../db");
const crypto = require("crypto");

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ------------------------
// Public: Get Razorpay key
// ------------------------
router.get("/key", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

// ------------------------
// Create order
// ------------------------
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount, ebookId, affiliateCode } = req.body;
    const userId = req.user.id;

    // Fetch affiliate ID if code provided
    let affiliateId = null;
    if (affiliateCode) {
      const { data: affs, error } = await supabase
        .from("affiliates")
        .select("id")
        .eq("code", affiliateCode)
        .single();
      if (error && error.code !== "PGRST116") throw error; // ignore no rows
      if (affs) affiliateId = affs.id;
    }

    // Create Razorpay order
    const options = {
      amount: amount * 100, // in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    };
    const razorpayOrder = await razorpay.orders.create(options);

    // Insert transaction in Supabase
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
// Verify payment
// ------------------------
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    // Signature verification
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generated_signature !== razorpay_signature)
      return res.status(400).json({ success: false, error: "Invalid signature" });

    // Update transaction as paid
    const { data: txn, error: updateError } = await supabase
      .from("transactions")
      .update({ status: "paid", razorpay_payment_id })
      .eq("id", orderId)
      .select()
      .single();

    if (updateError) throw updateError;

    // ------------------------
    // Handle affiliate commission
    // ------------------------
    if (txn.affiliate_id) {
      // Fetch affiliate commission rate
      const { data: aff, error: affErr } = await supabase
        .from("affiliates")
        .select("commission_rate, total_commission")
        .eq("id", txn.affiliate_id)
        .single();
      if (affErr) throw affErr;

      const commission = (txn.amount || 0) * (aff.commission_rate || 0.3);

      // Update affiliate's total commission
      await supabase
        .from("affiliates")
        .update({ total_commission: (aff.total_commission || 0) + commission })
        .eq("id", txn.affiliate_id);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
