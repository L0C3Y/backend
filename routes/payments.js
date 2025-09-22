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
// Public: Fetch Razorpay Key
// ------------------------
router.get("/key", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

// ------------------------
// Protected: Create Order
// ------------------------
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount, ebookId, affiliateCode } = req.body;
    const userId = req.user.id;

    // Fetch affiliate if code provided
    let affiliate = null;
    if (affiliateCode) {
      const { data: affData, error: affError } = await supabase
        .from("affiliates")
        .select("*")
        .eq("referral_code", affiliateCode)
        .single();

      if (affError && affError.code !== "PGRST116") throw affError;
      affiliate = affData || null;
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100, // paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    });

    // Save transaction in Supabase
    const { data: txn, error: txnError } = await supabase
      .from("transactions")
      .insert([{
        affiliate_id: affiliate ? affiliate.id : null,
        user_id: userId,
        amount,
        currency: "INR",
        razorpay_order_id: razorpayOrder.id,
        status: "created",
        commission_rate: affiliate ? affiliate.commission_rate : 0.3 // default 30%
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
// Protected: Verify Payment
// ------------------------
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    // Verify Razorpay signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, error: "Invalid signature" });
    }

    // Update transaction as paid
    const { data: txn, error: txnError } = await supabase
      .from("transactions")
      .update({
        status: "paid",
        razorpay_payment_id
      })
      .eq("id", orderId)
      .select()
      .single();

    if (txnError) throw txnError;

    // Update affiliate earnings if applicable
    if (txn.affiliate_id) {
      // Fetch affiliate
      const { data: aff, error: affError } = await supabase
        .from("affiliates")
        .select("*")
        .eq("id", txn.affiliate_id)
        .single();

      if (!affError && aff) {
        const commissionEarned = txn.amount * (txn.commission_rate || 0.3);

        await supabase.from("affiliates")
          .update({
            sales_count: aff.sales_count + 1,
            total_revenue: (aff.total_revenue || 0) + txn.amount,
            total_commission: (aff.total_commission || 0) + commissionEarned
          })
          .eq("id", aff.id);
      }
    }

    res.json({ success: true, message: "Payment verified" });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
