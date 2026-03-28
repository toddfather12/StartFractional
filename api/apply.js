// we use fetch because it's built into Vercel functions
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { type, data } = req.body;

  // 1. Send data to Supabase
  const supabaseResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${type === 'exec' ? 'profiles_exec' : 'company_postings'}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
    },
    body: JSON.stringify(data)
  });

  // 2. Send Email via Resend
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: 'onboarding@resend.dev', // You can change this once you verify a domain
      to: data.email,
      subject: type === 'exec' ? 'Application Received' : 'Matching Started',
      html: `<strong>Hi ${data.name || 'there'}!</strong><p>We received your ${type} request and are processing it now.</p>`
    })
  });

  return res.status(200).json({ success: true });
}
