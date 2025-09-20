const { supabase } = require("../supabase");
const { sendAffiliateEmail } = require("../utils/email");

// 📦 Create new order (pending by default)
async function createOrder(userId, ebookId, amount, affiliateCode = null, currency = "INR", razorpayOrderId = null) {
  const { data, error } = await supabase
    .from("orders")
    .insert([{
      user_id: userId,
      ebook_id: ebookId,
      amount,
      currency,
      affiliate_code: affiliateCode,
      status: "pending",
      razorpay_order_id: razorpayOrderId
    }])
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

// 📜 Get all orders for a user (latest first + ebook details)
async function getOrdersByUser(userId) {
  const { data, error } = await supabase
    .from("orders")
    .select(`
      *,
      ebooks (title, price, cover_image)
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// 🔄 Update order after payment verification
async function updateOrderStatus(orderId, status, paymentData = {}) {
  const { data, error } = await supabase
    .from("orders")
    .update({
      status,
      razorpay_order_id: paymentData.razorpay_order_id || null,
      razorpay_payment_id: paymentData.razorpay_payment_id || null,
      razorpay_signature: paymentData.razorpay_signature || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .select("*")
    .single();

  if (error) throw error;

  // 🔔 If order completed, notify affiliate
  if (status === "completed" && data.affiliate_code) {
    const { data: affiliate } = await supabase
      .from("affiliates")
      .select("name, email")
      .eq("referral_code", data.affiliate_code)
      .single();

    if (affiliate) {
      const { data: buyer } = await supabase
        .from("users")
        .select("name, email")
        .eq("id", data.user_id)
        .single();

      await sendAffiliateEmail(
        affiliate.email,
        affiliate.name,
        buyer?.name || "Unknown",
        data.amount,
        new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
      );
    }
  }

  return data;
}

module.exports = { createOrder, updateOrderStatus, getOrdersByUser };
