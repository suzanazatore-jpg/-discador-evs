from __future__ import annotations

import os
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import httpx


class CalendarNotConfigured(RuntimeError):
    pass


class CalendarService:
    """Calendly-backed availability and booking for Suzana's diagnosis event."""

    api_base = "https://api.calendly.com"

    def __init__(self) -> None:
        self.access_token = os.getenv("CALENDLY_ACCESS_TOKEN", "").strip()
        self.event_type_uri = os.getenv("CALENDLY_EVENT_TYPE_URI", "").strip()
        self.scheduling_url = os.getenv(
            "CALENDLY_SCHEDULING_URL",
            "https://calendly.com/suzanazatorreoficial/30min",
        ).strip().rstrip("/")
        self.event_type_slug = os.getenv("CALENDLY_EVENT_TYPE_SLUG", "30min").strip()
        self.timezone_name = os.getenv("AGENDA_TIMEZONE", "America/Sao_Paulo").strip()
        self.duration_minutes = int(os.getenv("DIAGNOSTICO_DURACAO_MINUTOS", "30"))
        self.buffer_minutes = int(os.getenv("AGENDA_ANTECEDENCIA_MINUTOS", "120"))

    @property
    def configured(self) -> bool:
        return bool(
            self.access_token
            and (self.event_type_uri or self.scheduling_url or self.event_type_slug)
        )

    @property
    def timezone(self) -> ZoneInfo:
        return ZoneInfo(self.timezone_name)

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _utc_text(value: datetime) -> str:
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    @staticmethod
    def _parse_datetime(value: str) -> datetime:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))

    def _request(
        self,
        method: str,
        path_or_url: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self.configured:
            raise CalendarNotConfigured("O Calendly da Suzana ainda não foi conectado.")

        url = (
            path_or_url
            if path_or_url.startswith("https://")
            else f"{self.api_base}{path_or_url}"
        )
        with httpx.Client(timeout=20) as client:
            response = client.request(
                method,
                url,
                headers=self._headers,
                params=params,
                json=json,
            )

        if response.status_code in {401, 403}:
            raise CalendarNotConfigured(
                "A autorização do Calendly expirou ou não permite agendamentos."
            )
        if response.status_code in {409, 422}:
            raise ValueError(
                "O horário acabou de ser ocupado. Consulte a agenda novamente."
            )
        response.raise_for_status()
        return response.json()

    def _resolve_event_type_uri(self) -> str:
        if self.event_type_uri:
            return self.event_type_uri

        current_user = self._request("GET", "/users/me").get("resource", {})
        user_uri = current_user.get("uri", "")
        if not user_uri:
            raise CalendarNotConfigured(
                "Não foi possível identificar a conta conectada ao Calendly."
            )

        page_token = ""
        expected_url = self.scheduling_url.lower().rstrip("/")
        expected_slug = (
            self.event_type_slug.lower()
            or urlparse(self.scheduling_url).path.rstrip("/").split("/")[-1].lower()
        )

        while True:
            params: dict[str, Any] = {
                "user": user_uri,
                "active": "true",
                "count": 100,
            }
            if page_token:
                params["page_token"] = page_token
            payload = self._request("GET", "/event_types", params=params)

            for event_type in payload.get("collection", []):
                event_url = str(event_type.get("scheduling_url", "")).lower().rstrip("/")
                event_slug = str(event_type.get("slug", "")).lower()
                url_slug = urlparse(event_url).path.rstrip("/").split("/")[-1]
                if (
                    (expected_url and event_url == expected_url)
                    or (expected_slug and event_slug == expected_slug)
                    or (expected_slug and url_slug == expected_slug)
                ):
                    self.event_type_uri = str(event_type.get("uri", ""))
                    if self.event_type_uri:
                        return self.event_type_uri

            page_token = str(payload.get("pagination", {}).get("next_page_token", ""))
            if not page_token:
                break

        raise CalendarNotConfigured(
            "O evento de 30 minutos não foi encontrado na conta conectada ao Calendly."
        )

    def _available_times(
        self,
        start: datetime,
        end: datetime,
    ) -> list[dict[str, Any]]:
        event_type_uri = self._resolve_event_type_uri()
        payload = self._request(
            "GET",
            "/event_type_available_times",
            params={
                "event_type": event_type_uri,
                "start_time": self._utc_text(start),
                "end_time": self._utc_text(end),
            },
        )
        return list(payload.get("collection", []))

    def list_slots(
        self,
        start_date: str = "",
        period: str = "qualquer",
        days: int = 14,
        limit: int = 8,
    ) -> list[dict[str, str]]:
        if not self.configured:
            raise CalendarNotConfigured("O Calendly da Suzana ainda não foi conectado.")

        now = datetime.now(self.timezone)
        first_day = date.fromisoformat(start_date) if start_date else now.date()
        range_start = datetime.combine(first_day, time.min, self.timezone)
        earliest = now + timedelta(minutes=self.buffer_minutes)
        if range_start < earliest:
            range_start = earliest
        range_end = datetime.combine(
            first_day + timedelta(days=max(1, min(days, 30))),
            time.min,
            self.timezone,
        )
        period_normalized = str(period or "qualquer").lower()

        slots: list[dict[str, str]] = []
        cursor = range_start
        # Calendly limits each availability query to a seven-day window.
        while cursor < range_end and len(slots) < limit:
            window_end = min(cursor + timedelta(days=7), range_end)
            for item in self._available_times(cursor, window_end):
                start_value = str(item.get("start_time", ""))
                if not start_value:
                    continue
                start = self._parse_datetime(start_value).astimezone(self.timezone)
                if period_normalized == "manha" and start.hour >= 12:
                    continue
                if period_normalized == "tarde" and start.hour < 12:
                    continue

                end_value = str(item.get("end_time", ""))
                end = (
                    self._parse_datetime(end_value).astimezone(self.timezone)
                    if end_value
                    else start + timedelta(minutes=self.duration_minutes)
                )
                slots.append(
                    {
                        "inicio": start.isoformat(),
                        "fim": end.isoformat(),
                        "descricao": start.strftime("%d/%m/%Y às %H:%M"),
                    }
                )
                if len(slots) >= limit:
                    break
            cursor = window_end

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
        del lead_id, challenge  # These remain recorded in the Discador/Base Geral.
        if not email:
            raise ValueError("É necessário confirmar o e-mail antes de agendar.")

        start = datetime.fromisoformat(start_iso).astimezone(self.timezone)
        probe_start = start - timedelta(minutes=1)
        probe_end = start + timedelta(minutes=self.duration_minutes + 1)
        available = self._available_times(probe_start, probe_end)
        exact_slot = any(
            self._parse_datetime(str(item.get("start_time", ""))).astimezone(self.timezone)
            == start
            for item in available
            if item.get("start_time")
        )
        if not exact_slot:
            raise ValueError("O horário acabou de ser ocupado. Consulte a agenda novamente.")

        event_type_uri = self._resolve_event_type_uri()
        payload = self._request(
            "POST",
            "/invitees",
            json={
                "event_type": event_type_uri,
                "start_time": self._utc_text(start),
                "invitee": {
                    "name": name,
                    "email": email,
                    "timezone": self.timezone_name,
                },
            },
        )
        invitee = payload.get("resource", {})
        event_uri = str(invitee.get("event", ""))
        if not invitee.get("uri") or not event_uri:
            raise RuntimeError("O Calendly não confirmou a criação do agendamento.")

        meet_url = ""
        try:
            event = self._request("GET", event_uri).get("resource", {})
            location = event.get("location") or {}
            meet_url = str(location.get("join_url", ""))
        except Exception:
            # The invite email still contains the meeting details even if the join
            # URL is not immediately available from the conference provider.
            meet_url = ""

        end = start + timedelta(minutes=self.duration_minutes)
        return {
            "event_id": event_uri.rstrip("/").split("/")[-1],
            "invitee_id": str(invitee.get("uri", "")).rstrip("/").split("/")[-1],
            "inicio": start.isoformat(),
            "fim": end.isoformat(),
            "meet_url": meet_url,
            "html_link": str(invitee.get("reschedule_url", "")),
        }
