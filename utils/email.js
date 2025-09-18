const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendAffiliateEmail(to, affiliateName, buyerName, amount, timestamp) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: "🎉 New Sale Registered!",
    text: `Hello ${affiliateName},\n\nYou made a new sale!\n\nBuyer: ${buyerName}\nAmount: ₹${amount}\nTime: ${timestamp}\n\nKeep up the great work!\n- Snowstrom Team`,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = { sendAffiliateEmail };
