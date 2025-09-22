// backend/server.js
require("dotenv").config(); // MUST be first
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { supabase } = require("./db"); // Supabase client

const app = express();

// Middleware
app.use(express.json());

// ✅ CORS
const allowedOrigins = [
  "https://snowstrom.shop",
  "http://localhost:3000",
  "http://localhost:5173",
];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    exposedHeaders: ["Authorization"],
  })
);

// JWT middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, error: "No token provided" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: "Invalid token" });
  }
};

// ✅ Razorpay instance
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error("❌ Razorpay keys missing! Check .env or hosting env vars.");
  process.exit(1);
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Routes
app.get("/", (req, res) => res.send("🚀 Backend running!"));

// Payment routes
app.get("/api/payments/key", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

app.post("/api/payments/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount, ebookId, affiliateCode } = req.body;
    const userId = req.user.id;

    // Lookup affiliate
    let affiliateId = null;
    if (affiliateCode) {
      const { data: affData, error: affError } = await supabase
        .from("affiliates")
        .select("id")
        .eq("code", affiliateCode)
        .single();

      if (affError && affError.code !== "PGRST116") throw affError; // PGRST116 = no rows
      affiliateId = affData?.id || null;
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100, // in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    });

    // Insert transaction
    const { data: orderRes, error: insertError } = await supabase
      .from("transactions")
      .insert([{
        affiliate_id: affiliateId,
        user_id: userId,
        amount: amount,
        currency: "INR",
        razorpay_order_id: razorpayOrder.id,
        status: "created",
      }])
      .select()
      .single();

    if (insertError) throw insertError;

    res.json({ success: true, razorpayOrder, order: orderRes });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/payments/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature)
      return res.status(400).json({ success: false, error: "Invalid signature" });

    // Update transaction
    const { error: updateError } = await supabase
      .from("transactions")
      .update({ status: "paid", razorpay_payment_id })
      .eq("id", orderId);

    if (updateError) throw updateError;

    res.json({ success: true });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Other API routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/ebooks", require("./routes/ebooks"));
app.use("/api/affiliates", require("./routes/affiliates"));
app.use("/api/visits", require("./routes/visits"));
app.use("/api/feedbacks", require("./routes/feedback"));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
