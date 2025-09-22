const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const authMiddleware = require("../middleware/auth");
const pool = require("../db"); // postgres client
const { sendAffiliateEmail, sendEbookEmail } = require("../utils/email");

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ------------------------
// CORS for frontend
// ------------------------
router.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://snowstrom.shop");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// ------------------------
// Public: Get Razorpay key
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

    // Fetch affiliate info if code provided
    let affiliate = null;
    if (affiliateCode) {
      const affRes = await pool.query(
        "SELECT id, commission_rate, name, email, referral_link FROM affiliates WHERE referral_code=$1 AND active=true",
        [affiliateCode]
      );
      if (affRes.rows.length) affiliate = affRes.rows[0];
    }

    const options = {
      amount: amount * 100, // in paise
      currency: "INR",
      receipt: rcpt_${Date.now()},
    };

    const razorpayOrder = await razorpay.orders.create(options);

    // Save transaction
    const trxRes = await pool.query(
      `INSERT INTO transactions (affiliate_id, user_id, amount, currency, razorpay_order_id, status)
       VALUES ($1,$2,$3,$4,$5,'created') RETURNING *`,
      [affiliate ? affiliate.id : null, userId, amount, "INR", razorpayOrder.id]
    );

    res.json({ success: true, razorpayOrder, order: trxRes.rows[0] });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ------------------------
// Verify payment & distribute commission
// ------------------------
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    // Signature validation
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature)
      return res.status(400).json({ success: false, error: "Invalid signature" });

    // Fetch transaction & affiliate
    const trxRes = await pool.query(
      `SELECT t.id, t.amount, t.affiliate_id, a.commission_rate, a.email, a.name
       FROM transactions t
       LEFT JOIN affiliates a ON t.affiliate_id = a.id
       WHERE t.id=$1`,
      [orderId]
    );

    if (!trxRes.rows.length) return res.status(404).json({ success: false, error: "Transaction not found" });

    const trx = trxRes.rows[0];
    const commission = trx.affiliate_id ? trx.amount * trx.commission_rate : 0;

    // Update transaction & affiliate metrics
    await pool.query(
      UPDATE transactions SET status='paid', razorpay_payment_id=$1 WHERE id=$2,
      [razorpay_payment_id, orderId]
    );

    if (trx.affiliate_id) {
      await pool.query(
        `UPDATE affiliates
         SET total_commission = total_commission + $1,
             total_revenue = total_revenue + $2,
             sales_count = sales_count + 1
         WHERE id=$3`,
        [commission, trx.amount, trx.affiliate_id]
      );

      // Optional: send affiliate notification email
      await sendAffiliateEmail({
        to: trx.email,
        affiliateName: trx.name,
        buyerName: req.user.name,
        commission,
        date: new Date(),
      });
    }

    // Optional: send ebook email to buyer
    await sendEbookEmail({ to: req.user.email, ebookId: req.body.ebookId });

    res.json({ success: true, commission });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;