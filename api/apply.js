module.exports = async (req, res) => {
  // Ensure we always return JSON
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, data } = req.body;

    // 1. Validate Environment Variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      return res.status(500).json({ error: "Server Configuration Error: Missing Keys" });
    }

    const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
    const table = type === 'exec' ? 'profiles_exec' : 'company_postings';
    const supabaseUrl = `${baseUrl}/rest/v1/${table}`;

    // 2. Insert the submission into Supabase
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

    // 3. THE ALGORITHM: If it's a company, find matching Approved Executives
    let matchCount = 0;
    let matchDetails = "No matches found yet.";

    if (type === 'company') {
      const matchQuery = new URLSearchParams({
        primary_role: `eq.${data.role_needed}`,
        vetting_status: `eq.approved`,
        min_monthly_rate: `lte.${data.budget_max}`, // Exec rate <= Company budget
        select: 'full_name,email,min_monthly_rate'
      });

      const matchRes = await fetch(`${baseUrl}/rest/v1/profiles_exec?${matchQuery}`, {
        headers: {
          'apikey': process.env.SUPABASE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
        }
      });

      if (matchRes.ok) {
        const matches = await matchRes.json();
        matchCount = matches.length;
        if (matchCount > 0) {
          matchDetails = matches.map(m => `- ${m.full_name} ($${m.min_monthly_rate}/mo)`).join('<br>');
        }
      }
    }

    // 4. Send Emails via Resend
    if (process.env.RESEND_API_KEY) {
      // Email to the User (Confirmation)
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: 'StartFractional <onboarding@resend.dev>',
          to: data.email || data.contact_email,
          subject: 'We received your request',
          html: `<p>Hi! We've received your ${type} submission and are processing it now.</p>`
        })
      });

      // Email to YOU (Internal Match Alert)
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: 'System <onboarding@resend.dev>',
          to: 'todd@startfractional.com', // Change this to your actual email
          subject: type === 'company' ? `MATCH ALERT: ${data.company_name}` : `NEW EXEC: ${data.full_name}`,
          html: type === 'company' 
            ? `<h3>New Company Request</h3>
               <p>Role: ${data.role_needed}<br>Budget: $${data.budget_max}</p>
               <hr>
               <h4>Potential Matches Found: ${matchCount}</h4>
               <p>${matchDetails}</p>`
            : `<p>New Executive Application from ${data.full_name} (${data.primary_role})</p>`
        })
      });
    }

    return res.status(200).json({ success: true, matches_found: matchCount });

  } catch (err) {
    return res.status(500).json({ error: "Server Crash", details: err.message });
  }
};
