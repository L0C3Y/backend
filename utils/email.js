const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");

// ------------------------
// Configure transporter
// ------------------------
const transporter = nodemailer.createTransport({
  service: "gmail", // or use host, port, secure for custom SMTP
  auth: {
    user: process.env.EMAIL_USER, // your Gmail or app email
    pass: process.env.EMAIL_PASS, // your Gmail app password
  },
});

// ------------------------
// Generic sendEmail function
// ------------------------
/**
 * Send an email with optional attachments
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - Email HTML content
 * @param {Array} attachments - Optional array [{ filename, path }]
 */
async function sendEmail(to, subject, html, attachments = []) {
  try {
    const info = await transporter.sendMail({
      from: `"Snowstorm" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      attachments,
    });
    console.log("✅ Email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("❌ Email failed:", error);
    throw error;
  }
}

// ------------------------
// Send Purchased eBook
// ------------------------
/**
 * Send purchased ebook to a user
 * @param {string} to - Recipient email
 * @param {string} ebookName - e.g. "ebook1", "ebook2"
 */
async function sendEbook(to, ebookName) {
  // Map ebook names to PDF paths
  const ebookFolder = path.join(__dirname, "..", "secure");
  const ebookMap = {
    ebook1: path.join(ebookFolder, "prod1.pdf"),
    ebook2: path.join(ebookFolder, "prod2.pdf"),
  };

  const filePath = ebookMap[ebookName];
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("Invalid ebook selection or file does not exist");
  }

  const subject = "Your Purchased eBook";
  const html = `
    <h2>Thank you for your purchase!</h2>
    <p>Attached is your eBook: <strong>${ebookName}</strong></p>
    <p>Enjoy reading!</p>
  `;

  return sendEmail(to, subject, html, [
    { filename: path.basename(filePath), path: filePath },
  ]);
}

// ------------------------
// Export functions
// ------------------------
module.exports = { sendEmail, sendEbook };