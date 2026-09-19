# Ana — serviço de voz

Serviço persistente que conecta Twilio Agent Connect ao GPT-Live. Ele não
substitui o painel Next.js: o painel seleciona e valida o lead; este serviço
mantém o áudio da chamada, executa as ferramentas da agenda e devolve o
resultado à Base Geral. A disponibilidade e os agendamentos usam o evento
oficial de 30 minutos da Suzana no Calendly.

## Segurança inicial

- `VOICE_AGENT_ENABLED=false` mantém o serviço totalmente desligado.
- `VOICE_AGENT_MODE=test` permite chamadas somente para os números de
  `VOICE_AGENT_TEST_NUMBERS`.
- Chamadas para a base exigem uma mudança explícita para `production` e
  `ALLOW_PRODUCTION_CALLS=true`.
- O endpoint `/calls` exige `VOICE_SERVICE_SECRET`.
- O Discador EVS valida novamente `Pode_Ligar`, status, tags, produto,
  agendamento existente e telefone antes de chamar este serviço.

## Publicação

Publique esta pasta como um serviço Docker sempre ativo e com suporte a
WebSocket. Configure as variáveis de `.env.example`. O domínio público usado
em `TWILIO_VOICE_PUBLIC_DOMAIN` precisa apontar para este contêiner.

Depois, configure na Vercel:

- `AGENTE_VOZ_API_URL`
- `AGENTE_VOZ_SECRET` com o mesmo valor de `VOICE_SERVICE_SECRET`
- `AGENTE_VOZ_ENABLED=false` até o teste final

Valide `GET /health`. A primeira chamada deve ser feita em modo `test`, para
um número que esteja explicitamente em `VOICE_AGENT_TEST_NUMBERS`.

## Calendly

Configure `CALENDLY_ACCESS_TOKEN` como segredo no serviço e mantenha:

- `CALENDLY_SCHEDULING_URL=https://calendly.com/suzanazatorreoficial/30min`
- `CALENDLY_EVENT_TYPE_SLUG=30min`
- `AGENDA_TIMEZONE=America/Sao_Paulo`

A Ana consulta apenas os horários que o próprio Calendly retorna como livres.
Antes de reservar, ela verifica novamente a disponibilidade. O Calendly envia
ao e-mail confirmado pela lead o convite e o link da reunião configurado no
tipo de evento.

## Gatilho automático do Pabbly

Depois do teste, o passo que grava o lead selecionado na Base Geral chama:

`POST https://discador-evs.vercel.app/api/agente/webhook`

Envie o header `Authorization: Bearer <AGENTE_VOZ_WEBHOOK_SECRET>` e um JSON com
`id_lead` (preferencial) ou `sheet_row`. O Discador relê a linha da Base Geral e
aplica todos os bloqueios antes de encaminhar a chamada para a Ana.
