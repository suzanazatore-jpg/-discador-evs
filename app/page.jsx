'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { readCallOutcome } from '@/lib/call-outcome.mjs';

const C = {
  vinho: '#6A1F32', vinhoEscuro: '#4E1626', vinhoClaro: '#7C2A3E',
  creme: '#FBF6EC', painel: '#FFFDF9', dourado: '#C6A24C', douradoSuave: '#EADFC0',
  tinta: '#2A211F', suave: '#8C7E76', linha: '#ECE2D2', verde: '#3F7D5B',
  ambar: '#C6862E', vermelho: '#B33A3A',
};

const MAX_TENTATIVAS = 3;
const AUTO_NEXT_DELAY_MS = 900;
const AUTO_REFRESH_MS = 30000;
const PENDING_KEY = 'discador_evs_resultado_pendente_v1';
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
const fmtDataHora = (value) => value ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--/-- --:--';
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
    estoque: valorDe(raw, ['estoque', 'Estoque']) || '',
    produto: valorDe(raw, ['produto', 'Produto']) || '',
    dataCompra: valorDe(raw, ['data_compra', 'dataCompra', 'Data_Compra']) || '',
    equipe: valorDe(raw, ['equipe', 'Equipe']) || '',
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
  const bloqueios = ['nao_ligar', 'nao_deseja_contato', 'agendou_mentoria_meet', 'diagnostico_agendado', 'mentoria_impulso', 'vendido'];
  return ['vendido', 'agendado', 'agendou', 'descartado', 'nao_ligar', 'limite_tentativas'].includes(status) ||
    tags.some((tag) => bloqueios.some((bloqueio) => tag.includes(bloqueio))) ||
    normalizarTexto(lead.produto).replace(/[\s-]+/g, '_').includes('mentoria_impulso') ||
    Boolean(lead.dataAgendamento) ||
    ['nao', 'nao_ligar'].includes(podeLigar) ||
    lead.podeLigar === false;
}

function leadElegivel(lead) {
  return Boolean(lead) && ['novo', 'retornar'].includes(normalizarTexto(lead.status)) && Number(lead.tentativas || 0) < MAX_TENTATIVAS && !leadBloqueado(lead);
}

function safeStorageRead(key, fallback) { try { if (typeof window === 'undefined') return fallback; const value = window.localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; } }
function safeStorageWrite(key, value) { try { if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
function mensagemErro(error, fallback) { if (!error) return fallback; const code = error.code ? `[${error.code}] ` : ''; return `${code}${error.message || error.description || fallback}`; }
async function obterToken() { const response = await fetch('/api/token', { cache: 'no-store', signal: AbortSignal.timeout(15000) }); if (response.status === 401) { window.location.assign('/login'); throw new Error('Sessão expirada. Entre novamente.'); } const body = await response.json().catch(() => ({})); if (!response.ok || !body.token) throw new Error(body.error || 'O servidor não conseguiu gerar o token do Twilio.'); return body.token; }
function normalizarLigacao(raw, index) { return { id: raw.id ?? `local-${index}`, lead_id: raw.lead_id ?? raw.leadId, resultado: raw.resultado || '', duracao_seg: Number(raw.duracao_seg ?? raw.duracao ?? 0), nota: raw.nota || raw.obs || '', tentativa: Number(raw.tentativa || 0), created_at: raw.created_at || raw.ts || new Date().toISOString() }; }
function proximaAcaoDe(resultado) { if (resultado === 'reuniao') return 'Aguardar reunião'; if (resultado === 'interessado' || resultado === 'retornar') return 'Retornar contato'; if (resultado === 'nao_atendeu' || resultado === 'caixa') return 'Tentar novamente'; return 'Sem ação'; }

export default function DiscadorEVS() {
  const [leads, setLeads] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [pendente, setPendente] = useState(null);
  const [deviceRetry, setDeviceRetry] = useState(0);
  const leadsRef = useRef([]);
  const registrarRef = useRef(null);
  const chamarRef = useRef(null);
  const saveRef = useRef(false);
  const pendingRef = useRef(null);
  const dialingRef = useRef(false);
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
  const [atualizando, setAtualizando] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);

  const deviceRef = useRef(null);
  const callRef = useRef(null);
  const timerRef = useRef(null);
  const nextTimerRef = useRef(null);
  const statusTimerRef = useRef(null);
  const callGenerationRef = useRef(0);
  const dataRevisionRef = useRef(0);
  const sidRef = useRef(null);
  const refreshRef = useRef(false);
  const callAcceptedRef = useRef(false);
  const automaticRecordingRef = useRef(false);
  const manualHangupRef = useRef(false);
  const autoAtivoRef = useRef(false);
  const autoPausadoRef = useRef(true);

  leadsRef.current = leads;

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

  const lead = pendente?.lead || leads.find((item) => String(item.id) === String(activeId)) || filaElegivel[0] || leads[0] || null;
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

  useEffect(() => {
    const saved = safeStorageRead(PENDING_KEY, null);
    if (saved?.payload?.event_id && saved?.lead) {
      pendingRef.current = saved;
      setPendente(saved);
      setActiveId(saved.lead.id);
      setEstado('wrapup');
      setErro('Há um resultado pendente. Salve novamente antes de continuar.');
    }
  }, []);

  useEffect(() => { setKabamOutbox(safeStorageRead(OUTBOX_KEY, [])); }, []);
  useEffect(() => { safeStorageWrite(OUTBOX_KEY, kabamOutbox); }, [kabamOutbox]);


  const carregarDados = async ({ silencioso = false } = {}) => {
    if (refreshRef.current || pendingRef.current || callRef.current || dialingRef.current) return;
    refreshRef.current = true;
    const revision = dataRevisionRef.current;
    if (!silencioso) setAtualizando(true);

    try {
      const [filaResponse, ligacoesResponse] = await Promise.all([
        fetch('/api/fila', { cache: 'no-store', signal: AbortSignal.timeout(25000) }),
        fetch('/api/ligacoes', { cache: 'no-store', signal: AbortSignal.timeout(25000) }),
      ]);

      if (filaResponse.status === 401 || ligacoesResponse.status === 401) {
        window.location.assign('/login');
        return;
      }

      const filaBody = await filaResponse.json().catch(() => ({}));
      if (!filaResponse.ok || filaBody.error) {
        throw new Error(filaBody.error || 'Falha ao carregar a fila.');
      }

      // A refresh started before dialing must not replace a live call or a saved result.
      if (callRef.current || dialingRef.current || pendingRef.current || revision !== dataRevisionRef.current) return;
      const carregados = (filaBody.leads || []).map(normalizarLead);
      leadsRef.current = carregados;
      setLeads(carregados);
      setActiveId((currentId) => (
        carregados.some((item) => String(item.id) === String(currentId))
          ? currentId
          : carregados.find(leadElegivel)?.id || carregados[0]?.id || null
      ));
      setFonteDados(filaBody.source || '');

      const ligacoesBody = await ligacoesResponse.json().catch(() => ({}));
      if (ligacoesResponse.ok && !ligacoesBody.error) {
        setHistorico((ligacoesBody.ligacoes || []).map(normalizarLigacao));
        if (ligacoesBody.source) setFonteDados(ligacoesBody.source);
      }

      setUltimaAtualizacao(new Date());
      if (!silencioso && !pendingRef.current) setErro('');
    } catch (error) {
      pausarAutomatico();
      setErro(mensagemErro(error, 'Falha ao atualizar a fila.'));
    } finally {
      refreshRef.current = false;
      setAtualizando(false);
    }
  };

  useEffect(() => {
    let desmontado = false; let device = null;
    (async () => {
      await carregarDados();
      if (desmontado) return;

      try {
        const token = await obterToken(); const { Device } = await import('@twilio/voice-sdk');
        if (!Device.isSupported) throw new Error('Este navegador não é compatível com o Twilio Voice.');
        device = new Device(token, { codecPreferences: ['opus', 'pcmu'], logLevel: 1, tokenRefreshMs: 60000 });
        device.on('error', (error) => { pausarAutomatico(); setErro(mensagemErro(error, 'O Twilio não conseguiu iniciar a ligação.')); setPronto(false); });
        device.on('tokenWillExpire', async () => { try { device.updateToken(await obterToken()); setPronto(true); } catch (error) { pausarAutomatico(); setErro(mensagemErro(error, 'Não foi possível renovar o token do Twilio.')); setPronto(false); } });
        if (desmontado) { device.destroy(); return; }
        deviceRef.current = device; setPronto(true);
      } catch (error) { if (!desmontado) setErro(mensagemErro(error, 'Falha ao conectar no Twilio. Confira as credenciais.')); }
    })();
    return () => { desmontado = true; clearInterval(timerRef.current); clearTimeout(nextTimerRef.current); clearTimeout(statusTimerRef.current); callGenerationRef.current += 1; deviceRef.current = null; device?.destroy(); };
  }, [deviceRetry]);

  useEffect(() => { if (estado === 'active') timerRef.current = setInterval(() => setSeg((seconds) => seconds + 1), 1000); return () => clearInterval(timerRef.current); }, [estado]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (estado === 'idle') carregarDados({ silencioso: true });
    }, AUTO_REFRESH_MS);

    return () => clearInterval(interval);
  }, [estado]);

  const emitirComentarioKabam = (payload) => {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') window.dispatchEvent(new window.CustomEvent('discador:comentario-kabam', { detail: payload }));
  };

  const registrarNaoAtendimentoAutomatico = (target, confirmado = false) => {
    if (!target || automaticRecordingRef.current || saveRef.current || pendingRef.current) return;
    if (manualHangupRef.current || (callAcceptedRef.current && !confirmado)) { setEstado('wrapup'); return; }

    automaticRecordingRef.current = true;
    setEstado('wrapup');

    registrarRef.current('nao_atendeu', target, {
      automatico: true,
      duracao_seg: 0,
    }).finally(() => {
      automaticRecordingRef.current = false;
    });
  };

  const chamarLead = async (target) => {
    if (dialingRef.current || callRef.current || saveRef.current || pendingRef.current || estado !== 'idle') return;
    target = leadsRef.current.find((item) => String(item.id) === String(target?.id));
    if (!target || !leadElegivel(target) || !deviceRef.current || !pronto) {
      pausarAutomatico();
      setErro('Não foi possível iniciar: confira a fila e reconecte o telefone.');
      return;
    }
    const automatico = autoAtivoRef.current && !autoPausadoRef.current;
    dialingRef.current = true;
    const generation = ++callGenerationRef.current;
    dataRevisionRef.current += 1;

    clearTimeout(nextTimerRef.current);
    setActiveId(target.id);
    setSeg(0);
    sidRef.current = null;
    setEstado('dialing');
    setErro('');
    callAcceptedRef.current = false;
    automaticRecordingRef.current = false;
    manualHangupRef.current = false;

    try {
      deviceRef.current.updateToken(await obterToken());
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }

      if (manualHangupRef.current || (automatico && autoPausadoRef.current)) { setEstado('idle'); return; }
      const call = await deviceRef.current.connect({
        params: {
          To: target.telefone,
          LeadId: target.idLead || target.id,
          SheetRow: target.sheetRow || '',
          Attempt: Number(target.tentativas || 0) + 1,
        },
      });

      callRef.current = call;
      let terminou = false;
      const vigente = () => generation === callGenerationRef.current;
      const finalizar = async (error = null, confirmed = null) => {
        if (terminou || !vigente()) return;
        terminou = true;
        clearTimeout(statusTimerRef.current);
        clearInterval(timerRef.current);
        sidRef.current = call.parameters?.CallSid || sidRef.current;
        const manual = manualHangupRef.current;
        setEstado('checking');
        try {
          const outcome = manual ? null : (confirmed || await readCallOutcome(sidRef.current));
          if (!vigente()) return;
          // Release the browser connection only after a terminal event/status.
          // Late SDK events are ignored by the guard above.
          call.disconnect();
          callRef.current = null;
          if (outcome?.noAnswer) {
            registrarNaoAtendimentoAutomatico(target, true);
          } else if (manual || outcome?.status === 'completed') {
            setEstado('wrapup');
          } else {
            pausarAutomatico();
            setErro(error ? mensagemErro(error, 'Falha técnica na ligação.') : `Chamada sem atendimento confirmado (${outcome?.status || 'desconhecido'}). Nenhuma tentativa foi descontada.`);
            setEstado('wrapup');
          }
        } catch (statusError) {
          if (!vigente()) return;
          call.disconnect();
          callRef.current = null;
          pausarAutomatico();
          setErro(mensagemErro(statusError, 'Não foi possível confirmar o resultado. Confira o atendimento antes de salvar.'));
          setEstado('wrapup');
        }
      };
      const monitorar = async () => {
        if (terminou || !vigente()) return;
        const sid = call.parameters?.CallSid;
        if (sid) {
          sidRef.current = sid;
          try {
            const outcome = await readCallOutcome(sid, { attempts: 1 });
            if (terminou || !vigente()) return;
            if (outcome.terminal) { await finalizar(null, outcome); return; }
          } catch (error) {
            if (terminou || !vigente()) return;
            // Do not hang up a conversation because a status read failed.
            setErro('Verificação da chamada indisponível. Você pode encerrar pelo botão Encerrar.');
          }
        }
        if (call.status?.() === 'closed') { await finalizar(); return; }
        statusTimerRef.current = setTimeout(monitorar, 15000);
      };
      call.on('ringing', () => {
        if (terminou || !vigente()) return;
        sidRef.current = call.parameters?.CallSid || sidRef.current;
        setEstado('dialing');
      });
      call.on('accept', (acceptedCall) => {
        if (terminou || !vigente()) return;
        callAcceptedRef.current = true;
        sidRef.current = acceptedCall.parameters?.CallSid || call.parameters?.CallSid || null;
        setEstado('active');
      });
      call.on('disconnect', () => finalizar());
      call.on('cancel', () => finalizar());
      call.on('reject', () => finalizar());
      call.on('error', (error) => finalizar(error));
      statusTimerRef.current = setTimeout(monitorar, 35000);
      if (manualHangupRef.current) { call.disconnect(); await finalizar(); }
    } catch (error) {
      manualHangupRef.current = true;
      pausarAutomatico();
      setErro('Não foi possível ligar: ' + mensagemErro(error, 'erro desconhecido'));
      setEstado('idle');
    } finally {
      dialingRef.current = false;
    }
  };
  chamarRef.current = chamarLead;

  const iniciarAutomatico = () => {
    if (!pronto || pendingRef.current || saveRef.current || estado !== 'idle') {
      setErro('Reconecte o telefone ou salve o resultado pendente antes de iniciar.');
      return;
    }
    const candidato = leadElegivel(lead) ? lead : filaElegivel[0];
    if (!candidato) return;

    clearTimeout(nextTimerRef.current);
    autoAtivoRef.current = true;
    autoPausadoRef.current = false;
    setAutoAtivo(true);
    setAutoPausado(false);

    if (estado === 'idle') chamarLead(candidato);
  };

  const pausarAutomatico = () => {
    clearTimeout(nextTimerRef.current);
    autoPausadoRef.current = true;
    setAutoPausado(true);
  };

  const alternarAutomatico = () => { if (autoAtivo && !autoPausado) pausarAutomatico(); else iniciarAutomatico(); };
  const encerrar = () => {
    manualHangupRef.current = true;
    if (callRef.current) callRef.current.disconnect();
    else { pausarAutomatico(); setEstado('idle'); }
  };

  const sair = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.assign('/login');
  };

  const selecionarResultado = (resultado) => { const configuracao = resultadoDe(resultado); if (!configuracao) return; setResultadoPendente(resultado); setDataProxima(''); setHoraProxima(''); setErroResultado(''); };
  const confirmarResultado = () => { const precisaData = ['reuniao', 'interessado', 'retornar'].includes(resultadoPendente); if (precisaData && (!dataProxima || (resultadoPendente === 'reuniao' && !horaProxima))) { setErroResultado(resultadoPendente === 'reuniao' ? 'Informe a data e o horário da reunião.' : 'Informe a data do retorno.'); return; } registrar(resultadoPendente); };

  async function registrar(resultado, leadOverride = null, options = {}) {
    const leadAtual = leadOverride || lead;
    if (!leadAtual || saveRef.current || !resultadoDe(resultado)) return;
    saveRef.current = true;
    setSalvando(true);
    dataRevisionRef.current += 1;

    const configuracao = resultadoDe(resultado);
    const tentativa = pendingRef.current?.payload.tentativa ?? Number(leadAtual.tentativas || 0) + (['nao_atendeu', 'caixa'].includes(resultado) ? 1 : 0);
    const atingiuLimite = ['nao_atendeu', 'caixa'].includes(resultado) && tentativa >= MAX_TENTATIVAS;
    const dataAgendamento = pendingRef.current?.payload.data_agendamento ?? (resultado === 'reuniao' ? `${dataProxima}T${horaProxima || '00:00'}:00` : '');
    const dataRetorno = pendingRef.current?.payload.data_retorno ?? (['interessado', 'retornar'].includes(resultado) ? dataProxima : '');
    const proximaAcao = atingiuLimite ? 'Limite de tentativas — revisar' : proximaAcaoDe(resultado);
    const duracaoAtual = pendingRef.current?.payload.duracao_seg ?? options.duracao_seg ?? seg;
    const notaAtual = pendingRef.current?.payload.nota ?? options.nota ?? nota;
    const notaLimpa = String(notaAtual || '').trim();

    const saved = pendingRef.current || {
      lead: leadAtual,
      payload: {
        event_id: `EVS-${crypto.randomUUID()}`,
        lead_id: leadAtual.id,
        id_lead: leadAtual.idLead || leadAtual.id,
        sheet_row: leadAtual.sheetRow,
        nome: leadAtual.nome,
        telefone: leadAtual.telefone,
        resultado,
        duracao_seg: duracaoAtual,
        nota: notaLimpa,
        twilio_sid: sidRef.current,
        proxima_acao: proximaAcao,
        data_retorno: dataRetorno,
        data_agendamento: dataAgendamento,
        tentativa,
      },
    };
    pendingRef.current = saved;
    setPendente(saved);
    try {
      window.localStorage.setItem(PENDING_KEY, JSON.stringify(saved));
      const response = await fetch('/api/ligacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify(saved.payload),
      });
      if (response.status === 401) {
        pausarAutomatico();
        window.location.assign('/login');
        return;
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.error) {
        throw new Error(body.error || 'Não foi possível salvar o resultado.');
      }

      const entrada = normalizarLigacao({
        id: body.ligacao?.id || 'local-' + Date.now(),
        lead_id: leadAtual.id,
        resultado,
        duracao_seg: duracaoAtual,
        nota: notaLimpa,
        tentativa,
        created_at: body.ligacao?.created_at || new Date().toISOString(),
      });

      setHistorico((atual) => [entrada, ...atual]);

      if (notaLimpa) {
        const payload = body.kabam || {
          evento: 'discador.comentario',
          versao: 1,
          status: 'pendente',
          sincronizado: false,
          id_evento: entrada.id,
          id_lead: leadAtual.id,
          nome: leadAtual.nome,
          telefone: leadAtual.telefone,
          comentario: notaLimpa,
          resultado,
          duracao_segundos: duracaoAtual,
          data_hora: entrada.created_at,
          proxima_acao: proximaAcao,
          data_retorno: dataRetorno,
          data_agendamento: dataAgendamento,
          origem: 'Discador EVS',
          destino: 'Kabam / BotConversa',
        };

        setKabamOutbox((outbox) => [payload, ...outbox]);
        emitirComentarioKabam(payload);
      }
    } catch (error) {
      pausarAutomatico();
      setActiveId(leadAtual.id);
      setEstado('wrapup');
      setErro(mensagemErro(error, 'Não foi possível salvar o resultado.'));
      return;
    } finally {
      saveRef.current = false;
      setSalvando(false);
    }

    pendingRef.current = null;
    setPendente(null);
    safeStorageWrite(PENDING_KEY, null);
    setErro('');
    const novoStatus = atingiuLimite ? 'limite_tentativas' : configuracao.status;
    const leadsAtualizados = leadsRef.current.map((item) => (
      item.id === leadAtual.id
        ? {
            ...item,
            status: novoStatus,
            tentativas: tentativa,
            observacao: notaLimpa || item.observacao,
            dataRetorno,
            dataAgendamento,
            podeLigar: atingiuLimite ? 'NÃO' : item.podeLigar,
            motivoBloqueio: atingiuLimite
              ? 'Limite de tentativas sem atendimento'
              : item.motivoBloqueio,
          }
        : item
    ));

    // Move the attempted lead to the end, so A -> B -> C instead of A -> B -> A.
    const attemptedIndex = leadsAtualizados.findIndex((item) => String(item.id) === String(leadAtual.id));
    if (attemptedIndex >= 0) leadsAtualizados.push(...leadsAtualizados.splice(attemptedIndex, 1));
    leadsRef.current = leadsAtualizados;
    setLeads(leadsAtualizados);

    const candidatos = leadsAtualizados.filter(
      (item) => leadElegivel(item) && String(item.id) !== String(leadAtual.id)
    );
    const proximo = candidatos[0] || leadsAtualizados.find(leadElegivel) || null;
    const continuarAutomatico = Boolean(
      configuracao.avancaAutomatico
      && autoAtivoRef.current
      && !autoPausadoRef.current
      && proximo
    );

    if (!proximo) {
      clearTimeout(nextTimerRef.current);
      autoAtivoRef.current = false;
      autoPausadoRef.current = true;
      setAutoAtivo(false);
      setAutoPausado(true);
    } else {
      setActiveId(proximo.id);

      if (continuarAutomatico) {
        clearTimeout(nextTimerRef.current);
        autoPausadoRef.current = false;
        setAutoPausado(false);
        nextTimerRef.current = setTimeout(() => { if (autoAtivoRef.current && !autoPausadoRef.current) chamarRef.current(proximo); }, AUTO_NEXT_DELAY_MS);
      } else if (autoAtivoRef.current) {
        autoPausadoRef.current = true;
        setAutoPausado(true);
      }
    }

    setNota('');
    setSeg(0);
    sidRef.current = null;
    setResultadoPendente(null);
    setDataProxima('');
    setHoraProxima('');
    setErroResultado('');
    setEstado('idle');
    callRef.current = null;
    manualHangupRef.current = false;
  }


  async function naoLigarMais() {
    if (!lead || bloqueado || estado !== 'idle' || saveRef.current || pendingRef.current || dialingRef.current || callRef.current) return;
    pausarAutomatico();
    const target = lead;
    if (!window.confirm(`Não ligar mais para ${target.nome} (${fmtTel(target.telefone)})? O histórico será mantido.`)) return;
    saveRef.current = true;
    dataRevisionRef.current += 1;
    setSalvando(true);
    setErro('');
    try {
      const response = await fetch('/api/leads/bloquear', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({lead_id: target.id, id_lead: target.idLead,
          sheet_row: target.sheetRow, telefone: target.telefone}),
      });
      if (response.status === 401) { window.location.assign('/login'); return; }
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok || !body.lead) throw new Error(body.error || 'A base não confirmou o bloqueio.');
      const updated = leadsRef.current.map((item) => String(item.id) === String(target.id)
        ? {...item, status: 'descartado', podeLigar: 'NÃO', tagsPabbly: body.lead.tags_pabbly,
          motivoBloqueio: body.lead.motivo_bloqueio} : item);
      leadsRef.current = updated;
      setLeads(updated);
      setActiveId(updated.find(leadElegivel)?.id || null);
    } catch (error) {
      setErro(mensagemErro(error, 'Não foi possível retirar o contato. Tente novamente.'));
    } finally { saveRef.current = false; setSalvando(false); }
  }

  registrarRef.current = registrar;
  const repetirSalvamento = () => {
    const saved = pendingRef.current;
    if (!saved) return;
    return registrar(saved.payload.resultado, saved.lead, {
      duracao_seg: saved.payload.duracao_seg, nota: saved.payload.nota,
    });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">SZ</div><div><div className="brand-name">Discador EVS</div><div className="brand-sub">Equipe que Vende Sozinha</div></div></div>
        <div className="auto-box"><div className="auto-title">Discador <span className={autoAtivo && !autoPausado ? 'state-dot active' : 'state-dot'}>●</span></div><div className="auto-state">{autoAtivo ? (autoPausado ? 'pausado' : 'automático ativo') : 'modo manual'}</div><button className="btn-mode" onClick={alternarAutomatico} disabled={(!filaElegivel.length && !autoAtivo) || (!autoAtivo || autoPausado) && (!pronto || estado !== 'idle' || Boolean(pendente) || salvando)}>{autoAtivo && !autoPausado ? 'Pausar' : autoAtivo ? 'Retomar' : 'Iniciar automático'}</button></div>
        <div className="kpis"><Kpi label="Ligações" value={stats.feitas} /><Kpi label="Atendidas" value={stats.atendidas} /><Kpi label="Atendimento" value={`${stats.atendimento}%`} highlight /><Kpi label="Tempo falado" value={fmtTotal(stats.tempo)} /><Kpi label="Agendamentos" value={stats.agendamentos} tone="green" /><Kpi label="Conversão" value={`${stats.conversao}%`} tone="green" highlight /><Kpi label="Na fila" value={stats.fila} /><Kpi label="Retornos" value={stats.retornos} tone="gold" /></div>
        <div className="refresh-box"><button className="btn-refresh" onClick={() => carregarDados()} disabled={atualizando}><RefreshIcon />{atualizando ? 'Atualizando…' : 'Atualizar fila'}</button><div className="refresh-status">{ultimaAtualizacao ? `Atualizada às ${fmtHora(ultimaAtualizacao)}` : 'Aguardando dados'}</div></div>
        <div className="operator"><div className="operator-avatar">SS</div><div><div className="operator-name">Suzana Santos</div><div className="operator-status">{fonteDados === 'Base_Geral' ? 'Base_Geral · conectada' : fonteDados === 'Supabase' ? 'fallback · Supabase' : pronto ? 'preparando ligação' : 'conectando dados'}</div></div><button className="logout-btn" onClick={sair}>Sair</button></div>
      </header>

      {erro && <div className="alert-error">{erro}</div>}
      {!pronto && estado === 'idle' && <button className="btn-secondary" onClick={() => { setPronto(false); setDeviceRetry((n) => n + 1); }}>Reconectar telefone</button>}
      {pendente && <div className="alert-error">Resultado pendente de salvamento. <button className="btn-secondary" disabled={salvando} onClick={repetirSalvamento}>{salvando ? 'Salvando…' : 'Salvar novamente'}</button></div>}
      <div className="workspace">
        <aside className="queue-panel"><div className="queue-head"><span>Fila de hoje</span><strong>{filaVisivel.length}</strong></div><div className="queue-filters"><input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar nome, telefone ou negócio" aria-label="Buscar lead" /><select value={filtroFila} onChange={(event) => setFiltroFila(event.target.value)} aria-label="Filtrar fila"><option value="todos">Todos elegíveis</option><option value="retornos">Retornos primeiro</option><option value="novos">Novos leads</option></select></div><div className="queue-list scroll-area">{filaVisivel.map((item) => { const ativo = String(item.id) === String(lead?.id); return <button key={item.id} className={`queue-item ${ativo ? 'selected' : ''}`} onClick={() => estado === 'idle' && setActiveId(item.id)} disabled={estado !== 'idle'}><div className="queue-avatar">{iniciais(item.nome)}</div><div className="queue-copy"><div className="queue-name">{item.nome}</div><div className="queue-business">{item.negocio || 'Negócio não informado'}</div></div>{item.status === 'retornar' && <span className="return-badge">{item.dataRetorno ? fmtDataCurta(item.dataRetorno) : 'retornar'}</span>}</button>; })}{!filaVisivel.length && <div className="empty-state">Nenhum lead elegível nessa visão.</div>}</div></aside>

        <main className="cockpit scroll-area">{!lead ? <div className="empty-card">Nenhum lead disponível. Verifique a fila do banco de dados.</div> : <><section className="lead-card"><div className="lead-header"><div className="lead-avatar">{iniciais(lead.nome)}</div><div className="lead-main"><div className="lead-name">{lead.nome}</div><div className="lead-business">{lead.negocio || 'Negócio não informado'}</div><div className="lead-tags">{lead.origem && <span className="chip origin">{lead.origem}</span>}{lead.instagram && <span className="chip instagram">{lead.instagram}</span>}{lead.tags.map((tag) => <span className="chip tag" key={tag}>{tag}</span>)}</div></div><div className="lead-phone-block"><div className="field-caption">Discando para</div><div className="lead-phone">{fmtTel(lead.telefone)}</div><div className="operator-caption">operadora · Suzana Santos</div></div></div>{bloqueado && <div className="blocked-warning">Este lead está bloqueado para ligação{lead.motivoBloqueio ? `: ${lead.motivoBloqueio}` : '.'}</div>}<div className="qualification-grid"><Qualification label="Negócio" value={lead.negocio} /><Qualification label="Faturamento" value={lead.faturamento} highlight /><Qualification label="Cargo" value={lead.cargo} /><Qualification label="Nº vendedores" value={lead.numeroVendedores} /><Qualification label="Sai 10 dias?" value={lead.dezDias} tone={lead.dezDias === 'Sim' ? 'green' : lead.dezDias === 'Não' ? 'red' : ''} /></div>{lead.desafio && <div className="challenge"><span>Principal desafio</span>{lead.desafio}</div>}{lead.observacao && <div className="last-note"><span>Última anotação</span>{lead.observacao}</div>}</section>

<section className="call-card"><CallState estado={estado} seconds={seg} />{estado === 'idle' && <><button className="btn-primary btn-call" onClick={() => chamarLead(lead)} disabled={!pronto || !leadElegivel(lead) || Boolean(pendente) || salvando}><PhoneIcon /> {pronto ? (autoAtivo && !autoPausado ? 'Aguardando próxima...' : 'Ligar manualmente') : 'Conectando…'}</button>{autoAtivo && !autoPausado && <div className="auto-hint">Avança após não atender ou caixa postal, com até {MAX_TENTATIVAS} tentativas por lead.</div>}</>}{(estado === 'dialing' || estado === 'active') && <div className="call-controls">{estado === 'active' && <div className="call-live-note">Microfone ativo no navegador</div>}<button className="btn-primary btn-hangup" onClick={encerrar}><HangupIcon /> Encerrar</button></div>}{estado === 'wrapup' && <div className="disposition"><div className="disposition-title">Como foi a ligação?</div><div className="disposition-grid">{RESULTADOS.map((resultado) => <button key={resultado.key} className="disposition-button" style={{ borderColor: resultado.cor, color: resultado.cor }} disabled={salvando || Boolean(pendente)} onClick={() => selecionarResultado(resultado.key)}>{resultado.label}</button>)}</div>{resultadoPendente && <div className="next-step-box"><div className="next-step-title">Próximo passo: {resultadoDe(resultadoPendente)?.label}</div>{['reuniao', 'interessado', 'retornar'].includes(resultadoPendente) && <div className="next-step-fields"><label>{resultadoPendente === 'reuniao' ? 'Data da reunião' : 'Data do retorno'}<input type="date" value={dataProxima} onChange={(event) => setDataProxima(event.target.value)} /></label>{resultadoPendente === 'reuniao' && <label>Horário<input type="time" value={horaProxima} onChange={(event) => setHoraProxima(event.target.value)} /></label>}</div>}{erroResultado && <div className="field-error">{erroResultado}</div>}<div className="next-step-actions"><button className="btn-primary" disabled={salvando || Boolean(pendente)} onClick={confirmarResultado}>Salvar resultado</button><button className="btn-secondary" disabled={salvando || Boolean(pendente)} onClick={() => setResultadoPendente(null)}>Voltar</button></div></div>}</div>}<label className={`note-label ${estado === 'active' ? 'note-live' : ''}`}><span>{estado === 'active' ? 'Anotação durante o atendimento' : estado === 'wrapup' ? 'O que aconteceu neste atendimento?' : 'Anotação deste atendimento'}</span><textarea value={nota} onChange={(event) => setNota(event.target.value)} placeholder="Escreva o que aconteceu, se não atendeu, objeções, próximos passos…" /><small>Essa anotação será salva neste registro e ficará no histórico do lead.</small></label></section></>}</main>

        <section className="details-panel"><div className="tabs"><button className={aba === 'ficha' ? 'active' : ''} onClick={() => setAba('ficha')}>Ficha do lead</button><button className={aba === 'historico' ? 'active' : ''} onClick={() => setAba('historico')}>Histórico {histLead.length > 0 && <span>{histLead.length}</span>}</button></div><div className="details-content scroll-area">{!lead && <div className="empty-state">Selecione um lead para ver os detalhes.</div>}{lead && aba === 'ficha' && <div className="lead-form"><ReadOnlyField label="Nome" value={lead.nome} /><ReadOnlyField label="Negócio" value={lead.negocio} /><ReadOnlyField label="Telefone (E.164)" value={lead.telefone} hint="Formato +55 + DDD + número" /><div className="two-columns"><ReadOnlyField label="E-mail" value={lead.email} /><ReadOnlyField label="Instagram" value={lead.instagram} /></div><div className="section-title">Qualificação</div><div className="two-columns"><ReadOnlyField label="Faturamento" value={lead.faturamento} /><ReadOnlyField label="Cargo" value={lead.cargo} /></div><ReadOnlyField label="Número de vendedores" value={lead.numeroVendedores} hint="Campo M da Base_Geral" /><ReadOnlyField label="Consegue ficar 10 dias fora do negócio?" value={lead.dezDias} /><ReadOnlyField label="Principal desafio" value={lead.desafio} multiline /><div className="section-title">Gestão</div><button className="btn-secondary" type="button" onClick={naoLigarMais} disabled={bloqueado || estado !== 'idle' || Boolean(pendente) || salvando}>{salvando ? 'Salvando…' : 'Não ligar mais'}</button><div className="two-columns"><ReadOnlyField label="Origem / etiqueta" value={lead.origem} /><ReadOnlyField label="Status na fila" value={statusLabel[lead.status] || lead.status} /></div><ReadOnlyField label="Resultado" value={lead.resultado} /><ReadOnlyField label="Motivo de bloqueio" value={lead.motivoBloqueio} /><div className="read-only-note">A ficha é alimentada pela Base_Geral. As alterações operacionais da ligação são registradas no histórico.</div></div>}{lead && aba === 'historico' && <div><div className="kabam-box"><strong>Kabam / BotConversa</strong><div>{kabamOutbox.length ? `${kabamOutbox.length} comentário(s) escrito(s) aguardando sincronização.` : 'Comentários escritos ficarão prontos para sincronização.'}</div><small>Preparado · o envio será ligado quando o endpoint do Kabam for definido.</small></div><div className="history-tabs"><button className={escopoHistorico === 'lead' ? 'active' : ''} onClick={() => setEscopoHistorico('lead')}>Deste lead</button><button className={escopoHistorico === 'todas' ? 'active' : ''} onClick={() => setEscopoHistorico('todas')}>Todas carregadas</button></div>{!histExibido.length && <div className="empty-state">Nenhuma ligação registrada ainda.</div>}{histExibido.map((item) => { const resultado = resultadoDe(item.resultado); return <div className="history-item" key={item.id}><div className="history-bar" style={{ background: resultado?.cor || C.suave }} /><div><div className="history-title">{escopoHistorico === 'todas' && <strong>{leads.find((current) => String(current.id) === String(item.lead_id))?.nome || 'Lead'}</strong>}<span style={{ color: resultado?.cor || C.suave }}>{resultado?.label || item.resultado}</span></div><div className="history-meta">{fmtDataHora(item.created_at)} · {item.tentativa ? `Tentativa ${item.tentativa}` : 'Atendimento registrado'} · {item.duracao_seg > 0 ? fmtCron(item.duracao_seg) : 'sem fala'}</div>{item.nota && <div className="history-note">{item.nota}</div>}{item.nota && <div className="kabam-pending">Comentário pronto para o Kabam</div>}</div></div>; })}</div>}</div></section>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, highlight }) { return <div className="kpi"><div className={`kpi-value ${tone || ''} ${highlight ? 'highlight' : ''}`}>{value}</div><div className="kpi-label">{label}</div></div>; }
function Qualification({ label, value, tone, highlight }) { return <div className="qualification"><div className="qualification-label">{label}</div><div className={`qualification-value ${tone || ''} ${highlight ? 'highlight' : ''}`}>{value || '—'}</div></div>; }
function ReadOnlyField({ label, value, hint, multiline }) { return <label className="read-field"><span>{label}</span>{multiline ? <textarea value={value || ''} readOnly /> : <input value={value || ''} readOnly />}{hint && <small>{hint}</small>}</label>; }
function CallState({ estado, seconds }) { if (estado === 'idle') return <div className="call-idle">Pronto para ligar</div>; const map = { dialing: ['Discando…', 'gold'], checking: ['Conferindo resultado…', 'gold'], active: ['Em ligação', 'green'], wrapup: ['Ligação encerrada', 'muted'] }[estado] || ['Pronto', 'muted']; return <div className="call-state"><div className={`state-indicator ${map[1]}`} /><div className={`call-state-label ${map[1]}`}>{map[0]}</div>{(estado === 'active' || estado === 'wrapup') && <div className="call-timer">{fmtCron(seconds)}</div>}</div>; }
function RefreshIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" /></svg>; }
function PhoneIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>; }
function HangupIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" /><line x1="23" y1="1" x2="1" y2="23" /></svg>; }
