/*
 * Discador EVS — endpoint exclusivo da Base_Geral
 *
 * Este arquivo deve ser publicado como um Web App separado do Apps Script do
 * dashboard financeiro. Assim, não altera os fluxos do Pabbly nem a rotina
 * Resumo_Diario já existente.
 *
 * Publicação:
 * 1. Cole este arquivo em um novo projeto do Apps Script.
 * 2. Confirme o ID da planilha em DISC_ENV.SPREADSHEET_ID.
 * 3. Opcional: crie a propriedade DISCADOR_API_TOKEN.
 * 4. Deploy > New deployment > Web app > Execute as me > Anyone with the link.
 * 5. Use a URL gerada em BASE_GERAL_APPS_SCRIPT_URL no Vercel.
 */

var DISC_ENV = {
  spreadsheetId: '1da1n15puWsPtZJeI2gBiwt-cKeVT9oryqK0e6qSQAYw',
  baseSheet: 'Base_Geral',
  historySheet: 'Historico_Ligacoes',
  timezone: 'America/Sao_Paulo',
  tokenProperty: 'DISCADOR_API_TOKEN'
};

var DISC_COL = {
  idLead: 1,
  data: 2,
  nome: 3,
  email: 4,
  whatsapp: 5,
  instagram: 6,
  negocio: 7,
  faturamento: 8,
  estoque: 9,
  cargo: 10,
  dezDias: 11,
  desafio: 12,
  numeroVendedores: 13,
  compromisso: 14,
  etiqueta: 15,
  status: 16,
  tagsPabbly: 17,
  podeLigar: 18,
  motivoBloqueio: 19,
  resultado: 20,
  dataUltimoContato: 21,
  proximaAcao: 22,
  dataRetorno: 23,
  dataAgendamento: 24,
  dataCompra: 25,
  produto: 26,
  equipe: 27,
  observacao: 28
};

var DISC_HISTORY_HEADERS = [
  'ID_Historico',
  'Data_Hora',
  'Sheet_Row',
  'ID_Lead',
  'Nome',
  'Whatsapp',
  'Resultado',
  'Duracao_Seg',
  'Observacao',
  'Proxima_Acao',
  'Data_Retorno',
  'Data_Agendamento',
  'Tentativa',
  'Twilio_SID',
  'Kabam_Status'
];

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var action = params.action || '';

    if (action === 'discador_fila') {
      discAuthorize_(params.token);
      return discJson_(discListarLeads_());
    }

    if (action === 'discador_historico') {
      discAuthorize_(params.token);
      return discJson_(discListarHistorico_(Number(params.limit) || 500));
    }

    return discJson_({
      success: false,
      error: 'Ação inválida. Use discador_fila ou discador_historico.'
    });
  } catch (error) {
    return discJson_({ success: false, error: error.message });
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    if (body.action === 'discador_registrar_ligacao') {
      discAuthorize_(body.token);
      return discJson_(discRegistrarLigacao_(body));
    }

    return discJson_({ success: false, error: 'Ação inválida.' });
  } catch (error) {
    return discJson_({ success: false, error: error.message });
  }
}

function discAuthorize_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty(DISC_ENV.tokenProperty);
  // Se a propriedade não existir, o Web App continua funcionando para a
  // primeira configuração. Depois de testar, recomenda-se criar o token.
  if (expected && String(token || '') !== String(expected)) {
    throw new Error('Token do Discador EVS inválido.');
  }
}

function discSpreadsheet_() {
  var configured = PropertiesService.getScriptProperties().getProperty('DISC_SPREADSHEET_ID');
  return SpreadsheetApp.openById(configured || DISC_ENV.spreadsheetId);
}

function discBaseSheet_() {
  var sheet = discSpreadsheet_().getSheetByName(DISC_ENV.baseSheet);
  if (!sheet) throw new Error('A aba Base_Geral não foi encontrada.');
  if (sheet.getLastColumn() < DISC_COL.observacao) {
    throw new Error('A aba Base_Geral precisa conter as colunas A:AB.');
  }
  return sheet;
}

function discListarLeads_() {
  var sheet = discBaseSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, source: 'Base_Geral', leads: [] };

  var values = sheet.getRange(1, 1, lastRow, DISC_COL.observacao).getDisplayValues();
  var tentativas = discAttempts_();
  var leads = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (discEmptyRow_(row)) continue;

    var sheetRow = i + 1;
    var idLead = String(row[DISC_COL.idLead - 1] || '').trim();
    var leadId = idLead || 'sheet-row-' + sheetRow;

    leads.push({
      id: leadId,
      id_lead: idLead,
      sheet_row: sheetRow,
      data: row[DISC_COL.data - 1] || '',
      nome: row[DISC_COL.nome - 1] || '',
      email: row[DISC_COL.email - 1] || '',
      telefone: row[DISC_COL.whatsapp - 1] || '',
      whatsapp: row[DISC_COL.whatsapp - 1] || '',
      instagram: row[DISC_COL.instagram - 1] || '',
      negocio: row[DISC_COL.negocio - 1] || '',
      faturamento: row[DISC_COL.faturamento - 1] || '',
      estoque: row[DISC_COL.estoque - 1] || '',
      cargo: row[DISC_COL.cargo - 1] || '',
      dez_dias: row[DISC_COL.dezDias - 1] || '',
      desafio: row[DISC_COL.desafio - 1] || '',
      numero_vendedores: row[DISC_COL.numeroVendedores - 1] || '',
      compromisso: row[DISC_COL.compromisso - 1] || '',
      etiqueta: row[DISC_COL.etiqueta - 1] || '',
      origem: row[DISC_COL.etiqueta - 1] || '',
      status: row[DISC_COL.status - 1] || '',
      tags_pabbly: row[DISC_COL.tagsPabbly - 1] || '',
      tags: discSplitTags_(row[DISC_COL.tagsPabbly - 1]),
      pode_ligar: row[DISC_COL.podeLigar - 1] || '',
      motivo_bloqueio: row[DISC_COL.motivoBloqueio - 1] || '',
      resultado: row[DISC_COL.resultado - 1] || '',
      data_ultimo_contato: row[DISC_COL.dataUltimoContato - 1] || '',
      proxima_acao: row[DISC_COL.proximaAcao - 1] || '',
      data_retorno: row[DISC_COL.dataRetorno - 1] || '',
      data_agendamento: row[DISC_COL.dataAgendamento - 1] || '',
      data_compra: row[DISC_COL.dataCompra - 1] || '',
      produto: row[DISC_COL.produto - 1] || '',
      equipe: row[DISC_COL.equipe - 1] || '',
      observacao: row[DISC_COL.observacao - 1] || '',
      tentativas: tentativas[leadId] || 0
    });
  }

  return {
    success: true,
    source: 'Base_Geral',
    sheet: DISC_ENV.baseSheet,
    leads: leads,
    fetched_at: new Date().toISOString()
  };
}

function discListarHistorico_(limit) {
  var sheet = discSpreadsheet_().getSheetByName(DISC_ENV.historySheet);
  if (!sheet || sheet.getLastRow() < 2) {
    return { success: true, source: DISC_ENV.historySheet, ligacoes: [] };
  }

  var lastRow = sheet.getLastRow();
  var startRow = Math.max(2, lastRow - Math.max(1, limit) + 1);
  var values = sheet.getRange(startRow, 1, lastRow - startRow + 1, DISC_HISTORY_HEADERS.length).getDisplayValues();
  var ligacoes = [];

  for (var i = values.length - 1; i >= 0; i--) {
    var row = values[i];
    var leadId = row[3] || ('sheet-row-' + row[2]);
    ligacoes.push({
      id: row[0],
      created_at: discIsoDate_(row[1]),
      sheet_row: Number(row[2]) || null,
      lead_id: leadId,
      nome: row[4] || '',
      telefone: row[5] || '',
      resultado: row[6] || '',
      duracao_seg: Number(row[7]) || 0,
      nota: row[8] || '',
      proxima_acao: row[9] || '',
      data_retorno: row[10] || '',
      data_agendamento: row[11] || '',
      tentativa: Number(row[12]) || 0,
      twilio_sid: row[13] || ''
    });
  }

  return { success: true, source: DISC_ENV.historySheet, ligacoes: ligacoes };
}

function discRegistrarLigacao_(body) {
  var sheet = discBaseSheet_();
  var sheetRow = discResolveRow_(sheet, body);
  var row = sheet.getRange(sheetRow, 1, 1, DISC_COL.observacao).getDisplayValues()[0];
  var resultado = String(body.resultado || '').trim();
  if (!resultado) throw new Error('Resultado da ligação é obrigatório.');

  var tentativa = Number(body.tentativa) || 0;
  var semAtendimento = resultado === 'nao_atendeu' || resultado === 'caixa';
  var limite = semAtendimento && tentativa >= 3;
  var status = discStatus_(resultado, limite);
  var tags = discMergeTags_(row[DISC_COL.tagsPabbly - 1], discTag_(resultado, limite));
  var motivo = limite ? 'Limite de tentativas sem atendimento' : String(body.motivo_bloqueio || row[DISC_COL.motivoBloqueio - 1] || '');
  var agora = new Date();

  sheet.getRange(sheetRow, DISC_COL.status).setValue(status);
  sheet.getRange(sheetRow, DISC_COL.tagsPabbly).setValue(tags);
  sheet.getRange(sheetRow, DISC_COL.motivoBloqueio).setValue(motivo);
  sheet.getRange(sheetRow, DISC_COL.resultado).setValue(discResultadoLabel_(resultado));
  sheet.getRange(sheetRow, DISC_COL.dataUltimoContato).setValue(agora);
  sheet.getRange(sheetRow, DISC_COL.proximaAcao).setValue(String(body.proxima_acao || ''));

  if (Object.prototype.hasOwnProperty.call(body, 'data_retorno')) {
    discSetDate_(sheet.getRange(sheetRow, DISC_COL.dataRetorno), body.data_retorno);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'data_agendamento')) {
    discSetDate_(sheet.getRange(sheetRow, DISC_COL.dataAgendamento), body.data_agendamento);
  }
  if (String(body.nota || '').trim()) {
    sheet.getRange(sheetRow, DISC_COL.observacao).setValue(String(body.nota).trim());
  }

  var history = discHistorySheet_();
  var historyId = 'LIG-' + Utilities.getUuid();
  var leadId = String(row[DISC_COL.idLead - 1] || body.id_lead || body.lead_id || ('sheet-row-' + sheetRow));
  var note = String(body.nota || '').trim();
  history.appendRow([
    historyId,
    agora,
    sheetRow,
    leadId,
    row[DISC_COL.nome - 1] || body.nome || '',
    row[DISC_COL.whatsapp - 1] || body.telefone || '',
    resultado,
    Number(body.duracao_seg) || 0,
    note,
    String(body.proxima_acao || ''),
    String(body.data_retorno || ''),
    String(body.data_agendamento || ''),
    tentativa,
    String(body.twilio_sid || ''),
    note ? 'pendente' : 'sem_comentario'
  ]);

  var kabam = note ? {
    evento: 'discador.comentario',
    versao: 1,
    status: 'pendente',
    sincronizado: false,
    id_evento: historyId,
    id_lead: leadId,
    nome: row[DISC_COL.nome - 1] || body.nome || '',
    telefone: row[DISC_COL.whatsapp - 1] || body.telefone || '',
    comentario: note,
    resultado: resultado,
    duracao_segundos: Number(body.duracao_seg) || 0,
    data_hora: agora.toISOString(),
    proxima_acao: String(body.proxima_acao || ''),
    data_retorno: String(body.data_retorno || ''),
    data_agendamento: String(body.data_agendamento || ''),
    tentativa: tentativa,
    origem: 'Discador EVS',
    destino: 'Kabam / BotConversa'
  } : null;

  return {
    success: true,
    ok: true,
    source: 'Base_Geral',
    sheet_row: sheetRow,
    ligacao: {
      id: historyId,
      created_at: agora.toISOString(),
      lead_id: leadId,
      resultado: resultado,
      duracao_seg: Number(body.duracao_seg) || 0,
      nota: note,
      tentativa: tentativa
    },
    kabam: kabam
  };
}

function discResolveRow_(sheet, body) {
  var requested = Number(body.sheet_row);
  var id = String(body.id_lead || '').trim();
  var phone = discDigits_(body.telefone);

  if (requested >= 2 && requested <= sheet.getLastRow()) {
    var row = sheet.getRange(requested, 1, 1, DISC_COL.whatsapp).getDisplayValues()[0];
    var storedId = String(row[DISC_COL.idLead - 1] || '').trim();
    var storedPhone = discDigits_(row[DISC_COL.whatsapp - 1]);
    if (id && id.indexOf('sheet-row-') !== 0 && storedId && storedId !== id) {
      throw new Error('A linha da Base_Geral não corresponde ao ID_Lead enviado.');
    }
    if (phone && storedPhone && phone !== storedPhone) {
      throw new Error('A linha da Base_Geral não corresponde ao telefone enviado.');
    }
    return requested;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('A Base_Geral não possui leads.');
  var values = sheet.getRange(2, 1, lastRow - 1, DISC_COL.whatsapp).getDisplayValues();
  var matches = [];
  for (var i = 0; i < values.length; i++) {
    var sameId = id && String(values[i][DISC_COL.idLead - 1] || '').trim() === id;
    var samePhone = phone && discDigits_(values[i][DISC_COL.whatsapp - 1]) === phone;
    if (sameId || samePhone) matches.push(i + 2);
  }
  if (matches.length !== 1) {
    throw new Error(matches.length ? 'Mais de uma linha corresponde ao lead.' : 'Lead não encontrado na Base_Geral.');
  }
  return matches[0];
}

function discHistorySheet_() {
  var ss = discSpreadsheet_();
  var sheet = ss.getSheetByName(DISC_ENV.historySheet);
  if (!sheet) sheet = ss.insertSheet(DISC_ENV.historySheet);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, DISC_HISTORY_HEADERS.length).setValues([DISC_HISTORY_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function discAttempts_() {
  var sheet = discSpreadsheet_().getSheetByName(DISC_ENV.historySheet);
  var counts = {};
  if (!sheet || sheet.getLastRow() < 2) return counts;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, DISC_HISTORY_HEADERS.length).getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    var resultado = values[i][6];
    if (resultado !== 'nao_atendeu' && resultado !== 'caixa') continue;
    var key = values[i][3] || ('sheet-row-' + values[i][2]);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function discStatus_(resultado, limite) {
  if (limite) return 'Limite de tentativas';
  if (resultado === 'reuniao') return 'Agendou';
  if (resultado === 'interessado' || resultado === 'retornar' || resultado === 'nao_atendeu' || resultado === 'caixa') return 'Retornar';
  return 'Descartado';
}

function discResultadoLabel_(resultado) {
  var labels = {
    reuniao: 'Agendou reunião',
    interessado: 'Interessada — retornar',
    retornar: 'Retornar depois',
    nao_atendeu: 'Não atendeu',
    caixa: 'Caixa postal',
    numero_errado: 'Número errado',
    sem_interesse: 'Sem interesse'
  };
  return labels[resultado] || resultado;
}

function discTag_(resultado, limite) {
  if (limite) return 'nao_ligar';
  return 'discador_' + resultado;
}

function discMergeTags_(current, added) {
  var tags = discSplitTags_(current);
  if (added && tags.map(discNorm_).indexOf(discNorm_(added)) === -1) tags.push(added);
  return tags.join(', ');
}

function discSplitTags_(value) {
  return String(value || '').split(/[,;|]/).map(function(item) { return item.trim(); }).filter(Boolean);
}

function discSetDate_(range, value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    range.clearContent();
    return;
  }
  var text = String(value).trim();
  var match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!match) {
    range.setValue(text);
    return;
  }
  var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0), 0);
  range.setValue(date);
}

function discIsoDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value.toISOString();
  }
  var text = String(value);
  var br = text.match(/^(\d{2})\/(\d{2})\/(\d{2,4})(?:[ ,T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (br) {
    var year = Number(br[3]) < 100 ? 2000 + Number(br[3]) : Number(br[3]);
    var brDate = new Date(year, Number(br[2]) - 1, Number(br[1]), Number(br[4] || 0), Number(br[5] || 0), Number(br[6] || 0));
    if (!isNaN(brDate.getTime())) return brDate.toISOString();
  }
  var date = new Date(value);
  return isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function discEmptyRow_(row) {
  return row.every(function(value) { return String(value || '').trim() === ''; });
}

function discDigits_(value) {
  return String(value || '').replace(/\D/g, '');
}

function discNorm_(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function discJson_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
