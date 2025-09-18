//backend/routes/feedbacks.js

const express = require("express");
const router = express.Router();
const Feedbacks = require("../models/feedbacks");
const { asyncHandler, authMiddleware, validate, body, param } = require("../middleware");

// POST feedback
router.post("/",
  authMiddleware,
  validate([body("userId").notEmpty(), body("ebookId").notEmpty(), body("message").notEmpty()]),
  asyncHandler(async (req, res) => {
    const { userId, ebookId, message } = req.body;
    const feedback = await Feedbacks.addFeedback(userId, ebookId, message);
    res.json({ success: true, data: feedback });
  })
);

// GET feedback by ebook
router.get("/:ebookId",
  validate([param("ebookId").notEmpty()]),
  asyncHandler(async (req, res) => {
    const feedbacks = await Feedbacks.getFeedbackByEbook(req.params.ebookId);
    res.json({ success: true, data: feedbacks });
  })
);

module.exports = router;

