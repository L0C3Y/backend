// backend/routes/payments.js
const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const authMiddleware = require("../middleware/auth"); // JWT auth
const { supabase } = require("../db"); // Supabase client
const crypto = require("crypto");

// Razorpay init
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Public key endpoint
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

    if (!amount || isNaN(amount) || amount <= 0)
      return res.status(400).json({ success: false, error: "Invalid amount" });

    // Affiliate fetch
    let affiliateId = null;
    if (affiliateCode) {
      const { data: affData, error: affError } = await supabase
        .from("affiliates")
        .select("id")
        .eq("referral_code", affiliateCode)
        .single();
      if (affError) console.error("Affiliate fetch error:", affError.message);
      if (affData) affiliateId = affData.id;
    }

    // Razorpay order
    const options = { amount: amount * 100, currency: "INR", receipt: `rcpt_${Date.now()}` };
    const razorpayOrder = await razorpay.orders.create(options);

    // Save transaction
    const { data: transData, error: transError } = await supabase
      .from("transactions")
      .insert([{
        user_id: userId,
        affiliate_id: affiliateId,
        ebook_id: ebookId || null,
        referral_code: affiliateCode || null,
        amount,
        currency: "INR",
        razorpay_order_id: razorpayOrder.id,
        status: "created",
      }])
      .select()
      .single();

    if (transError) throw new Error(transError.message);

    res.json({ success: true, razorpayOrder, transaction: transData });
  } catch (err) {
    console.error("Create order error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ------------------------
// Verify payment
// ------------------------
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, transactionId } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !transactionId)
      return res.status(400).json({ success: false, error: "Missing required fields" });

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature)
      return res.status(400).json({ success: false, error: "Invalid signature" });

    const { data: txnData, error: txnError } = await supabase
      .from("transactions")
      .update({ status: "paid", razorpay_payment_id })
      .eq("id", transactionId)
      .select()
      .single();

    if (txnError) throw new Error(txnError.message);

    res.json({ success: true, transaction: txnData });
  } catch (err) {
    console.error("Verify payment error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ------------------------
// Dashboard: get all transactions
// ------------------------
router.get("/all", authMiddleware, async (req, res) => {
  try {
    const { data: txns, error } = await supabase
      .from("transactions")
      .select(`*, affiliates(name, email, referral_code)`)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    res.json({ success: true, transactions: txns });
  } catch (err) {
    console.error("Dashboard fetch error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
