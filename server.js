// backend/server.js
require("dotenv").config(); // MUST be the very first line
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const pool = require("./db"); // PostgreSQL/Supabase client

// Routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const ebookRoutes = require("./routes/ebooks");
const affiliateRoutes = require("./routes/affiliates");
const visitRoutes = require("./routes/visits");
const feedbackRoutes = require("./routes/feedback");

const app = express();

// Middleware
app.use(express.json());

// ✅ CORS configuration
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

// ✅ Check environment variables
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error("❌ Razorpay keys missing! Please check .env or hosting env vars.");
  process.exit(1); // stop server
}

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Mount routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/ebooks", ebookRoutes);
app.use("/api/affiliates", affiliateRoutes);
app.use("/api/visits", visitRoutes);
app.use("/api/feedbacks", feedbackRoutes);

// ✅ Payment routes
app.get("/api/payments/key", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

app.post("/api/payments/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount, ebookId, affiliateCode } = req.body;
    const userId = req.user.id;

    // Affiliate lookup
    let affiliateId = null;
    if (affiliateCode) {
      const aff = await pool.query("SELECT id FROM affiliates WHERE code=$1", [affiliateCode]);
      if (aff.rows.length) affiliateId = aff.rows[0].id;
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100, // amount in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    });

    // Insert transaction in DB
    const orderRes = await pool.query(
      `INSERT INTO transactions (affiliate_id, user_id, amount, currency, razorpay_order_id, status)
       VALUES ($1,$2,$3,$4,$5,'created') RETURNING *`,
      [affiliateId, userId, amount, "INR", razorpayOrder.id]
    );

    res.json({ success: true, razorpayOrder, order: orderRes.rows[0] });
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

    await pool.query(
      "UPDATE transactions SET status='paid', razorpay_payment_id=$1 WHERE id=$2",
      [razorpay_payment_id, orderId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Root test
app.get("/", (req, res) => res.send("🚀 Backend running!"));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
