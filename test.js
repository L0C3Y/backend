// test.js
require("dotenv").config();
const path = require("path");
const nodemailer = require("nodemailer");

(async () => {
  try {
    console.log("🚀 Testing purchase emails...");

    // Setup transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // must be App Password
      },
    });

    // Buyer info
    const buyerEmail = "devanshraj5120@gmail.com"; // must be valid
    const buyerName = "Snow Buyer";
    const ebookFile = path.join(__dirname, "..", "secure", "prod1.pdf");

    // Affiliate info
    const affiliateEmail = "devanshraj5120@gmail.com";
    const affiliateName = "Snow Affiliate";
    const commissionRate = 0.3;
    const saleAmount = 1000;
    const commissionAmount = saleAmount * commissionRate;

    // 1️⃣ Send buyer email with PDF
    await transporter.sendMail({
      from: `"Snowstorm" <${process.env.EMAIL_USER}>`,
      to: buyerEmail,
      subject: "Your Ebook Purchase ✅",
      html: `<p>Hi ${buyerName},</p>
             <p>Thanks for your purchase! Your ebook is attached below.</p>`,
      attachments: [
        {
          filename: "ebook1.pdf",
          path: ebookFile,
        },
      ],
    });
    console.log("✅ Buyer email sent");

    // 2️⃣ Send affiliate email
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

    console.log("🎉 All test emails completed successfully!");
  } catch (err) {
    console.error("❌ Test failed:", err);
  }
})();