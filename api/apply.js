export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { type, data } = req.body;

    // 1. Clean data
    const { _subject, ...cleanData } = data;

    // 2. Format URL
    const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
    const table = type === 'exec' ? 'profiles_exec' : 'company_postings';
    const supabaseUrl = `${baseUrl}/rest/v1/${table}`;

    // 3. Insert into Supabase
    const supabaseResponse = await fetch(supabaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
        'Content-Profile': 'public',
        'Prefer': 'return=representation' // This asks Supabase for more detail on errors
      },
      body: JSON.stringify(cleanData)
    });

    const result = await supabaseResponse.json();

    if (!supabaseResponse.ok) {
      // THIS IS THE KEY: We send the actual Supabase error back to you
      console.error("Supabase Error:", result);
      return res.status(400).json({ 
        error: "Supabase Error", 
        details: result.message || JSON.stringify(result) 
      });
    }

    // 4. Send Email via Resend
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: 'onboarding@resend.dev', 
          to: cleanData.email || cleanData.contact_email,
          subject: type === 'exec' ? 'Application Received' : 'Hiring Need Received',
          html: `<p>We received your ${type} submission. We are reviewing it now.</p>`
        })
      });
    } catch (e) {
      console.log("Email failed but data was saved.");
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    return res.status(500).json({ error: "Server Error", details: error.message });
  }
}
