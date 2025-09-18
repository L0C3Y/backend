const mongoose = require("mongoose");

const txnSchema = new mongoose.Schema({
  affiliateId: { type: mongoose.Schema.Types.ObjectId, ref: "Affiliate", default: null },
  code: { type: String, default: null }, // affiliate code if present
  userName: String,
  userEmail: String,
  amount: { type: Number, required: true },
  currency: { type: String, default: "INR" },
  razorpay_order_id: String,
  razorpay_payment_id: String,
  razorpay_signature: String,
  status: { type: String, enum: ["pending","completed","failed"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Transaction", txnSchema);
