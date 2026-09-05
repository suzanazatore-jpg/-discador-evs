'use client';

import React, { useState, useEffect, useRef } from 'react';

const C = {
  burgundy: '#5A1A28', burgundyDark: '#3E1019', cream: '#FBF6EF',
  gold: '#C9A24B', ink: '#2A1418', muted: '#8A7A72', line: '#E7DDD2', green: '#3F7D5A',
};

const RESULTADOS = [
  { key: 'reuniao', label: 'Agendou reunião', tom: 'success' },
  { key: 'interessado', label: 'Interessada — retornar', tom: 'gold' },
  { key: 'retornar', label: 'Retornar depois', tom: 'neutral' },
  { key: 'nao_atendeu', label: 'Não atendeu', tom: 'neutral' },
  { key: 'numero_errado', label: 'Número errado', tom: 'neutral' },
  { key: 'sem_interesse', label: 'Sem interesse', tom: 'neutral' },
];

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function DiscadorEVS() {
  const [leads, setLeads] = useState([]);
  const [idx, setIdx] = useState(0);
  const [estado, setEstado] = useState('idle'); // idle | dialing | active | wrapup
  const [seg, setSeg] = useState(0);
  const [nota, setNota] = useState('');
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState('');

  const deviceRef = useRef(null);
  const callRef = useRef(null);
  const timerRef = useRef(null);
  const sidRef = useRef(null);

  const lead = leads[idx];

  // Carrega a fila + inicializa o Twilio Device
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/fila');
        const j = await r.json();
        setLeads(j.leads || []);
      } catch (e) { setErro('Falha ao carregar a fila.'); }

      try {
        const rt = await fetch('/api/token');
        const jt = await rt.json();
        const { Device } = await import('@twilio/voice-sdk');
        const device = new Device(jt.token, { codecPreferences: ['opus', 'pcmu'] });
        deviceRef.current = device;
        setPronto(true);
      } catch (e) { setErro('Falha ao conectar no Twilio. Confira as credenciais.'); }
    })();
    return () => { clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    if (estado === 'active') timerRef.current = setInterval(() => setSeg((s) => s + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [estado]);

  const discar = async () => {
    if (!deviceRef.current || !lead) return;
    setSeg(0); setEstado('dialing'); setErro('');
    try {
      const call = await deviceRef.current.connect({ params: { To: lead.telefone } });
      callRef.current = call;
      call.on('accept', (c) => { sidRef.current = c.parameters?.CallSid || null; setEstado('active'); });
      call.on('disconnect', () => { clearInterval(timerRef.current); setEstado('wrapup'); });
      call.on('cancel', () => { setEstado('wrapup'); });
      call.on('error', (e) => { setErro('Erro na ligação: ' + e.message); setEstado('wrapup'); });
    } catch (e) { setErro('Não foi possível ligar: ' + e.message); setEstado('idle'); }
  };

  const encerrar = () => { if (callRef.current) callRef.current.disconnect(); };

  const registrar = async (resultado) => {
    try {
      await fetch('/api/ligacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, resultado, duracao_seg: seg, nota, twilio_sid: sidRef.current }),
      });
    } catch (e) { /* segue mesmo se falhar o log */ }
    setNota(''); setSeg(0); sidRef.current = null; setEstado('idle');
    setIdx((i) => (i + 1 < leads.length ? i + 1 : i));
  };

  return (
    <div style={{ minHeight: '100vh', padding: 20 }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: C.burgundy, color: C.gold, display: 'grid', placeItems: 'center', fontFamily: 'Fraunces, serif', fontWeight: 600 }}>SZ</div>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 600 }}>Discador EVS</div>
            <div style={{ fontSize: 12, color: C.muted }}>{pronto ? 'Pronto para ligar' : 'Conectando…'}</div>
          </div>
        </div>

        {erro && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 14 }}>{erro}</div>}

        {leads.length === 0 ? (
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 40, textAlign: 'center', color: C.muted }}>
            Nenhum lead na fila. Adicione leads no Supabase para começar.
          </div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, alignItems: 'start' }}>

          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.line}`, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', color: C.muted, fontWeight: 600 }}>
              Fila · {leads.length - idx} restantes
            </div>
            {leads.map((l, i) => (
              <div key={l.id} onClick={() => estado === 'idle' && setIdx(i)}
                style={{ padding: '12px 16px', borderBottom: `1px solid ${C.line}`, background: i === idx ? '#F7EFE4' : '#fff', borderLeft: i === idx ? `3px solid ${C.gold}` : '3px solid transparent', cursor: 'pointer' }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{l.nome}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{l.loja || ''} {l.faturamento ? '· ' + l.faturamento : ''}</div>
              </div>
            ))}
          </div>

          <div style={{ background: C.burgundy, borderRadius: 16, padding: 24, color: C.cream, minHeight: 420 }}>
            <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: C.gold, marginBottom: 4 }}>Lead atual</div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 30, fontWeight: 600 }}>{lead?.nome}</div>
            <div style={{ color: '#E0CDBE', marginTop: 4 }}>{lead?.loja} {lead?.faturamento ? '· ' + lead.faturamento : ''}</div>
            {lead?.dor && <div style={{ display: 'inline-block', marginTop: 12, fontSize: 12, padding: '4px 10px', borderRadius: 20, background: 'rgba(201,162,75,.16)', color: C.gold, fontWeight: 600 }}>Dor: {lead.dor}</div>}
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, marginTop: 20 }}>{lead?.telefone}</div>

            <div style={{ marginTop: 22, minHeight: 132 }}>
              {estado === 'idle' && (
                <button onClick={discar} disabled={!pronto}
                  style={{ background: pronto ? C.gold : '#8A7A72', color: C.burgundyDark, border: 'none', borderRadius: 12, padding: '16px 28px', fontSize: 16, fontWeight: 700 }}>
                  {pronto ? 'Ligar agora' : 'Conectando…'}
                </button>
              )}
              {estado === 'dialing' && <div style={{ fontSize: 16, fontWeight: 600 }}>Discando…</div>}
              {estado === 'active' && (
                <div>
                  <div style={{ fontFamily: 'Fraunces, serif', fontSize: 40, fontWeight: 600, color: C.gold }}>{fmt(seg)}</div>
                  <button onClick={encerrar} style={{ marginTop: 12, background: '#C0392B', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 26px', fontSize: 15, fontWeight: 700 }}>Encerrar chamada</button>
                </div>
              )}
              {estado === 'wrapup' && (
                <div style={{ background: 'rgba(0,0,0,.15)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', color: C.gold, marginBottom: 10 }}>Resultado · {fmt(seg)}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {RESULTADOS.map((r) => (
                      <button key={r.key} onClick={() => registrar(r.key)}
                        style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, fontWeight: 600, fontSize: 13,
                          background: r.tom === 'success' ? C.green : r.tom === 'gold' ? C.gold : 'rgba(255,255,255,.06)',
                          color: r.tom === 'success' ? '#fff' : r.tom === 'gold' ? C.burgundyDark : C.cream,
                          border: `1px solid ${r.tom === 'neutral' ? 'rgba(255,255,255,.15)' : 'transparent'}` }}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Anotação rápida…"
                    style={{ width: '100%', marginTop: 10, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, color: C.cream, padding: '8px 10px', fontSize: 13, minHeight: 44 }} />
                </div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
