// backend/routes/payments.js
const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const authMiddleware = require("../middleware/auth");
const pool = require("../db"); // postgres / supabase client

// Razorpay instance
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
// Create order
// ------------------------
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount, ebookId, affiliateCode } = req.body;
    const userId = req.user.id;

    // Fetch affiliate ID and commission rate if provided
    let affiliateId = null;
    let commissionRate = 0.3; // default 30%
    if (affiliateCode) {
      const aff = await pool.query(
        "SELECT id, commission_rate FROM affiliates WHERE referral_code=$1 AND active=true",
        [affiliateCode]
      );
      if (aff.rows.length) {
        affiliateId = aff.rows[0].id;
        commissionRate = aff.rows[0].commission_rate;
      }
    }

    // Razorpay order creation
    const options = {
      amount: Math.round(amount * 100), // amount in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    };
    const razorpayOrder = await razorpay.orders.create(options);

    // Save transaction in DB
    const orderRes = await pool.query(
      `INSERT INTO transactions 
       (affiliate_id, user_id, amount, currency, razorpay_order_id, status, commission_rate)
       VALUES ($1,$2,$3,$4,$5,'created',$6) RETURNING *`,
      [affiliateId, userId, amount, "INR", razorpayOrder.id, commissionRate]
    );

    res.json({
      success: true,
      razorpayOrder,
      order: orderRes.rows[0],
    });
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
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generated_signature !== razorpay_signature)
      return res.json({ success: false, error: "Invalid signature" });

    // Fetch transaction to calculate affiliate commission
    const txRes = await pool.query("SELECT * FROM transactions WHERE id=$1", [orderId]);
    if (!txRes.rows.length) return res.status(404).json({ success: false, error: "Transaction not found" });
    const tx = txRes.rows[0];

    // Mark transaction as paid
    await pool.query(
      `UPDATE transactions 
       SET status='paid', razorpay_payment_id=$1, paid_at=NOW() 
       WHERE id=$2`,
      [razorpay_payment_id, orderId]
    );

    // Update affiliate stats if applicable
    if (tx.affiliate_id) {
      const commissionAmount = tx.amount * tx.commission_rate;
      await pool.query(
        `UPDATE affiliates 
         SET sales_count = sales_count + 1,
             total_revenue = total_revenue + $1,
             total_commission = total_commission + $2
         WHERE id=$3`,
        [tx.amount, commissionAmount, tx.affiliate_id]
      );
    }

    res.json({ success: true, message: "Payment verified and commission applied" });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;