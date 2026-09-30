const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.argv[2] || path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/page.jsx'), 'utf8');
function ui() {
  const states = [], refs = [], effects = [], timers = new Map(), storage = new Map();
  let stateIndex = 0, refIndex = 0, tick = 0;
  const requests = [], redirects = [], events = {};
  let response = {ok:true,status:200,json:async()=>({ok:true,ligacao:{id:'mock-event'}})};
  let connectError = null, connects = 0;
  let statusResult = {terminal:true, status:'no-answer', noAnswer:true}, statusError = null;
  const call = {parameters:{CallSid:'CA-mock'},on:(event,fn)=>events[event]=fn,disconnect:()=>events.disconnect?.()};
  const device = {updateToken:()=>{}, connect:async()=>{connects++;if(connectError)throw connectError;return call;}};
  const context = vm.createContext({
    readCallOutcome: async () => { if (statusError) throw statusError; return statusResult; },
    console, Date, String, Number, Boolean, JSON, Math, AbortSignal,
    crypto:{randomUUID:()=>`mock-${++tick}`},
    navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[]})}},
    window:{location:{assign:x=>redirects.push(x)},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}},
    fetch:async(url,opts)=>{requests.push({url,opts});return url==='/api/token'?{ok:true,status:200,json:async()=>({token:'fake'})}:response;},
    setTimeout:(fn)=>{const id=++tick;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    setInterval:()=>0,clearInterval:()=>{},
    useState:initial=>{const i=stateIndex++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},
    useRef:initial=>{const i=refIndex++;return refs[i]||(refs[i]={current:initial});},
    useMemo:fn=>fn(),useEffect:fn=>effects.push(fn),
  });
  let code=source.replace(/import React[^;]+;/,'').replace(/import \{ readCallOutcome \}[^;]+;/,'').replace('export default function','function');
  code=code.slice(0,code.indexOf('  return (\n    <div className="app-shell">'))+`return {chamarLead,iniciarAutomatico,pausarAutomatico,registrar,repetirSalvamento,leadsRef,deviceRef,pendingRef,autoAtivoRef,autoPausadoRef,leadElegivel,saveRef};}\n globalThis.render=DiscadorEVS;`;
  vm.runInContext(code,context);
  const render=()=>{stateIndex=refIndex=0;return context.render();};
  let api=render();states[9]=true;
  const A={id:'A',idLead:'A',nome:'A',telefone:'+5511999990000',status:'novo',podeLigar:'SIM',tentativas:0,tags:[]};
  const B={...A,id:'B',idLead:'B'};
  states[0]=[A,B];api=render();api.deviceRef.current=device;
  return {render,api,states,requests,storage,timers,redirects,events,A,B,
    setResponse:r=>response=r,setStatus:r=>statusResult=r,setStatusError:e=>statusError=e,setConnectError:e=>connectError=e,getConnects:()=>connects};
}
(async()=>{
 let h=ui();h.setConnectError(new Error('microphone/network'));await h.api.chamarLead(h.A);assert.equal(h.api.autoPausadoRef.current,true);assert.equal(h.requests.filter(r=>r.url==='/api/ligacoes').length,0);console.log('PASS start failure pauses without inventing a result');
 h=ui();h.api.autoAtivoRef.current=true;h.api.autoPausadoRef.current=false;h.setResponse({ok:false,status:502,json:async()=>({error:'Sheets unavailable'})});await h.api.registrar('nao_atendeu',h.A);assert(h.api.pendingRef.current);assert.equal(h.api.autoPausadoRef.current,true);assert.equal(h.timers.size,0);assert(h.storage.get('discador_evs_resultado_pendente_v1'));const first=JSON.parse(h.requests.at(-1).opts.body);h.setResponse({ok:true,status:200,json:async()=>({ligacao:{id:first.event_id}})});h.api=h.render();await h.api.repetirSalvamento();assert.equal(JSON.parse(h.requests.at(-1).opts.body).event_id,first.event_id);assert.equal(h.api.pendingRef.current,null);assert.equal(h.states[0].find(x=>x.id==='A').tentativas,1);console.log('PASS failed persistence is preserved; retry uses same event and attempt');
 h=ui();h.setResponse({ok:false,status:401,json:async()=>({})});await h.api.registrar('caixa',h.A);assert.deepEqual(h.redirects,['/login']);assert(h.api.pendingRef.current);assert.equal(h.api.saveRef.current,false);console.log('PASS 401 preserves pending result before redirect');
 h=ui();h.api.autoAtivoRef.current=true;h.api.autoPausadoRef.current=false;await h.api.chamarLead(h.A);h.setStatus({terminal:true,status:'failed',noAnswer:false});h.events.error({code:31000,message:'technical'});h.events.disconnect();await new Promise(setImmediate);assert.equal(h.requests.filter(r=>r.url==='/api/ligacoes').length,0);assert.equal(h.api.autoPausadoRef.current,true);console.log('PASS call error + disconnect is not false non-answer');
 h=ui();await Promise.all([h.api.chamarLead(h.A),h.api.chamarLead(h.A)]);assert.equal(h.getConnects(),1);console.log('PASS concurrent start is locked');
 h=ui();await h.api.chamarLead(h.A);h.states[0]=[h.A,h.B,{...h.B,id:'C'}];h.api=h.render();h.events.disconnect();h.events.cancel();await new Promise(setImmediate);assert.equal(h.requests.filter(r=>r.url==='/api/ligacoes').length,1);assert.equal(h.states[0].length,3);assert.equal(h.states[0].find(x=>x.id==='A').tentativas,1);console.log('PASS terminal events recorded once and use latest queue');
 h=ui();await Promise.all([h.api.registrar('caixa',h.A),h.api.registrar('caixa',h.A)]);assert.equal(h.requests.filter(r=>r.url==='/api/ligacoes').length,1);console.log('PASS double save is locked');

 h=ui();h.api.autoAtivoRef.current=true;h.api.autoPausadoRef.current=false;await h.api.chamarLead(h.A);h.events.accept({parameters:{CallSid:'CA-mock'}});await h.events.disconnect();await new Promise(setImmediate);assert.equal(h.requests.filter(r=>r.url==='/api/ligacoes').length,1);assert.equal(h.states[6],'idle');assert.equal(h.api.autoPausadoRef.current,false);assert.equal(h.states[4],'B');console.log('PASS accepted browser leg plus confirmed no-answer advances automatically');
 h=ui();h.setStatus({terminal:true,status:'completed',noAnswer:false,answered:true});await h.api.chamarLead(h.A);await h.events.disconnect();assert.equal(h.requests.filter(r=>r.url==='/api/ligacoes').length,0);assert.equal(h.states[6],'wrapup');console.log('PASS answered phone or voicemail requires operator classification');
 h=ui();h.api.autoAtivoRef.current=true;h.api.autoPausadoRef.current=false;await h.api.chamarLead(h.A);h.events.error({code:31005,message:'SDK lost connection'});await new Promise(setImmediate);assert.equal(h.states[6],'idle');assert.equal(h.requests.filter(r=>r.url==='/api/ligacoes').length,1);console.log('PASS SDK error with confirmed no-answer continues without losing result');
 h=ui();h.api.autoAtivoRef.current=true;h.api.autoPausadoRef.current=false;await h.api.chamarLead(h.A);const monitor=[...h.timers.values()][0];await monitor();await new Promise(setImmediate);assert.equal(h.requests.filter(r=>r.url==='/api/ligacoes').length,1);assert.equal(h.states[6],'idle');console.log('PASS terminal status recovers a missing SDK disconnect');
 h=ui();h.setStatusError(new Error('status offline'));await h.api.chamarLead(h.A);await h.events.disconnect();assert.equal(h.states[6],'wrapup');assert.equal(h.api.autoPausadoRef.current,true);assert.equal(h.requests.filter(r=>r.url==='/api/ligacoes').length,0);console.log('PASS unknown status pauses without fabricating no-answer');
 h=ui();h.states[0]=[h.A,h.B,{...h.B,id:'C'}];h.api=h.render();await h.api.registrar('nao_atendeu',h.A);h.api=h.render();await h.api.registrar('nao_atendeu',h.B);assert.equal(h.states[4],'C');console.log('PASS queue visits C before immediately retrying A');

 h=ui();h.states[0]=[h.A,h.B,{...h.B,id:'C',idLead:'C'}];h.api=h.render();h.api.iniciarAutomatico();await new Promise(setImmediate);
 for(let i=0;i<3;i++) { await h.events.disconnect(); await new Promise(setImmediate);h.api=h.render();if(i<2){const [id,next]=[...h.timers.entries()][0];h.timers.delete(id);await next();await new Promise(setImmediate);}}
 const attempted=h.requests.filter(r=>r.url==='/api/ligacoes').map(r=>JSON.parse(r.opts.body).lead_id);assert.deepEqual(attempted,['A','B','C']);assert.equal(h.getConnects(),3);console.log('PASS three consecutive unanswered calls advance A -> B -> C without restart');
 // Google Apps Script in-memory integration test; no real Google APIs.
 const base=[Array(28).fill(''),['A','','Mock','','+5511999990000',...Array(23).fill('')]];
 const history=[['ID_Historico']];let failBase=false,locks=0;
 function sheet(rows){return {getLastRow:()=>rows.length,getLastColumn:()=>28,appendRow:r=>rows.push(r),setFrozenRows:()=>{},getRange:(row,col,n=1,m=1)=>({
  getDisplayValues:()=>rows.slice(row-1,row-1+n).map(r=>Array.from({length:m},(_,i)=>String(r[col-1+i]??''))),
  getValues:()=>rows.slice(row-1,row-1+n).map(r=>Array.from({length:m},(_,i)=>r[col-1+i]??'')),
  setValue:v=>{if(rows===base&&failBase){failBase=false;throw new Error('partial write');}rows[row-1][col-1]=v;},clearContent:()=>rows[row-1][col-1]='',setValues:v=>{},
  createTextFinder:value=>({matchEntireCell(){return this;},findNext:()=>{const i=rows.findIndex(r=>r[col-1]===value);return i<0?null:{getRow:()=>i+1};}}),
 })};}
 const ss={getSheetByName:name=>name==='Base_Geral'?sheet(base):sheet(history)};
 const ctx=vm.createContext({Date,Number,String,Boolean,JSON,Math,PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},SpreadsheetApp:{openById:()=>ss,flush:()=>{}},Utilities:{getUuid:()=>String(Math.random())},LockService:{getScriptLock:()=>({waitLock:()=>locks++,releaseLock:()=>locks--})}});
 vm.runInContext(fs.readFileSync(path.join(root,'apps-script/DiscadorEVS_BaseGeral_Endpoint.gs'),'utf8'),ctx);
 const payload={event_id:'EVS-test',id_lead:'A',lead_id:'A',sheet_row:2,telefone:'+5511999990000',resultado:'caixa',tentativa:1,nota:'saved',duracao_seg:0};
 failBase=true;assert.throws(()=>ctx.discRegistrarLigacao_(payload),/partial write/);assert.equal(history.length,2);ctx.discRegistrarLigacao_(payload);ctx.discRegistrarLigacao_(payload);assert.equal(history.length,2);assert.equal(base[1][15],'Retornar');assert.equal(locks,0);console.log('PASS partial sheet write repair and response-loss retry do not duplicate history');
 assert.throws(()=>ctx.discRegistrarLigacao_({...payload,nota:'different'}),/conteúdo/);console.log('PASS event content is immutable');
 ctx.discRegistrarLigacao_({...payload,event_id:'EVS-next',resultado:'sem_interesse',tentativa:1});ctx.discRegistrarLigacao_(payload);assert.equal(base[1][15],'Descartado');assert.equal(history.length,3);console.log('PASS delayed replay cannot undo a newer result');
 console.log('Core persistence and concurrency regressions passed; all network/call/Sheets operations mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;});
