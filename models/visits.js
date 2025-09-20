const { supabase } = require("../supabase");

// Record a visit
async function recordVisit(affiliateCode, ip, userAgent, referrer, landingPath) {
  const { data, error } = await supabase
    .from("visits")
    .insert([{
      affiliate_code: affiliateCode,
      ip,
      user_agent: userAgent,
      referrer,
      landing_path: landingPath,
      created_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = { recordVisit };
