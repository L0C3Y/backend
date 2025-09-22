// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const Razorpay = require("razorpay");
const { supabase } = require("./db"); // Supabase client

const app = express();
app.use(express.json());

// CORS
const allowedOrigins = ["https://snowstrom.shop", "http://localhost:3000", "http://localhost:5173"];
app.use(
  cors({ origin: (origin, cb) => cb(null, true), credentials: true })
);

// JWT middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, error: "No token provided" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, error: "Invalid token" });
  }
};

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// GET Razorpay key
app.get("/api/payments/key", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

// CREATE ORDER
app.post("/api/payments/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount, ebookId, affiliateCode } = req.body;
    const userId = req.user.id;

    // Affiliate lookup
    let affiliateId = null;
    if (affiliateCode) {
      const { data: affs } = await supabase
        .from("affiliates")
        .select("id")
        .eq("code", affiliateCode)
        .single();
      if (affs) affiliateId = affs.id;
    }

    // Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    });

    // Insert transaction
    const { data: orderData, error: insertErr } = await supabase
      .from("transactions")
      .insert([{
        user_id: userId,
        affiliate_id: affiliateId,
        amount,
        currency: "INR",
        razorpay_order_id: razorpayOrder.id,
        status: "created",
      }])
      .select()
      .single();

    if (insertErr) throw insertErr;
    res.json({ success: true, razorpayOrder, order: orderData });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// VERIFY PAYMENT
app.post("/api/payments/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    const crypto = require("crypto");

    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature)
      return res.status(400).json({ success: false, error: "Invalid signature" });

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

// Root test
app.get("/", (req, res) => res.send("🚀 Backend running!"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
