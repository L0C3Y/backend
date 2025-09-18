const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const razorpay = require("../utils/razorpay");
const { supabase } = require("../supabase");
const { asyncHandler, authMiddleware, validate, body } = require("./middleware");
const { sendAffiliateEmail } = require("../utils/email"); // send email to affiliate

// Helper to parse amount
const parseAmount = (amount) => {
  const num = parseFloat(amount);
  if (isNaN(num) || num < 1) throw new Error("Invalid amount");
  return num;
};

// 🔹 Create Razorpay Order
router.post(
  "/create-order",
  authMiddleware,
  validate([
    body("ebookId").notEmpty(),
    body("amount").notEmpty(),
    body("affiliateCode").optional(),
  ]),
  asyncHandler(async (req, res) => {
    const { ebookId, amount, affiliateCode } = req.body;
    const userId = req.user?.id;
    const userEmail = req.user?.email;

    if (!userId || !userEmail) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    try {
      const amountNum = parseAmount(amount);

      // 1️⃣ Create Razorpay order
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(amountNum * 100),
        currency: "INR",
        receipt: `ebook_${ebookId}_${Date.now()}`,
      });

      // 2️⃣ Save order to Supabase with auto-detect affiliate code
      const finalAffiliateCode = affiliateCode || req.query.ref || null;

      const { data: order, error } = await supabase
        .from("orders")
        .insert([{
          user_id: userId,
          user_email: userEmail,
          ebook_id: ebookId,
          amount: amountNum,
          status: "pending",
          razorpay_order_id: razorpayOrder.id,
          affiliate_code: finalAffiliateCode,
        }])
        .select()
        .single();

      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }

      res.json({ success: true, razorpayOrder, order });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  })
);

// 🔹 Verify Razorpay Payment
router.post(
  "/verify",
  authMiddleware,
  validate([
    body("razorpay_order_id").notEmpty(),
    body("razorpay_payment_id").notEmpty(),
    body("razorpay_signature").notEmpty(),
    body("orderId").notEmpty(), // DB order id
  ]),
  asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    try {
      // Generate signature
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ success: false, error: "Payment verification failed" });
      }

      // Update order status
      const { data: updatedOrder, error: updateError } = await supabase
        .from("orders")
        .update({ status: "completed", razorpay_payment_id, razorpay_signature })
        .eq("id", orderId)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ success: false, error: updateError.message });
      }

      let transactionInfo = null;

      // 🔹 Affiliate commission
      if (updatedOrder.affiliate_code) {
        const { data: affiliate } = await supabase
          .from("affiliates")
          .select("*")
          .eq("code", updatedOrder.affiliate_code)
          .maybeSingle();

        if (affiliate) {
          // Prevent duplicate transaction
          const { data: existingTxn } = await supabase
            .from("transactions")
            .select("*")
            .eq("razorpay_order_id", razorpay_order_id)
            .maybeSingle();

          if (!existingTxn) {
            const commissionAmount = updatedOrder.amount * (affiliate.commission_rate || 0.2);

            const { data: txn } = await supabase
              .from("transactions")
              .insert([{
                affiliate_id: affiliate.id,
                code: updatedOrder.affiliate_code,
                user_email: updatedOrder.user_email,
                amount: commissionAmount,
                currency: "INR",
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature,
                status: "completed",
              }])
              .select()
              .single();

            transactionInfo = txn;

            // 🔹 Fetch user name for email
            const { data: userInfo } = await supabase
              .from("users")
              .select("name, email")
              .eq("id", updatedOrder.user_id)
              .single();

            const buyerName = userInfo?.name || updatedOrder.user_email;

            // Send email to affiliate
            await sendAffiliateEmail(
              affiliate.email,
              affiliate.name,
              buyerName,
              commissionAmount,
              new Date().toISOString()
            );
          }
        }
      }

      res.json({ success: true, data: updatedOrder, transaction: transactionInfo });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  })
);

// 🔓 Public Razorpay key
router.get("/key", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

module.exports = router;
