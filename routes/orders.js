const express = require("express");
const router = express.Router();
const Orders = require("../models/orders");
const razorpay = require("../utils/razorpay");
const crypto = require("crypto");
const { asyncHandler, authMiddleware, validate, body } = require("../middleware");
const { supabase } = require("../supabase");
const { sendAffiliateEmail } = require("../utils/email");

// Create order
router.post(
  "/create",
  authMiddleware,
  validate([
    body("userId").notEmpty(),
    body("ebookId").notEmpty(),
    body("amount").isFloat({ min: 1 }),
  ]),
  asyncHandler(async (req, res) => {
    const { userId, ebookId, amount, affiliateCode } = req.body;

    // Razorpay order
    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: `ebook_${ebookId}_${Date.now()}`,
    };
    const razorpayOrder = await razorpay.orders.create(options);

    // Create DB order
    const dbOrder = await Orders.createOrder(userId, ebookId, amount, affiliateCode);

    res.json({ success: true, razorpayOrder, dbOrder });
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
    body("orderId").notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    const digest = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (digest !== razorpay_signature) {
      return res.status(400).json({ success: false, error: "Payment verification failed" });
    }

    // Update order status
    const updatedOrder = await Orders.updateOrderStatus(orderId, "completed", {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    // Notify affiliate if exists
    if (updatedOrder.affiliate_code) {
      const { data: affiliate } = await supabase
        .from("affiliates")
        .select("*")
        .eq("referral_code", updatedOrder.affiliate_code)
        .single();

      if (affiliate) {
        // Get buyer info from user table (assuming you have a users table)
        const { data: buyer } = await supabase
          .from("users")
          .select("name, email")
          .eq("id", updatedOrder.user_id)
          .single();

        await sendAffiliateEmail(
          affiliate.email,
          affiliate.name,
          buyer?.name || "Unknown",
          updatedOrder.amount,
          new Date().toISOString()
        );
      }
    }

    res.json({ success: true, data: updatedOrder });
  })
);

// Get user orders
router.get(
  "/user/:userId",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const orders = await Orders.getOrdersByUser(req.params.userId);
    res.json({ success: true, data: orders });
  })
);

module.exports = router;
