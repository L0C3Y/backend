const { supabase } = require("../supabase");

// Register an affiliate (turns a user into affiliate with commission rate)
async function createAffiliate(userId, commissionRate = 0.20) {
  const { data, error } = await supabase
    .from("affiliates")
    .insert([{ user_id: userId, commission_rate: commissionRate }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get affiliate stats
async function getAffiliateStats(affiliateCode) {
  const { data, error } = await supabase.rpc("calculate_affiliate_commission", { code: affiliateCode });
  if (error) throw error;
  return data;
}

module.exports = { createAffiliate, getAffiliateStats };
