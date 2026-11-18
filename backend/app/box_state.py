"""IP kamera past sifatli oqimidan box holatini aniqlovchi mashina."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

BoxStateName = Literal[
    "empty",
    "confirming_arrival",
    "capturing",
    "occupied",
    "confirming_exit",
]


@dataclass(frozen=True)
class NormalizedROI:
    """0.0..1.0 oralig'idagi normalizatsiya qilingan ROI to'rtburchagi."""

    x: float = 0.20
    y: float = 0.30
    w: float = 0.60
    h: float = 0.58

    def __post_init__(self) -> None:
        if not (0.0 <= self.x < 1.0 and 0.0 <= self.y < 1.0):
            raise ValueError("ROI origin must be in [0, 1)")
        if not (0.05 <= self.w <= 1.0 and 0.05 <= self.h <= 1.0):
            raise ValueError("ROI size must be in [0.05, 1]")


@dataclass(frozen=True)
class BoxSignal:
    state: BoxStateName
    action: Literal["none", "start_capture", "car_left"]
    occupancy_score: float


class BoxOccupancyMachine:
    """Past sifatli (sub-stream) kadrlar bo'yicha box bandligini kuzatadi."""

    def __init__(
        self,
        box_id: str,
        *,
        arrival_threshold: float = 0.18,
        exit_threshold: float = 0.08,
        arrival_confirm_seconds: float = 2.0,
        exit_confirm_seconds: float = 10.0,
        post_capture_cooldown_seconds: float = 5.0,
    ) -> None:
        self.box_id = box_id
        self.arrival_threshold = arrival_threshold
        self.exit_threshold = exit_threshold
        self.arrival_confirm_seconds = arrival_confirm_seconds
        self.exit_confirm_seconds = exit_confirm_seconds
        self.post_capture_cooldown_seconds = post_capture_cooldown_seconds

        self.state: BoxStateName = "empty"
        self._transition_started_at: float | None = None
        self._last_capture_finished_at: float = -1e9

    def update(self, occupancy_score: float, now: float) -> BoxSignal:
        if self.state == "capturing":
            return BoxSignal(state="capturing", action="none", occupancy_score=occupancy_score)

        if self.state == "empty":
            if now - self._last_capture_finished_at < self.post_capture_cooldown_seconds:
                return BoxSignal(state="empty", action="none", occupancy_score=occupancy_score)
            if occupancy_score >= self.arrival_threshold:
                self.state = "confirming_arrival"
                self._transition_started_at = now
                if self.arrival_confirm_seconds <= 0:
                    self.state = "capturing"
                    return BoxSignal(state="capturing", action="start_capture", occupancy_score=occupancy_score)
            return BoxSignal(state=self.state, action="none", occupancy_score=occupancy_score)

        if self.state == "confirming_arrival":
            if occupancy_score < self.exit_threshold:
                self.state = "empty"
                self._transition_started_at = None
                return BoxSignal(state="empty", action="none", occupancy_score=occupancy_score)
            if (
                self._transition_started_at is not None
                and now - self._transition_started_at >= self.arrival_confirm_seconds
            ):
                self.state = "capturing"
                self._transition_started_at = None
                return BoxSignal(state="capturing", action="start_capture", occupancy_score=occupancy_score)
            return BoxSignal(state="confirming_arrival", action="none", occupancy_score=occupancy_score)

        if self.state == "occupied":
            if occupancy_score <= self.exit_threshold:
                self.state = "confirming_exit"
                self._transition_started_at = now
            return BoxSignal(state=self.state, action="none", occupancy_score=occupancy_score)

        if self.state == "confirming_exit":
            if occupancy_score >= self.arrival_threshold:
                self.state = "occupied"
                self._transition_started_at = None
                return BoxSignal(state="occupied", action="none", occupancy_score=occupancy_score)
            if (
                self._transition_started_at is not None
                and now - self._transition_started_at >= self.exit_confirm_seconds
            ):
                self.state = "empty"
                self._transition_started_at = None
                return BoxSignal(state="empty", action="car_left", occupancy_score=occupancy_score)
            return BoxSignal(state="confirming_exit", action="none", occupancy_score=occupancy_score)

        return BoxSignal(state=self.state, action="none", occupancy_score=occupancy_score)

    def complete_capture(self, *, car_present: bool, now: float) -> None:
        self._last_capture_finished_at = now
        self._transition_started_at = None
        self.state = "occupied" if car_present else "empty"
