const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { supabase } = require("../utils/supabaseClient");
const razorpay = require("../utils/razorpay");
const { asyncHandler, authMiddleware, validate, body } = require("../middleware");
const { sendAffiliateEmail } = require("../utils/email");

// ------------------------
// 🔹 Create Razorpay Transaction
// ------------------------
router.post(
  "/create",
  authMiddleware,
  validate([
    body("amount").isFloat({ min: 1 }).withMessage("Amount must be a number > 0"),
    body("userName").notEmpty().withMessage("User name is required"),
    body("userEmail").isEmail().withMessage("Valid email is required"),
    body("affiliateCode").optional().isString(),
  ]),
  asyncHandler(async (req, res) => {
    const { amount, userName, userEmail, affiliateCode } = req.body;

    // 1️⃣ Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100), // in paise
      currency: "INR",
      receipt: `txn_${Date.now()}`,
      notes: {
        userName,
        userEmail,
        affiliateCode: affiliateCode || "none",
      },
    });

    // 2️⃣ Resolve affiliate ID if referral code provided
    let affiliateId = null;
    if (affiliateCode) {
      const { data: affiliate, error } = await supabase
        .from("affiliates")
        .select("id")
        .eq("referral_code", affiliateCode)
        .maybeSingle();

      if (error) console.warn("Affiliate lookup failed:", error.message);
      if (affiliate) affiliateId = affiliate.id;
    }

    // 3️⃣ Insert transaction into Supabase
    const { data: txn, error } = await supabase
      .from("transactions")
      .insert([
        {
          affiliate_id: affiliateId,
          referral_code: affiliateCode || null,
          user_name: userName,
          user_email: userEmail,
          amount,
          currency: "INR",
          razorpay_order_id: razorpayOrder.id,
          status: "pending",
        },
      ])
      .select()
      .single();

    if (error) throw new Error("Transaction insertion failed: " + error.message);

    res.json({ success: true, razorpayOrder, transaction: txn });
  })
);

// ------------------------
// 🔹 Verify Payment
// ------------------------
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
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, error: "Payment verification failed" });
    }

    // 2️⃣ Update transaction status
    const { data: txn, error } = await supabase
      .from("transactions")
      .update({ status: "completed", razorpay_payment_id })
      .eq("id", transactionId)
      .select()
      .single();

    if (error) throw new Error("Transaction update failed: " + error.message);

    // 3️⃣ Notify affiliate (async, non-blocking)
    if (txn.affiliate_id) {
      supabase
        .from("affiliates")
        .select("name, email")
        .eq("id", txn.affiliate_id)
        .maybeSingle()
        .then(async ({ data: affiliate }) => {
          if (affiliate) {
            await sendAffiliateEmail(
              affiliate.email,
              affiliate.name,
              txn.user_email,
              txn.amount,
              txn.created_at || new Date().toISOString()
            );
          }
        })
        .catch((err) => console.error("Affiliate notification failed:", err.message));
    }

    res.json({ success: true, transaction: txn });
  })
);

// ------------------------
// 🔹 Get All Transactions (for Dashboard)
// ------------------------
router.get(
  "/all",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { data: txns, error } = await supabase
      .from("transactions")
      .select(
        `
        *,
        affiliates(id, name, email, referral_code)
      `
      )
      .order("created_at", { ascending: false });

    if (error) throw new Error("Fetching transactions failed: " + error.message);

    res.json({ success: true, transactions: txns });
  })
);

module.exports = router;
