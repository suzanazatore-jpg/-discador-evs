import twilio from 'twilio';

// O Twilio chama esta rota quando o navegador inicia uma ligacao.
// Ela devolve o TwiML que manda discar pro numero do lead,
// mostrando o SEU numero verificado como identificador.
async function handler(request) {
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
    const dial = response.dial({ callerId: process.env.TWILIO_CALLER_ID });
    dial.number(to);
  } else {
    response.say({ language: 'pt-BR' }, 'Numero nao informado.');
  }

  return new Response(response.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  });
}

export const POST = handler;
export const GET = handler;
