// backend/server.js

require("dotenv").config();
const express = require("express");
const cors = require("cors");

// ✅ Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const paymentRoutes = require("./routes/payments");
const ebookRoutes = require("./routes/ebooks");
const affiliateRoutes = require("./routes/affiliates");
const visitRoutes = require("./routes/visits");
const feedbackRoutes = require("./routes/feedback"); // ✅ New feedback route

const app = express();

// ✅ Middleware
app.use(cors());
app.use(express.json());

// ✅ Mount routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/ebooks", ebookRoutes);
app.use("/api/affiliates", affiliateRoutes);
app.use("/api/visits", visitRoutes);
app.use("/api/feedbacks", feedbackRoutes); // ✅ Feedback route

// ✅ Root test route
app.get("/", (req, res) => {
  res.send("🚀 Backend is running!");
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
