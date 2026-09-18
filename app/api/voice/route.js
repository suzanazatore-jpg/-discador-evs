import twilio from 'twilio';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function requestUrlCandidates(request) {
  const incoming = new URL(request.url);
  const protocol = request.headers.get('x-forwarded-proto') || incoming.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || incoming.host;
  const path = `${incoming.pathname}${incoming.search}`;
  const urls = new Set([
    incoming.toString(),
    `${protocol}://${host}${path}`,
  ]);

  const configuredHosts = [
    process.env.TWILIO_VOICE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ].filter(Boolean);

  for (const value of configuredHosts) {
    const base = value.startsWith('http') ? value : `https://${value}`;

    try {
      const url = new URL(base);
      url.pathname = incoming.pathname;
      url.search = incoming.search;
      urls.add(url.toString());
    } catch {
      // Ignora um valor malformado e continua com os enderecos da requisicao.
    }
  }

  // A Twilio assina o endereco exatamente como ele foi cadastrado. A Vercel
  // pode normalizar a barra final antes de entregar a requisicao ao Next.js.
  for (const value of [...urls]) {
    const url = new URL(value);
    url.pathname = url.pathname.endsWith('/')
      ? url.pathname.slice(0, -1)
      : `${url.pathname}/`;
    urls.add(url.toString());
  }

  return [...urls];
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
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const signature = request.headers.get('x-twilio-signature')?.trim();

  if (!authToken || !signature) return false;

  const urls = requestUrlCandidates(request);
  const valid = urls.some((url) =>
    twilio.validateRequest(authToken, signature, url, params)
  );

  if (!valid) {
    console.error('Assinatura Twilio recusada para os enderecos esperados.', {
      urls,
      hasSignature: true,
      hasAuthToken: true,
    });
  }

  return valid;
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
