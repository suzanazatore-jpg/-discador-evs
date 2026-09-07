'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

const C = {
  vinho: '#6A1F32', vinhoEscuro: '#4E1626', vinhoClaro: '#7C2A3E',
  creme: '#FBF6EC', painel: '#FFFDF9', dourado: '#C6A24C', douradoSuave: '#EADFC0',
  tinta: '#2A211F', suave: '#8C7E76', linha: '#ECE2D2', verde: '#3F7D5B',
  ambar: '#C6862E', vermelho: '#B33A3A',
};

const MAX_TENTATIVAS = 3;
const AUTO_NEXT_DELAY_MS = 900;
const OUTBOX_KEY = 'discador_evs_kabam_outbox_v1';

const RESULTADOS = [
  { key: 'reuniao', label: 'Agendou reunião', cor: C.verde, atendida: true, status: 'reuniao', pedeData: true },
  { key: 'interessado', label: 'Interessada — retornar', cor: C.dourado, atendida: true, status: 'retornar', pedeData: true },
  { key: 'retornar', label: 'Retornar depois', cor: C.ambar, atendida: true, status: 'retornar', pedeData: true },
  { key: 'nao_atendeu', label: 'Não atendeu', cor: C.suave, atendida: false, status: 'retornar', avancaAutomatico: true },
  { key: 'caixa', label: 'Caixa postal', cor: C.suave, atendida: false, status: 'retornar', avancaAutomatico: true },
  { key: 'numero_errado', label: 'Número errado', cor: C.vermelho, atendida: false, status: 'descartado', avancaAutomatico: true },
  { key: 'sem_interesse', label: 'Sem interesse', cor: C.vermelho, atendida: true, status: 'descartado' },
];

const resultadoDe = (key) => RESULTADOS.find((resultado) => resultado.key === key);
const statusLabel = { novo: 'Novo', retornar: 'Retornar', reuniao: 'Agendado', descartado: 'Descartado', limite_tentativas: 'Limite de tentativas' };
const dataLocalISO = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fmtCron = (seconds = 0) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const fmtTotal = (seconds = 0) => { const minutes = Math.floor(seconds / 60); const rest = seconds % 60; return minutes < 60 ? `${minutes}m ${String(rest).padStart(2, '0')}s` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`; };
const fmtHora = (value) => value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
const fmtDataCurta = (value) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
const fmtTel = (value = '') => { const digits = String(value).replace(/\D/g, ''); if (digits.startsWith('55') && digits.length >= 12) { const ddd = digits.slice(2, 4); const number = digits.slice(4); const middle = number.length > 8 ? `${number.slice(0, 5)}-${number.slice(5)}` : `${number.slice(0, 4)}-${number.slice(4)}`; return `+55 (${ddd}) ${middle}`; } return value || 'Telefone não informado'; };
const iniciais = (nome = '') => String(nome).trim().split(/\s+/).filter(Boolean).map((parte) => parte[0]).slice(0, 2).join('').toUpperCase() || '—';
const normalizarTexto = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const valorDe = (objeto, chaves) => chaves.map((chave) => objeto?.[chave]).find((valor) => valor !== undefined && valor !== null && valor !== '');
const listaDe = (value) => Array.isArray(value) ? value.filter(Boolean).map(String) : String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

function normalizarLead(raw, index) {
  const tags = [...listaDe(valorDe(raw, ['tags', 'Tags'])), ...listaDe(valorDe(raw, ['tags_pabbly', 'tagsPabbly', 'Tags_Pabbly']))].filter((tag, position, all) => all.indexOf(tag) === position);
  const sheetRow = valorDe(raw, ['sheet_row', 'sheetRow', 'row_index', 'rowIndex']);
  const idLead = valorDe(raw, ['id', 'id_lead', 'ID_Lead']);
  return {
    id: idLead || (sheetRow ? `sheet-row-${sheetRow}` : `lead-${index}`),
    idLead: idLead || '',
    sheetRow: sheetRow ? Number(sheetRow) : null,
    nome: valorDe(raw, ['nome', 'Nome']) || 'Lead sem nome',
    telefone: valorDe(raw, ['telefone', 'whatsapp', 'Whatsapp', 'WhatsApp']) || '',
    email: valorDe(raw, ['email', 'Email']) || '',
    instagram: valorDe(raw, ['instagram', 'Instagram']) || '',
    negocio: valorDe(raw, ['negocio', 'Negócio', 'loja', 'Loja']) || '',
    faturamento: valorDe(raw, ['faturamento', 'Faturamento']) || '',
    cargo: valorDe(raw, ['cargo', 'Cargo']) || '',
    numeroVendedores: valorDe(raw, ['numero_vendedores', 'numeroVendedores', 'vendedores', 'Vendedor']) || '',
    dezDias: valorDe(raw, ['dez_dias', 'dezDias', 'ficar_10_dias_fora', 'Ficar 10 Dias fora']) || '',
    desafio: valorDe(raw, ['desafio', 'dor', 'Desafio']) || '',
    origem: valorDe(raw, ['origem', 'Origem', 'etiqueta', 'Etiqueta']) || '',
    etiqueta: valorDe(raw, ['etiqueta', 'Etiqueta']) || '',
    status: normalizarTexto(valorDe(raw, ['status', 'Status']) || 'novo'),
    tags,
    tagsPabbly: valorDe(raw, ['tags_pabbly', 'tagsPabbly', 'Tags_Pabbly']) || '',
    podeLigar: valorDe(raw, ['pode_ligar', 'podeLigar', 'Pode_Ligar']) || '',
    motivoBloqueio: valorDe(raw, ['motivo_bloqueio', 'motivoBloqueio', 'Motivo_Bloqueio']) || '',
    resultado: valorDe(raw, ['resultado', 'Resultado']) || '',
    observacao: valorDe(raw, ['observacao', 'observacoes', 'Observação', 'Observacao']) || '',
    dataRetorno: valorDe(raw, ['data_retorno', 'dataRetorno', 'Data_Retorno']) || '',
    dataAgendamento: valorDe(raw, ['data_agendamento', 'dataAgendamento', 'Data_Agendamento']) || '',
    tentativas: Number(valorDe(raw, ['tentativas', 'Tentativas']) || 0),
  };
}

function leadBloqueado(lead) {
  if (!lead) return true;
  const status = normalizarTexto(lead.status);
  const tags = [...(lead.tags || []), lead.tagsPabbly, lead.etiqueta, lead.motivoBloqueio].filter(Boolean).map((tag) => normalizarTexto(tag).replace(/[\s-]+/g, '_'));
  const podeLigar = normalizarTexto(lead.podeLigar).replace(/[\s-]+/g, '_');
  return ['vendido', 'descartado', 'nao_ligar', 'limite_tentativas'].includes(status) || tags.some((tag) => tag.includes('nao_ligar')) || ['nao', 'nao_ligar'].includes(podeLigar) || lead.podeLigar === false;
}

function leadElegivel(lead) {
  return Boolean(lead) && ['novo', 'retornar'].includes(normalizarTexto(lead.status)) && Number(lead.tentativas || 0) < MAX_TENTATIVAS && !leadBloqueado(lead);
}

function safeStorageRead(key, fallback) { try { if (typeof window === 'undefined') return fallback; const value = window.localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; } }
function safeStorageWrite(key, value) { try { if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
function mensagemErro(error, fallback) { if (!error) return fallback; const code = error.code ? `[${error.code}] ` : ''; return `${code}${error.message || error.description || fallback}`; }
async function obterToken() { const response = await fetch('/api/token', { cache: 'no-store' }); const body = await response.json().catch(() => ({})); if (!response.ok || !body.token) throw new Error(body.error || 'O servidor não conseguiu gerar o token do Twilio.'); return body.token; }
function normalizarLigacao(raw, index) { return { id: raw.id ?? `local-${index}`, lead_id: raw.lead_id ?? raw.leadId, resultado: raw.resultado || '', duracao_seg: Number(raw.duracao_seg ?? raw.duracao ?? 0), nota: raw.nota || raw.obs || '', created_at: raw.created_at || raw.ts || new Date().toISOString() }; }
function proximaAcaoDe(resultado) { if (resultado === 'reuniao') return 'Aguardar reunião'; if (resultado === 'interessado' || resultado === 'retornar') return 'Retornar contato'; if (resultado === 'nao_atendeu' || resultado === 'caixa') return 'Tentar novamente'; return 'Sem ação'; }

export default function DiscadorEVS() {
  const [leads, setLeads] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [estado, setEstado] = useState('idle');
  const [seg, setSeg] = useState(0);
  const [nota, setNota] = useState('');
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('ficha');
  const [escopoHistorico, setEscopoHistorico] = useState('lead');
  const [busca, setBusca] = useState('');
  const [filtroFila, setFiltroFila] = useState('todos');
  const [autoAtivo, setAutoAtivo] = useState(false);
  const [autoPausado, setAutoPausado] = useState(true);
  const [resultadoPendente, setResultadoPendente] = useState(null);
  const [dataProxima, setDataProxima] = useState('');
  const [horaProxima, setHoraProxima] = useState('');
  const [erroResultado, setErroResultado] = useState('');
  const [kabamOutbox, setKabamOutbox] = useState([]);
  const [fonteDados, setFonteDados] = useState('');

  const deviceRef = useRef(null);
  const callRef = useRef(null);
  const timerRef = useRef(null);
  const nextTimerRef = useRef(null);
  const sidRef = useRef(null);

  const filaElegivel = useMemo(() => leads.filter(leadElegivel), [leads]);
  const filaVisivel = useMemo(() => {
    const termo = normalizarTexto(busca);
    return filaElegivel.filter((lead) => {
      const porStatus = filtroFila === 'todos' || (filtroFila === 'novos' && lead.status === 'novo') || (filtroFila === 'retornos' && lead.status === 'retornar');
      const texto = normalizarTexto([lead.nome, lead.telefone, lead.negocio, ...(lead.tags || [])].join(' '));
      return porStatus && (!termo || texto.includes(termo));
    }).sort((a, b) => {
      const aRetorno = a.status === 'retornar' ? 0 : 1; const bRetorno = b.status === 'retornar' ? 0 : 1;
      if (aRetorno !== bRetorno) return aRetorno - bRetorno;
      return String(a.dataRetorno || '').localeCompare(String(b.dataRetorno || ''));
    });
  }, [filaElegivel, busca, filtroFila]);

  const lead = leads.find((item) => String(item.id) === String(activeId)) || filaElegivel[0] || leads[0] || null;
  const histLead = historico.filter((item) => String(item.lead_id) === String(lead?.id));
  const histExibido = escopoHistorico === 'lead' ? histLead : historico;
  const bloqueado = leadBloqueado(lead);
  const hoje = dataLocalISO();
  const stats = useMemo(() => {
    const doDia = historico.filter((item) => item.created_at && dataLocalISO(new Date(item.created_at)) === hoje);
    const feitas = doDia.length; const atendidas = doDia.filter((item) => resultadoDe(item.resultado)?.atendida).length;
    const agendamentos = doDia.filter((item) => item.resultado === 'reuniao').length; const tempo = doDia.reduce((total, item) => total + Number(item.duracao_seg || 0), 0);
    return { feitas, atendidas, agendamentos, tempo, atendimento: feitas ? Math.round((atendidas / feitas) * 100) : 0, conversao: atendidas ? Math.round((agendamentos / atendidas) * 100) : 0, fila: filaElegivel.length, retornos: filaElegivel.filter((item) => item.status === 'retornar').length };
  }, [historico, hoje, filaElegivel]);

  useEffect(() => { setKabamOutbox(safeStorageRead(OUTBOX_KEY, [])); }, []);
  useEffect(() => { safeStorageWrite(OUTBOX_KEY, kabamOutbox); }, [kabamOutbox]);

  useEffect(() => {
    let desmontado = false; let device = null;
    (async () => {
      try {
        const response = await fetch('/api/fila', { cache: 'no-store' }); const body = await response.json().catch(() => ({}));
        if (!response.ok || body.error) throw new Error(body.error || 'Falha ao carregar a fila.');
        const carregados = (body.leads || []).map(normalizarLead);
        if (!desmontado) { setLeads(carregados); setActiveId(carregados.find(leadElegivel)?.id || carregados[0]?.id || null); setFonteDados(body.source || ''); }
      } catch (error) { if (!desmontado) setErro(mensagemErro(error, 'Falha ao carregar a fila.')); }

      try {
        const response = await fetch('/api/ligacoes', { cache: 'no-store' }); const body = await response.json().catch(() => ({}));
        if (response.ok && !body.error && !desmontado) { setHistorico((body.ligacoes || []).map(normalizarLigacao)); if (body.source) setFonteDados(body.source); }
      } catch (_) {}

      try {
        const token = await obterToken(); const { Device } = await import('@twilio/voice-sdk');
        if (!Device.isSupported) throw new Error('Este navegador não é compatível com o Twilio Voice.');
        device = new Device(token, { codecPreferences: ['opus', 'pcmu'], logLevel: 1, tokenRefreshMs: 60000 });
        device.on('error', (error) => { setErro(mensagemErro(error, 'O Twilio não conseguiu iniciar a ligação.')); setEstado('idle'); setPronto(false); });
        device.on('tokenWillExpire', async () => { try { device.updateToken(await obterToken()); setPronto(true); } catch (error) { setErro(mensagemErro(error, 'Não foi possível renovar o token do Twilio.')); setPronto(false); } });
        if (desmontado) { device.destroy(); return; }
        deviceRef.current = device; setPronto(true);
      } catch (error) { if (!desmontado) setErro(mensagemErro(error, 'Falha ao conectar no Twilio. Confira as credenciais.')); }
    })();
    return () => { desmontado = true; clearInterval(timerRef.current); clearTimeout(nextTimerRef.current); device?.destroy(); };
  }, []);

  useEffect(() => { if (estado === 'active') timerRef.current = setInterval(() => setSeg((seconds) => seconds + 1), 1000); return () => clearInterval(timerRef.current); }, [estado]);

  const emitirComentarioKabam = (payload) => {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') window.dispatchEvent(new window.CustomEvent('discador:comentario-kabam', { detail: payload }));
  };

  const chamarLead = async (target) => {
    if (!target || !leadElegivel(target) || !deviceRef.current) return;
    clearTimeout(nextTimerRef.current); setActiveId(target.id); setSeg(0); setEstado('dialing'); setErro('');
    try {
      if (navigator.mediaDevices?.getUserMedia) { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach((track) => track.stop()); }
      const call = await deviceRef.current.connect({ params: { To: target.telefone } }); callRef.current = call;
      call.on('accept', (acceptedCall) => { sidRef.current = acceptedCall.parameters?.CallSid || null; setEstado('active'); });
      call.on('disconnect', () => { clearInterval(timerRef.current); setEstado('wrapup'); });
      call.on('cancel', () => setEstado('wrapup'));
      call.on('error', (error) => { setErro(`Erro na ligação: ${mensagemErro(error, 'erro desconhecido')}`); setEstado('wrapup'); });
    } catch (error) { setErro(`Não foi possível ligar: ${mensagemErro(error, 'erro desconhecido')}`); setEstado('idle'); }
  };

  const iniciarAutomatico = () => { const candidato = leadElegivel(lead) ? lead : filaElegivel[0]; if (!candidato) return; clearTimeout(nextTimerRef.current); setAutoAtivo(true); setAutoPausado(false); if (estado === 'idle') chamarLead(candidato); };
  const pausarAutomatico = () => { clearTimeout(nextTimerRef.current); setAutoPausado(true); };
  const alternarAutomatico = () => { if (autoAtivo && !autoPausado) pausarAutomatico(); else iniciarAutomatico(); };
  const encerrar = () => { if (callRef.current) callRef.current.disconnect(); else setEstado('wrapup'); };

  const selecionarResultado = (resultado) => { const configuracao = resultadoDe(resultado); if (!configuracao) return; if (!configuracao.pedeData) { registrar(resultado); return; } setResultadoPendente(resultado); setDataProxima(''); setHoraProxima(''); setErroResultado(''); };
  const confirmarResultado = () => { if (!dataProxima || (resultadoPendente === 'reuniao' && !horaProxima)) { setErroResultado(resultadoPendente === 'reuniao' ? 'Informe a data e o horário da reunião.' : 'Informe a data do retorno.'); return; } registrar(resultadoPendente); };

  async function registrar(resultado) {
    if (!lead) return;
    const configuracao = resultadoDe(resultado); const tentativa = Number(lead.tentativas || 0) + (['nao_atendeu', 'caixa'].includes(resultado) ? 1 : 0); const atingiuLimite = ['nao_atendeu', 'caixa'].includes(resultado) && tentativa >= MAX_TENTATIVAS;
    const dataAgendamento = resultado === 'reuniao' ? dataProxima : ''; const dataRetorno = ['interessado', 'retornar'].includes(resultado) ? dataProxima : ''; const proximaAcao = atingiuLimite ? 'Limite de tentativas — revisar' : proximaAcaoDe(resultado); const notaLimpa = nota.trim();
    try {
      const response = await fetch('/api/ligacoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_id: lead.id, id_lead: lead.idLead || lead.id, sheet_row: lead.sheetRow, nome: lead.nome, telefone: lead.telefone, resultado, duracao_seg: seg, nota: notaLimpa, twilio_sid: sidRef.current, proxima_acao: proximaAcao, data_retorno: dataRetorno, data_agendamento: dataAgendamento, tentativa }) });
      const body = await response.json().catch(() => ({})); if (!response.ok || body.error) throw new Error(body.error || 'Não foi possível salvar o resultado.');
      const entrada = normalizarLigacao({ id: body.ligacao?.id || `local-${Date.now()}`, lead_id: lead.id, resultado, duracao_seg: seg, nota: notaLimpa, created_at: body.ligacao?.created_at || new Date().toISOString() }); setHistorico((atual) => [entrada, ...atual]);
      if (notaLimpa) {
        const payload = body.kabam || { evento: 'discador.comentario', versao: 1, status: 'pendente', sincronizado: false, id_evento: entrada.id, id_lead: lead.id, nome: lead.nome, telefone: lead.telefone, comentario: notaLimpa, resultado, duracao_segundos: seg, data_hora: entrada.created_at, proxima_acao: proximaAcao, data_retorno: dataRetorno, data_agendamento: dataAgendamento, origem: 'Discador EVS', destino: 'Kabam / BotConversa' };
        setKabamOutbox((outbox) => [payload, ...outbox]); emitirComentarioKabam(payload);
      }
    } catch (error) { setErro(mensagemErro(error, 'Não foi possível salvar o resultado da ligação.')); return; }

    const novoStatus = atingiuLimite ? 'limite_tentativas' : configuracao.status;
    const leadsAtualizados = leads.map((item) => item.id === lead.id ? { ...item, status: novoStatus, tentativas: tentativa, observacao: notaLimpa || item.observacao, dataRetorno, dataAgendamento, podeLigar: atingiuLimite ? 'NÃO' : item.podeLigar, motivoBloqueio: atingiuLimite ? 'Limite de tentativas sem atendimento' : item.motivoBloqueio } : item);
    setLeads(leadsAtualizados);
    const candidatos = leadsAtualizados.filter((item) => leadElegivel(item) && String(item.id) !== String(lead.id)); const proximo = candidatos[0] || leadsAtualizados.find(leadElegivel) || null; const continuarAutomatico = Boolean(configuracao.avancaAutomatico && autoAtivo && !autoPausado && proximo);
    if (!proximo) { setAutoAtivo(false); setAutoPausado(true); } else { setActiveId(proximo.id); if (continuarAutomatico) { clearTimeout(nextTimerRef.current); nextTimerRef.current = setTimeout(() => chamarLead(proximo), AUTO_NEXT_DELAY_MS); } else if (autoAtivo) setAutoPausado(true); }
    setNota(''); setSeg(0); sidRef.current = null; setResultadoPendente(null); setDataProxima(''); setHoraProxima(''); setErroResultado(''); setEstado('idle');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">SZ</div><div><div className="brand-name">Discador EVS</div><div className="brand-sub">Equipe que Vende Sozinha</div></div></div>
        <div className="auto-box"><div className="auto-title">Discador <span className={autoAtivo && !autoPausado ? 'state-dot active' : 'state-dot'}>●</span></div><div className="auto-state">{autoAtivo ? (autoPausado ? 'pausado' : 'automático ativo') : 'modo manual'}</div><button className="btn-mode" onClick={alternarAutomatico} disabled={!filaElegivel.length && !autoAtivo}>{autoAtivo && !autoPausado ? 'Pausar' : autoAtivo ? 'Retomar' : 'Iniciar automático'}</button></div>
        <div className="kpis"><Kpi label="Ligações" value={stats.feitas} /><Kpi label="Atendidas" value={stats.atendidas} /><Kpi label="Atendimento" value={`${stats.atendimento}%`} highlight /><Kpi label="Tempo falado" value={fmtTotal(stats.tempo)} /><Kpi label="Agendamentos" value={stats.agendamentos} tone="green" /><Kpi label="Conversão" value={`${stats.conversao}%`} tone="green" highlight /><Kpi label="Na fila" value={stats.fila} /><Kpi label="Retornos" value={stats.retornos} tone="gold" /></div>
        <div className="operator"><div className="operator-avatar">SS</div><div><div className="operator-name">Suzana Santos</div><div className="operator-status">{fonteDados === 'Base_Geral' ? 'Base_Geral · conectada' : fonteDados === 'Supabase' ? 'fallback · Supabase' : pronto ? 'preparando ligação' : 'conectando dados'}</div></div></div>
      </header>

      {erro && <div className="alert-error">{erro}</div>}
      <div className="workspace">
        <aside className="queue-panel"><div className="queue-head"><span>Fila de hoje</span><strong>{filaVisivel.length}</strong></div><div className="queue-filters"><input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar nome, telefone ou negócio" aria-label="Buscar lead" /><select value={filtroFila} onChange={(event) => setFiltroFila(event.target.value)} aria-label="Filtrar fila"><option value="todos">Todos elegíveis</option><option value="retornos">Retornos primeiro</option><option value="novos">Novos leads</option></select></div><div className="queue-list scroll-area">{filaVisivel.map((item) => { const ativo = String(item.id) === String(lead?.id); return <button key={item.id} className={`queue-item ${ativo ? 'selected' : ''}`} onClick={() => estado === 'idle' && setActiveId(item.id)} disabled={estado !== 'idle'}><div className="queue-avatar">{iniciais(item.nome)}</div><div className="queue-copy"><div className="queue-name">{item.nome}</div><div className="queue-business">{item.negocio || 'Negócio não informado'}</div></div>{item.status === 'retornar' && <span className="return-badge">{item.dataRetorno ? fmtDataCurta(item.dataRetorno) : 'retornar'}</span>}</button>; })}{!filaVisivel.length && <div className="empty-state">Nenhum lead elegível nessa visão.</div>}</div></aside>

        <main className="cockpit scroll-area">{!lead ? <div className="empty-card">Nenhum lead disponível. Verifique a fila do banco de dados.</div> : <><section className="lead-card"><div className="lead-header"><div className="lead-avatar">{iniciais(lead.nome)}</div><div className="lead-main"><div className="lead-name">{lead.nome}</div><div className="lead-business">{lead.negocio || 'Negócio não informado'}</div><div className="lead-tags">{lead.origem && <span className="chip origin">{lead.origem}</span>}{lead.instagram && <span className="chip instagram">{lead.instagram}</span>}{lead.tags.map((tag) => <span className="chip tag" key={tag}>{tag}</span>)}</div></div><div className="lead-phone-block"><div className="field-caption">Discando para</div><div className="lead-phone">{fmtTel(lead.telefone)}</div><div className="operator-caption">operadora · Suzana Santos</div></div></div>{bloqueado && <div className="blocked-warning">Este lead está bloqueado para ligação{lead.motivoBloqueio ? `: ${lead.motivoBloqueio}` : '.'}</div>}<div className="qualification-grid"><Qualification label="Negócio" value={lead.negocio} /><Qualification label="Faturamento" value={lead.faturamento} highlight /><Qualification label="Cargo" value={lead.cargo} /><Qualification label="Nº vendedores" value={lead.numeroVendedores} /><Qualification label="Sai 10 dias?" value={lead.dezDias} tone={lead.dezDias === 'Sim' ? 'green' : lead.dezDias === 'Não' ? 'red' : ''} /></div>{lead.desafio && <div className="challenge"><span>Principal desafio</span>{lead.desafio}</div>}{lead.observacao && <div className="last-note"><span>Última anotação</span>{lead.observacao}</div>}</section>

          <section className="call-card"><CallState estado={estado} seconds={seg} />{estado === 'idle' && <><button className="btn-primary btn-call" onClick={() => chamarLead(lead)} disabled={!pronto || bloqueado}><PhoneIcon /> {pronto ? (autoAtivo && !autoPausado ? 'Aguardando próxima...' : 'Ligar manualmente') : 'Conectando…'}</button>{autoAtivo && !autoPausado && <div className="auto-hint">Avança após não atender ou caixa postal, com até {MAX_TENTATIVAS} tentativas por lead.</div>}</>}{(estado === 'dialing' || estado === 'active') && <div className="call-controls">{estado === 'active' && <div className="call-live-note">Microfone ativo no navegador</div>}<button className="btn-primary btn-hangup" onClick={encerrar}><HangupIcon /> Encerrar</button></div>}{estado === 'wrapup' && <div className="disposition"><div className="disposition-title">Como foi a ligação?</div><div className="disposition-grid">{RESULTADOS.map((resultado) => <button key={resultado.key} className="disposition-button" style={{ borderColor: resultado.cor, color: resultado.cor }} onClick={() => selecionarResultado(resultado.key)}>{resultado.label}</button>)}</div>{resultadoPendente && <div className="next-step-box"><div className="next-step-title">Próximo passo: {resultadoDe(resultadoPendente)?.label}</div><div className="next-step-fields"><label>{resultadoPendente === 'reuniao' ? 'Data da reunião' : 'Data do retorno'}<input type="date" value={dataProxima} onChange={(event) => setDataProxima(event.target.value)} /></label>{resultadoPendente === 'reuniao' && <label>Horário<input type="time" value={horaProxima} onChange={(event) => setHoraProxima(event.target.value)} /></label>}</div>{erroResultado && <div className="field-error">{erroResultado}</div>}<div className="next-step-actions"><button className="btn-primary" onClick={confirmarResultado}>Salvar resultado</button><button className="btn-secondary" onClick={() => setResultadoPendente(null)}>Voltar</button></div></div>}<label className="note-label">Anotação da ligação<textarea value={nota} onChange={(event) => setNota(event.target.value)} placeholder="O que o lead disse, próximos passos, objeções..." /></label></div>}</section></>}</main>

        <section className="details-panel"><div className="tabs"><button className={aba === 'ficha' ? 'active' : ''} onClick={() => setAba('ficha')}>Ficha do lead</button><button className={aba === 'historico' ? 'active' : ''} onClick={() => setAba('historico')}>Histórico {histLead.length > 0 && <span>{histLead.length}</span>}</button></div><div className="details-content scroll-area">{!lead && <div className="empty-state">Selecione um lead para ver os detalhes.</div>}{lead && aba === 'ficha' && <div className="lead-form"><ReadOnlyField label="Nome" value={lead.nome} /><ReadOnlyField label="Negócio" value={lead.negocio} /><ReadOnlyField label="Telefone (E.164)" value={lead.telefone} hint="Formato +55 + DDD + número" /><div className="two-columns"><ReadOnlyField label="E-mail" value={lead.email} /><ReadOnlyField label="Instagram" value={lead.instagram} /></div><div className="section-title">Qualificação</div><div className="two-columns"><ReadOnlyField label="Faturamento" value={lead.faturamento} /><ReadOnlyField label="Cargo" value={lead.cargo} /></div><ReadOnlyField label="Número de vendedores" value={lead.numeroVendedores} hint="Campo M da Base_Geral" /><ReadOnlyField label="Consegue ficar 10 dias fora do negócio?" value={lead.dezDias} /><ReadOnlyField label="Principal desafio" value={lead.desafio} multiline /><div className="section-title">Gestão</div><div className="two-columns"><ReadOnlyField label="Origem / etiqueta" value={lead.origem} /><ReadOnlyField label="Status na fila" value={statusLabel[lead.status] || lead.status} /></div><ReadOnlyField label="Resultado" value={lead.resultado} /><ReadOnlyField label="Motivo de bloqueio" value={lead.motivoBloqueio} /><div className="read-only-note">A ficha é alimentada pela Base_Geral. As alterações operacionais da ligação são registradas no histórico.</div></div>}{lead && aba === 'historico' && <div><div className="kabam-box"><strong>Kabam / BotConversa</strong><div>{kabamOutbox.length ? `${kabamOutbox.length} comentário(s) escrito(s) aguardando sincronização.` : 'Comentários escritos ficarão prontos para sincronização.'}</div><small>Preparado · o envio será ligado quando o endpoint do Kabam for definido.</small></div><div className="history-tabs"><button className={escopoHistorico === 'lead' ? 'active' : ''} onClick={() => setEscopoHistorico('lead')}>Deste lead</button><button className={escopoHistorico === 'todas' ? 'active' : ''} onClick={() => setEscopoHistorico('todas')}>Todas carregadas</button></div>{!histExibido.length && <div className="empty-state">Nenhuma ligação registrada ainda.</div>}{histExibido.map((item) => { const resultado = resultadoDe(item.resultado); return <div className="history-item" key={item.id}><div className="history-bar" style={{ background: resultado?.cor || C.suave }} /><div><div className="history-title">{escopoHistorico === 'todas' && <strong>{leads.find((current) => String(current.id) === String(item.lead_id))?.nome || 'Lead'}</strong>}<span style={{ color: resultado?.cor || C.suave }}>{resultado?.label || item.resultado}</span></div><div className="history-meta">{fmtHora(item.created_at)} · {item.duracao_seg > 0 ? fmtCron(item.duracao_seg) : 'sem fala'}</div>{item.nota && <div className="history-note">{item.nota}</div>}{item.nota && <div className="kabam-pending">Comentário pronto para o Kabam</div>}</div></div>; })}</div>}</div></section>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, highlight }) { return <div className="kpi"><div className={`kpi-value ${tone || ''} ${highlight ? 'highlight' : ''}`}>{value}</div><div className="kpi-label">{label}</div></div>; }
function Qualification({ label, value, tone, highlight }) { return <div className="qualification"><div className="qualification-label">{label}</div><div className={`qualification-value ${tone || ''} ${highlight ? 'highlight' : ''}`}>{value || '—'}</div></div>; }
function ReadOnlyField({ label, value, hint, multiline }) { return <label className="read-field"><span>{label}</span>{multiline ? <textarea value={value || ''} readOnly /> : <input value={value || ''} readOnly />}{hint && <small>{hint}</small>}</label>; }
function CallState({ estado, seconds }) { if (estado === 'idle') return <div className="call-idle">Pronto para ligar</div>; const map = { dialing: ['Discando…', 'gold'], active: ['Em ligação', 'green'], wrapup: ['Ligação encerrada', 'muted'] }[estado] || ['Pronto', 'muted']; return <div className="call-state"><div className={`state-indicator ${map[1]}`} /><div className={`call-state-label ${map[1]}`}>{map[0]}</div>{(estado === 'active' || estado === 'wrapup') && <div className="call-timer">{fmtCron(seconds)}</div>}</div>; }
function PhoneIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>; }
function HangupIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" /><line x1="23" y1="1" x2="1" y2="23" /></svg>; }
