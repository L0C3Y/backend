// test.js
require("dotenv").config();
const path = require("path");
const { sendAffiliateEmail, sendEbookEmail } = require("./utils/email"); // adjust path
const Razorpay = require("razorpay");

(async () => {
  try {
    console.log("🚀 Starting test...");

    // -----------------------------
    // 1️⃣ Test Affiliate Email
    // -----------------------------
    await sendAffiliateEmail(
      "fmtsnow51@gmail.com", // affiliate email
      "Snow",        // affiliate name
      "Master",            // buyer name
      90,                      // commission amount
      new Date().toISOString() // sale date
    );
    console.log("✅ Affiliate email sent successfully!");

    // -----------------------------
    // 2️⃣ Test Ebook Email
    // -----------------------------
    await sendEbookEmail(
      "fmtsnow51@gmail.com",                   // buyer email
      "life of a dot",                             // ebook title
      path.join(__dirname, "secure/ebook1.pdf") // path to PDF
    );
    console.log("✅ Ebook email sent successfully!");

    // -----------------------------
    // 3️⃣ Test Razorpay Order Creation
    // -----------------------------
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount: 1000 * 100, // ₹1000 in paise
      currency: "INR",
      receipt: "test_order_" + Date.now(),
    });

    console.log("✅ Razorpay order created:", order);

    console.log("🎯 Test completed successfully!");
  } catch (err) {
    console.error("❌ Test failed:", err);
  }
})();