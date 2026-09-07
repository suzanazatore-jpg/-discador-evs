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

## Parte G — Conectar a Base_Geral sem pop-up de autorização

O painel agora suporta a `Base_Geral` como fonte principal dos leads. O
arquivo `apps-script/DiscadorEVS_BaseGeral_Endpoint.gs` é um Web App separado
do Apps Script financeiro. Ele lê a aba `Base_Geral`, grava os resultados nas
colunas P, Q, S, T, U, V, W, X e AB e cria a aba `Historico_Ligacoes` na
primeira ligação.

Esse endpoint não altera os fluxos do Pabbly.

1. Crie um projeto novo em script.google.com.
2. Cole o conteúdo de `apps-script/DiscadorEVS_BaseGeral_Endpoint.gs`.
3. Publique como Web App, executando como você e com acesso `Qualquer pessoa com o link`.
4. Se criar a propriedade opcional `DISCADOR_API_TOKEN`, coloque o mesmo valor
   em `BASE_GERAL_APPS_SCRIPT_TOKEN` na Vercel.
5. Na Vercel, adicione `BASE_GERAL_APPS_SCRIPT_URL` com a URL publicada.
6. Faça um novo deploy e valide a fila com a URL do painel.
7. Depois de confirmar, defina `BASE_GERAL_REQUIRED=true` para impedir que o
   sistema volte silenciosamente para o Supabase.

O endpoint usa `sheet_row` para atualizar a linha correta quando `ID_Lead`
estiver vazio. A coluna R (`Pode_Ligar`) não é sobrescrita pelo discador.

## Parte H — Testar
1. Confirme alguns leads na aba `Base_Geral`, com telefone na coluna E em
   E.164: `+55` + DDD + número.
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
