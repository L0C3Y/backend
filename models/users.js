const { supabase } = require("../supabase");

// Create new user (with role)
async function createUser(email, password, role = "customer", affiliateCode = null) {
  // Register in Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });
  if (authError) throw authError;

  const userId = authData.user.id;

  // Insert into public.users table
  const { data, error } = await supabase
    .from("users")
    .insert([{ id: userId, email, role, affiliate_code: affiliateCode }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get user by ID
async function getUser(id) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

module.exports = { createUser, getUser };
