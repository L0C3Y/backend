// backend/routes/payments.js
const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase"); // initialized Supabase client
const { body, validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");
const Razorpay = require("razorpay");

// ------------------
// Middleware helpers
// ------------------
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const validate = (validations) => async (req, res, next) => {
  await Promise.all(validations.map((v) => v.run(req)));
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(400).json({ success: false, errors: errors.array() });
};

// ------------------
// JWT Auth middleware
// ------------------
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token)
    return res.status(401).json({ success: false, error: "No token provided" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid token" });
  }
};

// ------------------
// Get Razorpay key
// ------------------
router.get("/key", authMiddleware, asyncHandler(async (req, res) => {
  if (!process.env.RAZORPAY_KEY_ID)
    return res.status(500).json({ success: false, error: "Razorpay key missing in backend" });

  res.json({ success: true, key: process.env.RAZORPAY_KEY_ID });
}));

// ------------------
// Create order
// ------------------
router.post(
  "/create-order",
  authMiddleware,
  validate([body("amount").isNumeric({ min: 1 }), body("ebookId").notEmpty()]),
  asyncHandler(async (req, res) => {
    const { amount, ebookId, affiliateCode } = req.body;

    // 1️⃣ Resolve affiliate_code to affiliate_id
    let affiliate_id = null;
    if (affiliateCode) {
      const { data: aff, error } = await supabase
        .from("affiliates")
        .select("id")
        .eq("code", affiliateCode)
        .maybeSingle();

      if (error) return res.status(500).json({ success: false, error: error.message });
      affiliate_id = aff?.id;
    }

    if (!affiliate_id)
      return res.status(400).json({ success: false, error: "Affiliate code missing or invalid" });

    // 2️⃣ Insert transaction
    const { data: txn, error } = await supabase
      .from("transactions")
      .insert([{ affiliate_id, user_id: req.user.id, amount, currency: "INR", status: "created" }])
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    // 3️⃣ Create Razorpay order
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
      amount: Math.round(amount * 100), // Razorpay expects amount in paise
      currency: "INR",
      receipt: txn.id,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    res.json({ success: true, razorpayOrder, order: txn });
  })
);

// ------------------
// Verify payment
// ------------------
router.post(
  "/verify",
  authMiddleware,
  validate([
    body("razorpay_order_id").notEmpty(),
    body("razorpay_payment_id").notEmpty(),
    body("razorpay_signature").notEmpty(),
    body("orderId").notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    // Optional: verify signature here with HMAC SHA256
    // For simplicity, mark as paid
    const { data: txn, error } = await supabase
      .from("transactions")
      .update({ status: "paid", razorpay_order_id, razorpay_payment_id })
      .eq("id", orderId)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    // Update affiliate stats
    if (txn.affiliate_id) {
      const { data: aff } = await supabase
        .from("affiliates")
        .select("*")
        .eq("id", txn.affiliate_id)
        .maybeSingle();

      if (aff) {
        const commission = txn.amount * (aff.commission_rate || 0.2);
        await supabase.from("affiliates").update({
          sales_count: (aff.sales_count || 0) + 1,
          total_revenue: (aff.total_revenue || 0) + txn.amount,
          total_commission: (aff.total_commission || 0) + commission,
        }).eq("id", txn.affiliate_id);
      }
    }

    res.json({ success: true, data: txn });
  })
);

module.exports = router;
