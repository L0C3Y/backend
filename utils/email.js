const nodemailer = require("nodemailer");
const path = require("path");

// ------------------------
// Configure transporter
// ------------------------
const transporter = nodemailer.createTransport({
  service: "gmail", // or use host/port/secure for custom SMTP
  auth: {
    user: process.env.EMAIL_USER, // your main email
    pass: process.env.EMAIL_PASS, // app password
  },
});

// ------------------------
// Send generic email
// ------------------------
async function sendEmail({ to, subject, html, attachments = [] }) {
  try {
    const info = await transporter.sendMail({
      from: `"Snowstorm" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      attachments, // optional attachments array
    });
    console.log("✅ Email sent:", info.messageId);
    return info;
  } catch (err) {
    console.error("❌ Email failed:", err);
    throw err;
  }
}

// ------------------------
// Send ebook to purchaser
// ------------------------
const ebookMap = {
  "ebook001": path.join(__dirname, "../secure/prod1.pdf"),
  "ebook002": path.join(__dirname, "../secure/prod2.pdf"),
};

async function sendEbookEmail({ to, ebookId }) {
  const filePath = ebookMap[ebookId];
  if (!filePath) throw new Error("Invalid ebook ID");

  const html = `
    <p>Thank you for your purchase!</p>
    <p>Please find your ebook attached.</p>
  `;

  return sendEmail({
    to,
    subject: "Your Ebook Purchase",
    html,
    attachments: [
      {
        filename: `${ebookId}.pdf`,
        path: filePath,
      },
    ],
  });
}

// ------------------------
// Send affiliate notification
// ------------------------
async function sendAffiliateEmail({ to, affiliateName, buyerName, commission, date }) {
  const html = `
    <p>Hey ${affiliateName},</p>
    <p>Congrats! You earned a commission of ₹${commission.toFixed(2)} from ${buyerName}'s purchase on ${new Date(date).toLocaleString()}.</p>
    <p>Keep sharing your link to earn more!</p>
  `;

  return sendEmail({
    to,
    subject: "You Earned a Commission! 💰",
    html,
  });
}

module.exports = {
  sendEmail,
  sendEbookEmail,
  sendAffiliateEmail,
};