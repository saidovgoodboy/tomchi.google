"""Tomchi Linux ilovasi uchun asosiy FastAPI serveri (API + React PWA static)."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
import shutil
import subprocess
from typing import Any

from datetime import datetime, timezone
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import create_session_token, verify_session_token
from app.box_state import NormalizedROI
from app.camera_worker import CameraBoxConfig, IPCameraManager
from app.capture import CaptureSession
from app.config import get_settings
from app.crud import (
    cancel_box_active_bonus,
    confirm_pending,
    create_pending_detection,
    dismiss_pending,
    ensure_seed_data,
    export_visits_csv,
    get_anpr_settings,
    get_bonus_settings,
    get_display_text,
    get_security_settings,
    get_tailscale_settings,
    log_event,
    press_bonus,
    process_plate_detection,
    refund_pulse,
    update_anpr_settings,
    update_bonus_settings,
    update_security_settings,
    update_tailscale_settings,
)
from app.db import Base, SessionLocal, engine, get_db
from app.models import BonusPulse, DeviceLog, PendingDetection, Visit, WashBox
from app.ocr import normalize_plate, recognize_plate_tesseract
from app.provisioning import CameraBrand, Esp32PairingStore, build_camera_endpoints

camera_manager = IPCameraManager(max_boxes=20)
pairing_store = Esp32PairingStore(ttl_seconds=600)
_virtual_box_runtime: dict[str, dict[str, Any]] = {}


def _register_all_boxes() -> None:
    settings = get_settings()
    with SessionLocal() as db:
        ensure_seed_data(db)
        anpr_cfg = get_anpr_settings(db)
        sec_cfg = get_security_settings(db)
        for box in db.query(WashBox).all():
            cfg = CameraBoxConfig(
                box_id=box.id,
                low_stream_url=box.low_stream_url,
                high_stream_url=box.high_stream_url,
                snapshot_url=box.snapshot_url or None,
                roi=NormalizedROI(x=box.roi_x, y=box.roi_y, w=box.roi_w, h=box.roi_h),
                use_vaapi=bool(box.use_vaapi) and bool(sec_cfg["use_vaapi"]),
                vaapi_device=str(sec_cfg["vaapi_device"]),
                virtual_mode=bool(box.virtual_mode),
            )
            camera_manager.register_box(
                cfg,
                start_worker=(not bool(box.virtual_mode)) and bool(sec_cfg["anpr_enabled"]),
                recognize_plate=lambda b, t=anpr_cfg["ocr_timeout_seconds"]: recognize_plate_tesseract(
                    b, command=settings.anpr_tesseract_cmd, timeout_seconds=t
                ),
                on_finalized=lambda b_id, plate, _jpg, dec: _on_worker_finalized(b_id, plate, dec.agreement, dec.best_frame_index or 5),
                on_pending=lambda b_id, ev_id, plate, _jpg, dec: _on_worker_pending(b_id, ev_id, plate, dec.votes, dec.agreement),
            )


def _on_worker_finalized(box_id: str, plate: str, agreement: float, frames_used: int) -> None:
    with SessionLocal() as db:
        process_plate_detection(
            db,
            plate=plate,
            box_id=box_id,
            agreement_pct=round(agreement * 100),
            frames_used=max(5, frames_used),
        )


def _on_worker_pending(box_id: str, event_id: str, plate: str | None, votes: int, agreement: float) -> None:
    with SessionLocal() as db:
        create_pending_detection(
            db,
            box_id=box_id,
            event_id=event_id,
            suggested_plate=plate,
            votes=votes,
            frames_taken=15,
            agreement_pct=round(agreement * 100),
        )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _register_all_boxes()
    yield
    camera_manager.stop_all()


app = FastAPI(title="Tomchi Linux App", lifespan=lifespan)


def require_device(x_device_key: str = Header(default=""), db: Session = Depends(get_db)) -> None:
    sec = get_security_settings(db)
    if x_device_key != sec["device_key"]:
        raise HTTPException(status_code=401, detail="Invalid device key")


def require_admin(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> str:
    sec = get_security_settings(db)
    if not sec["auth_enabled"]:
        return sec["admin_username"]
    token = authorization.removeprefix("Bearer ").strip()
    user = verify_session_token(token, secret=sec["admin_token_secret"])
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


class LoginPayload(BaseModel):
    username: str
    password: str


class BoxRenamePayload(BaseModel):
    name: str


class CameraUpdatePayload(BaseModel):
    name: str | None = None
    virtualMode: bool | None = None
    virtual_mode: bool | None = None
    cameraBrand: CameraBrand | None = None
    camera_brand: CameraBrand | None = None
    cameraIp: str | None = None
    camera_ip: str | None = None
    username: str = "admin"
    password: str = "pass"
    lowStreamUrl: str | None = None
    low_stream_url: str | None = None
    highStreamUrl: str | None = None
    high_stream_url: str | None = None
    snapshotUrl: str | None = None
    snapshot_url: str | None = None
    useVaapi: bool | None = None
    use_vaapi: bool | None = None
    roi: dict[str, float] | None = None


class BurstPayload(BaseModel):
    preset: str = "consensus_4_5"
    customPlate: str = "01A888BC"
    visual: str = "sedan"


class ManualVisitPayload(BaseModel):
    box_id: str
    plate: str


class PairClaimPayload(BaseModel):
    code: str
    mac: str = ""


class BonusPressPayload(BaseModel):
    box_id: str
    press_id: str


class ConfirmPendingPayload(BaseModel):
    plate: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/login")
def login(payload: LoginPayload, db: Session = Depends(get_db)) -> dict[str, str]:
    sec = get_security_settings(db)
    if payload.username != sec["admin_username"] or payload.password != sec["admin_password"]:
        raise HTTPException(status_code=401, detail="Noto'g'ri login yoki parol")
    log_event(db, "admin_login", f"Admin kirdi: {payload.username}")
    db.commit()
    return {"token": create_session_token(payload.username, secret=sec["admin_token_secret"]), "username": payload.username}


def _to_camel_settings(s: dict[str, Any]) -> dict[str, Any]:
    return {
        "bonusEveryVisits": s["bonus_every_visits"],
        "bonusAmount": s["bonus_amount"],
        "bonusPerPress": s["bonus_per_press"],
        "pulseValue": s["pulse_value"],
        "relayPulseMs": s["relay_pulse_ms"],
        "relayPauseMs": s["relay_pause_ms"],
        "p10IdleText": s["p10_idle_text"],
        "p10VisitTemplate": s["p10_visit_template"],
        "p10BonusTemplate": s["p10_bonus_template"],
    }


def _to_camel_anpr(a: dict[str, Any]) -> dict[str, Any]:
    return {
        "agreementThresholdPct": a["agreement_threshold_pct"],
        "minFrames": a["min_frames"],
        "windowSize": a["window_size"],
        "maxFrames": a["max_frames"],
        "noPlateAbortStreak": a["no_plate_abort_streak"],
        "ocrTimeoutSeconds": a["ocr_timeout_seconds"],
    }


def _to_camel_security(sec: dict[str, Any]) -> dict[str, Any]:
    return {
        "authEnabled": sec["auth_enabled"],
        "adminUsername": sec["admin_username"],
        "adminPassword": sec["admin_password"],
        "adminTokenSecret": sec["admin_token_secret"],
        "deviceKey": sec["device_key"],
        "appEnv": sec["app_env"],
        "serverPort": sec["server_port"],
        "useVaapi": sec["use_vaapi"],
        "vaapiDevice": sec["vaapi_device"],
        "anprEnabled": sec["anpr_enabled"],
        "timezoneOffsetMinutes": sec["timezone_offset_minutes"],
    }


def _build_app_state(db: Session) -> dict[str, Any]:
    bonus_cfg = get_bonus_settings(db)
    boxes_out = []
    for box in db.query(WashBox).order_by(WashBox.id.asc()).all():
        state, score = camera_manager.get_box_runtime(box.id)
        virt = _virtual_box_runtime.get(box.id)
        display = get_display_text(db, box.id)
        latest_visit = (
            db.query(Visit).filter(Visit.box_id == box.id).order_by(Visit.id.desc()).first()
        )
        eff_state = virt["state"] if virt else state
        eff_score = virt["occupancyScore"] if virt else score
        eff_plate = virt["currentPlate"] if virt else (latest_visit.car.plate if latest_visit else None)
        eff_display = virt["displayText"] if (virt and virt.get("displayText")) else display["text"]
        boxes_out.append(
            {
                "id": box.id,
                "name": box.name,
                "virtualMode": bool(box.virtual_mode),
                "state": eff_state,
                "cameraBrand": box.camera_brand,
                "cameraIp": box.camera_ip,
                "lowStreamUrl": box.low_stream_url,
                "highStreamUrl": box.high_stream_url,
                "snapshotUrl": box.snapshot_url,
                "useVaapi": bool(box.use_vaapi),
                "roi": {"x": box.roi_x, "y": box.roi_y, "w": box.roi_w, "h": box.roi_h},
                "occupancyScore": eff_score,
                "currentPlate": eff_plate,
                "vehicleVisual": virt.get("vehicleVisual", "empty") if virt else ("sedan" if eff_plate else "empty"),
                "activeBonusLeft": display["bonus_left"],
                "displayText": eff_display if eff_state != "empty" else bonus_cfg["p10_idle_text"],
                "lastCaptureStatus": virt.get("lastCaptureStatus") if virt else ("finalized" if latest_visit else None),
                "lastAgreement": virt.get("lastAgreement") if virt else ((latest_visit.agreement_pct / 100.0) if (latest_visit and latest_visit.agreement_pct is not None) else None),
                "esp32Paired": bool(box.esp32_paired),
                "pairingCode": virt.get("pairingCode") if virt else None,
            }
        )
    visits_out = [
        {
            "id": v.id,
            "plate": v.car.plate,
            "boxId": v.box_id,
            "visitNo": v.visit_no,
            "createdAt": v.created_at.isoformat() + "Z",
            "bonusTotal": v.bonus_total,
            "bonusLeft": v.bonus_left,
            "isActiveBonus": bool(v.is_active_bonus),
            "agreementPct": v.agreement_pct,
            "framesUsed": v.frames_used,
            "source": v.source,
            "imageUrl": "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=960&q=80",
        }
        for v in db.query(Visit).order_by(Visit.id.desc()).limit(200).all()
    ]
    pending_out = [
        {
            "id": p.id,
            "boxId": p.box_id,
            "eventId": p.event_id,
            "suggestedPlate": p.suggested_plate,
            "votes": p.votes,
            "framesTaken": p.frames_taken,
            "agreementPct": p.agreement_pct,
            "createdAt": p.created_at.isoformat() + "Z",
            "imageUrl": "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=960&q=80",
        }
        for p in db.query(PendingDetection)
        .filter(PendingDetection.resolved == 0)
        .order_by(PendingDetection.id.desc())
        .all()
    ]
    pulses_out = [
        {
            "id": p.id,
            "visitId": p.visit_id,
            "boxId": p.box_id,
            "plate": p.plate,
            "amount": p.amount,
            "pressId": p.press_id,
            "createdAt": p.created_at.isoformat() + "Z",
            "refundedAt": p.refunded_at.isoformat() + "Z" if p.refunded_at else None,
        }
        for p in db.query(BonusPulse).order_by(BonusPulse.id.desc()).limit(100).all()
    ]
    logs_out = [
        {
            "id": l.id,
            "event": l.event,
            "payload": l.payload,
            "createdAt": l.created_at.isoformat() + "Z",
        }
        for l in db.query(DeviceLog).order_by(DeviceLog.id.desc()).limit(100).all()
    ]
    return {
        "boxes": boxes_out,
        "visits": visits_out,
        "pending": pending_out,
        "pulses": pulses_out,
        "logs": logs_out,
        "settings": _to_camel_settings(bonus_cfg),
        "anpr": _to_camel_anpr(get_anpr_settings(db)),
        "security": _to_camel_security(get_security_settings(db)),
        "tailscale": get_tailscale_settings(db),
    }


@app.get("/api/state")
def get_state(db: Session = Depends(get_db)) -> dict[str, Any]:
    return _build_app_state(db)


@app.post("/api/boxes")
def add_box(db: Session = Depends(get_db)) -> dict[str, Any]:
    count = db.query(WashBox).count()
    if count >= 20:
        raise HTTPException(status_code=400, detail="Maximum 20 boxes supported")
    num = count + 1
    while db.query(WashBox).filter(WashBox.id == f"box-{num}").first() is not None:
        num += 1
    ip = f"192.168.1.{100 + num}"
    endpoints = build_camera_endpoints(brand="hikvision", host=ip, username="admin", password="pass")
    box = WashBox(
        id=f"box-{num}",
        name=f"Box {num}",
        virtual_mode=1,
        camera_brand="hikvision",
        camera_ip=ip,
        low_stream_url=endpoints.low_stream_url,
        high_stream_url=endpoints.high_stream_url,
        snapshot_url=endpoints.snapshot_url or "",
        use_vaapi=1,
    )
    db.add(box)
    log_event(db, "box_added", f"{box.id} ({box.name})")
    db.commit()
    _register_all_boxes()
    return {"id": box.id, "name": box.name, "state": _build_app_state(db)}


@app.put("/api/boxes/{box_id}")
def rename_box(box_id: str, payload: BoxRenamePayload, db: Session = Depends(get_db)) -> dict[str, Any]:
    box = db.query(WashBox).filter(WashBox.id == box_id).first()
    if box is None:
        raise HTTPException(status_code=404, detail="Box not found")
    clean_name = payload.name.strip()
    if clean_name:
        box.name = clean_name[:60]
        log_event(db, "box_renamed", f"{box_id} -> {box.name}")
        db.commit()
    return {"status": "updated", "name": box.name, "state": _build_app_state(db)}


@app.delete("/api/boxes/{box_id}")
def delete_box(box_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    if db.query(WashBox).count() <= 1:
        return JSONResponse(status_code=400, content={"error": "Kamida 1 ta box qolishi kerak"})
    box = db.query(WashBox).filter(WashBox.id == box_id).first()
    if box is None:
        raise HTTPException(status_code=404, detail="Box not found")
    _virtual_box_runtime.pop(box_id, None)
    db.delete(box)
    log_event(db, "box_deleted", f"{box_id} o'chirildi")
    db.commit()
    _register_all_boxes()
    return {"status": "deleted", "state": _build_app_state(db)}


@app.put("/api/boxes/{box_id}/camera")
def update_box_camera(box_id: str, payload: CameraUpdatePayload, db: Session = Depends(get_db)) -> dict[str, Any]:
    box = db.query(WashBox).filter(WashBox.id == box_id).first()
    if box is None:
        raise HTTPException(status_code=404, detail="Box not found")
    eff_brand: CameraBrand = payload.cameraBrand or payload.camera_brand or box.camera_brand  # type: ignore[assignment]
    eff_ip = payload.cameraIp or payload.camera_ip or box.camera_ip
    eff_virtual = payload.virtualMode if payload.virtualMode is not None else (
        payload.virtual_mode if payload.virtual_mode is not None else bool(box.virtual_mode)
    )
    eff_vaapi = payload.useVaapi if payload.useVaapi is not None else (
        payload.use_vaapi if payload.use_vaapi is not None else bool(box.use_vaapi)
    )
    endpoints = build_camera_endpoints(
        brand=eff_brand,
        host=eff_ip,
        username=payload.username,
        password=payload.password,
    )
    if payload.name and payload.name.strip():
        box.name = payload.name.strip()[:60]
    box.virtual_mode = 1 if eff_virtual else 0
    box.camera_brand = eff_brand
    box.camera_ip = eff_ip
    box.low_stream_url = payload.lowStreamUrl or payload.low_stream_url or endpoints.low_stream_url
    box.high_stream_url = payload.highStreamUrl or payload.high_stream_url or endpoints.high_stream_url
    snap = payload.snapshotUrl if payload.snapshotUrl is not None else payload.snapshot_url
    box.snapshot_url = snap if snap is not None else (endpoints.snapshot_url or "")
    box.use_vaapi = 1 if eff_vaapi else 0
    if payload.roi:
        box.roi_x = float(payload.roi.get("x", box.roi_x))
        box.roi_y = float(payload.roi.get("y", box.roi_y))
        box.roi_w = float(payload.roi.get("w", box.roi_w))
        box.roi_h = float(payload.roi.get("h", box.roi_h))
    log_event(db, "camera_updated", f"{box_id} ({'virtual' if box.virtual_mode else box.camera_ip})")
    db.commit()
    _register_all_boxes()
    return {"ok": True, "state": _build_app_state(db)}


@app.post("/api/boxes/{box_id}/simulate-exit")
def simulate_box_exit(box_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _virtual_box_runtime[box_id] = {
        "state": "empty",
        "occupancyScore": 0.02,
        "currentPlate": None,
        "vehicleVisual": "empty",
        "displayText": None,
    }
    log_event(db, "box_exit", f"{box_id} bo'shadi")
    db.commit()
    return {"ok": True, "state": _build_app_state(db)}


@app.post("/api/boxes/{box_id}/burst")
def run_virtual_burst(box_id: str, payload: BurstPayload, db: Session = Depends(get_db)) -> dict[str, Any]:
    box = db.query(WashBox).filter(WashBox.id == box_id).first()
    if box is None:
        raise HTTPException(status_code=404, detail="Box not found")
    anpr = get_anpr_settings(db)
    plate_clean = normalize_plate(payload.customPlate) or "01A888BC"
    preset = payload.preset
    max_f = anpr["max_frames"]
    abort_streak = anpr["no_plate_abort_streak"]

    if preset == "consensus_5_5":
        seq = [(plate_clean, 0.94)] * 5
    elif preset == "consensus_4_5":
        seq = [(plate_clean, 0.89), (plate_clean, 0.91), (None, 0.0), (plate_clean, 0.93), (plate_clean, 0.88)]
    elif preset == "mixed_pending":
        alt = "01B777AA" if plate_clean != "01B777AA" else "01C555DD"
        seq = [
            (plate_clean, 0.72), (alt, 0.65), (None, 0.0), (plate_clean, 0.74), (alt, 0.69),
            (None, 0.0), (plate_clean, 0.76), (alt, 0.66), (plate_clean, 0.73), (None, 0.0),
            (plate_clean, 0.75), (alt, 0.68), (None, 0.0), (plate_clean, 0.74), (alt, 0.67),
        ][:max_f]
    else:
        seq = [(None, 0.0)] * abort_streak

    session = CaptureSession(
        box_id=box_id,
        event_id=f"{box_id}-{int(datetime.now(timezone.utc).timestamp())}",
        min_frames=anpr["min_frames"],
        window_size=anpr["window_size"],
        agreement_threshold=anpr["agreement_threshold_pct"] / 100.0,
        max_frames=anpr["max_frames"],
        no_plate_abort_streak=abort_streak,
    )
    frames_out = []
    final_dec = session.decision
    for idx, (cand, conf) in enumerate(seq):
        final_dec = session.add_frame(cand, conf)
        frames_out.append({
            "frameIndex": idx + 1,
            "timestamp": datetime.now(timezone.utc).strftime("%H:%M:%S"),
            "plate": cand,
            "confidence": conf,
            "windowVotes": final_dec.votes,
            "windowLength": min(len(session.window), anpr["window_size"]) or 1,
            "agreement": final_dec.agreement,
            "decisionStatus": final_dec.status,
        })
        if final_dec.status != "continue":
            break

    if final_dec.status == "finalized" and final_dec.plate:
        res = process_plate_detection(
            db,
            plate=final_dec.plate,
            box_id=box_id,
            agreement_pct=round(final_dec.agreement * 100),
            frames_used=len(frames_out),
            source="auto_80_anpr",
        )
        _virtual_box_runtime[box_id] = {
            "state": "occupied",
            "occupancyScore": 0.91,
            "currentPlate": final_dec.plate,
            "vehicleVisual": payload.visual,
            "lastCaptureStatus": "finalized",
            "lastAgreement": final_dec.agreement,
        }
        summary_uz = (
            f"Tasdiqlandi ({round(final_dec.agreement * 100)}%): {final_dec.plate} · "
            f"{res['visit_no']}-kelish yaratildi"
            + (f" va {res['bonus_awarded']} so'm bonus yoqildi." if res["earns_bonus"] else ".")
        )
        summary_ru = (
            f"Подтверждено ({round(final_dec.agreement * 100)}%): {final_dec.plate} · "
            f"визит #{res['visit_no']}"
            + (f" + бонус {res['bonus_awarded']} сум." if res["earns_bonus"] else ".")
        )
    elif final_dec.status == "pending":
        create_pending_detection(
            db,
            box_id=box_id,
            event_id=session.event_id,
            suggested_plate=final_dec.plate,
            votes=final_dec.votes,
            frames_taken=len(frames_out),
            agreement_pct=round(final_dec.agreement * 100),
        )
        _virtual_box_runtime[box_id] = {
            "state": "occupied",
            "occupancyScore": 0.68,
            "currentPlate": final_dec.plate,
            "vehicleVisual": payload.visual,
            "lastCaptureStatus": "pending",
            "lastAgreement": final_dec.agreement,
            "displayText": "ADMIN TEKSHIRUVI KUTILMOQDA",
        }
        summary_uz = f"{len(frames_out)} kadrda {anpr['agreement_threshold_pct']}% ga yetmadi. Tasdiqlash navbatiga yuborildi."
        summary_ru = f"За {len(frames_out)} кадров не набрано {anpr['agreement_threshold_pct']}%. Отправлено на проверку."
    else:
        _virtual_box_runtime[box_id] = {
            "state": "empty",
            "occupancyScore": 0.03,
            "currentPlate": None,
            "vehicleVisual": "empty",
            "lastCaptureStatus": "aborted",
            "lastAgreement": 0.0,
        }
        summary_uz = f"Ketma-ket {abort_streak} kadrda raqam topilmadi — bekor qilindi."
        summary_ru = f"{abort_streak} пустых кадров подряд — отменено."

    return {
        "frames": frames_out,
        "summaryUz": summary_uz,
        "summaryRu": summary_ru,
        "state": _build_app_state(db),
    }


@app.post("/api/visits/manual")
def create_manual_visit(payload: ManualVisitPayload, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        res = process_plate_detection(
            db,
            plate=payload.plate,
            box_id=payload.box_id,
            agreement_pct=100,
            frames_used=1,
            source="manual_entry",
        )
        _virtual_box_runtime[payload.box_id] = {
            "state": "occupied",
            "occupancyScore": 0.92,
            "currentPlate": res["plate"],
            "vehicleVisual": "sedan",
            "lastCaptureStatus": "finalized",
            "lastAgreement": 1.0,
        }
        return {"ok": True, "outcome": res, "state": _build_app_state(db)}
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})


@app.post("/api/boxes/{box_id}/cancel-bonus")
def cancel_active_bonus_route(box_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    res = cancel_box_active_bonus(db, box_id)
    return {**res, "state": _build_app_state(db)}


@app.post("/api/boxes/{box_id}/pairing-code")
def issue_esp32_code(box_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    box = db.query(WashBox).filter(WashBox.id == box_id).first()
    if box is None:
        raise HTTPException(status_code=404, detail="Box not found")
    token = pairing_store.issue_code(box_id)
    prev = _virtual_box_runtime.get(box_id, {})
    _virtual_box_runtime[box_id] = {**prev, "pairingCode": token.code}
    log_event(db, "pairing_code_issued", f"{box_id} -> {token.code}")
    db.commit()
    return {"box_id": box_id, "code": token.code, "state": _build_app_state(db)}


@app.post("/api/devices/pair")
def claim_esp32_code(payload: PairClaimPayload, db: Session = Depends(get_db)) -> dict[str, Any]:
    sec = get_security_settings(db)
    try:
        claimed = pairing_store.claim_code(payload.code, device_key=sec["device_key"])
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    box = db.query(WashBox).filter(WashBox.id == claimed["box_id"]).first()
    if box is not None:
        box.esp32_paired = 1
        if box.id in _virtual_box_runtime:
            _virtual_box_runtime[box.id]["pairingCode"] = None
        log_event(db, "esp32_paired", f"{box.id} MAC={payload.mac or 'unknown'}")
        db.commit()
    return {**claimed, "state": _build_app_state(db)}


@app.get("/api/display")
def display(box_id: str, db: Session = Depends(get_db)) -> dict:
    return get_display_text(db, box_id)


@app.post("/api/bonus/press")
def bonus_press(payload: BonusPressPayload, db: Session = Depends(get_db)) -> dict[str, Any]:
    res = press_bonus(db, box_id=payload.box_id, press_id=payload.press_id)
    return {**res, "state": _build_app_state(db)}


@app.post("/api/pulses/{pulse_id}/refund")
def pulse_refund(pulse_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        res = refund_pulse(db, pulse_id)
        return {**res, "state": _build_app_state(db)}
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})


@app.post("/api/pending/{pending_id}/confirm")
def pending_confirm(pending_id: int, payload: ConfirmPendingPayload, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        res = confirm_pending(db, pending_id, payload.plate)
        return {**res, "state": _build_app_state(db)}
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})


@app.post("/api/pending/{pending_id}/dismiss")
def pending_dismiss(pending_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        res = dismiss_pending(db, pending_id)
        return {**res, "state": _build_app_state(db)}
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})


@app.put("/api/settings")
def put_settings(payload: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    update_bonus_settings(db, payload)
    return {"ok": True, "state": _build_app_state(db)}


@app.put("/api/settings/anpr")
def put_anpr_settings(payload: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    update_anpr_settings(db, payload)
    _register_all_boxes()
    return {"ok": True, "state": _build_app_state(db)}


@app.put("/api/settings/security")
def put_security_settings(payload: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    update_security_settings(db, payload)
    _register_all_boxes()
    return {"ok": True, "state": _build_app_state(db)}


@app.put("/api/system/tailscale")
def put_tailscale_settings(payload: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    update_tailscale_settings(db, payload)
    return {"ok": True, "state": _build_app_state(db)}


@app.delete("/api/logs")
def clear_logs(db: Session = Depends(get_db)) -> dict[str, Any]:
    db.query(DeviceLog).delete()
    db.commit()
    return {"status": "cleared", "state": _build_app_state(db)}


@app.get("/api/visits/export.csv")
def visits_csv(db: Session = Depends(get_db)) -> PlainTextResponse:
    return PlainTextResponse(
        content=export_visits_csv(db),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tomchi-visits.csv"},
    )


@app.get("/api/firmware/files")
def firmware_files() -> dict[str, Any]:
    fw_dir = get_settings().firmware_dir
    ino_path = fw_dir / "tomchi_panel" / "tomchi_panel.ino"
    readme_path = fw_dir / "README.md"
    return {
        "ino": ino_path.read_text(encoding="utf-8") if ino_path.exists() else "",
        "readme": readme_path.read_text(encoding="utf-8") if readme_path.exists() else "",
        "binAvailable": (fw_dir / "builds" / "tomchi_panel.bin").exists(),
    }


@app.get("/api/firmware/download")
def firmware_download():
    ino_path = get_settings().firmware_dir / "tomchi_panel" / "tomchi_panel.ino"
    if not ino_path.exists():
        raise HTTPException(status_code=404, detail="Firmware not found")
    return FileResponse(ino_path, filename="tomchi_panel.ino", media_type="text/plain")


@app.get("/api/system/status")
def system_status(db: Session = Depends(get_db)) -> dict[str, Any]:
    settings = get_settings()
    sec = get_security_settings(db)
    vaapi_present = Path(str(sec["vaapi_device"])).exists()
    tesseract_present = bool(shutil.which(settings.anpr_tesseract_cmd))
    ffmpeg_present = bool(shutil.which("ffmpeg"))
    tailscale_url = None
    if shutil.which("tailscale"):
        try:
            proc = subprocess.run(
                ["tailscale", "status", "--json"], capture_output=True, text=True, timeout=2, check=False
            )
            if proc.returncode == 0 and "DNSName" in proc.stdout:
                import json

                data = json.loads(proc.stdout)
                dns = data.get("Self", {}).get("DNSName", "").rstrip(".")
                if dns:
                    tailscale_url = f"https://{dns}"
        except Exception:
            pass
    return {
        "vaapiDevicePresent": vaapi_present,
        "tesseractPresent": tesseract_present,
        "ffmpegPresent": ffmpeg_present,
        "tailscaleUrl": tailscale_url,
        "runtime": "linux-fastapi",
        "dbPath": settings.database_url,
    }


dist_dir = get_settings().dist_dir
if dist_dir.exists():
    assets_dir = dist_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        candidate = dist_dir / full_path
        if full_path and candidate.exists() and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(dist_dir / "index.html")
