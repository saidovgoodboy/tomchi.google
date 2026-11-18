import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.box_state import BoxOccupancyMachine, NormalizedROI
from app.camera_worker import (
    CameraBoxConfig,
    IPCameraManager,
    compute_roi_diff_score,
    run_capture_burst,
    update_adaptive_background,
)
from app.ocr import is_valid_plate, normalize_ocr_candidate, normalize_plate
from app.provisioning import Esp32PairingStore, build_camera_endpoints


class TomchiLinuxPipelineTests(unittest.TestCase):
    def test_box_occupancy_ignores_brief_noise_and_confirms_arrival(self):
        machine = BoxOccupancyMachine(
            "box-1",
            arrival_threshold=0.18,
            exit_threshold=0.08,
            arrival_confirm_seconds=2.0,
            exit_confirm_seconds=10.0,
            post_capture_cooldown_seconds=5.0,
        )
        s1 = machine.update(0.25, now=0.0)
        self.assertEqual(s1.state, "confirming_arrival")
        s2 = machine.update(0.03, now=1.0)
        self.assertEqual(s2.state, "empty")

        machine.update(0.24, now=10.0)
        s3 = machine.update(0.26, now=12.1)
        self.assertEqual(s3.state, "capturing")
        self.assertEqual(s3.action, "start_capture")

        machine.complete_capture(car_present=True, now=17.1)
        s4 = machine.update(0.35, now=25.0)
        self.assertEqual(s4.state, "occupied")

        machine.update(0.02, now=40.0)
        s6 = machine.update(0.01, now=50.5)
        self.assertEqual(s6.state, "empty")
        self.assertEqual(s6.action, "car_left")

    def test_capture_burst_auto_registers_visit_at_80_percent_after_5_frames(self):
        config = CameraBoxConfig(
            box_id="box-2",
            low_stream_url="rtsp://cam2/sub",
            high_stream_url="rtsp://cam2/main",
        )
        frames = iter([
            (b"\xff\xd8\xffframe0", ("01A777BC", 0.72)),
            (b"\xff\xd8\xffframe1", ("01A777BC", 0.88)),
            (b"\xff\xd8\xffframe2", (None, 0.0)),
            (b"\xff\xd8\xffframe3", ("01A777BC", 0.94)),
            (b"\xff\xd8\xffframe4", ("01A777BC", 0.81)),
        ])
        finalized_calls = []

        def grab_stub(_cfg):
            jpeg, _ = next(frames)
            return jpeg

        def ocr_stub(jpeg):
            return {
                b"\xff\xd8\xffframe0": ("01A777BC", 0.72),
                b"\xff\xd8\xffframe1": ("01A777BC", 0.88),
                b"\xff\xd8\xffframe2": (None, 0.0),
                b"\xff\xd8\xffframe3": ("01A777BC", 0.94),
                b"\xff\xd8\xffframe4": ("01A777BC", 0.81),
            }[jpeg]

        clock = [0.0]
        outcome = run_capture_burst(
            config,
            grab_high_res=grab_stub,
            recognize_plate=ocr_stub,
            on_finalized=lambda b, p, j, d: finalized_calls.append((b, p, j, d)),
            interval_seconds=1.0,
            sleep_fn=lambda s: clock.__setitem__(0, clock[0] + s),
            now_fn=lambda: clock[0],
        )
        self.assertEqual(outcome.decision.status, "finalized")
        self.assertEqual(outcome.decision.plate, "01A777BC")
        self.assertEqual(outcome.decision.agreement, 0.8)
        self.assertEqual(finalized_calls[0][2], b"\xff\xd8\xffframe3")

    def test_adaptive_background_and_roi_diff(self):
        w, h = 10, 10
        baseline = bytearray([20] * (w * h))
        current = bytearray([20] * (w * h))
        for x in range(w):
            current[x] = 200
        roi = NormalizedROI(x=0.2, y=0.3, w=0.6, h=0.6)
        self.assertEqual(compute_roi_diff_score(bytes(baseline), bytes(current), w, h, roi), 0.0)
        update_adaptive_background(baseline, bytes(current), alpha=0.5)
        self.assertGreater(baseline[0], 20)

    def test_uz_plate_ocr_normalization(self):
        self.assertEqual(normalize_plate("01 a 777 bc"), "01A777BC")
        self.assertTrue(is_valid_plate("01A777BC"))
        self.assertTrue(is_valid_plate("01123ABC"))
        normalized = normalize_ocr_candidate("O1A7778C")
        self.assertIsNotNone(normalized)
        self.assertEqual(normalized[0], "01A777BC")

    def test_manager_and_provisioning(self):
        manager = IPCameraManager(max_boxes=20)
        for i in range(1, 21):
            manager.register_box(
                CameraBoxConfig(
                    box_id=f"box-{i}",
                    low_stream_url=f"rtsp://10.0.0.{i}/sub",
                    high_stream_url=f"rtsp://10.0.0.{i}/main",
                )
            )
        self.assertEqual(len(manager.list_states()), 20)

        hik = build_camera_endpoints(brand="hikvision", host="192.168.1.105", username="admin", password="secret")
        self.assertIn("/Streaming/Channels/102", hik.low_stream_url)

        store = Esp32PairingStore(ttl_seconds=300)
        token = store.issue_code("box-4", now=100.0)
        claimed = store.claim_code(token.code, device_key="dev-key-123", now=150.0)
        self.assertEqual(claimed["box_id"], "box-4")


if __name__ == "__main__":
    unittest.main()
