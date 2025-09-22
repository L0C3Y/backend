// testPurchase.js  
require("dotenv").config();  
const path = require("path");  
const { sendEmail, sendAffiliateEmail } = require("./utils/email"); // adjust path if needed  
  
(async () => {  
  try {  
    console.log("🚀 Testing purchase emails...");  
  
    // Buyer info  
    const buyerEmail = "devanshraj5120@gmail.com";  
    const buyerName = "Snow Buyer";  
    const ebookFile1 = path.join(__dirname, "..", "secure", "prod1.pdf");
const ebookFile2 = path.join(__dirname, "..", "secure", "prod2.pdf");
    // Affiliate info  
    const affiliateEmail = "devanshraj5120@gmail.com";  
    const affiliateName = "Snow Affiliate";  
    const commissionRate = 0.3;  
    const saleAmount = 1000; // ₹1000 for test  
    const commissionAmount = saleAmount * commissionRate;  
  
    // 1️⃣ Send buyer email with PDF  
    await sendEmail(  
      buyerEmail,  
      "Your Ebook Purchase ✅",  
      `<p>Hi ${buyerName},</p>  
       <p>Thanks for your purchase! Your ebook is attached below.</p>  
       <p>Enjoy!</p>`,  
      [  
        {  
          filename: `${ebookId}.pdf`,  
          path: ebookFile,  
        },  
      ]  
    );  
  
    console.log("✅ Buyer email sent");  
  
    // 2️⃣ Send affiliate email about commission  
    await sendAffiliateEmail(  
      affiliateEmail,  
      affiliateName,  
      buyerName,  
      commissionAmount,  
      new Date().toISOString()  
    );  
  
    console.log("✅ Affiliate email sent");  
    console.log("All test emails completed successfully!");  
  } catch (err) {  
    console.error("❌ Test failed:", err);  
  }  
})();