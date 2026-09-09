import twilio from 'twilio';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function publicRequestUrl(request) {
  const incoming = new URL(request.url);
  const protocol = request.headers.get('x-forwarded-proto') || incoming.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || incoming.host;
  return `${protocol}://${host}${incoming.pathname}`;
}

async function requestParams(request) {
  if (request.method === 'POST') {
    const form = await request.formData();
    const params = {};
    form.forEach((value, key) => {
      params[key] = String(value);
    });
    return params;
  }

  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

async function twilioRequestIsValid(request, params) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = request.headers.get('x-twilio-signature');

  if (!authToken || !signature) return false;

  return twilio.validateRequest(
    authToken,
    signature,
    publicRequestUrl(request),
    params
  );
}

// O Twilio chama esta rota quando o navegador inicia uma ligacao.
// Ela devolve o TwiML que manda discar pro numero do lead,
// mostrando o SEU numero verificado como identificador.
async function handler(request) {
  try {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();

    const params = await requestParams(request);
    if (!(await twilioRequestIsValid(request, params))) {
      return new Response('Assinatura Twilio inválida.', {
        status: process.env.TWILIO_AUTH_TOKEN ? 403 : 503,
      });
    }

    const to = params.To || params.to || '';

    if (to) {
      if (!process.env.TWILIO_CALLER_ID) {
        console.error('TWILIO_CALLER_ID não está configurado.');
        return new Response('Caller ID não configurado.', { status: 500 });
      }

      const dial = response.dial({
        callerId: process.env.TWILIO_CALLER_ID,
        answerOnBridge: true,
        timeout: 25,
      });
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
