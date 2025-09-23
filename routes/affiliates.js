const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase"); // must export initialized supabase client
const { nanoid } = require("nanoid");
const jwt = require("jsonwebtoken");
const { body, param, validationResult } = require("express-validator");

// ------------------
// Middleware helpers
// ------------------
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map((validation) => validation.run(req)));
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }
    return res.status(400).json({ success: false, errors: errors.array() });
  };
};

// ------------------
// Generate JWT
// ------------------
const generateToken = (user) =>
  jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "7d" });

// ------------------
// JWT Auth middleware
// ------------------
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token)
    return res.status(401).json({ success: false, error: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ success: false, error: "Invalid token" });
  }
};

// ------------------
// Admin only middleware
// ------------------
const adminMiddleware = (req, res, next) => {
  if (!req.user?.role || req.user.role !== "admin")
    return res
      .status(403)
      .json({ success: false, error: "Admin access only" });
  next();
};

// ------------------
// Admin login
// ------------------
router.post(
  "/admin-login",
  validate([body("username").notEmpty(), body("password").notEmpty()]),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    if (
      username === process.env.ADMIN_USERNAME &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const user = { id: "admin-id", name: username, role: "admin" };
      const token = generateToken(user);
      return res.json({ success: true, user, token });
    }

    return res
      .status(401)
      .json({ success: false, error: "Invalid admin credentials" });
  })
);

// ------------------
// Affiliate login
// ------------------
router.post(
  "/affiliate-login",
  validate([body("email").isEmail()]),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const { data: affiliate, error } = await supabase
      .from("affiliates")
      .select("*")
      .eq("email", email)
      .eq("deleted", false)
      .maybeSingle();

    if (error || !affiliate)
      return res
        .status(401)
        .json({ success: false, error: "Affiliate not found" });

    const user = {
      id: affiliate.id,
      name: affiliate.name,
      email: affiliate.email,
      role: "affiliate",
    };
    const token = generateToken(user);
    res.json({ success: true, user, token });
  })
);

// ------------------
// GET affiliates
// ------------------
router.get(
  "/",
  authMiddleware,
  asyncHandler(async (req, res) => {
    if (req.user.role === "admin") {
      const { data: affiliates, error } = await supabase
        .from("affiliates")
        .select("*")
        .eq("deleted", false)
        .order("created_at", { ascending: false });

      if (error)
        return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data: affiliates });
    }

    if (req.user.role === "affiliate") {
      const { data: affiliate, error } = await supabase
        .from("affiliates")
        .select("*")
        .eq("id", req.user.id)
        .eq("deleted", false)
        .maybeSingle();

      if (error)
        return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, data: affiliate });
    }

    return res.status(403).json({ success: false, error: "Access denied" });
  })
);

// ------------------
// Create affiliate (admin only)
// ------------------
router.post(
  "/create",
  authMiddleware,
  adminMiddleware,
  validate([body("name").notEmpty(), body("email").isEmail()]),
  asyncHandler(async (req, res) => {
    const { name, email, commissionRate = 0.2 } = req.body;
    const referralCode = nanoid(8);
    const referralLink = `${process.env.BASE_URL}/ref/${referralCode}`;

    const { data, error } = await supabase
      .from("affiliates")
      .insert([
        {
          name,
          email,
          referral_code: referralCode,
          referral_link: referralLink,
          commission_rate: commissionRate,
          deleted: false,
          active: true,
          sales_count: 0,
          total_revenue: 0,
          total_commission: 0,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Affiliate create error:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
    res.json({ success: true, data });
  })
);

// ------------------
// Update affiliate (admin only)
// ------------------
router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  validate([param("id").notEmpty()]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.email) updates.email = req.body.email;
    if (req.body.commissionRate)
      updates.commission_rate = req.body.commissionRate;

    const { data, error } = await supabase
      .from("affiliates")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error)
      return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
  })
);

// ------------------
// Soft delete affiliate
// ------------------
router.delete(
  "/:id",
  authMiddleware,
  adminMiddleware,
  validate([param("id").notEmpty()]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("affiliates")
      .update({ deleted: true, active: false })
      .eq("id", id)
      .select()
      .single();

    if (error)
      return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
  })
);

// ------------------
// Record transaction
// ------------------
router.post(
  "/transaction",
  authMiddleware,
  validate([body("user_id").notEmpty(), body("amount").isNumeric({ min: 1 })]),
  asyncHandler(async (req, res) => {
    const {
      affiliate_id,
      user_id,
      amount,
      currency = "INR",
      razorpay_order_id,
      razorpay_payment_id,
      status = "created",
    } = req.body;

    const { data: txn, error } = await supabase
      .from("transactions")
      .insert([
        {
          affiliate_id,
          user_id,
          amount,
          currency,
          razorpay_order_id,
          razorpay_payment_id,
          status,
        },
      ])
      .select()
      .single();

    if (error)
      return res.status(500).json({ success: false, error: error.message });

    if (affiliate_id && (status === "paid" || status === "completed")) {
      const { data: aff } = await supabase
        .from("affiliates")
        .select("*")
        .eq("id", affiliate_id)
        .maybeSingle();

      if (aff) {
        const commission = amount * (aff.commission_rate || 0.2);
        await supabase
          .from("affiliates")
          .update({
            sales_count: (aff.sales_count || 0) + 1,
            total_revenue: (aff.total_revenue || 0) + amount,
            total_commission: (aff.total_commission || 0) + commission,
          })
          .eq("id", affiliate_id);
      }
    }

    res.json({ success: true, data: txn });
  })
);

// ------------------
// Update transaction status
// ------------------
router.put(
  "/transaction/:id",
  authMiddleware,
  validate([
    param("id").notEmpty(),
    body("status").isIn(["created", "paid", "failed", "refunded"]),
  ]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const { data: txn, error } = await supabase
      .from("transactions")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error)
      return res.status(500).json({ success: false, error: error.message });

    if (txn.affiliate_id) {
      const { data: aff } = await supabase
        .from("affiliates")
        .select("*")
        .eq("id", txn.affiliate_id)
        .maybeSingle();

      if (aff && (status === "paid" || status === "completed")) {
        const commission = txn.amount * (aff.commission_rate || 0.2);
        await supabase
          .from("affiliates")
          .update({
            sales_count: (aff.sales_count || 0) + 1,
            total_revenue: (aff.total_revenue || 0) + txn.amount,
            total_commission: (aff.total_commission || 0) + commission,
          })
          .eq("id", txn.affiliate_id);
      }
    }

    res.json({ success: true, data: txn });
  })
);

// ------------------
// Referral link tracking
// ------------------
router.get(
  "/r/:code",
  asyncHandler(async (req, res) => {
    const { code } = req.params;
    const { data: affiliate } = await supabase
      .from("affiliates")
      .select("*")
      .eq("referral_code", code)
      .maybeSingle();

    if (affiliate) {
      await supabase.from("visits").insert({
        affiliate_id: affiliate.id,
        ip: req.ip,
        user_agent: req.get("user-agent"),
        landing_path: req.originalUrl,
      });
    }

    res.redirect(
      `${process.env.REFERRAL_BASE || "https://snowstrom.shop"}?aff=${code}`
    );
  })
);

module.exports = router;
