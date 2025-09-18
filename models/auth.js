// backend/models/auth.js
const { createClient } = require("@supabase/supabase-js");
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = require("../config");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

// Register new user
async function register(email, password) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user;
}

// Login user
async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data.session;
}

// Logout
async function logout(refreshToken) {
  const { error } = await supabase.auth.admin.signOut(refreshToken);
  if (error) throw error;
  return { message: "Logged out" };
}

module.exports = { register, login, logout };