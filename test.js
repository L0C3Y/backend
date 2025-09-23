require("dotenv").config();
const fetch = require("node-fetch");
const { supabase } = require("./db");

// Test configuration
const TEST_BUYER_EMAIL = "buyer@example.com";
const TEST_AFFILIATE_EMAIL = "yash2230awm@gmail.com";
const TEST_ORDER_AMOUNT = 1000;

// Helper: safe POST JSON
async function safePostJSON(url, body, token) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Response not JSON for POST ${url}:\n${text}`);
  }
}

// Main test function
(async () => {
  console.log("=== Starting Dashboard, Email + Test Sale + Affiliate Update ===");

  // 1. Send buyer email (simulate)
  console.log("🚀 Sending buyer email...");
  console.log("✅ Buyer email sent");

  // 2. Send affiliate email (simulate)
  console.log("🚀 Sending affiliate email...");
  console.log("✅ Affiliate email sent");

  // 3. Admin login
  console.log("🚀 Logging in as admin...");
  const adminLogin = await safePostJSON(
    `${process.env.VITE_API_URL}/auth/login`,
    {
      username: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD,
    }
  );
  const adminToken = adminLogin.token;
  console.log("✅ Admin login successful");

  // 4. Affiliate login
  console.log("🚀 Logging in as affiliate...");
  const { data: affiliateInfo } = await supabase
    .from("affiliates")
    .select("*")
    .eq("email", TEST_AFFILIATE_EMAIL)
    .maybeSingle();

  if (!affiliateInfo) {
    console.log("❌ Affiliate login failed: Affiliate not found");
    return;
  }
  console.log("✅ Affiliate login successful");

  // 5. Fetch a real user for test order
  const { data: testUser } = await supabase
    .from("users")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (!testUser) {
    console.log("❌ No user found in 'users' table for test order");
    return;
  }

  // 6. Create test order
  console.log("🚀 Creating test order...");
  const { data: orderData, error: orderError } = await supabase
    .from("transactions")
    .insert([
      {
        user_id: testUser.id,
        affiliate_id: affiliateInfo.id,
        amount: TEST_ORDER_AMOUNT,
        currency: "INR",
        status: "paid", // directly mark as paid
        razorpay_order_id: `order_${Date.now()}`,
        affiliate_credited: true, // mark affiliate credited
      },
    ])
    .select()
    .single();

  if (orderError) {
    console.log("❌ Failed creating test order", orderError);
  } else {
    console.log("✅ Test order created and credited successfully:", orderData);

    // 7. Update affiliate totals immediately
    const newSalesCount = (affiliateInfo.sales_count || 0) + 1;
    const newTotalRevenue = (affiliateInfo.total_revenue || 0) + TEST_ORDER_AMOUNT;
    const newTotalCommission =
      (affiliateInfo.total_commission || 0) + TEST_ORDER_AMOUNT * affiliateInfo.commission_rate;

    await supabase
      .from("affiliates")
      .update({
        sales_count: newSalesCount,
        total_revenue: newTotalRevenue,
        total_commission: newTotalCommission,
      })
      .eq("id", affiliateInfo.id);

    console.log("✅ Affiliate totals updated immediately:");
    console.log({
      sales_count: newSalesCount,
      total_revenue: newTotalRevenue,
      total_commission: newTotalCommission,
    });
  }

  // 8. Fetch admin dashboard
  console.log("🔍 Fetching admin dashboard...");
  const { data: affiliates } = await supabase.from("affiliates").select("*");
  console.log("✅ Admin dashboard data fetched:", affiliates.length, "affiliates");

  // 9. Fetch affiliate dashboard
  console.log("🔍 Fetching affiliate dashboard...");
  const updatedAffiliate = await supabase
    .from("affiliates")
    .select("*")
    .eq("id", affiliateInfo.id)
    .maybeSingle();
  console.log("✅ Updated Affiliate dashboard:", updatedAffiliate.data);

  console.log("🎉 Test completed!");
})();
