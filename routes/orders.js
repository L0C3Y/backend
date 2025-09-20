// backend/routes/order.js
const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase");
const { sendEmail } = require("../utils/email");

// --- Create Order ---
router.post("/create", async (req, res) => {
  try {
    const { userId, ebookId, amount, affiliateCode, currency } = req.body;

    const { data, error } = await supabase
      .from("orders")
      .insert([{
        user_id: userId,
        ebook_id: ebookId,
        amount,
        currency: currency || "INR",
        affiliate_code: affiliateCode || null,
        status: "pending"
      }])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// --- Update Order Status ---
router.post("/update-status", async (req, res) => {
  try {
    const { orderId, status, paymentData } = req.body;

    const { data: order, error } = await supabase
      .from("orders")
      .update({
        status,
        razorpay_order_id: paymentData?.razorpay_order_id || null,
        razorpay_payment_id: paymentData?.razorpay_payment_id || null,
        razorpay_signature: paymentData?.razorpay_signature || null,
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;

    // ⚡ If order was paid and has affiliate → send email
    if (status === "paid" && order.affiliate_code) {
      await notifyAffiliate(order);
    }

    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

// --- Helper function ---
async function notifyAffiliate(order) {
  try {
    // Get affiliate info
    const { data: affiliate } = await supabase
      .from("affiliates")
      .select("name, email")
      .eq("code", order.affiliate_code)
      .single();

    if (!affiliate) return;

    // Get buyer info
    const { data: buyer } = await supabase
      .from("users")
      .select("name")
      .eq("id", order.user_id)
      .single();

    const buyerName = buyer?.name || "Anonymous";

    // Prepare email
    const subject = "🎉 New Sale Registered!";
    const html = `
      <h2>Hello ${affiliate.name},</h2>
      <p>You just earned a commission from a new sale!</p>
      <ul>
        <li><strong>Buyer:</strong> ${buyerName}</li>
        <li><strong>Amount:</strong> ₹${order.amount}</li>
        <li><strong>Time:</strong> ${new Date(order.created_at).toLocaleString()}</li>
      </ul>
      <p>Keep up the great work 🚀</p>
      <p>- Snowstorm Team</p>
    `;

    await sendEmail(affiliate.email, subject, html);
  } catch (err) {
    console.error("Affiliate email failed:", err);
  }
}

module.exports = router;
