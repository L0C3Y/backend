// backend/routes/payments.js
const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const authMiddleware = require("../middleware/auth");
const { supabase } = require("../db");

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ------------------------
// Get Razorpay Key (Public)
// ------------------------
router.get("/key", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

// ------------------------
// Create Order
// ------------------------
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount, ebookId, affiliateCode } = req.body;
    const userId = req.user.id;

    // Fetch affiliate if code provided
    let affiliateId = null;
    let commissionRate = 0.3; // default 30%
    if (affiliateCode) {
      const { data: affData, error: affError } = await supabase
        .from("affiliates")
        .select("*")
        .eq("referral_code", affiliateCode)
        .single();

      if (affError && affError.code !== "PGRST116") throw affError;
      if (affData) {
        affiliateId = affData.id;
        commissionRate = affData.commission_rate || 0.3;
      }
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100, // INR to paise
      currency: "INR",
      receipt: rcpt_${Date.now()},
    });

    // Insert transaction in Supabase
    const { data: orderRes, error } = await supabase
      .from("transactions")
      .insert([{
        affiliate_id: affiliateId,
        user_id: userId,
        amount,
        currency: "INR",
        razorpay_order_id: razorpayOrder.id,
        status: "created",
        commission_rate: commissionRate
      }])
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

// ------------------------
// Verify Payment
// ------------------------
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    // Verify signature
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature)
      return res.json({ success: false, error: "Invalid signature" });

    // Update transaction as paid
    const { data: txn, error } = await supabase
      .from("transactions")
      .update({ status: "paid", razorpay_payment_id })
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;

    // Update affiliate stats if applicable
    if (txn.affiliate_id) {
      const commissionAmount = txn.amount * (txn.commission_rate || 0.3);

      await supabase.rpc("update_affiliate_stats", {
        aff_id: txn.affiliate_id,
        commission: commissionAmount,
        revenue: txn.amount
      });
    }

    res.json({ success: true, transaction: txn });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;