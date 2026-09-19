from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
from dataclasses import dataclass, field
from datetime import datetime
from time import monotonic
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from tac import TAC, TACConfig
from tac.channels.voice import VoiceChannel
from tac.channels.voice.media_streams.gpt_live import (
    GPTLiveProviderConfig,
    InitiateVoiceConversationOptionsGPTLive,
    TWILIO_AUDIO_FORMAT_FOR_GPT_LIVE,
)
from tac.models.outbound import CallOptions
from tac.models.session import ConversationSession
from tac.models.voice import AmdEvent, CallStatusEvent
from tac.server import TACFastAPIServer
from tac.tools import function_tool

from ana_prompt import build_prompt, welcome_instruction
from calendar_service import CalendarNotConfigured, CalendarService

load_dotenv()

# Compatibilidade com os nomes que o Discador EVS já usa na Vercel.
os.environ.setdefault("TWILIO_API_KEY", os.getenv("TWILIO_API_KEY_SID", ""))
os.environ.setdefault("TWILIO_API_SECRET", os.getenv("TWILIO_API_KEY_SECRET", ""))
os.environ.setdefault("TWILIO_PHONE_NUMBER", os.getenv("TWILIO_CALLER_ID", ""))
os.environ.setdefault("TWILIO_SERVER_PORT", os.getenv("PORT", "8000"))

RESULTS = {
    "agendado",
    "agendamento_pendente",
    "retornar",
    "interessado",
    "sem_interesse",
    "nao_deseja_contato",
    "fora_do_perfil",
    "ja_agendado",
    "numero_de_outra_pessoa",
    "numero_invalido",
    "sem_resposta",
    "caixa_postal",
    "ligacao_caiu",
    "audio_ruim",
    "solicitou_whatsapp",
    "duvida_para_equipe",
}


class Lead(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    id_lead: str = ""
    sheet_row: int | None = None
    nome: str = ""
    telefone: str
    email: str = ""
    instagram: str = ""
    negocio: str = ""
    faturamento: str = ""
    estoque: str = ""
    cargo: str = ""
    desafio: str = ""
    produto: str = ""
    data_compra: str = ""
    etiqueta: str = ""
    tags_pabbly: str = ""
    pode_ligar: str = ""
    data_agendamento: str = ""
    equipe: str = ""
    observacao: str = ""
    tentativas: int = 0


class StartCallRequest(BaseModel):
    lead: Lead


@dataclass
class CallContext:
    lead: Lead
    call_sid: str
    started_monotonic: float = field(default_factory=monotonic)
    result: str = ""
    summary: str = ""
    next_action: str = ""
    return_at: str = ""
    appointment_at: str = ""
    meet_url: str = ""
    transcript: list[dict[str, str]] = field(default_factory=list)
    finalized: bool = False
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


call_contexts: dict[str, CallContext] = {}
lead_contexts: dict[str, CallContext] = {}
calendar = CalendarService()


def _authorized(authorization: str | None = Header(default=None)) -> None:
    expected = os.getenv("VOICE_SERVICE_SECRET", "")
    received = re.sub(r"^Bearer\s+", "", authorization or "", flags=re.IGNORECASE)
    if not expected or not secrets.compare_digest(expected, received):
        raise HTTPException(status_code=401, detail="Não autorizado.")


def _agent_enabled() -> bool:
    return os.getenv("VOICE_AGENT_ENABLED", "false").lower() == "true"


def _phone_allowed(phone: str) -> bool:
    mode = os.getenv("VOICE_AGENT_MODE", "test").lower()
    if mode == "production":
        return os.getenv("ALLOW_PRODUCTION_CALLS", "false").lower() == "true"
    allowed = {
        item.strip()
        for item in os.getenv("VOICE_AGENT_TEST_NUMBERS", "").split(",")
        if item.strip()
    }
    return phone in allowed


def _lead_context(lead_id: str) -> CallContext:
    context = lead_contexts.get(str(lead_id))
    if context is None or context.finalized:
        raise ValueError("Não existe uma chamada ativa para este lead_id.")
    return context


@function_tool()
async def consultar_agenda(
    data_inicial: str = "",
    periodo: Literal["manha", "tarde", "qualquer"] = "qualquer",
) -> dict[str, Any]:
    """Consulta horários reais de 30 minutos na agenda da Suzana. Nunca invente horários."""
    try:
        slots = await asyncio.to_thread(calendar.list_slots, data_inicial, periodo)
        return {"sucesso": True, "horarios": slots[:8]}
    except CalendarNotConfigured as error:
        return {"sucesso": False, "erro": str(error)}
    except Exception:
        return {"sucesso": False, "erro": "A agenda está temporariamente indisponível."}


@function_tool()
async def criar_agendamento(
    lead_id: str,
    nome: str,
    email: str,
    data_hora: str,
    desafio: str = "",
) -> dict[str, Any]:
    """Cria o diagnóstico no Google Calendar e devolve o link do Google Meet."""
    try:
        context = _lead_context(lead_id)
        if context.appointment_at and context.meet_url:
            return {
                "sucesso": True,
                "inicio": context.appointment_at,
                "meet_url": context.meet_url,
                "ja_existia": True,
            }

        event = await asyncio.to_thread(
            calendar.create_meeting,
            start_iso=data_hora,
            name=nome or context.lead.nome,
            email=email or context.lead.email,
            lead_id=lead_id,
            challenge=desafio or context.lead.desafio,
        )
        context.result = "agendado"
        context.summary = f"Diagnóstico agendado para {event['inicio']}. Desafio: {desafio or context.lead.desafio or 'não informado'}."
        context.next_action = "Participar do diagnóstico"
        context.appointment_at = event["inicio"]
        context.meet_url = event["meet_url"]
        return {"sucesso": True, **event}
    except (CalendarNotConfigured, ValueError) as error:
        return {"sucesso": False, "erro": str(error)}
    except Exception:
        return {"sucesso": False, "erro": "Não foi possível confirmar o agendamento agora."}


@function_tool()
async def registrar_resultado(
    lead_id: str,
    resultado: str,
    resumo: str,
    proxima_acao: str = "",
    data_retorno: str = "",
    data_agendamento: str = "",
) -> dict[str, Any]:
    """Registra no contexto da chamada o resultado verdadeiro antes de encerrar."""
    context = _lead_context(lead_id)
    normalized = str(resultado or "").strip().lower()
    if normalized not in RESULTS:
        return {"sucesso": False, "erro": "Resultado inválido."}

    # Um Google Meet confirmado tem precedência sobre classificações posteriores.
    if context.result != "agendado":
        context.result = normalized
    context.summary = str(resumo or "").strip()[:2000]
    context.next_action = str(proxima_acao or "").strip()[:300]
    context.return_at = str(data_retorno or "").strip()
    if not context.appointment_at:
        context.appointment_at = str(data_agendamento or "").strip()
    return {"sucesso": True, "resultado": context.result}


TOOLS = [consultar_agenda, criar_agendamento, registrar_resultado]


def _session_config(lead: Lead) -> dict[str, Any]:
    return {
        "model": os.getenv("OPENAI_LIVE_MODEL", "gpt-live-1"),
        "instructions": build_prompt(lead.model_dump()),
        "audio": {
            "format": TWILIO_AUDIO_FORMAT_FOR_GPT_LIVE,
            "output": {"voice": os.getenv("OPENAI_VOICE", "marin")},
        },
        "delegation": {
            "type": "responses",
            "responses": {
                "model": os.getenv("OPENAI_DELEGATION_MODEL", "gpt-5.6-sol"),
                "tools": [tool.to_realtime_format() for tool in TOOLS],
                "tool_choice": "auto",
            },
        },
    }


def _transcript_summary(transcript: list[dict[str, str]]) -> str:
    user_text = " ".join(
        turn.get("text", "") for turn in transcript if turn.get("role") == "user"
    ).strip()
    if not user_text:
        return "A pessoa não chegou a conversar com a Ana."
    return f"Conversa com a Ana: {user_text}"[:2000]


def _fallback_result(context: CallContext) -> str:
    user_text = " ".join(
        turn.get("text", "") for turn in context.transcript if turn.get("role") == "user"
    ).lower()
    if not user_text.strip():
        return "sem_resposta"
    if any(term in user_text for term in ["não tenho interesse", "nao tenho interesse", "não quero"]):
        return "sem_interesse"
    return "interessado"


async def _send_result(context: CallContext) -> None:
    async with context.lock:
        if context.finalized:
            return

        context.result = context.result or _fallback_result(context)
        context.summary = context.summary or _transcript_summary(context.transcript)
        duration = max(0, int(monotonic() - context.started_monotonic))
        callback_url = os.getenv("DISCADOR_CALLBACK_URL", "").strip()
        secret = os.getenv("VOICE_SERVICE_SECRET", "")
        if not callback_url:
            raise RuntimeError("DISCADOR_CALLBACK_URL não foi configurada.")

        payload = {
            "lead_id": context.lead.id,
            "id_lead": context.lead.id_lead,
            "sheet_row": context.lead.sheet_row,
            "nome": context.lead.nome,
            "telefone": context.lead.telefone,
            "resultado": context.result,
            "resumo": context.summary,
            "proxima_acao": context.next_action,
            "data_retorno": context.return_at,
            "data_agendamento": context.appointment_at,
            "meet_url": context.meet_url,
            "duracao_seg": duration,
            "tentativa": int(context.lead.tentativas or 0) + 1,
            "twilio_sid": context.call_sid,
            "transcricao": context.transcript,
        }

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                callback_url,
                json=payload,
                headers={"Authorization": f"Bearer {secret}"},
            )
            response.raise_for_status()

        context.finalized = True
        call_contexts.pop(context.call_sid, None)
        lead_contexts.pop(context.lead.id, None)


tac = TAC(config=TACConfig.from_env())
voice_channel = VoiceChannel(
    tac,
    config=GPTLiveProviderConfig(
        tools=TOOLS,
        default_session_config=_session_config(
            Lead(id="modelo", nome="Lead", telefone="+5500000000000")
        ),
        welcome_instruction=welcome_instruction(),
    ),
)


@tac.on_conversation_ended
async def on_conversation_ended(session: ConversationSession) -> None:
    if not session.call_sid:
        return
    context = call_contexts.get(session.call_sid)
    if not context:
        return
    context.transcript = list(session.metadata.get("transcript", []))
    try:
        await _send_result(context)
    except Exception as error:
        print(f"Falha ao devolver resultado da chamada {session.call_sid}: {error}")


async def on_call_status(event: CallStatusEvent) -> None:
    context = call_contexts.get(event.call_sid)
    if not context or context.finalized:
        return
    if event.is_unreached:
        context.result = "sem_resposta"
        context.summary = f"Ligação não completada. Status Twilio: {event.call_status or 'desconhecido'}."
        context.next_action = "Tentar novamente"
        try:
            await _send_result(context)
        except Exception as error:
            print(f"Falha ao registrar não atendimento {event.call_sid}: {error}")


async def on_amd(event: AmdEvent) -> None:
    context = call_contexts.get(event.call_sid)
    if not context or context.finalized or not event.is_machine:
        return
    context.result = "caixa_postal"
    context.summary = "A chamada foi atendida por caixa postal."
    context.next_action = "Tentar novamente"
    await voice_channel.end_call(event.call_sid)


voice_channel.on_call_status(on_call_status)
voice_channel.on_amd(on_amd)

app = FastAPI(title="Ana — Agente de Voz", version="1.0.0")
server = TACFastAPIServer(tac=tac, voice_channel=voice_channel, app=app)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "agente": "Ana",
        "enabled": _agent_enabled(),
        "mode": os.getenv("VOICE_AGENT_MODE", "test"),
        "calendar_configured": calendar.configured,
    }


@app.post("/calls", dependencies=[Depends(_authorized)])
async def start_call(request: StartCallRequest) -> dict[str, Any]:
    if not _agent_enabled():
        raise HTTPException(status_code=503, detail="A Ana ainda está desligada.")

    lead = request.lead
    if not re.fullmatch(r"\+[1-9]\d{9,14}", lead.telefone):
        raise HTTPException(status_code=400, detail="Telefone fora do formato E.164.")
    if not _phone_allowed(lead.telefone):
        raise HTTPException(
            status_code=403,
            detail="Número bloqueado pelo modo seguro do serviço de voz.",
        )
    if lead.id in lead_contexts and not lead_contexts[lead.id].finalized:
        raise HTTPException(status_code=409, detail="Já existe uma chamada ativa para este lead.")

    options = InitiateVoiceConversationOptionsGPTLive(
        to=lead.telefone,
        session_config=_session_config(lead),
        call_options=CallOptions(
            timeout=25,
            machine_detection="Enable",
            async_amd=True,
            status_callback_event=["initiated", "ringing", "answered", "completed"],
        ),
    )
    result = await voice_channel.initiate_outbound_conversation(options)
    context = CallContext(lead=lead, call_sid=result.call_sid)
    call_contexts[result.call_sid] = context
    lead_contexts[lead.id] = context

    return {"ok": True, "call_sid": result.call_sid, "lead_id": lead.id}


if __name__ == "__main__":
    server.start()

