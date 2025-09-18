const nodemailer = require("nodemailer");

// Configure transporter
const transporter = nodemailer.createTransport({
  service: "gmail", // or use: host, port, secure for custom SMTP
  auth: {
    user: process.env.EMAIL_USER,   // your email
    pass: process.env.EMAIL_PASS,   // your app password (not raw Gmail password)
  },
});

// Send Email function
async function sendEmail(to, subject, html) {
  try {
    const info = await transporter.sendMail({
      from: `"Snowstorm" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log("✅ Email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("❌ Email failed:", error);
    throw error;
  }
}

module.exports = { sendEmail };