from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Car(Base):
    __tablename__ = "cars"

    id = Column(Integer, primary_key=True, index=True)
    plate = Column(String(20), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    visits = relationship("Visit", back_populates="car")


class WashBox(Base):
    __tablename__ = "wash_boxes"

    id = Column(String(40), primary_key=True)
    name = Column(String(100), nullable=False)
    virtual_mode = Column(Integer, default=1, nullable=False)
    camera_brand = Column(String(30), default="hikvision", nullable=False)
    camera_ip = Column(String(100), default="192.168.1.101", nullable=False)
    low_stream_url = Column(String(255), default="", nullable=False)
    high_stream_url = Column(String(255), default="", nullable=False)
    snapshot_url = Column(String(255), default="", nullable=False)
    use_vaapi = Column(Integer, default=1, nullable=False)
    roi_x = Column(Float, default=0.20, nullable=False)
    roi_y = Column(Float, default=0.30, nullable=False)
    roi_w = Column(Float, default=0.60, nullable=False)
    roi_h = Column(Float, default=0.58, nullable=False)
    esp32_paired = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    visits = relationship("Visit", back_populates="box")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String(80), primary_key=True)
    value = Column(String(255), nullable=False)


class Visit(Base):
    __tablename__ = "visits"

    id = Column(Integer, primary_key=True, index=True)
    car_id = Column(Integer, ForeignKey("cars.id"), nullable=False)
    box_id = Column(String(40), ForeignKey("wash_boxes.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    visit_no = Column(Integer, nullable=False)
    bonus_total = Column(Integer, default=0, nullable=False)
    bonus_left = Column(Integer, default=0, nullable=False)
    is_active_bonus = Column(Integer, default=0, nullable=False)
    agreement_pct = Column(Integer, nullable=True)
    frames_used = Column(Integer, default=5, nullable=False)
    source = Column(String(30), default="auto_80_anpr", nullable=False)
    image_key = Column(String(120), nullable=True)

    car = relationship("Car", back_populates="visits")
    box = relationship("WashBox", back_populates="visits")
    pulses = relationship("BonusPulse", back_populates="visit")


class BonusPulse(Base):
    __tablename__ = "bonus_pulses"

    id = Column(Integer, primary_key=True, index=True)
    visit_id = Column(Integer, ForeignKey("visits.id"), nullable=False)
    box_id = Column(String(40), nullable=False)
    plate = Column(String(20), nullable=False)
    amount = Column(Integer, default=0, nullable=False)
    press_id = Column(String(64), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    refunded_at = Column(DateTime, nullable=True)

    visit = relationship("Visit", back_populates="pulses")


class PendingDetection(Base):
    __tablename__ = "pending_detections"

    id = Column(Integer, primary_key=True, index=True)
    box_id = Column(String(40), ForeignKey("wash_boxes.id"), nullable=False, index=True)
    event_id = Column(String(64), unique=True, nullable=False)
    suggested_plate = Column(String(20), nullable=True)
    votes = Column(Integer, default=0, nullable=False)
    frames_taken = Column(Integer, default=15, nullable=False)
    agreement_pct = Column(Integer, default=0, nullable=False)
    image_key = Column(String(120), nullable=True)
    resolved = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class DeviceLog(Base):
    __tablename__ = "device_logs"

    id = Column(Integer, primary_key=True, index=True)
    event = Column(String(100), nullable=False)
    payload = Column(Text, default="", nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
