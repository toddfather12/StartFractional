module.exports = async (req, res) => {
  // 1. Set headers to always return JSON
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, data } = req.body;
    console.log("Received data for type:", type);

    // 2. Validate Environment Variables exist
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      throw new Error("Missing Supabase Environment Variables in Vercel Settings");
    }

    const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
    const table = type === 'exec' ? 'profiles_exec' : 'company_postings';
    const supabaseUrl = `${baseUrl}/rest/v1/${table}`;

    // 3. Talk to Supabase
    const supabaseResponse = await fetch(supabaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(data)
    });

    if (!supabaseResponse.ok) {
      const errorData = await supabaseResponse.text();
      return res.status(400).json({ error: "Supabase Error", details: errorData });
    }

    // 4. Send Email via Resend
    if (process.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: 'onboarding@resend.dev', 
          to: data.email || data.contact_email,
          subject: 'StartFractional Confirmation',
          html: `<p>We received your submission. We are reviewing it now.</p>`
        })
      });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Function Error:", err.message);
    return res.status(500).json({ error: "Server Crash", details: err.message });
  }
};
