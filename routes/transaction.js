const express = require("express");
const router = express.Router();
const Transaction = require("../models/transaction");
const Affiliate = require("../models/affiliates");
const razorpay = require("../utils/razorpay");
const crypto = require("crypto");
const { asyncHandler, authMiddleware, validate, body } = require("../middleware");
const { sendAffiliateEmail } = require("../utils/email");

// Create transaction / Razorpay order
router.post(
  "/create",
  authMiddleware,
  validate([body("amount").isFloat({ min: 1 }), body("userName").notEmpty(), body("userEmail").notEmpty()]),
  asyncHandler(async (req, res) => {
    const { amount, userName, userEmail, affiliateCode } = req.body;

    // 1️⃣ Create Razorpay order
    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: `txn_${Date.now()}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    // 2️⃣ Find affiliate if code exists
    let affiliateId = null;
    if (affiliateCode) {
      const affiliate = await Affiliate.findOne({ referral_code: affiliateCode });
      if (affiliate) affiliateId = affiliate._id;
    }

    // 3️⃣ Save transaction in DB
    const txn = await Transaction.create({
      affiliateId,
      code: affiliateCode || null,
      userName,
      userEmail,
      amount,
      currency: "INR",
      razorpay_order_id: razorpayOrder.id,
      status: "pending",
    });

    res.json({ success: true, razorpayOrder, transaction: txn });
  })
);

// Verify payment
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

    const digest = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (digest !== razorpay_signature) {
      return res.status(400).json({ success: false, error: "Payment verification failed" });
    }

    // Update transaction status
    const txn = await Transaction.findByIdAndUpdate(
      transactionId,
      {
        status: "completed",
        razorpay_payment_id,
        razorpay_signature,
      },
      { new: true }
    );

    // Notify affiliate if exists
    if (txn.affiliateId) {
      const affiliate = await Affiliate.findById(txn.affiliateId);
      if (affiliate) {
        await sendAffiliateEmail(
          affiliate.email,
          affiliate.name,
          txn.userName,
          txn.amount,
          new Date().toISOString()
        );
      }
    }

    res.json({ success: true, transaction: txn });
  })
);

// Get transactions (for dashboard)
router.get(
  "/all",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const txns = await Transaction.find()
      .populate("affiliateId", "name email referral_code")
      .sort({ createdAt: -1 });
    res.json({ success: true, transactions: txns });
  })
);

module.exports = router;
