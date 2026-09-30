# Discador EVS — continuidade das ligações

## Evidência e conclusão

Base revisada: commit `773571eccdd110a9d0d21552ec8b476b7aacccdd` (28/09/2026).
O GitHub registra implantação Vercel concluída para esse commit. O arquivo de
auditoria produzido anteriormente não estava aplicado ao `main`.

Em 30/09, o painel publicado foi acessado com autenticação: mostrou
**Base_Geral conectada, 921 leads na fila, 4 retornos e 0 ligações no dia**.
A leitura delimitada `Base_Geral!P2:R1100` encontrou 978 linhas com status:
918 Novo, 4 Retornar, 51 Agendou, 4 Vendido e 1 Limite de tentativas.
921 estavam com Pode_Ligar=SIM e 57 com NÃO. Status Novo e Pode_Ligar=SIM
são contagens distintas. O histórico tem seis registros; o último é de
28/09/2026, 15:42:34, no fuso da planilha. Todos os seis estão sem Twilio SID.

Isso confirma que a fila existe e carrega. Não demonstra o motivo específico
de cada chamada passada. Não foram feitas ligações, nem obtidos os logs de
chamadas da conta Twilio. A sessão aberta nesta auditoria não contém os eventos
do navegador da operadora no momento da falha.

**Há defeitos reproduzíveis no controle de término, avanço e salvamento.**
O estado observado pela usuária é compatível com esses caminhos, mas a causa
da ocorrência real depende do SID/status e dos eventos de uma chamada controlada.

## Defeitos reproduzidos e corrigidos nesta proposta

| Caminho | Código antigo | Correção |
|---|---|---|
| `accept` seguido de `disconnect` | Automático continua marcado ativo, sem salvar ou agendar próxima chamada | Consulta a perna discada no Twilio antes de classificar; `no-answer`/`busy` avança |
| Eventos terminais repetidos | `cancel` tardio pode sobrescrever `idle` com `wrapup` após salvar | Encerramento único por chamada e geração; eventos antigos não alteram a próxima |
| Evento de término ausente | Tela pode continuar esperando o SDK | Consulta de recuperação começa em 35 s e segue a cada 15 s; não interrompe conversa ativa por tempo |
| Falha em iniciar/renovar telefone | Automático pode continuar ativo sem chamada | Pausa explícita, erro visível e reconexão sem F5 |
| Callback com estado antigo | Filas, notas e tentativas podem usar o render anterior | Referências atualizadas e invalidação de respostas de atualização antigas |
| Ordem da fila | A → B → A antes de tentar C | Lead tentado vai para o fim da fila em memória: A → B → C |
| POST falha ou sessão expira | Dados da ligação podem ser apagados | Resultado é conservado localmente e pode ser reenviado sem rediscagem |
| Reenvio após resposta perdida | Histórico pode duplicar | `event_id`, lock no Apps Script, conteúdo imutável e reparo de gravação parcial |
| Leitura em contingência, escrita estrita | Tela pode parecer conectada a outra base enquanto não consegue gravar na principal | Em modo estrito, falha da Base_Geral é apresentada em leitura também |
| Data de reunião | Horário digitado era omitido do payload | Data e hora são enviadas juntas |

`accept` não distingue pessoa de caixa postal. A rota já usa
`answerOnBridge=true`; se essa rota é a efetivamente configurada, o SDK deve
manter ringing até atendimento. A nova consulta usa a chamada **filha**, pois
o encerramento da conexão do navegador, sozinho, não comprova atendimento.
Chamadas `completed`, incluindo eventual caixa postal, continuam exigindo a
classificação da operadora. Não foi acrescentada detecção automática de voz/AMD
ao modo humano. Falhas técnicas e resultados desconhecidos não gastam tentativa
automaticamente.

## Varredura dos demais componentes

Foram lidos painel, APIs de fila/resultado/token/voz/agente, login/middleware,
cliente Base_Geral, endpoint Apps Script e serviço Python da Ana, incluindo
agenda e instruções da agente. Não houve alteração de segredos, contatos,
Pabbly, permissões, banco de produção ou gravações existentes.

- **Ana é um fluxo diferente:** o botão do automático chama `Device.connect`
  no navegador. Não chama `/api/agente/iniciar`. Não existe worker neste projeto
  consumindo sozinho os 921 registros da planilha.
- **Risco adicional da Ana:** `_send_result` faz uma tentativa HTTP. Se falha,
  o contexto continua aberto; os handlers só registram erro. Outro `/calls`
  para aquele lead pode receber 409 indefinidamente até reinício. O contexto
  fica em memória e não é uma fila persistente. A verificação de duplicidade
  ocorre antes de um `await`, sem reserva prévia, permitindo disputa entre
  dois gatilhos simultâneos. Requer correção própria com persistência de
  resultados e idempotência, antes de liberar processamento em lote pela Ana.
- **Falhas técnicas na Ana:** `event.is_unreached` agrupa encerramentos e os
  grava como sem resposta; precisa distinguir falha técnica de não atendimento.
- **Agendamento da Ana:** a proteção contra repetição depende de
  `appointment_at` e `meet_url`. Se o Calendly confirmar a reunião sem devolver
  imediatamente o link, uma segunda solicitação pode tentar agendar outra vez.
- **Retornos com data futura:** o filtro atual não verifica se chegou a data
  do retorno. Essa regra comercial não foi alterada neste patch.
- **Concorrência entre abas/operadoras:** as travas novas são da aba e o lock
  do Apps Script protege a gravação, não uma reserva global antes de discar.
  Operação simultânea em várias abas ainda requer coordenação no servidor.
- **Token/login:** token Twilio é dinâmico, TTL de uma hora e renovação
  programada. A sessão do painel dura oito horas. Não há evidência nesta
  auditoria de credencial inválida em produção.
- **Dependências:** a instalação avisou que Next 14.2.5 tem vulnerabilidade
  conhecida. Atualização deve ser tratada separadamente com validação de
  compatibilidade; não há evidência de que explique o travamento descrito.

## Validação

`node tests/original-regressions.cjs` reproduz três falhas sobre o commit
original imutável: ausência de avanço após accept/disconnect, alteração tardia
de estado e alternância A/B antes de C.

`npm test` cobre persistência, expiração de sessão, eventos repetidos,
concorrência de início/salvamento, confirmação de status, falha de consulta,
recuperação sem disconnect, ordem da fila, três chamadas consecutivas sem
atendimento, reenvio sem duplicidade e reparo de gravação parcial. Todos usam
Twilio, rede e planilha simulados. `npm run build` valida a compilação Next;
os módulos Python foram verificados sintaticamente, não executados no Render.

Os testes não substituem uma chamada real controlada. Nenhum resultado de
teste foi gravado na planilha de produção.

## Aplicação e limites

1. Pausar o automático e manter uma única aba operacional.
2. Atualizar **primeiro** `apps-script/DiscadorEVS_BaseGeral_Endpoint.gs`
   no projeto Apps Script correto e publicar nova versão no deployment
   existente. O token e a URL permanecem os atuais. Isso é necessário para
   que o reenvio com `event_id` não duplique registros.
3. Publicar este branch no aplicativo após validar o Apps Script. A consulta
   `/api/voice/status` usa `TWILIO_ACCOUNT_SID` e `TWILIO_AUTH_TOKEN` existentes,
   exige login e não dispara chamadas. Não adicioná-la aos caminhos públicos.
4. Atualizar a página do painel, confirmar fila e telefone e testar um número
   autorizado: não atender, recusar, atender/encerrar e falha de gravação em
   ambiente de teste. Confirmar um registro por chamada e avanço para o
   próximo contato; conferir SID e resultado Twilio.

O código está em proposta separada; esta auditoria não publicou a versão no
Apps Script nem substituiu a produção. O login do painel não concede acesso
ao editor/deployment do Apps Script nem aos logs Twilio/Render.

Pendências ficam no navegador/origem usados; limpeza dos dados remove-as.
Fechar a aba antes de haver resultado conservado ainda pode perder contexto.
O Apps Script não oferece transação atômica entre as duas abas: o reenvio
repara a atualização parcial, mas não elimina essa limitação. A ordem rodada
é mantida em memória e pode ser recomposta pelo carregamento da planilha.

## Referências técnicas

- [Twilio Call e eventos do SDK](https://www.twilio.com/docs/voice/sdks/javascript/twiliocall)
- [Twilio Calls, ParentCallSid e status](https://www.twilio.com/docs/voice/api/call-resource)
- [Dial e answerOnBridge](https://www.twilio.com/docs/voice/twiml/dial)
