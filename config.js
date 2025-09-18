// filepath: c:\Users\ashis\we\backend\config.js
require('dotenv').config();

module.exports = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
  SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE,
  // ...any other config
};