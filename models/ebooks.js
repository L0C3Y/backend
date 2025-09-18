const { supabase } = require("../supabase");

// Get all published ebooks
async function getPublishedEbooks() {
  const { data, error } = await supabase
    .from("ebooks")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// Get upcoming ebooks
async function getUpcomingEbooks() {
  const { data, error } = await supabase
    .from("ebooks")
    .select("*")
    .eq("status", "upcoming")
    .order("release_date", { ascending: true });
if (error) throw error;
return data;
  if (error) throw error;
  return data;
}

module.exports = { getPublishedEbooks, getUpcomingEbooks };
