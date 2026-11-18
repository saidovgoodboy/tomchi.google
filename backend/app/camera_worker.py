"""3–20 ta IP kamera uchun dual-stream (past + yuqori sifat) ishchi xizmati.

- Past sifatli sub-stream (320x240 @ 2 FPS) FFmpeg (ixtiyoriy AMD RX 580 VA-API
  ``/dev/dri/renderD128`` apparat dekodlash bilan) orqali uzluksiz o'qiladi.
- ``empty`` holatida adaptiv EMA fon yangilanishi yorug'lik va namlik o'zgarishlariga
  moslashadi.
- ``BoxOccupancyMachine`` ROI da mashina kirishini tasdiqlagach, ``CaptureSession``
  ochiladi va har 1 soniyada 1 tadan yuqori sifatli kadr olinadi.
- Kamida 5 kadrda >= 80% bir xil raqam tasdiqlansa (``finalized``), avtomatik
  ravishda ``on_finalized()`` chaqiriladi (Visit + Bonus yoqiladi).
"""

from __future__ import annotations

from dataclasses import dataclass, field
import logging
import subprocess
import threading
import time
from typing import Callable
from uuid import uuid4

from app.box_state import BoxOccupancyMachine, NormalizedROI
from app.capture import CaptureSession, Decision

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CameraBoxConfig:
    box_id: str
    low_stream_url: str
    high_stream_url: str
    snapshot_url: str | None = None
    roi: NormalizedROI = field(default_factory=NormalizedROI)
    sub_stream_fps: float = 2.0
    sub_stream_width: int = 320
    sub_stream_height: int = 240
    use_vaapi: bool = True
    vaapi_device: str = "/dev/dri/renderD128"
    virtual_mode: bool = True


def build_substream_ffmpeg_cmd(config: CameraBoxConfig) -> list[str]:
    """Past sifatli RTSP oqimdan raw gray kadrlarni chiqaruvchi FFmpeg buyrug'i."""
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp"]
    if config.use_vaapi:
        cmd.extend(["-hwaccel", "vaapi", "-hwaccel_device", config.vaapi_device])
    cmd.extend([
        "-i",
        config.low_stream_url,
        "-vf",
        f"fps={config.sub_stream_fps},scale={config.sub_stream_width}:{config.sub_stream_height},format=gray",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "gray",
        "pipe:1",
    ])
    return cmd


def grab_high_quality_jpeg(config: CameraBoxConfig, timeout_seconds: float = 4.0) -> bytes:
    """Main-stream RTSP (yoki HTTP snapshot URL) dan 1 ta yuqori sifatli JPEG oladi."""
    source = config.snapshot_url or config.high_stream_url
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-rtsp_transport",
        "tcp",
        "-i",
        source,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "pipe:1",
    ]
    proc = subprocess.run(cmd, capture_output=True, timeout=timeout_seconds, check=False)
    if proc.returncode != 0 or not proc.stdout.startswith(b"\xff\xd8\xff"):
        detail = proc.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"Failed to grab high-res JPEG from {config.box_id}: {detail}")
    return proc.stdout


def update_adaptive_background(
    baseline: bytearray,
    current_gray: bytes,
    alpha: float = 0.05,
) -> None:
    """Bo'sh holatda yorug'lik o'zgarishiga moslashish uchun fonni sekin yangilaydi."""
    if len(baseline) != len(current_gray):
        return
    inv = 1.0 - alpha
    for i in range(len(baseline)):
        baseline[i] = int(baseline[i] * inv + current_gray[i] * alpha)


def compute_roi_diff_score(
    baseline_gray: bytes,
    current_gray: bytes,
    width: int,
    height: int,
    roi: NormalizedROI,
    pixel_delta_threshold: int = 26,
) -> float:
    """ROI ichida fonga nisbatan o'zgargan piksellar ulushini (0.0..1.0) hisoblaydi."""
    if len(baseline_gray) != width * height or len(current_gray) != width * height:
        raise ValueError("Gray frame byte length does not match dimensions")

    x0 = max(0, min(width - 1, int(roi.x * width)))
    y0 = max(0, min(height - 1, int(roi.y * height)))
    x1 = max(x0 + 1, min(width, int((roi.x + roi.w) * width)))
    y1 = max(y0 + 1, min(height, int((roi.y + roi.h) * height)))

    changed = 0
    total = (x1 - x0) * (y1 - y0)
    for y in range(y0, y1):
        row_offset = y * width
        for x in range(x0, x1):
            idx = row_offset + x
            if abs(current_gray[idx] - baseline_gray[idx]) >= pixel_delta_threshold:
                changed += 1
    return changed / max(1, total)


@dataclass
class CaptureOutcome:
    box_id: str
    event_id: str
    decision: Decision
    frames_taken: int
    best_frame_jpeg: bytes | None = None
    auto_visit_registered: bool = False


PlateRecognizer = Callable[[bytes], tuple[str | None, float]]
HighResGrabber = Callable[[CameraBoxConfig], bytes]
FinalizedVisitCallback = Callable[[str, str, bytes | None, Decision], None]
PendingReviewCallback = Callable[[str, str, str | None, bytes | None, Decision], None]


def run_capture_burst(
    config: CameraBoxConfig,
    *,
    grab_high_res: HighResGrabber,
    recognize_plate: PlateRecognizer,
    on_finalized: FinalizedVisitCallback,
    on_pending: PendingReviewCallback | None = None,
    interval_seconds: float = 1.0,
    sleep_fn: Callable[[float], None] = time.sleep,
    now_fn: Callable[[], float] = time.monotonic,
    session_kwargs: dict | None = None,
) -> CaptureOutcome:
    """Mashina kelganda har 1 s da yuqori sifatli rasm olib 80% qaror chiqaradi."""
    event_id = f"{config.box_id}-{uuid4().hex[:12]}"
    session = CaptureSession(event_id, **(session_kwargs or {}))
    last_jpeg: bytes | None = None

    while not session.finished:
        tick_start = now_fn()
        frame_bytes: bytes | None = None
        plate: str | None = None
        confidence = 0.0

        try:
            frame_bytes = grab_high_res(config)
            last_jpeg = frame_bytes
            plate, confidence = recognize_plate(frame_bytes)
        except Exception as exc:  # noqa: BLE001
            logger.warning("High-res capture/OCR failed on %s: %s", config.box_id, exc)

        decision = session.on_frame(
            plate,
            confidence=confidence,
            frame_bytes=frame_bytes,
            now=now_fn(),
        )
        if decision.terminal:
            break

        if interval_seconds > 0:
            elapsed = now_fn() - tick_start
            remaining = interval_seconds - elapsed
            if remaining > 0:
                sleep_fn(remaining)

    final_decision = session.decision or Decision(status="aborted", reason="unknown")
    best_jpeg = session.best_frame_for(final_decision.plate) or last_jpeg

    auto_visit = False
    if final_decision.status == "finalized" and final_decision.plate:
        on_finalized(config.box_id, final_decision.plate, best_jpeg, final_decision)
        auto_visit = True
    elif final_decision.status == "pending" and on_pending is not None:
        on_pending(config.box_id, event_id, final_decision.plate, best_jpeg, final_decision)

    return CaptureOutcome(
        box_id=config.box_id,
        event_id=event_id,
        decision=final_decision,
        frames_taken=session.frames_seen,
        best_frame_jpeg=best_jpeg,
        auto_visit_registered=auto_visit,
    )


class IPCameraManager:
    """3–20 ta box kameralarini alohida worker thread larda boshqaradi."""

    def __init__(self, max_boxes: int = 20) -> None:
        self.max_boxes = max_boxes
        self._lock = threading.Lock()
        self._configs: dict[str, CameraBoxConfig] = {}
        self._machines: dict[str, BoxOccupancyMachine] = {}
        self._scores: dict[str, float] = {}
        self._stops: dict[str, threading.Event] = {}
        self._threads: dict[str, threading.Thread] = {}

    def register_box(
        self,
        config: CameraBoxConfig,
        *,
        start_worker: bool = False,
        recognize_plate: PlateRecognizer | None = None,
        on_finalized: FinalizedVisitCallback | None = None,
        on_pending: PendingReviewCallback | None = None,
    ) -> None:
        with self._lock:
            if config.box_id not in self._configs and len(self._configs) >= self.max_boxes:
                raise ValueError(f"Camera limit reached (max {self.max_boxes} boxes)")
            self._stop_locked(config.box_id)
            self._configs[config.box_id] = config
            self._machines[config.box_id] = BoxOccupancyMachine(config.box_id)
            self._scores[config.box_id] = 0.02

            if start_worker and not config.virtual_mode and recognize_plate and on_finalized:
                stop_ev = threading.Event()
                self._stops[config.box_id] = stop_ev
                t = threading.Thread(
                    target=self._run_substream_loop,
                    args=(config.box_id, stop_ev, recognize_plate, on_finalized, on_pending),
                    daemon=True,
                )
                self._threads[config.box_id] = t
                t.start()

    def remove_box(self, box_id: str) -> None:
        with self._lock:
            self._stop_locked(box_id)
            self._configs.pop(box_id, None)
            self._machines.pop(box_id, None)
            self._scores.pop(box_id, None)

    def stop_all(self) -> None:
        with self._lock:
            for box_id in list(self._stops.keys()):
                self._stop_locked(box_id)

    def _stop_locked(self, box_id: str) -> None:
        ev = self._stops.pop(box_id, None)
        if ev is not None:
            ev.set()
        self._threads.pop(box_id, None)

    def list_states(self) -> dict[str, str]:
        with self._lock:
            return {box_id: machine.state for box_id, machine in self._machines.items()}

    def get_box_runtime(self, box_id: str) -> tuple[str, float]:
        with self._lock:
            machine = self._machines.get(box_id)
            score = self._scores.get(box_id, 0.02)
            return (machine.state if machine else "empty", score)

    def _run_substream_loop(
        self,
        box_id: str,
        stop_event: threading.Event,
        recognize_plate: PlateRecognizer,
        on_finalized: FinalizedVisitCallback,
        on_pending: PendingReviewCallback | None,
    ) -> None:
        while not stop_event.is_set():
            with self._lock:
                config = self._configs.get(box_id)
                machine = self._machines.get(box_id)
            if config is None or machine is None:
                return

            frame_size = config.sub_stream_width * config.sub_stream_height
            cmd = build_substream_ffmpeg_cmd(config)
            proc: subprocess.Popen[bytes] | None = None
            try:
                proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                baseline: bytearray | None = None
                while not stop_event.is_set() and proc.stdout is not None:
                    chunk = proc.stdout.read(frame_size)
                    if len(chunk) != frame_size:
                        break
                    if baseline is None:
                        baseline = bytearray(chunk)
                        continue
                    score = compute_roi_diff_score(
                        bytes(baseline),
                        chunk,
                        config.sub_stream_width,
                        config.sub_stream_height,
                        config.roi,
                    )
                    now = time.monotonic()
                    with self._lock:
                        self._scores[box_id] = score
                        signal = machine.update(score, now)

                    if signal.state == "empty":
                        update_adaptive_background(baseline, chunk, alpha=0.05)

                    if signal.action == "start_capture":
                        outcome = run_capture_burst(
                            config,
                            grab_high_res=grab_high_quality_jpeg,
                            recognize_plate=recognize_plate,
                            on_finalized=on_finalized,
                            on_pending=on_pending,
                        )
                        car_present = outcome.decision.status in ("finalized", "pending")
                        with self._lock:
                            machine.complete_capture(car_present=car_present, now=time.monotonic())
            except Exception as exc:  # noqa: BLE001
                logger.warning("Sub-stream worker error on %s: %s", box_id, exc)
            finally:
                if proc is not None and proc.poll() is None:
                    proc.terminate()
            stop_event.wait(3.0)
