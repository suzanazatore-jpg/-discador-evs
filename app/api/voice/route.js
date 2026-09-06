import twilio from 'twilio';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// O Twilio chama esta rota quando o navegador inicia uma ligacao.
// Ela devolve o TwiML que manda discar pro numero do lead,
// mostrando o SEU numero verificado como identificador.
async function handler(request) {
  try {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();

    let to = '';
    try {
      const form = await request.formData();
      to = form.get('To') || '';
    } catch (e) {
      to = '';
    }

    if (to) {
      if (!process.env.TWILIO_CALLER_ID) {
        console.error('TWILIO_CALLER_ID não está configurado.');
        return new Response('Caller ID não configurado.', { status: 500 });
      }

      const dial = response.dial({ callerId: process.env.TWILIO_CALLER_ID });
      dial.number(to);
    } else {
      response.say({ language: 'pt-BR' }, 'Numero nao informado.');
    }

    return new Response(response.toString(), {
      headers: {
        'Content-Type': 'text/xml',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Erro na rota /api/voice:', error);
    return new Response('Erro ao gerar as instruções da chamada.', { status: 500 });
  }
}

export const POST = handler;
export const GET = handler;
