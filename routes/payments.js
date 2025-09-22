// backend/routes/payments.js
const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const authMiddleware = require("../middleware/auth");
const { supabase } = require("../db");
const crypto = require("crypto");

// ------------------------
// Razorpay setup
// ------------------------
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ------------------------
// Get Razorpay public key
// ------------------------
router.get("/key", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

// ------------------------
// Create Razorpay order
// ------------------------
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount, ebookId, affiliateCode } = req.body;
    const userId = req.user.id;

    // Fetch affiliate info if code provided
    let affiliate = null;
    if (affiliateCode) {
      const { data, error } = await supabase
        .from("affiliates")
        .select("*")
        .eq("referral_code", affiliateCode)
        .eq("active", true)
        .single();
      if (error) console.log("Affiliate fetch error:", error);
      else affiliate = data;
    }

    // Create Razorpay order
    const options = {
      amount: amount * 100, // in paise
      currency: "INR",
      receipt: rcpt_${Date.now()},
    };
    const razorpayOrder = await razorpay.orders.create(options);

    // Insert transaction
    const { data: txn, error: txnError } = await supabase
      .from("transactions")
      .insert([{
        affiliate_id: affiliate ? affiliate.id : null,
        user_id: userId,
        amount,
        currency: "INR",
        razorpay_order_id: razorpayOrder.id,
        status: "created",
        commission_rate: affiliate ? affiliate.commission_rate : 0.3
      }])
      .select()
      .single();
    if (txnError) throw txnError;

    res.json({ success: true, razorpayOrder, order: txn });
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

    // Verify signature
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(${razorpay_order_id}|${razorpay_payment_id})
      .digest("hex");
    if (generated_signature !== razorpay_signature)
      return res.json({ success: false, error: "Invalid signature" });

    // Fetch transaction
    const { data: txn, error: txnFetchError } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", orderId)
      .single();
    if (txnFetchError) throw txnFetchError;

    // Update transaction as paid
    const { error: txnUpdateError } = await supabase
      .from("transactions")
      .update({
        status: "paid",
        razorpay_payment_id,
      })
      .eq("id", orderId);
    if (txnUpdateError) throw txnUpdateError;

    // Update affiliate stats if applicable
    if (txn.affiliate_id) {
      const { data: aff, error: affFetchError } = await supabase
        .from("affiliates")
        .select("*")
        .eq("id", txn.affiliate_id)
        .single();
      if (affFetchError) console.log("Affiliate fetch error:", affFetchError);

      if (aff) {
        const commission = txn.amount * aff.commission_rate;
        const { error: affUpdateError } = await supabase
          .from("affiliates")
          .update({
            total_commission: aff.total_commission + commission,
            total_revenue: aff.total_revenue + txn.amount,
            sales_count: aff.sales_count + 1,
          })
          .eq("id", aff.id);
        if (affUpdateError) console.log("Affiliate update error:", affUpdateError);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;