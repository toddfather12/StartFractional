module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { type, data } = req.body;

    const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
    const table = type === 'exec' ? 'profiles_exec' : 'company_postings';
    
    // Ensure industry data is sent as a clean array to Supabase
    // If only one checkbox is checked, some JS parsers send a string; we force an array.
    const payload = { ...data };
    const industryKey = type === 'exec' ? 'industry_expertise' : 'industry_target';
    if (payload[industryKey] && !Array.isArray(payload[industryKey])) {
        payload[industryKey] = [payload[industryKey]];
    }

    // 1. Insert the submission
    const insertResponse = await fetch(`${baseUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (!insertResponse.ok) {
      const errorMsg = await insertResponse.text();
      return res.status(400).json({ error: "Supabase Error", details: errorMsg });
    }

    // 2. THE ALGORITHM: Match Role + Budget + Overlapping Industry
    let matchCount = 0;
    let matchDetails = "No matches found.";

    if (type === 'company') {
      // We look for approved execs in the same role with a lower/equal rate
      const query = new URLSearchParams({
        primary_role: `eq.${payload.role_needed}`,
        vetting_status: `eq.approved`,
        min_monthly_rate: `lte.${payload.budget_max}`,
        select: 'full_name,email,industry_expertise'
      });

      const matchRes = await fetch(`${baseUrl}/rest/v1/profiles_exec?${query}`, {
        headers: { 'apikey': process.env.SUPABASE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_KEY}` }
      });

      if (matchRes.ok) {
        const potentialMatches = await matchRes.json();
        
        // Filter matches locally to see if industries overlap
        const filteredMatches = potentialMatches.filter(exec => {
            return exec.industry_expertise.some(ind => payload.industry_target.includes(ind));
        });

        matchCount = filteredMatches.length;
        if (matchCount > 0) {
            matchDetails = filteredMatches.map(m => `- ${m.full_name} (${m.email})`).join('<br>');
        }
      }
    }

    // 3. Send Emails
    if (process.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: 'System <onboarding@resend.dev>',
          to: 'todd@startfractional.com', 
          subject: type === 'company' ? `MATCH ALERT: ${payload.company_name}` : `NEW EXEC: ${payload.full_name}`,
          html: `<h3>Submission Details</h3>
                 <p>Type: ${type}</p>
                 <p>Location: ${payload.location}</p>
                 <p>Industries: ${Array.isArray(payload[industryKey]) ? payload[industryKey].join(', ') : payload[industryKey]}</p>
                 <hr>
                 <h4>Potential Matches: ${matchCount}</h4>
                 <p>${matchDetails}</p>`
        })
      });
    }

    return res.status(200).json({ success: true, matches_found: matchCount });
  } catch (err) {
    return res.status(500).json({ error: "Server Crash", details: err.message });
  }
};
