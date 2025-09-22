// backend/db.js
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// Supabase environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE; // secure service role

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase environment variables are missing!");
}

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper functions for ebooks and upcoming registrations

// Get all ebooks
async function getEbooks(status) {
  const query = supabase.from("ebooks").select("*");
  if (status) query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// Create new ebook
async function createEbook({ title, description, cover, status, releaseDate }) {
  const { data, error } = await supabase
    .from("ebooks")
    .insert([{ title, description, cover, status, releaseDate }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Register for upcoming ebook
async function registerUpcoming({ ebook_id, email }) {
  const { data, error } = await supabase
    .from("upcoming_registrations")
    .insert([{ ebook_id, email }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Get upcoming registrations for an ebook
async function getUpcomingRegistrations(ebook_id) {
  const { data, error } = await supabase
    .from("upcoming_registrations")
    .select("*")
    .eq("ebook_id", ebook_id);
  if (error) throw error;
  return data;
}

module.exports = {
  supabase,
  getEbooks,
  createEbook,
  registerUpcoming,
  getUpcomingRegistrations,
};
