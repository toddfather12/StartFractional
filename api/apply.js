export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { type, data } = req.body;

    // 1. CLEAN DATA: Remove the "_subject" field so it doesn't break Supabase
    const { _subject, ...cleanData } = data;

    // 2. Format the Supabase URL correctly (handles trailing slashes)
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
        'Prefer': 'return=minimal' // Efficient insert
      },
      body: JSON.stringify(cleanData)
    });

    if (!supabaseResponse.ok) {
      const errorText = await supabaseResponse.text();
      console.error("Supabase Error:", errorText);
      throw new Error("Supabase rejected the data");
    }

    // 4. Send Email via Resend
    // Note: Resend only sends to YOUR email until you verify your domain
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
        html: `<p>Hello! We received your ${type} submission for StartFractional. We are reviewing it now.</p>`
      })
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("API Route Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
