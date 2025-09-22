// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

// Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const paymentRoutes = require("./routes/payments");
const ebookRoutes = require("./routes/ebooks");
const affiliateRoutes = require("./routes/affiliates");
const visitRoutes = require("./routes/visits");
const feedbackRoutes = require("./routes/feedback");

const app = express();

// ✅ Middleware
app.use(express.json());

// ✅ CORS configuration
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://snowstrom.shop"
];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    exposedHeaders: ["Authorization"],
  })
);

// ✅ Mount routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/ebooks", ebookRoutes);
app.use("/api/affiliates", affiliateRoutes);
app.use("/api/visits", visitRoutes);
app.use("/api/feedbacks", feedbackRoutes);

// ✅ Test routes
app.post("/api/test", (req, res) => res.json({ ok: true }));
app.get("/", (req, res) => res.send("🚀 Backend is running!"));

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
