from __future__ import annotations

import base64
import json
import os
import uuid
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo


class CalendarNotConfigured(RuntimeError):
    pass


class CalendarService:
    def __init__(self) -> None:
        self.calendar_id = os.getenv("GOOGLE_CALENDAR_ID", "").strip()
        self.timezone_name = os.getenv("AGENDA_TIMEZONE", "America/Sao_Paulo").strip()
        self.duration_minutes = int(os.getenv("DIAGNOSTICO_DURACAO_MINUTOS", "30"))
        self.buffer_minutes = int(os.getenv("AGENDA_ANTECEDENCIA_MINUTOS", "120"))
        self.windows = self._load_windows()
        self.credentials_info = self._load_credentials()
        self._client = None

    @property
    def configured(self) -> bool:
        return bool(self.calendar_id and self.credentials_info and self.windows)

    def _load_credentials(self) -> dict[str, Any] | None:
        raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
        encoded = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON_B64", "").strip()
        if encoded and not raw:
            raw = base64.b64decode(encoded).decode("utf-8")
        if not raw:
            return None
        return json.loads(raw)

    def _load_windows(self) -> dict[str, list[list[str]]]:
        raw = os.getenv("AGENDA_JANELAS_JSON", "").strip()
        if not raw:
            return {}
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("AGENDA_JANELAS_JSON precisa ser um objeto JSON.")
        return payload

    def _service(self):
        if not self.configured:
            raise CalendarNotConfigured("A agenda da Suzana ainda não foi configurada.")
        if self._client is None:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build

            credentials = service_account.Credentials.from_service_account_info(
                self.credentials_info,
                scopes=["https://www.googleapis.com/auth/calendar"],
            )
            self._client = build("calendar", "v3", credentials=credentials, cache_discovery=False)
        return self._client

    @property
    def timezone(self) -> ZoneInfo:
        return ZoneInfo(self.timezone_name)

    def _busy_intervals(self, start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
        events = (
            self._service()
            .events()
            .list(
                calendarId=self.calendar_id,
                timeMin=start.isoformat(),
                timeMax=end.isoformat(),
                singleEvents=True,
                orderBy="startTime",
            )
            .execute()
            .get("items", [])
        )

        busy: list[tuple[datetime, datetime]] = []
        for event in events:
            start_value = event.get("start", {}).get("dateTime")
            end_value = event.get("end", {}).get("dateTime")
            if not start_value or not end_value:
                continue
            busy.append((datetime.fromisoformat(start_value), datetime.fromisoformat(end_value)))
        return busy

    def list_slots(
        self,
        start_date: str = "",
        period: str = "qualquer",
        days: int = 14,
        limit: int = 8,
    ) -> list[dict[str, str]]:
        if not self.configured:
            raise CalendarNotConfigured("A agenda da Suzana ainda não foi configurada.")

        now = datetime.now(self.timezone)
        first_day = date.fromisoformat(start_date) if start_date else now.date()
        range_start = datetime.combine(first_day, time.min, self.timezone)
        range_end = range_start + timedelta(days=max(1, min(days, 30)))
        busy = self._busy_intervals(range_start, range_end)
        earliest = now + timedelta(minutes=self.buffer_minutes)
        duration = timedelta(minutes=self.duration_minutes)
        period_normalized = str(period or "qualquer").lower()

        slots: list[dict[str, str]] = []
        current_day = first_day
        while current_day < range_end.date() and len(slots) < limit:
            windows = self.windows.get(str(current_day.weekday()), [])
            for begin_text, end_text in windows:
                begin_time = time.fromisoformat(begin_text)
                end_time = time.fromisoformat(end_text)
                cursor = datetime.combine(current_day, begin_time, self.timezone)
                window_end = datetime.combine(current_day, end_time, self.timezone)

                while cursor + duration <= window_end and len(slots) < limit:
                    if period_normalized == "manha" and cursor.hour >= 12:
                        cursor += duration
                        continue
                    if period_normalized == "tarde" and cursor.hour < 12:
                        cursor += duration
                        continue

                    end_slot = cursor + duration
                    collision = any(cursor < busy_end and end_slot > busy_start for busy_start, busy_end in busy)
                    if cursor >= earliest and not collision:
                        slots.append(
                            {
                                "inicio": cursor.isoformat(),
                                "fim": end_slot.isoformat(),
                                "descricao": cursor.strftime("%d/%m/%Y às %H:%M"),
                            }
                        )
                    cursor += duration
            current_day += timedelta(days=1)
        return slots

    def create_meeting(
        self,
        *,
        start_iso: str,
        name: str,
        email: str,
        lead_id: str,
        challenge: str = "",
    ) -> dict[str, str]:
        start = datetime.fromisoformat(start_iso).astimezone(self.timezone)
        end = start + timedelta(minutes=self.duration_minutes)

        busy = self._busy_intervals(start, end)
        if any(start < busy_end and end > busy_start for busy_start, busy_end in busy):
            raise ValueError("O horário acabou de ser ocupado. Consulte a agenda novamente.")

        body: dict[str, Any] = {
            "summary": f"Diagnóstico gratuito — {name}",
            "description": (
                "Diagnóstico gratuito de 30 minutos com Suzana Zatorre.\n"
                f"Lead: {lead_id}\n"
                f"Desafio: {challenge or 'não informado'}"
            ),
            "start": {"dateTime": start.isoformat(), "timeZone": self.timezone_name},
            "end": {"dateTime": end.isoformat(), "timeZone": self.timezone_name},
            "conferenceData": {
                "createRequest": {
                    "requestId": uuid.uuid4().hex,
                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                }
            },
        }
        if email:
            body["attendees"] = [{"email": email, "displayName": name}]

        event = (
            self._service()
            .events()
            .insert(
                calendarId=self.calendar_id,
                body=body,
                conferenceDataVersion=1,
                sendUpdates="all" if email else "none",
            )
            .execute()
        )
        meet_url = event.get("hangoutLink", "")
        if not event.get("id") or not meet_url:
            raise RuntimeError("O Google Calendar não confirmou a criação do Google Meet.")

        return {
            "event_id": event["id"],
            "inicio": start.isoformat(),
            "fim": end.isoformat(),
            "meet_url": meet_url,
            "html_link": event.get("htmlLink", ""),
        }

