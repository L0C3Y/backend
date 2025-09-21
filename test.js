require('dotenv').config();
const { sendEmail } = require('./backend/utils/email');
const Razorpay = require('razorpay');

(async () => {
  try {
    // Test email
    await sendEmail('fmtsnow51@gmail.com', 'Test Email', '<h2>Test Email ✅</h2>');
    console.log('✅ Email sent successfully');

    // Test Razorpay
    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await rzp.orders.create({
      amount: 100, // ₹1
      currency: 'INR',
      receipt: `test_${Date.now()}`,
    });

    console.log('✅ Razorpay order created:', order);
  } catch (err) {
    console.error('❌ Test failed:', err);
  }
})();