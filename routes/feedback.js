// backend/routes/feedback.js

const express = require("express");
const router = express.Router();
const Feedbacks = require("../models/feedbacks"); // Your Feedback model
const { asyncHandler, authMiddleware, validate, body, param } = require("../middleware");

// ------------------------
// POST: Submit Feedback
// ------------------------
router.post(
  "/",
  authMiddleware, // Only logged-in users
  validate([
    body("userId").notEmpty().withMessage("userId is required"),
    body("ebookId").notEmpty().withMessage("ebookId is required"),
    body("message").notEmpty().withMessage("Message cannot be empty"),
  ]),
  asyncHandler(async (req, res) => {
    const { userId, ebookId, message, userName } = req.body;

    const feedback = await Feedbacks.addFeedback(userId, ebookId, message, userName);
    res.status(201).json({ success: true, data: feedback });
  })
);

// ------------------------
// GET: Fetch Feedbacks for an Ebook
// ------------------------
router.get(
  "/:ebookId",
  validate([param("ebookId").notEmpty().withMessage("ebookId is required")]),
  asyncHandler(async (req, res) => {
    const { ebookId } = req.params;
    const feedbacks = await Feedbacks.getFeedbackByEbook(ebookId);
    res.status(200).json({ success: true, data: feedbacks });
  })
);

module.exports = router;
