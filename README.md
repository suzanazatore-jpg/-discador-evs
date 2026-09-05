# Discador EVS

Discador de ligações no navegador para a Equipe que Vende Sozinha.
Stack: Next.js + Twilio Voice (navegador) + Supabase.

A vendedora abre o app, vê a fila de leads, clica em "Ligar", fala pelo
headset direto no navegador, marca o resultado, e o sistema pula pro
próximo — salvando tudo no Supabase.

---

## Antes de começar (já feito ✅)
- Banco Supabase com as tabelas (schema já rodado).
- Conta Twilio com upgrade feito e seu número verificado como Caller ID.

Agora falta juntar as peças. São 6 partes. Faça na ordem.

---

## Parte A — Criar a API Key no Twilio
1. No painel Twilio: **Account** > **API keys & tokens** (ou busque "API keys").
2. Clique em **Create API key**.
3. Nome: `discador-evs`. Tipo: **Standard**. Clique em **Create**.
4. Vai aparecer o **SID** (começa com `SK...`) e o **Secret**.
   COPIE OS DOIS AGORA — o Secret só aparece uma vez.

Guarde: `SK...` = TWILIO_API_KEY_SID · o secret = TWILIO_API_KEY_SECRET

## Parte B — Criar o TwiML App no Twilio
1. No painel: **Voice** > **Manage** > **TwiML Apps** (ou busque "TwiML Apps").
2. Clique em **Create new TwiML App**.
3. Nome: `discador-evs`.
4. Em **Voice Configuration > Request URL**: por enquanto coloque qualquer
   coisa, ex: `https://exemplo.com/api/voice` (a gente corrige na Parte F,
   depois do deploy). Método: **POST**.
5. Salve. Copie o **SID do app** (começa com `AP...`).

Guarde: `AP...` = TWILIO_TWIML_APP_SID

## Parte C — Pegar as chaves do Supabase
1. No painel Supabase do projeto: **Project Settings** > **API**.
2. Copie a **Project URL** (ex: https://lkqwxhrnsldwfrwcaxye.supabase.co).
3. Copie a **service_role key** (a secreta, seção "Project API keys").

Guarde: URL = SUPABASE_URL · service_role = SUPABASE_SERVICE_ROLE_KEY

## Parte D — Subir o código no GitHub
1. Crie um repositório novo no GitHub (ex: `discador-evs`), privado.
2. Suba os arquivos desta pasta pra ele (pelo site do GitHub, GitHub Desktop
   ou pelo terminal com `git init / add / commit / push`).

## Parte E — Publicar na Vercel
1. Em vercel.com, clique em **Add New > Project** e importe o repositório.
2. Antes de clicar em Deploy, abra **Environment Variables** e adicione as 7:
   - TWILIO_ACCOUNT_SID  (o AC... da sua conta, na home do Twilio)
   - TWILIO_API_KEY_SID  (SK... da Parte A)
   - TWILIO_API_KEY_SECRET  (secret da Parte A)
   - TWILIO_TWIML_APP_SID  (AP... da Parte B)
   - TWILIO_CALLER_ID  (seu número verificado, formato +5585999998888)
   - SUPABASE_URL  (Parte C)
   - SUPABASE_SERVICE_ROLE_KEY  (Parte C)
3. Clique em **Deploy**. No fim, a Vercel te dá uma URL
   (ex: https://discador-evs.vercel.app).

## Parte F — Apontar o TwiML App pra URL real
1. Volte ao Twilio > TwiML Apps > seu app `discador-evs`.
2. Em **Request URL**, troque pela URL da Vercel + `/api/voice`, assim:
   `https://discador-evs.vercel.app/api/voice` — método **POST**.
3. Salve.

## Parte G — Testar
1. Adicione alguns leads na tabela `leads` do Supabase (telefone em E.164:
   +55 + DDD + número). Há exemplos comentados no final do schema.
2. Abra a URL da Vercel. O navegador vai pedir permissão de microfone: permita.
3. Clique em "Ligar agora". Fale pelo headset. Marque o resultado.

Pronto — o discador está no ar. 🎉

---

## Rodar localmente (opcional, pra testar antes)
1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha as 7 variáveis.
3. `npm run dev` e abra http://localhost:3000
   (Para o Twilio chamar o /api/voice local, você precisaria expor com uma
   ferramenta tipo ngrok — mais simples testar direto na Vercel.)

## Problemas comuns
- "Falha ao conectar no Twilio": confira API Key SID/Secret e o TwiML App SID.
- Liga mas cai na hora: confira se a Request URL do TwiML App aponta pro
  /api/voice da sua URL da Vercel (Parte F) e está como POST.
- "Nenhum lead na fila": adicione leads no Supabase com status 'novo'.
- Sem áudio: confira a permissão de microfone do navegador (use Chrome/Edge).
