const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const authMiddleware = require("../middleware/auth");
const { supabase } = require("../db");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Rate limiting middleware
const createOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: { success: false, error: "Too many order creation attempts" }
});

const verifyPaymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs
  message: { success: false, error: "Too many verification attempts" }
});

// Validation middleware
const createOrderValidation = [
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Amount must be a positive number'),
  body('ebookId')
    .isUUID()
    .withMessage('Invalid ebook ID format'),
  body('affiliateCode')
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage('Affiliate code must be 3-50 characters')
];

const verifyPaymentValidation = [
  body('razorpay_order_id')
    .notEmpty()
    .withMessage('Razorpay order ID is required'),
  body('razorpay_payment_id')
    .notEmpty()
    .withMessage('Razorpay payment ID is required'),
  body('razorpay_signature')
    .notEmpty()
    .withMessage('Razorpay signature is required'),
  body('orderId')
    .isUUID()
    .withMessage('Invalid order ID format')
];

// Utility functions
const logger = {
  info: (message, data = {}) => {
    console.log([INFO] ${message}, { timestamp: new Date().toISOString(), ...data });
  },
  error: (message, error = {}) => {
    console.error([ERROR] ${message}, { 
      timestamp: new Date().toISOString(), 
      error: error.message || error,
      stack: error.stack 
    });
  },
  warn: (message, data = {}) => {
    console.warn([WARN] ${message}, { timestamp: new Date().toISOString(), ...data });
  }
};

async function findAffiliate(affiliateCode) {
  if (!affiliateCode) return null;
  
  try {
    const { data, error } = await supabase
      .from("affiliates")
      .select("*")
      .eq("referral_code", affiliateCode)
      .single();
      
    if (error && error.code !== "PGRST116") {
      logger.error("Error fetching affiliate", error);
      throw error;
    }
    
    return data || null;
  } catch (error) {
    logger.error("Affiliate lookup failed", error);
    throw error;
  }
}

async function validateEbook(ebookId) {
  try {
    const { data, error } = await supabase
      .from("ebooks")
      .select("id, price, title, is_active")
      .eq("id", ebookId)
      .single();
      
    if (error) {
      if (error.code === "PGRST116") {
        return { valid: false, error: "Ebook not found" };
      }
      throw error;
    }
    
    if (!data.is_active) {
      return { valid: false, error: "Ebook is not available for purchase" };
    }
    
    return { valid: true, ebook: data };
  } catch (error) {
    logger.error("Ebook validation failed", error);
    throw error;
  }
}

async function checkDuplicateOrder(userId, ebookId, timeWindow = 5 * 60 * 1000) {
  try {
    const cutoffTime = new Date(Date.now() - timeWindow).toISOString();
    
    const { data, error } = await supabase
      .from("transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("ebook_id", ebookId)
      .gte("created_at", cutoffTime)
      .in("status", ["created", "paid"]);
      
    if (error) throw error;
    
    return data && data.length > 0;
  } catch (error) {
    logger.error("Duplicate order check failed", error);
    return false; // Allow order creation on check failure
  }
}

async function executeWithTransaction(operations) {
  // Note: Supabase doesn't support native transactions in the JS client
  // This is a simplified transaction-like pattern
  const results = [];
  const rollbackOperations = [];
  
  try {
    for (const operation of operations) {
      const result = await operation.execute();
      results.push(result);
      
      if (operation.rollback) {
        rollbackOperations.push(operation.rollback);
      }
    }
    
    return { success: true, results };
  } catch (error) {
    // Attempt rollback
    for (const rollback of rollbackOperations.reverse()) {
      try {
        await rollback();
      } catch (rollbackError) {
        logger.error("Rollback operation failed", rollbackError);
      }
    }
    
    throw error;
  }
}

// ------------------------
// Public: Fetch Razorpay Key
// ------------------------
router.get("/key", (req, res) => {
  if (!process.env.RAZORPAY_KEY_ID) {
    logger.error("Razorpay key not configured");
    return res.status(500).json({ success: false, error: "Payment system not configured" });
  }
  
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

// ------------------------
// Protected: Create Order
// ------------------------
router.post("/create-order", 
  createOrderLimiter,
  authMiddleware, 
  createOrderValidation,
  async (req, res) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          error: "Validation failed",
          details: errors.array()
        });
      }

      const { amount, ebookId, affiliateCode } = req.body;
      const userId = req.user.id;

      logger.info("Creating order", { userId, ebookId, amount, affiliateCode });

      // Check for duplicate orders
      const isDuplicate = await checkDuplicateOrder(userId, ebookId);
      if (isDuplicate) {
        return res.status(400).json({ 
          success: false, 
          error: "Duplicate order detected. Please wait before creating another order." 
        });
      }

      // Validate ebook
      const ebookValidation = await validateEbook(ebookId);
      if (!ebookValidation.valid) {
        return res.status(400).json({ 
          success: false, 
          error: ebookValidation.error 
        });
      }

      // Verify amount matches ebook price
      if (amount !== ebookValidation.ebook.price) {
        logger.warn("Amount mismatch", { 
          provided: amount, 
          expected: ebookValidation.ebook.price,
          userId,
          ebookId 
        });
        return res.status(400).json({ 
          success: false, 
          error: "Invalid amount" 
        });
      }

      // Fetch affiliate if code provided
      let affiliate = null;
      if (affiliateCode) {
        affiliate = await findAffiliate(affiliateCode);
        if (!affiliate) {
          return res.status(400).json({ 
            success: false, 
            error: "Invalid affiliate code" 
          });
        }
      }

      // Create Razorpay order
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(amount * 100), // Convert to paise and ensure integer
        currency: "INR",
        receipt: rcpt_${userId}_${Date.now()},
        notes: {
          user_id: userId,
          ebook_id: ebookId,
          affiliate_code: affiliateCode || ""
        }
      });

      // Save transaction in Supabase
      const { data: txn, error: txnError } = await supabase
        .from("transactions")
        .insert([{
          affiliate_id: affiliate ? affiliate.id : null,
          user_id: userId,
          ebook_id: ebookId,
          amount,
          currency: "INR",
          razorpay_order_id: razorpayOrder.id,
          status: "created",
          commission_rate: affiliate ? affiliate.commission_rate : 0.3, // default 30%
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
        }])
        .select()
        .single();

      if (txnError) {
        logger.error("Transaction creation failed", txnError);
        throw txnError;
      }

      logger.info("Order created successfully", { 
        orderId: txn.id, 
        razorpayOrderId: razorpayOrder.id,
        userId 
      });

      res.json({ 
        success: true, 
        razorpayOrder, 
        order: txn,
        ebook: {
          id: ebookValidation.ebook.id,
          title: ebookValidation.ebook.title,
          price: ebookValidation.ebook.price
        }
      });
    } catch (err) {
      logger.error("Create order error", err);
      res.status(500).json({ 
        success: false, 
        error: "Failed to create order. Please try again." 
      });
    }
  }
);

// ------------------------
// Protected: Verify Payment
// ------------------------
router.post("/verify", 
  verifyPaymentLimiter,
  authMiddleware, 
  verifyPaymentValidation,
  async (req, res) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          error: "Validation failed",
          details: errors.array()
        });
      }

      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
      const userId = req.user.id;

      logger.info("Verifying payment", { 
        orderId, 
        razorpay_order_id, 
        razorpay_payment_id,
        userId 
      });

      // Fetch transaction and verify ownership
      const { data: txn, error: fetchError } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", orderId)
        .eq("user_id", userId)
        .single();

      if (fetchError || !txn) {
        logger.warn("Transaction not found or access denied", { orderId, userId });
        return res.status(404).json({ 
          success: false, 
          error: "Transaction not found" 
        });
      }

      // Check if already processed
      if (txn.status === "paid") {
        logger.warn("Payment already verified", { orderId, userId });
        return res.json({ 
          success: true, 
          message: "Payment already verified",
          alreadyProcessed: true 
        });
      }

      // Check if order has expired
      if (txn.expires_at && new Date() > new Date(txn.expires_at)) {
        logger.warn("Expired transaction verification attempt", { orderId, userId });
        return res.status(400).json({ 
          success: false, 
          error: "Transaction has expired" 
        });
      }

      // Verify Razorpay signature
      const generatedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(${razorpay_order_id}|${razorpay_payment_id})
        .digest("hex");

      if (generatedSignature !== razorpay_signature) {
        logger.warn("Invalid signature verification", { 
          orderId, 
          userId,
          razorpay_order_id,
          razorpay_payment_id 
        });
        return res.status(400).json({ 
          success: false, 
          error: "Invalid payment signature" 
        });
      }

      // Verify payment with Razorpay (optional additional check)
      try {
        const payment = await razorpay.payments.fetch(razorpay_payment_id);
        if (payment.status !== "captured" && payment.status !== "authorized") {
          logger.warn("Payment not captured", { 
            orderId, 
            userId,
            paymentStatus: payment.status 
          });
          return res.status(400).json({ 
            success: false, 
            error: "Payment not completed" 
          });
        }
      } catch (razorpayError) {
        logger.error("Razorpay payment fetch failed", razorpayError);
        // Continue with verification as signature was valid
      }

      // Execute transaction-like operations
      const operations = [
        {
          execute: async () => {
            // Update transaction as paid
            const { data: updatedTxn, error: updateError } = await supabase
              .from("transactions")
              .update({
                status: "paid",
                razorpay_payment_id,
                paid_at: new Date().toISOString()
              })
              .eq("id", orderId)
              .eq("status", "created") // Prevent double processing
              .select()
              .single();

            if (updateError) throw updateError;
            if (!updatedTxn) throw new Error("Transaction already processed or not found");
            
            return updatedTxn;
          }
        }
      ];

      // Add affiliate earnings update if applicable
      if (txn.affiliate_id) {
        operations.push({
          execute: async () => {
            // Fetch current affiliate data
            const { data: aff, error: affError } = await supabase
              .from("affiliates")
              .select("*")
              .eq("id", txn.affiliate_id)
              .single();

            if (affError) throw affError;

            const commissionEarned = txn.amount * (txn.commission_rate || 0.3);

            const { data: updatedAff, error: updateAffError } = await supabase
              .from("affiliates")
              .update({
                sales_count: (aff.sales_count || 0) + 1,
                total_revenue: (aff.total_revenue || 0) + txn.amount,
                total_commission: (aff.total_commission || 0) + commissionEarned,
                last_sale_at: new Date().toISOString()
              })
              .eq("id", aff.id)
              .select()
              .single();

            if (updateAffError) throw updateAffError;
            
            return { affiliate: updatedAff, commissionEarned };
          }
        });
      }

      // Add user access grant
      operations.push({
        execute: async () => {
          const { data: access, error: accessError } = await supabase
            .from("user_ebook_access")
            .insert([{
              user_id: userId,
              ebook_id: txn.ebook_id,
              granted_at: new Date().toISOString(),
              transaction_id: orderId
            }])
            .select()
            .single();

          if (accessError) {
            // Check if access already exists
            if (accessError.code === '23505') { // Unique constraint violation
              logger.warn("User already has access to ebook", { userId, ebookId: txn.ebook_id });
              return { alreadyHasAccess: true };
            }
            throw accessError;
          }
          
          return access;
        }
      });

      const { results } = await executeWithTransaction(operations);
      const [updatedTxn, affiliateResult, accessResult] = results;

      logger.info("Payment verified successfully", { 
        orderId, 
        userId,
        affiliateCommission: affiliateResult?.commissionEarned || 0
      });

      res.json({ 
        success: true, 
        message: "Payment verified successfully",
        transaction: {
          id: updatedTxn.id,
          status: updatedTxn.status,
          amount: updatedTxn.amount
        },
        affiliate: affiliateResult ? {
          commissionEarned: affiliateResult.commissionEarned
        } : null,
        accessGranted: accessResult && !accessResult.alreadyHasAccess
      });

    } catch (err) {
      logger.error("Verify payment error", err);
      res.status(500).json({ 
        success: false, 
        error: "Payment verification failed. Please contact support if payment was deducted." 
      });
    }
  }
);

// ------------------------
// Protected: Get Transaction Status
// ------------------------
router.get("/transaction/:orderId", authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    if (!orderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
      return res.status(400).json({ success: false, error: "Invalid order ID" });
    }

    const { data: txn, error } = await supabase
      .from("transactions")
      .select(`
        *,
        affiliates:affiliate_id (
          referral_code,
          commission_rate
        )
      `)
      .eq("id", orderId)
      .eq("user_id", userId)
      .single();

    if (error || !txn) {
      return res.status(404).json({ success: false, error: "Transaction not found" });
    }

    // Check if expired
    const isExpired = txn.expires_at && new Date() > new Date(txn.expires_at);

    res.json({
      success: true,
      transaction: {
        id: txn.id,
        status: txn.status,
        amount: txn.amount,
        currency: txn.currency,
        created_at: txn.created_at,
        expires_at: txn.expires_at,
        is_expired: isExpired,
        affiliate: txn.affiliates ? {
          code: txn.affiliates.referral_code,
          commission_rate: txn.affiliates.commission_rate
        } : null
      }
    });

  } catch (err) {
    logger.error("Get transaction status error", err);
    res.status(500).json({ success: false, error: "Failed to fetch transaction status" });
  }
});

// ------------------------
// Webhook: Handle Razorpay Events (Optional)
// ------------------------
router.post("/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body = req.body;

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET)
      .update(body, 'utf8')
      .digest('hex');

    if (signature !== expectedSignature) {
      logger.warn("Invalid webhook signature");
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(body);
    logger.info("Webhook received", { event: event.event, entity: event.payload.payment?.entity?.id });

    // Handle different webhook events
    switch (event.event) {
      case 'payment.failed':
        await handlePaymentFailed(event.payload.payment.entity);
        break;
      case 'payment.authorized':
        // Handle authorized payments if needed
        break;
      default:
        logger.info("Unhandled webhook event", { event: event.event });
    }

    res.json({ status: 'ok' });
  } catch (err) {
    logger.error("Webhook processing error", err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function handlePaymentFailed(payment) {
  try {
    // Update transaction status to failed
    const { error } = await supabase
      .from("transactions")
      .update({
        status: "failed",
        razorpay_payment_id: payment.id,
        failure_reason: payment.error_description || "Payment failed"
      })
      .eq("razorpay_order_id", payment.order_id);

    if (error) {
      logger.error("Failed to update transaction status", error);
    }

    logger.info("Payment failure handled", { 
      orderId: payment.order_id, 
      paymentId: payment.id 
    });
  } catch (err) {
    logger.error("Error handling payment failure", err);
  }
}

// Error handling middleware
router.use((error, req, res, next) => {
  logger.error("Unhandled route error", error);
  res.status(500).json({ 
    success: false, 
    error: "An unexpected error occurred" 
  });
});

module.exports = router;