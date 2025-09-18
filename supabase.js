require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE; // 👈 service role

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase environment variables are missing.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };
