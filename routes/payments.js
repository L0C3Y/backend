// backend/routes/payments.js
require("dotenv").config();
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Razorpay = require("razorpay");
const { supabase } = require("../supabase");

// ------------------
// Middleware helpers
// ------------------
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, error: "No token provided" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid token" });
  }
};

// ------------------
// 1️⃣ Get Razorpay key (optional public)
// ------------------
router.get(
  "/key",
  // authMiddleware, // remove this if you want public access
  asyncHandler(async (req, res) => {
    if (!process.env.RAZORPAY_KEY_ID)
      return res.status(500).json({ success: false, error: "Razorpay key missing" });
    res.json({ key: process.env.RAZORPAY_KEY_ID });
  })
);

// ------------------
// 2️⃣ Create Razorpay order
// ------------------
router.post(
  "/create-order",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { amount, ebookId, affiliateCode } = req.body;

    if (!amount || !ebookId) {
      return res.status(400).json({ success: false, error: "Amount and ebookId required" });
    }

    // 1️⃣ Get affiliate ID if code exists
    let affiliate_id = null;
    if (affiliateCode) {
      const { data: aff } = await supabase
        .from("affiliates")
        .select("id")
        .eq("code", affiliateCode)
        .maybeSingle();
      if (aff) affiliate_id = aff.id;
    }

    // 2️⃣ Create Razorpay order
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
      amount: Math.round(amount * 100), // in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    // 3️⃣ Save transaction in Supabase
    const { data: order, error } = await supabase
      .from("transactions")
      .insert([
        {
          affiliate_id,
          user_id: req.user.id,
          amount,
          currency: "INR",
          razorpay_order_id: razorpayOrder.id,
          status: "created",
        },
      ])
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    res.json({ success: true, razorpayOrder, order });
  })
);

// ------------------
// 3️⃣ Verify payment
// ------------------
router.post(
  "/verify",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId)
      return res.status(400).json({ success: false, error: "Missing required fields" });

    // 1️⃣ Generate expected signature
    const crypto = require("crypto");
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature)
      return res.status(400).json({ success: false, error: "Invalid signature" });

    // 2️⃣ Update transaction
    const { data: txn, error } = await supabase
      .from("transactions")
      .update({ status: "paid", razorpay_payment_id })
      .eq("id", orderId)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    // 3️⃣ Update affiliate stats
    if (txn.affiliate_id) {
      const { data: aff } = await supabase
        .from("affiliates")
        .select("*")
        .eq("id", txn.affiliate_id)
        .maybeSingle();

      if (aff) {
        const commission = txn.amount * (aff.commission_rate || 0.2);
        await supabase
          .from("affiliates")
          .update({
            sales_count: (aff.sales_count || 0) + 1,
            total_revenue: (aff.total_revenue || 0) + txn.amount,
            total_commission: (aff.total_commission || 0) + commission,
          })
          .eq("id", txn.affiliate_id);
      }
    }

    res.json({ success: true, txn });
  })
);

module.exports = router;
