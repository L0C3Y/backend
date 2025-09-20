const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { supabase } = require("../utils/supabaseClient");
const razorpay = require("../utils/razorpay");
const { asyncHandler, authMiddleware, validate, body } = require("../middleware");
const { sendAffiliateEmail } = require("../utils/email");

// ✅ Create transaction / Razorpay order
router.post(
  "/create",
  authMiddleware,
  validate([
    body("amount").isFloat({ min: 1 }),
    body("userName").notEmpty(),
    body("userEmail").notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const { amount, userName, userEmail, affiliateCode } = req.body;

    // 1️⃣ Create Razorpay order
    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: `txn_${Date.now()}`,
    };
    const razorpayOrder = await razorpay.orders.create(options);

    // 2️⃣ Find affiliate (if code exists)
    let affiliateId = null;
    if (affiliateCode) {
      const { data: affiliate } = await supabase
        .from("affiliates")
        .select("id")
        .eq("referral_code", affiliateCode)
        .single();

      if (affiliate) affiliateId = affiliate.id;
    }

    // 3️⃣ Save transaction in Supabase
    const { data: txn, error } = await supabase
      .from("transactions")
      .insert([
        {
          affiliate_id: affiliateId,
          referral_code: affiliateCode || null,
          user_email: userEmail,
          amount,
          currency: "INR",
          razorpay_order_id: razorpayOrder.id,
          status: "pending",
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, razorpayOrder, transaction: txn });
  })
);

// ✅ Verify payment
router.post(
  "/verify",
  authMiddleware,
  validate([
    body("razorpay_order_id").notEmpty(),
    body("razorpay_payment_id").notEmpty(),
    body("razorpay_signature").notEmpty(),
    body("transactionId").notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, transactionId } = req.body;

    // 1️⃣ Verify signature
    const digest = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (digest !== razorpay_signature) {
      return res.status(400).json({ success: false, error: "Payment verification failed" });
    }

    // 2️⃣ Update transaction status
    const { data: txn, error } = await supabase
      .from("transactions")
      .update({
        status: "completed",
        razorpay_payment_id,
      })
      .eq("id", transactionId)
      .select()
      .single();

    if (error) throw error;

    // 3️⃣ Notify affiliate if exists
    if (txn.affiliate_id) {
      const { data: affiliate } = await supabase
        .from("affiliates")
        .select("email, name")
        .eq("id", txn.affiliate_id)
        .single();

      if (affiliate) {
        await sendAffiliateEmail(
          affiliate.email,
          affiliate.name,
          txn.user_email,
          txn.amount,
          new Date().toISOString()
        );
      }
    }

    res.json({ success: true, transaction: txn });
  })
);

// ✅ Get transactions (for dashboard)
router.get(
  "/all",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { data: txns, error } = await supabase
      .from("transactions")
      .select(
        `
        *,
        affiliates(name, email, referral_code)
      `
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ success: true, transactions: txns });
  })
);

module.exports = router;
