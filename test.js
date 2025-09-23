require("dotenv").config();
const path = require("path");
const nodemailer = require("nodemailer");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

const API_BASE = process.env.VITE_API_URL.replace(/\/+$/, "");

async function safePostJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  try {
    return await res.json();
  } catch {
    const text = await res.text();
    console.error(`❌ Response not JSON for POST ${url}:\n`, text);
    return null;
  }
}

(async () => {
  try {
    console.log("=== Starting Dashboard & Email Test ===");

    // ---------- Email setup ----------
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    // Buyer email
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

    // Affiliate email
    const affiliateEmail = "yash2230awm@gmail.com";
    const affiliateName = "Snow Affiliate";
    const commissionAmount = 1000 * 0.3;

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

    // ---------- Admin login ----------
    console.log("🚀 Logging in as admin...");
    const adminData = await safePostJSON(`${API_BASE}/auth/login`, {
      role: "admin",
      identifier: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD,
    });
    if (!adminData || !adminData.success) console.log("❌ Login failed (admin)");
    else console.log("✅ Admin login successful");

    // ---------- Affiliate login ----------
    console.log("🚀 Logging in as affiliate...");
    const affiliateData = await safePostJSON(`${API_BASE}/auth/login`, {
      role: "affiliate",
      identifier: affiliateEmail,
      name: affiliateName,
    });
    if (!affiliateData || !affiliateData.success) console.log("❌ Login failed (affiliate)");
    else console.log("✅ Affiliate login successful");

    // ---------- Fetch dashboards ----------
    if (adminData?.token) {
      console.log("🔍 Fetching admin dashboard...");
      const dashRes = await fetch(`${API_BASE}/affiliates`, {
        headers: { Authorization: `Bearer ${adminData.token}` },
      });
      try {
        const dashData = await dashRes.json();
        console.log("✅ Admin dashboard data:", dashData.data?.length || 0, "affiliates");
      } catch { console.log("❌ Failed fetching admin dashboard"); }
    }

    if (affiliateData?.token) {
      console.log("🔍 Fetching affiliate dashboard...");
      const dashRes = await fetch(`${API_BASE}/affiliates`, {
        headers: { Authorization: `Bearer ${affiliateData.token}` },
      });
      try {
        const dashData = await dashRes.json();
        console.log("✅ Affiliate dashboard data:", dashData.data || []);
      } catch { console.log("❌ Failed fetching affiliate dashboard"); }
    }

    console.log("🎉 Test completed!");
  } catch (err) {
    console.error("❌ Test failed:", err);
  }
})();
