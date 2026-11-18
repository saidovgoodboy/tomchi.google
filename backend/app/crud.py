"""Tomchi biznes qoidalari: boxlar, kelishlar, yagona faol bonus, impulslar va hisobotlar."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AppSetting, BonusPulse, Car, DeviceLog, PendingDetection, Visit, WashBox, utcnow
from app.ocr import is_valid_plate, normalize_plate
from app.provisioning import build_camera_endpoints


def ensure_seed_data(db: Session) -> None:
    if db.query(WashBox).count() > 0:
        return
    for idx in range(1, 5):
        ip = f"192.168.1.{100 + idx}"
        endpoints = build_camera_endpoints(
            brand="hikvision", host=ip, username="admin", password="pass"
        )
        db.add(
            WashBox(
                id=f"box-{idx}",
                name=f"Box {idx}",
                virtual_mode=1,
                camera_brand="hikvision",
                camera_ip=ip,
                low_stream_url=endpoints.low_stream_url,
                high_stream_url=endpoints.high_stream_url,
                snapshot_url=endpoints.snapshot_url or "",
                use_vaapi=1,
                esp32_paired=1 if idx <= 2 else 0,
            )
        )
    db.commit()


def _get_setting(rows: dict[str, str], key: str, default: str) -> str:
    return rows.get(key, default)


def _upsert_setting(db: Session, key: str, value: str) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


def log_event(db: Session, event: str, payload: str) -> None:
    db.add(DeviceLog(event=event, payload=payload))


def get_bonus_settings(db: Session) -> dict:
    defaults = get_settings()
    rows = {r.key: r.value for r in db.query(AppSetting).all()}
    return {
        "bonus_amount": int(_get_setting(rows, "bonus_amount", str(defaults.bonus_amount))),
        "bonus_per_press": int(_get_setting(rows, "bonus_per_press", str(defaults.bonus_per_press))),
        "bonus_every_visits": int(_get_setting(rows, "bonus_every_visits", str(defaults.bonus_every_visits))),
        "pulse_value": int(_get_setting(rows, "pulse_value", str(defaults.pulse_value))),
        "relay_pulse_ms": int(_get_setting(rows, "relay_pulse_ms", "120")),
        "relay_pause_ms": int(_get_setting(rows, "relay_pause_ms", "120")),
        "p10_idle_text": _get_setting(rows, "p10_idle_text", "AVTOMOBIL YO'Q"),
        "p10_visit_template": _get_setting(rows, "p10_visit_template", "{PLATE} - {VISIT}-KELISH"),
        "p10_bonus_template": _get_setting(rows, "p10_bonus_template", "{PLATE} - MUKOFOT {BONUS} SO'M"),
    }


def update_bonus_settings(db: Session, payload: dict) -> dict:
    int_map = {
        "bonus_amount": ("bonusAmount", 1000, 10_000_000),
        "bonus_per_press": ("bonusPerPress", 1000, 10_000_000),
        "bonus_every_visits": ("bonusEveryVisits", 1, 50),
        "pulse_value": ("pulseValue", 100, 1_000_000),
        "relay_pulse_ms": ("relayPulseMs", 30, 2000),
        "relay_pause_ms": ("relayPauseMs", 30, 2000),
    }
    str_map = {
        "p10_idle_text": "p10IdleText",
        "p10_visit_template": "p10VisitTemplate",
        "p10_bonus_template": "p10BonusTemplate",
    }
    for db_key, (camel_key, low, high) in int_map.items():
        raw = payload.get(db_key, payload.get(camel_key))
        if raw is not None:
            _upsert_setting(db, db_key, str(max(low, min(high, int(raw)))))
    for db_key, camel_key in str_map.items():
        raw = payload.get(db_key, payload.get(camel_key))
        if raw is not None:
            _upsert_setting(db, db_key, str(raw).strip()[:80])
    log_event(db, "settings_updated", "Bonus, Bill Acceptor va P10 qoidalari yangilandi")
    db.commit()
    return get_bonus_settings(db)


def get_anpr_settings(db: Session) -> dict:
    defaults = get_settings()
    rows = {r.key: r.value for r in db.query(AppSetting).all()}
    return {
        "agreement_threshold_pct": int(
            _get_setting(rows, "anpr_agreement_threshold_pct", str(int(defaults.anpr_agreement_threshold * 100)))
        ),
        "min_frames": int(_get_setting(rows, "anpr_min_frames", str(defaults.anpr_min_frames))),
        "window_size": int(_get_setting(rows, "anpr_window_size", str(defaults.anpr_window_size))),
        "max_frames": int(_get_setting(rows, "anpr_max_frames", str(defaults.anpr_max_frames))),
        "no_plate_abort_streak": int(
            _get_setting(rows, "anpr_no_plate_abort_streak", str(defaults.anpr_no_plate_abort_streak))
        ),
        "ocr_timeout_seconds": int(_get_setting(rows, "anpr_timeout_seconds", str(defaults.anpr_timeout_seconds))),
    }


def update_anpr_settings(db: Session, payload: dict) -> dict:
    mapping = {
        "agreement_threshold_pct": ("agreementThresholdPct", "anpr_agreement_threshold_pct", 50, 100),
        "min_frames": ("minFrames", "anpr_min_frames", 2, 15),
        "window_size": ("windowSize", "anpr_window_size", 2, 15),
        "max_frames": ("maxFrames", "anpr_max_frames", 5, 40),
        "no_plate_abort_streak": ("noPlateAbortStreak", "anpr_no_plate_abort_streak", 2, 15),
        "ocr_timeout_seconds": ("ocrTimeoutSeconds", "anpr_timeout_seconds", 1, 30),
    }
    for req_key, (camel_key, db_key, low, high) in mapping.items():
        raw = payload.get(req_key, payload.get(camel_key))
        if raw is not None:
            val = max(low, min(high, int(raw)))
            _upsert_setting(db, db_key, str(val))
    log_event(db, "anpr_settings_updated", "ANPR qaror parametrlari yangilandi")
    db.commit()
    return get_anpr_settings(db)


def get_security_settings(db: Session) -> dict:
    defaults = get_settings()
    rows = {r.key: r.value for r in db.query(AppSetting).all()}
    return {
        "auth_enabled": _get_setting(rows, "auth_enabled", "0") == "1",
        "admin_username": _get_setting(rows, "admin_username", defaults.admin_username),
        "admin_password": _get_setting(rows, "admin_password", defaults.admin_password),
        "admin_token_secret": _get_setting(rows, "admin_token_secret", defaults.admin_token_secret),
        "device_key": _get_setting(rows, "device_key", defaults.device_key),
        "app_env": _get_setting(rows, "app_env", defaults.app_env),
        "server_port": int(_get_setting(rows, "server_port", str(defaults.port))),
        "use_vaapi": _get_setting(rows, "use_vaapi", "1" if defaults.use_vaapi else "0") == "1",
        "vaapi_device": _get_setting(rows, "vaapi_device", defaults.vaapi_device),
        "anpr_enabled": _get_setting(rows, "anpr_enabled", "1" if defaults.anpr_enabled else "0") == "1",
        "timezone_offset_minutes": int(
            _get_setting(rows, "timezone_offset_minutes", str(defaults.report_timezone_offset_minutes))
        ),
    }


def update_security_settings(db: Session, payload: dict) -> dict:
    auth_val = payload.get("auth_enabled", payload.get("authEnabled"))
    if auth_val is not None:
        _upsert_setting(db, "auth_enabled", "1" if auth_val else "0")
    str_pairs = {
        "admin_username": "adminUsername",
        "admin_password": "adminPassword",
        "admin_token_secret": "adminTokenSecret",
        "device_key": "deviceKey",
        "vaapi_device": "vaapiDevice",
    }
    for key, camel in str_pairs.items():
        raw = payload.get(key, payload.get(camel))
        if raw is not None and str(raw).strip():
            _upsert_setting(db, key, str(raw).strip())
    env_val = payload.get("app_env", payload.get("appEnv"))
    if env_val in ("prod", "dev"):
        _upsert_setting(db, "app_env", str(env_val))
    port_val = payload.get("server_port", payload.get("serverPort"))
    if port_val is not None:
        _upsert_setting(db, "server_port", str(max(80, min(65535, int(port_val)))))
    vaapi_val = payload.get("use_vaapi", payload.get("useVaapi"))
    if vaapi_val is not None:
        _upsert_setting(db, "use_vaapi", "1" if vaapi_val else "0")
    anpr_val = payload.get("anpr_enabled", payload.get("anprEnabled"))
    if anpr_val is not None:
        _upsert_setting(db, "anpr_enabled", "1" if anpr_val else "0")
    tz_val = payload.get("timezone_offset_minutes", payload.get("timezoneOffsetMinutes"))
    if tz_val is not None:
        _upsert_setting(db, "timezone_offset_minutes", str(int(tz_val)))
    log_event(db, "security_updated", "Muhit, xavfsizlik va tizim sozlamalari yangilandi")
    db.commit()
    return get_security_settings(db)


def get_tailscale_settings(db: Session) -> dict:
    rows = {r.key: r.value for r in db.query(AppSetting).all()}
    return {
        "hostname": _get_setting(rows, "tailscale_hostname", "moyka-server.tail84a12.ts.net"),
        "servePort": int(_get_setting(rows, "tailscale_serve_port", "8000")),
        "enabled": _get_setting(rows, "tailscale_enabled", "1") == "1",
    }


def update_tailscale_settings(db: Session, payload: dict) -> dict:
    if "hostname" in payload:
        _upsert_setting(db, "tailscale_hostname", str(payload["hostname"]).strip())
    serve_port = payload.get("servePort", payload.get("serve_port"))
    if serve_port is not None:
        _upsert_setting(db, "tailscale_serve_port", str(max(80, min(65535, int(serve_port)))))
    if "enabled" in payload:
        _upsert_setting(db, "tailscale_enabled", "1" if payload["enabled"] else "0")
    log_event(db, "tailscale_updated", f"Tailscale: {payload.get('hostname', '')}")
    db.commit()
    return get_tailscale_settings(db)


def expire_active_bonus(db: Session, visit: Visit) -> None:
    visit.is_active_bonus = 0
    visit.bonus_left = 0


def cancel_box_active_bonus(db: Session, box_id: str) -> dict:
    active = (
        db.query(Visit)
        .filter(Visit.box_id == box_id, Visit.is_active_bonus == 1)
        .all()
    )
    for visit in active:
        expire_active_bonus(db, visit)
    log_event(db, "bonus_cancelled", f"{box_id} faol bonusi bekor qilindi")
    db.commit()
    return {"ok": True, "cancelled": len(active)}


def process_plate_detection(
    db: Session,
    *,
    plate: str,
    box_id: str,
    agreement_pct: int | None = 100,
    frames_used: int = 5,
    source: str = "auto_80_anpr",
    image_key: str | None = None,
) -> dict:
    clean_plate = normalize_plate(plate)
    if not is_valid_plate(clean_plate):
        raise ValueError(f"Invalid Uzbekistan plate: {plate}")

    box = db.query(WashBox).filter(WashBox.id == box_id).first()
    if box is None:
        raise ValueError(f"Box not found: {box_id}")

    car = db.query(Car).filter(Car.plate == clean_plate).first()
    if car is None:
        car = Car(plate=clean_plate)
        db.add(car)
        db.flush()

    visit_count = db.query(Visit).filter(Visit.car_id == car.id).count()
    next_visit_no = visit_count + 1

    cfg = get_bonus_settings(db)
    earns_bonus = next_visit_no % cfg["bonus_every_visits"] == 0
    awarded = cfg["bonus_amount"] if earns_bonus else 0

    if earns_bonus:
        active_visits = db.query(Visit).filter(Visit.is_active_bonus == 1).all()
        for prev_active in active_visits:
            expire_active_bonus(db, prev_active)

    visit = Visit(
        car_id=car.id,
        box_id=box.id,
        visit_no=next_visit_no,
        bonus_total=awarded,
        bonus_left=awarded,
        is_active_bonus=1 if earns_bonus else 0,
        agreement_pct=agreement_pct,
        frames_used=frames_used,
        source=source,
        image_key=image_key,
    )
    db.add(visit)
    log_event(
        db,
        "visit_registered",
        f"{box.id} · {clean_plate} · {next_visit_no}-kelish · bonus={awarded}",
    )
    db.commit()
    db.refresh(visit)
    return {
        "visit_id": visit.id,
        "plate": clean_plate,
        "box_id": box.id,
        "visit_no": next_visit_no,
        "earns_bonus": earns_bonus,
        "bonus_awarded": awarded,
    }


def get_display_text(db: Session, box_id: str) -> dict:
    cfg = get_bonus_settings(db)
    latest = (
        db.query(Visit)
        .filter(Visit.box_id == box_id)
        .order_by(Visit.id.desc())
        .first()
    )
    if latest is None:
        return {
            "box_id": box_id,
            "status": "idle",
            "text": cfg["p10_idle_text"],
            "bonus_left": 0,
            "relay_pulse_ms": cfg["relay_pulse_ms"],
            "relay_pause_ms": cfg["relay_pause_ms"],
        }
    plate = latest.car.plate
    if latest.is_active_bonus and latest.bonus_left > 0:
        text = (
            cfg["p10_bonus_template"]
            .replace("{PLATE}", plate)
            .replace("{VISIT}", str(latest.visit_no))
            .replace("{BONUS}", str(latest.bonus_left))
        )
        return {
            "box_id": box_id,
            "status": "bonus_active",
            "text": text,
            "bonus_left": latest.bonus_left,
            "relay_pulse_ms": cfg["relay_pulse_ms"],
            "relay_pause_ms": cfg["relay_pause_ms"],
        }
    text = (
        cfg["p10_visit_template"]
        .replace("{PLATE}", plate)
        .replace("{VISIT}", str(latest.visit_no))
        .replace("{BONUS}", "0")
    )
    return {
        "box_id": box_id,
        "status": "occupied",
        "text": text,
        "bonus_left": 0,
        "relay_pulse_ms": cfg["relay_pulse_ms"],
        "relay_pause_ms": cfg["relay_pause_ms"],
    }


def press_bonus(db: Session, *, box_id: str, press_id: str) -> dict:
    existing = db.query(BonusPulse).filter(BonusPulse.press_id == press_id).first()
    if existing is not None:
        visit = db.query(Visit).filter(Visit.id == existing.visit_id).first()
        cfg = get_bonus_settings(db)
        return {
            "ok": True,
            "duplicate": True,
            "amount": existing.amount,
            "pulse_count": max(1, existing.amount // max(1, cfg["pulse_value"])),
            "bonus_left": visit.bonus_left if visit else 0,
            "relay_pulse_ms": cfg["relay_pulse_ms"],
            "relay_pause_ms": cfg["relay_pause_ms"],
        }

    visit = (
        db.query(Visit)
        .filter(Visit.box_id == box_id, Visit.is_active_bonus == 1, Visit.bonus_left > 0)
        .order_by(Visit.id.desc())
        .first()
    )
    if visit is None:
        return {"ok": False, "pulse_count": 0, "bonus_left": 0, "message": "No active bonus"}

    cfg = get_bonus_settings(db)
    deducted = min(cfg["bonus_per_press"], visit.bonus_left)
    visit.bonus_left -= deducted
    if visit.bonus_left <= 0:
        visit.bonus_left = 0
        visit.is_active_bonus = 0

    pulse_count = max(1, deducted // max(1, cfg["pulse_value"]))
    pulse = BonusPulse(
        visit_id=visit.id,
        box_id=box_id,
        plate=visit.car.plate,
        amount=deducted,
        press_id=press_id,
    )
    db.add(pulse)
    log_event(db, "bonus_pressed", f"{box_id} · {visit.car.plate} · -{deducted} ({pulse_count} impuls)")
    db.commit()
    return {
        "ok": True,
        "duplicate": False,
        "amount": deducted,
        "pulse_count": pulse_count,
        "bonus_left": visit.bonus_left,
        "relay_pulse_ms": cfg["relay_pulse_ms"],
        "relay_pause_ms": cfg["relay_pause_ms"],
    }


def refund_pulse(db: Session, pulse_id: int) -> dict:
    pulse = db.query(BonusPulse).filter(BonusPulse.id == pulse_id).first()
    if pulse is None or pulse.refunded_at is not None:
        raise ValueError("Pulse not found or already refunded")

    other_active = (
        db.query(Visit)
        .filter(Visit.is_active_bonus == 1, Visit.id != pulse.visit_id)
        .first()
    )
    if other_active is not None:
        raise ValueError("Another box already has an active bonus")

    visit = db.query(Visit).filter(Visit.id == pulse.visit_id).first()
    if visit is None:
        raise ValueError("Visit not found")

    pulse.refunded_at = utcnow()
    visit.bonus_left = min(visit.bonus_total, visit.bonus_left + pulse.amount)
    visit.is_active_bonus = 1 if visit.bonus_left > 0 else 0
    log_event(db, "pulse_refunded", f"{pulse.box_id} · {pulse.plate} · +{pulse.amount}")
    db.commit()
    return {"ok": True, "bonus_left": visit.bonus_left}


def create_pending_detection(
    db: Session,
    *,
    box_id: str,
    event_id: str,
    suggested_plate: str | None,
    votes: int,
    frames_taken: int,
    agreement_pct: int,
    image_key: str | None = None,
) -> PendingDetection:
    item = PendingDetection(
        box_id=box_id,
        event_id=event_id,
        suggested_plate=suggested_plate,
        votes=votes,
        frames_taken=frames_taken,
        agreement_pct=agreement_pct,
        image_key=image_key,
    )
    db.add(item)
    log_event(db, "pending_created", f"{box_id} · {suggested_plate or 'no-plate'} ({agreement_pct}%)")
    db.commit()
    db.refresh(item)
    return item


def confirm_pending(db: Session, pending_id: int, plate: str) -> dict:
    item = db.query(PendingDetection).filter(PendingDetection.id == pending_id, PendingDetection.resolved == 0).first()
    if item is None:
        raise ValueError("Pending detection not found")
    res = process_plate_detection(
        db,
        plate=plate,
        box_id=item.box_id,
        agreement_pct=item.agreement_pct,
        frames_used=item.frames_taken,
        source="manual_confirmed",
        image_key=item.image_key,
    )
    item.resolved = 1
    db.commit()
    return res


def dismiss_pending(db: Session, pending_id: int) -> dict:
    item = db.query(PendingDetection).filter(PendingDetection.id == pending_id, PendingDetection.resolved == 0).first()
    if item is None:
        raise ValueError("Pending detection not found")
    item.resolved = 1
    log_event(db, "pending_dismissed", f"{item.box_id} · {item.suggested_plate or 'unknown'} bekor qilindi")
    db.commit()
    return {"ok": True}


def export_visits_csv(db: Session) -> str:
    visits = db.query(Visit).order_by(Visit.id.desc()).limit(1000).all()
    lines = ["plate,visit_no,box_id,created_at,bonus_total,bonus_left,is_active_bonus,agreement_pct,source"]
    for v in visits:
        lines.append(
            f"{v.car.plate},{v.visit_no},{v.box_id},{v.created_at.isoformat()}Z,"
            f"{v.bonus_total},{v.bonus_left},{v.is_active_bonus},{v.agreement_pct or ''},{v.source}"
        )
    return "\n".join(lines)
