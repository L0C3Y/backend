// backend/routes/ebooks.js
const express = require("express");
const router = express.Router();
const Ebooks = require("../models/ebooks"); // Model for DB operations
const { asyncHandler, authMiddleware, validate, body, param } = require("./middleware");

// ------------------------
// GET all ebooks (paginated)
// ------------------------
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const ebooks = await Ebooks.getAllEbooks({ page, limit });
    res.json({ success: true, data: ebooks });
  })
);

// ------------------------
// GET upcoming ebooks
// ------------------------
router.get(
  "/upcoming",
  asyncHandler(async (req, res) => {
    const ebooks = await Ebooks.getUpcomingEbooks();
    res.json({ success: true, data: ebooks });
  })
);

// ------------------------
// POST register for upcoming discount
// ------------------------
router.post(
  "/upcoming/register",
  validate([body("ebookId").notEmpty(), body("email").isEmail()]),
  asyncHandler(async (req, res) => {
    const { ebookId, email } = req.body;
    const registration = await Ebooks.registerForUpcoming(ebookId, email);
    res.json({ success: true, data: registration });
  })
);

module.exports = router;