import twilio from 'twilio';

// O token precisa ser criado em cada requisição. Se esta rota for
// pré-renderizada pela Next/Vercel, o token congela no build e expira.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

// Gera o token que autoriza o navegador da vendedora a ligar.
export async function GET() {
  try {
    const required = [
      'TWILIO_ACCOUNT_SID',
      'TWILIO_API_KEY_SID',
      'TWILIO_API_KEY_SECRET',
      'TWILIO_TWIML_APP_SID',
    ];
    const missing = required.filter((name) => !process.env[name]);

    if (missing.length) {
      console.error('Variáveis Twilio ausentes:', missing.join(', '));
      return Response.json(
        { error: 'A configuração do Twilio está incompleta.' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    const identity = 'vendedora';

    const token = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_API_KEY_SID,
      process.env.TWILIO_API_KEY_SECRET,
      { identity, ttl: 3600 }
    );

    token.addGrant(
      new VoiceGrant({
        outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
        incomingAllow: false,
      })
    );

    return Response.json(
      { token: token.toJwt(), identity },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Erro ao gerar token Twilio:', error);
    return Response.json(
      { error: 'Não foi possível gerar o token do Twilio.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
