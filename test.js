require("dotenv").config();
const path = require("path");
const nodemailer = require("nodemailer");
const fetch = require("node-fetch");

const API_BASE = process.env.VITE_API_URL.replace(/\/+$/, "");

// Safe POST that handles JSON parsing and errors
async function safePostJSON(url, bodyObj) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      console.log(`❌ Response not JSON for POST ${url}:\n`, text);
      return null;
    }
  } catch (err) {
    console.error("❌ Request failed:", err);
    return null;
  }
}

(async () => {
  try {
    console.log("=== Starting Dashboard & Email Test ===");

    // ---------- Setup email transporter ----------
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // App password
      },
    });

    // ---------- Buyer info ----------
    const buyerEmail = "yash2230awm@gmail.com";
    const buyerName = "Snow Buyer";
    const ebookFile = path.join(__dirname, "..", "secure", "prod1.pdf");

    console.log("🚀 Sending buyer email...");
    await transporter.sendMail({
      from: `"Snowstorm" <${process.env.EMAIL_USER}>`,
      to: buyerEmail,
      subject: "Your Ebook Purchase ✅",
      html: `<p>Hi ${buyerName},</p><p>Thanks for your purchase! Your ebook is attached below.</p>`,
      attachments: [{ filename: "ebook1.pdf", path: ebookFile }],
    });
    console.log("✅ Buyer email sent");

    // ---------- Affiliate info ----------
    const affiliateEmail = "yash2230awm@gmail.com";
    const affiliateName = "Yashi";
    const commissionRate = 0.3;
    const saleAmount = 1000;
    const commissionAmount = saleAmount * commissionRate;

    console.log("🚀 Sending affiliate email...");
    await transporter.sendMail({
      from: `"Snowstorm" <${process.env.EMAIL_USER}>`,
      to: affiliateEmail,
      subject: "🎉 You earned a commission!",
      html: `<p>Hi ${affiliateName},</p>
             <p>Congrats! You earned a commission from ${buyerName}'s purchase.</p>
             <p><strong>Commission:</strong> ₹${commissionAmount.toFixed(2)}</p>
             <p><strong>Date:</strong> ${new Date().toISOString()}</p>`,
    });
    console.log("✅ Affiliate email sent");

    // ---------- Login ----------
    let adminData = null;
    let affiliateData = null;

    console.log("🚀 Logging in as admin...");
    adminData = await safePostJSON(`${API_BASE}/auth/login`, {
      role: "admin",
      identifier: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD,
    });
    if (!adminData || !adminData.success) {
      console.log("❌ Login failed (admin):", adminData ? adminData.error : "No JSON response");
    } else {
      console.log("✅ Admin login successful");
    }

    console.log("🚀 Logging in as affiliate...");
affiliateData = await safePostJSON(`${API_BASE}/auth/login`, {
  role: "affiliate",
  identifier: affiliateEmail,
  name: affiliateName,   // <-- required by backend
});
if (!affiliateData || !affiliateData.success) {
  console.log("❌ Login failed (affiliate):", affiliateData ? affiliateData.error : "No JSON response");
} else {
  console.log("✅ Affiliate login successful");
}


    // ---------- Fetch dashboard (admin) ----------
    if (adminData && adminData.token) {
      console.log("🔍 Fetching admin dashboard...");
      const dashRes = await fetch(`${API_BASE}/affiliates`, {
        headers: { Authorization: `Bearer ${adminData.token}` },
      });
      const dashData = await dashRes.json().catch(() => null);
      if (dashData && dashData.success) {
        console.log("✅ Admin dashboard data fetched:", dashData.data.length, "affiliates");
      } else {
        console.log("❌ Failed fetching admin dashboard");
      }
    }

    // ---------- Fetch dashboard (affiliate) ----------
    if (affiliateData && affiliateData.token) {
      console.log("🔍 Fetching affiliate dashboard...");
      const dashRes = await fetch(`${API_BASE}/affiliates`, {
        headers: { Authorization: `Bearer ${affiliateData.token}` },
      });
      const dashData = await dashRes.json().catch(() => null);
      if (dashData && dashData.success) {
        console.log("✅ Affiliate dashboard data fetched:", dashData.data);
      } else {
        console.log("❌ Failed fetching affiliate dashboard");
      }
    }

    console.log("🎉 Test completed!");
  } catch (err) {
    console.error("❌ Test failed:", err);
  }
})();
