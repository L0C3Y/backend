// backend/routes/payments.js
const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

// ✅ Supabase client (adjust if you already have it setup)
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// ✅ Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// -------------------------------------
// GET Razorpay public key (public endpoint)
// -------------------------------------
router.get("/key", (req, res) => {
  if (!process.env.RAZORPAY_KEY_ID)
    return res.status(500).json({ error: "Razorpay key missing" });
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

// -------------------------------------
// POST Create order
// -------------------------------------
router.post("/create-order", async (req, res) => {
  try {
    const { amount, ebookId, affiliateCode } = req.body;
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) return res.status(401).json({ error: "Unauthorized" });

    // ✅ Decode user from token (implement your JWT decode here)
    const user = await decodeJWT(token); // implement decodeJWT to return { id: userId, name, email }

    if (!user) return res.status(401).json({ error: "Invalid token" });

    // ✅ Find affiliate by code
    const { data: affiliates, error: affErr } = await supabase
      .from("affiliates")
      .select("*")
      .eq("code", affiliateCode)
      .limit(1);

    if (affErr) throw affErr;

    const affiliate = affiliates?.[0];

    if (!affiliate)
      return res.status(400).json({ error: "Invalid affiliate code" });

    // ✅ Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100, // in paise
      currency: "INR",
      receipt: uuidv4(),
      payment_capture: 1,
    });

    // ✅ Save transaction in Supabase
    const { data: transaction, error: trxErr } = await supabase
      .from("transactions")
      .insert([
        {
          affiliate_id: affiliate.id,
          user_id: user.id,
          amount,
          currency: "INR",
          razorpay_order_id: razorpayOrder.id,
          status: "created",
        },
      ])
      .select()
      .single();

    if (trxErr) throw trxErr;

    res.json({
      success: true,
      razorpayOrder,
      order: transaction,
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: err.message || "Order creation failed" });
  }
});

// -------------------------------------
// POST Verify payment
// -------------------------------------
router.post("/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    // ✅ Verify signature
    const crypto = require("crypto");
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature)
      return res.status(400).json({ success: false, error: "Invalid signature" });

    // ✅ Update transaction status
    const { error } = await supabase
      .from("transactions")
      .update({ status: "paid", razorpay_payment_id })
      .eq("id", orderId);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

// ------------------------------
// Helper function to decode JWT
// ------------------------------
async function decodeJWT(token) {
  const jwt = require("jsonwebtoken");
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { id: decoded.id, email: decoded.email, name: decoded.name }; // adjust based on your JWT
  } catch (err) {
    return null;
  }
}
