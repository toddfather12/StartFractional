module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { type, data } = req.body;

    // 1. Validate Environment Variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      return res.status(500).json({ error: "Server Configuration Error: Missing Keys" });
    }

    const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
    const table = type === 'exec' ? 'profiles_exec' : 'company_postings';
    const supabaseUrl = `${baseUrl}/rest/v1/${table}`;

    // 2. DATA SYNC: Ensure industries are ALWAYS an array (even if only 1 is selected)
    const industryKey = type === 'exec' ? 'industry_expertise' : 'industry_target';
    if (data[industryKey]) {
      if (!Array.isArray(data[industryKey])) {
        data[industryKey] = [data[industryKey]]; // Wrap single string in array
      }
    } else {
      data[industryKey] = []; // Default to empty array if none selected
    }

    // 3. Insert into Supabase
    const insertResponse = await fetch(supabaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(data)
    });

    if (!insertResponse.ok) {
      const errorMsg = await insertResponse.text();
      return res.status(400).json({ error: "Supabase Error", details: errorMsg });
    }

    // 4. THE ALGORITHM: Search for matching Approved Executives
    let matchCount = 0;
    let matchDetails = "No matches found yet.";

    if (type === 'company') {
      const matchQuery = new URLSearchParams({
        primary_role: `eq.${data.role_needed}`,
        vetting_status: `eq.approved`,
        min_monthly_rate: `lte.${data.budget_max}`,
        select: 'full_name,email,min_monthly_rate,industry_expertise'
      });

      const matchRes = await fetch(`${baseUrl}/rest/v1/profiles_exec?${matchQuery}`, {
        headers: {
          'apikey': process.env.SUPABASE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
        }
      });

      if (matchRes.ok) {
        const approvedExecs = await matchRes.json();
        
        // Filter to see if ANY of the company's target industries exist in the exec's expertise
        const filteredMatches = approvedExecs.filter(exec => 
          exec.industry_expertise.some(ind => data.industry_target.includes(ind))
        );

        matchCount = filteredMatches.length;
        if (matchCount > 0) {
          matchDetails = filteredMatches.map(m => `- ${m.full_name} ($${m.min_monthly_rate}/mo)`).join('<br>');
        }
      }
    }

    // 5. Send Notification Emails
    if (process.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: 'System <onboarding@resend.dev>',
          to: 'todd@startfractional.com', // <--- YOUR NOTIFICATION EMAIL
          subject: type === 'company' ? `MATCH ALERT: ${data.company_name}` : `NEW EXEC: ${data.full_name}`,
          html: `<h3>New ${type === 'exec' ? 'Executive' : 'Company'} Submission</h3>
                 <p><strong>Location:</strong> ${data.location}</p>
                 <p><strong>Industries:</strong> ${data[industryKey].join(', ')}</p>
                 <hr>
                 <h4>Internal Match Check:</h4>
                 <p>${matchDetails}</p>`
        })
      });
    }

    return res.status(200).json({ success: true, matches_found: matchCount });

  } catch (err) {
    return res.status(500).json({ error: "Server Crash", details: err.message });
  }
};
