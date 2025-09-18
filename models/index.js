// Import all model schemas
const Affiliate = require('./affiliates');
const Order = require('./orders');
const Payment = require('./transaction');
const User = require('./users');
const Ebook = require('./ebooks');
const Feedback = require('./feedbacks');
const Visit = require('./visit');

// If you haven't already created this, do it next:node server.js
const Commission = require('./commission'); // <-- create this file if it doesn't exist

// Export all models in one place
module.exports = {
  Affiliate,
  Order,
  Payment,
  User,
  Ebook,
  Feedback,
  Visit,
  Commission
};
