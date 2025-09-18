const { supabase } = require("../supabase");

// Add feedback
async function addFeedback(userId, ebookId, message, rating = 5) {
  const { data, error } = await supabase
    .from("feedback")
    .insert([{ user_id: userId, ebook_id: ebookId, message, rating }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get feedback by ebook
async function getFeedbackByEbook(ebookId) {
  const { data, error } = await supabase
    .from("feedback")
    .select("*, users(name, email)")
    .eq("ebook_id", ebookId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

module.exports = { addFeedback, getFeedbackByEbook };
