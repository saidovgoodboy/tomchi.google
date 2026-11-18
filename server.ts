import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { CaptureSessionEngine, PLATE_REGEX, normalizePlate } from './src/engine/captureEngine.ts';
import {
  BAY_IMAGES,
  DEFAULT_ANPR_SETTINGS,
  DEFAULT_BONUS_SETTINGS,
  DEFAULT_SECURITY_SETTINGS,
  INITIAL_BOXES,
  INITIAL_LOGS,
  INITIAL_PULSES,
  INITIAL_VISITS,
  createBoxTemplate,
} from './src/data/initialData.ts';
import type {
  AnprSettings,
  BonusPulseRecord,
  BonusSettings,
  CameraBrand,
  CaptureFrameLog,
  DeviceLogRecord,
  NormalizedROI,
  PendingDetection,
  SystemSecuritySettings,
  TailscaleConfig,
  VehiclePreset,
  VisitRecord,
  WashBox,
} from './src/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, '.tomchi-data.json');
const PORT = Number(process.env.PORT || 3000);

interface AppDbState {
  boxes: WashBox[];
  visits: VisitRecord[];
  pending: PendingDetection[];
  pulses: BonusPulseRecord[];
  settings: BonusSettings;
  anpr: AnprSettings;
  security: SystemSecuritySettings;
  logs: DeviceLogRecord[];
  tailscale: TailscaleConfig;
}

interface PairingRecord {
  code: string;
  boxId: string;
  expiresAt: number;
  used: boolean;
}

const pairingCodes = new Map<string, PairingRecord>();

function defaultState(): AppDbState {
  return {
    boxes: structuredClone(INITIAL_BOXES),
    visits: structuredClone(INITIAL_VISITS),
    pending: [],
    pulses: structuredClone(INITIAL_PULSES),
    settings: { ...DEFAULT_BONUS_SETTINGS },
    anpr: { ...DEFAULT_ANPR_SETTINGS },
    security: {
      ...DEFAULT_SECURITY_SETTINGS,
      appEnv: process.env.APP_ENV === 'dev' ? 'dev' : DEFAULT_SECURITY_SETTINGS.appEnv,
      serverPort: Number(process.env.PORT) || DEFAULT_SECURITY_SETTINGS.serverPort,
      deviceKey: process.env.DEVICE_KEY || DEFAULT_SECURITY_SETTINGS.deviceKey,
      adminUsername: process.env.ADMIN_USERNAME || DEFAULT_SECURITY_SETTINGS.adminUsername,
      adminPassword: process.env.ADMIN_PASSWORD || DEFAULT_SECURITY_SETTINGS.adminPassword,
      adminTokenSecret: process.env.ADMIN_TOKEN_SECRET || DEFAULT_SECURITY_SETTINGS.adminTokenSecret,
      useVaapi:
        process.env.USE_VAAPI !== undefined
          ? process.env.USE_VAAPI === 'true'
          : DEFAULT_SECURITY_SETTINGS.useVaapi,
      vaapiDevice: process.env.VAAPI_DEVICE || DEFAULT_SECURITY_SETTINGS.vaapiDevice,
      anprEnabled:
        process.env.ANPR_ENABLED !== undefined
          ? process.env.ANPR_ENABLED === 'true'
          : DEFAULT_SECURITY_SETTINGS.anprEnabled,
    },
    logs: structuredClone(INITIAL_LOGS),
    tailscale: {
      hostname: 'moyka-server.tail84a12.ts.net',
      servePort: 8000,
      enabled: true,
    },
  };
}

function loadState(): AppDbState {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as Partial<AppDbState>;
      const def = defaultState();
      return {
        boxes: Array.isArray(parsed.boxes) && parsed.boxes.length > 0 ? parsed.boxes : def.boxes,
        visits: Array.isArray(parsed.visits) ? parsed.visits : def.visits,
        pending: Array.isArray(parsed.pending) ? parsed.pending : def.pending,
        pulses: Array.isArray(parsed.pulses) ? parsed.pulses : def.pulses,
        settings: parsed.settings ? { ...def.settings, ...parsed.settings } : def.settings,
        anpr: parsed.anpr ? { ...def.anpr, ...parsed.anpr } : def.anpr,
        security: parsed.security ? { ...def.security, ...parsed.security } : def.security,
        logs: Array.isArray(parsed.logs) ? parsed.logs : def.logs,
        tailscale: parsed.tailscale ? { ...def.tailscale, ...parsed.tailscale } : def.tailscale,
      };
    }
  } catch {
    // fallback to default
  }
  return defaultState();
}

let dbState: AppDbState = loadState();

function persistState() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(dbState, null, 2), 'utf-8');
  } catch {
    // ignore read-only fs errors
  }
}

function appendLog(event: string, payload: string) {
  const entry: DeviceLogRecord = {
    id: Date.now() + Math.floor(Math.random() * 100),
    event,
    payload,
    createdAt: new Date().toISOString(),
  };
  dbState.logs = [entry, ...dbState.logs].slice(0, 120);
}

function formatP10Display(
  plate: string,
  visitNo: number,
  bonusLeft: number,
  settings: BonusSettings,
) {
  if (bonusLeft > 0) {
    return settings.p10BonusTemplate
      .replace('{PLATE}', plate)
      .replace('{VISIT}', String(visitNo))
      .replace('{BONUS}', bonusLeft.toLocaleString('fr-FR'));
  }
  return settings.p10VisitTemplate
    .replace('{PLATE}', plate)
    .replace('{VISIT}', String(visitNo))
    .replace('{BONUS}', '0');
}

function registerAutoVisitAndBonus(
  boxId: string,
  plate: string,
  agreement: number,
  framesUsed: number,
  source: 'auto_80_anpr' | 'manual_confirmed' | 'manual_entry',
  visual: VehiclePreset,
) {
  const existingForPlate = dbState.visits.filter((v) => v.plate === plate);
  const nextVisitNo = existingForPlate.length + 1;
  const earnsBonus = nextVisitNo % dbState.settings.bonusEveryVisits === 0;
  const awardedAmount = earnsBonus ? dbState.settings.bonusAmount : 0;

  const newVisit: VisitRecord = {
    id: Date.now(),
    plate,
    boxId,
    visitNo: nextVisitNo,
    createdAt: new Date().toISOString(),
    bonusTotal: awardedAmount,
    bonusLeft: awardedAmount,
    isActiveBonus: earnsBonus,
    agreementPct: Math.round(agreement * 100),
    framesUsed,
    source,
    imageUrl: visual === 'suv' ? BAY_IMAGES.suv : BAY_IMAGES.sedan,
  };

  if (earnsBonus) {
    dbState.visits = dbState.visits.map((v) =>
      v.isActiveBonus ? { ...v, isActiveBonus: false, bonusLeft: 0 } : v,
    );
  }
  dbState.visits = [newVisit, ...dbState.visits];

  dbState.boxes = dbState.boxes.map((b) => {
    if (b.id === boxId) {
      const bonusText = formatP10Display(plate, nextVisitNo, awardedAmount, dbState.settings);
      return {
        ...b,
        state: 'occupied',
        occupancyScore: 0.74,
        currentPlate: plate,
        activeBonusLeft: earnsBonus ? awardedAmount : 0,
        vehicleVisual: visual,
        lastCaptureStatus: 'finalized',
        lastAgreement: agreement,
        displayText: bonusText,
      };
    }
    if (earnsBonus && b.activeBonusLeft > 0) {
      return {
        ...b,
        activeBonusLeft: 0,
        displayText: b.currentPlate ? `${b.currentPlate} - MUKOFOT BEKOR` : dbState.settings.p10IdleText,
      };
    }
    return b;
  });

  appendLog(
    'visit_registered',
    `${boxId} · ${plate} · ${nextVisitNo}-kelish${earnsBonus ? ` · bonus ${awardedAmount.toLocaleString('fr-FR')} so'm` : ''}`,
  );
  persistState();
  return { visitNo: nextVisitNo, earnsBonus, awardedAmount };
}

type BurstPreset = 'consensus_5_5' | 'consensus_4_5' | 'mixed_pending' | 'empty_abort';

function buildBurstSequence(preset: BurstPreset, targetPlate: string, maxFrames: number, abortStreak: number) {
  const normalized = normalizePlate(targetPlate);
  const plate = PLATE_REGEX.test(normalized) ? normalized : '01A888BC';

  if (preset === 'consensus_5_5') {
    return Array.from({ length: Math.max(5, maxFrames) }, (_, i) => ({
      plate,
      confidence: Number((0.9 + (i % 3) * 0.02).toFixed(2)),
    }));
  }
  if (preset === 'consensus_4_5') {
    const seq = [
      { plate, confidence: 0.85 },
      { plate: null, confidence: 0.0 },
      { plate, confidence: 0.91 },
      { plate, confidence: 0.94 },
      { plate, confidence: 0.89 },
    ];
    while (seq.length < maxFrames) seq.push({ plate, confidence: 0.92 });
    return seq;
  }
  if (preset === 'empty_abort') {
    return Array.from({ length: Math.max(5, abortStreak) }, () => ({ plate: null, confidence: 0.0 }));
  }
  const altPlate = plate === '01B222CD' ? '01C333EF' : '01B222CD';
  return Array.from({ length: Math.max(5, maxFrames) }, (_, idx) =>
    idx % 2 === 0 ? { plate, confidence: 0.66 } : { plate: altPlate, confidence: 0.61 },
  );
}

function cmdExists(bin: string): boolean {
  try {
    execSync(`command -v ${bin}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', runtime: 'node-express', boxes: dbState.boxes.length });
  });

  app.get('/api/state', (_req, res) => {
    res.json(dbState);
  });

  app.post('/api/auth/login', (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (
      username !== dbState.security.adminUsername ||
      password !== dbState.security.adminPassword
    ) {
      res.status(401).json({ error: 'Login yoki parol noto‘g‘ri' });
      return;
    }
    const token = crypto
      .createHmac('sha256', dbState.security.adminTokenSecret || dbState.security.deviceKey)
      .update(`${username}:${Date.now()}`)
      .digest('hex');
    appendLog('admin_login', `Admin kirdi: ${username}`);
    persistState();
    res.json({ ok: true, token, username });
  });

  app.get('/api/system/status', (_req, res) => {
    let tailscaleUrl: string | null = null;
    if (cmdExists('tailscale')) {
      try {
        const out = execSync('tailscale status --json', { encoding: 'utf-8', timeout: 1500 });
        const parsed = JSON.parse(out) as { Self?: { DNSName?: string } };
        const dns = parsed.Self?.DNSName?.replace(/\.$/, '');
        if (dns) tailscaleUrl = `https://${dns}`;
      } catch {
        // tailscale not connected
      }
    }
    res.json({
      vaapiDevicePresent: fs.existsSync(dbState.security.vaapiDevice || '/dev/dri/renderD128'),
      tesseractPresent: cmdExists('tesseract'),
      ffmpegPresent: cmdExists('ffmpeg'),
      tailscaleUrl,
      runtime: 'node-express',
      dbPath: DATA_FILE,
    });
  });

  app.post('/api/boxes', (_req, res) => {
    if (dbState.boxes.length >= 20) {
      res.status(400).json({ error: 'Maksimum 20 ta box mumkin' });
      return;
    }
    let nextNum = dbState.boxes.length + 1;
    while (dbState.boxes.some((b) => b.id === `box-${nextNum}`)) {
      nextNum += 1;
    }
    const created = {
      ...createBoxTemplate(nextNum - 1),
      displayText: dbState.settings.p10IdleText,
    };
    dbState.boxes.push(created);
    appendLog('box_added', `${created.id} (${created.name})`);
    persistState();
    res.json({ box: created, state: dbState });
  });

  app.put('/api/boxes/:id', (req, res) => {
    const { id } = req.params;
    const name = String(req.body?.name || '').trim().slice(0, 60);
    if (!name) {
      res.status(400).json({ error: 'Box nomi bo‘sh bo‘lmasin' });
      return;
    }
    let found = false;
    dbState.boxes = dbState.boxes.map((b) => {
      if (b.id !== id) return b;
      found = true;
      return { ...b, name };
    });
    if (!found) {
      res.status(404).json({ error: 'Box topilmadi' });
      return;
    }
    appendLog('box_renamed', `${id} -> ${name}`);
    persistState();
    res.json({ ok: true, state: dbState });
  });

  app.delete('/api/boxes/:id', (req, res) => {
    const { id } = req.params;
    if (dbState.boxes.length <= 1) {
      res.status(400).json({ error: 'Kamida 1 ta box qolishi kerak' });
      return;
    }
    const target = dbState.boxes.find((b) => b.id === id);
    if (!target) {
      res.status(404).json({ error: 'Box topilmadi' });
      return;
    }
    dbState.boxes = dbState.boxes.filter((b) => b.id !== id);
    dbState.pending = dbState.pending.filter((p) => p.boxId !== id);
    appendLog('box_deleted', `${id} (${target.name}) o‘chirildi`);
    persistState();
    res.json({ ok: true, state: dbState });
  });

  app.put('/api/boxes/:id/camera', (req, res) => {
    const { id } = req.params;
    const patch = req.body as Partial<{
      name: string;
      virtualMode: boolean;
      cameraBrand: CameraBrand;
      cameraIp: string;
      lowStreamUrl: string;
      highStreamUrl: string;
      snapshotUrl: string;
      useVaapi: boolean;
      roi: NormalizedROI;
    }>;
    let found = false;
    dbState.boxes = dbState.boxes.map((b) => {
      if (b.id !== id) return b;
      found = true;
      return {
        ...b,
        name: patch.name?.trim() ? patch.name.trim().slice(0, 60) : b.name,
        virtualMode: patch.virtualMode ?? b.virtualMode,
        cameraBrand: patch.cameraBrand ?? b.cameraBrand,
        cameraIp: patch.cameraIp ?? b.cameraIp,
        lowStreamUrl: patch.lowStreamUrl ?? b.lowStreamUrl,
        highStreamUrl: patch.highStreamUrl ?? b.highStreamUrl,
        snapshotUrl: patch.snapshotUrl ?? b.snapshotUrl,
        useVaapi: patch.useVaapi ?? b.useVaapi,
        roi: patch.roi ?? b.roi,
      };
    });
    if (!found) {
      res.status(404).json({ error: 'Box topilmadi' });
      return;
    }
    appendLog('camera_updated', `${id} kamera/ROI saqlandi`);
    persistState();
    res.json({ ok: true, state: dbState });
  });

  app.post('/api/boxes/:id/simulate-exit', (req, res) => {
    const { id } = req.params;
    dbState.boxes = dbState.boxes.map((b) =>
      b.id === id
        ? {
            ...b,
            state: 'empty',
            occupancyScore: 0.02,
            currentPlate: null,
            vehicleVisual: 'empty',
            displayText: dbState.settings.p10IdleText,
          }
        : b,
    );
    appendLog('box_exit', `${id} bo‘shadi`);
    persistState();
    res.json({ ok: true, state: dbState });
  });

  app.post('/api/boxes/:id/cancel-bonus', (req, res) => {
    const { id } = req.params;
    dbState.visits = dbState.visits.map((v) =>
      v.boxId === id && v.isActiveBonus ? { ...v, isActiveBonus: false, bonusLeft: 0 } : v,
    );
    dbState.boxes = dbState.boxes.map((b) =>
      b.id === id
        ? {
            ...b,
            activeBonusLeft: 0,
            displayText: b.currentPlate ? `${b.currentPlate} - MUKOFOT BEKOR` : dbState.settings.p10IdleText,
          }
        : b,
    );
    appendLog('bonus_cancelled', `${id} faol bonusi qo‘lda bekor qilindi`);
    persistState();
    res.json({ ok: true, state: dbState });
  });

  app.post('/api/visits/manual', (req, res) => {
    const boxId = String(req.body?.box_id || '');
    const plate = normalizePlate(String(req.body?.plate || ''));
    const visual = (req.body?.visual === 'suv' ? 'suv' : 'sedan') as VehiclePreset;
    if (!PLATE_REGEX.test(plate)) {
      res.status(400).json({ error: 'Raqam formati noto‘g‘ri (masalan: 01A777BC)' });
      return;
    }
    const box = dbState.boxes.find((b) => b.id === boxId);
    if (!box) {
      res.status(404).json({ error: 'Box topilmadi' });
      return;
    }
    const outcome = registerAutoVisitAndBonus(boxId, plate, 1.0, 1, 'manual_entry', visual);
    res.json({ ok: true, outcome, state: dbState });
  });

  app.post('/api/boxes/:id/burst', (req, res) => {
    const { id } = req.params;
    const box = dbState.boxes.find((b) => b.id === id);
    if (!box) {
      res.status(404).json({ error: 'Box topilmadi' });
      return;
    }
    const preset = (req.body?.preset || 'consensus_4_5') as BurstPreset;
    const customPlate = String(req.body?.customPlate || '01A888BC');
    const visual = (req.body?.visual === 'suv' ? 'suv' : 'sedan') as VehiclePreset;

    const anpr = dbState.anpr;
    const sequence = buildBurstSequence(preset, customPlate, anpr.maxFrames, anpr.noPlateAbortStreak);
    const engine = new CaptureSessionEngine(`${id}-${Date.now()}`, {
      minFrames: anpr.minFrames,
      windowSize: anpr.windowSize,
      agreementThreshold: anpr.agreementThresholdPct / 100,
      maxFrames: anpr.maxFrames,
      noPlateAbortStreak: anpr.noPlateAbortStreak,
    });

    const frames: CaptureFrameLog[] = [];
    let finalDecision = engine.decision;

    for (let i = 0; i < sequence.length; i += 1) {
      const item = sequence[i];
      const step = engine.onFrame(item.plate);
      frames.push({
        frameIndex: i + 1,
        timestamp: new Date(Date.now() + i * 1000).toISOString().slice(11, 19),
        plate: item.plate,
        confidence: item.confidence,
        windowVotes: step.votes,
        windowLength: step.windowLength,
        agreement: step.agreement,
        decisionStatus: step.decision.status,
      });
      if (step.decision.status !== 'continue') {
        finalDecision = step.decision;
        break;
      }
    }

    let summaryUz = '';
    let summaryRu = '';

    if (finalDecision?.status === 'finalized' && finalDecision.plate) {
      const outcome = registerAutoVisitAndBonus(
        id,
        finalDecision.plate,
        finalDecision.agreement,
        engine.framesSeen,
        'auto_80_anpr',
        visual,
      );
      summaryUz = `Tasdiqlandi (${Math.round(finalDecision.agreement * 100)}%): ${finalDecision.plate} · ${outcome.visitNo}-kelish yaratildi${
        outcome.earnsBonus ? ` va ${outcome.awardedAmount.toLocaleString('fr-FR')} so'm bonus yoqildi` : ''
      }.`;
      summaryRu = `Подтверждено (${Math.round(finalDecision.agreement * 100)}%): ${finalDecision.plate} · визит #${outcome.visitNo}${
        outcome.earnsBonus ? ` + бонус ${outcome.awardedAmount.toLocaleString('fr-FR')} сум` : ''
      }.`;
    } else if (finalDecision?.status === 'pending') {
      const pendingItem: PendingDetection = {
        id: Date.now(),
        boxId: id,
        eventId: engine.eventId,
        suggestedPlate: finalDecision.plate,
        votes: finalDecision.votes,
        framesTaken: engine.framesSeen,
        agreementPct: Math.round(finalDecision.agreement * 100),
        createdAt: new Date().toISOString(),
        imageUrl: visual === 'suv' ? BAY_IMAGES.suv : BAY_IMAGES.sedan,
      };
      dbState.pending = [pendingItem, ...dbState.pending];
      dbState.boxes = dbState.boxes.map((b) =>
        b.id === id
          ? {
              ...b,
              state: 'occupied',
              occupancyScore: 0.68,
              vehicleVisual: visual,
              lastCaptureStatus: 'pending',
              lastAgreement: finalDecision.agreement,
              displayText: 'ADMIN TEKSHIRUVI KUTILMOQDA',
            }
          : b,
      );
      appendLog('pending_created', `${id} · ${finalDecision.plate || 'aniqsiz'} (${Math.round(finalDecision.agreement * 100)}%)`);
      persistState();
      summaryUz = `${engine.framesSeen} kadrda ${anpr.agreementThresholdPct}% ga yetmadi (${Math.round(finalDecision.agreement * 100)}%). Tasdiqlash navbatiga yuborildi.`;
      summaryRu = `За ${engine.framesSeen} кадров не набрано ${anpr.agreementThresholdPct}% (${Math.round(finalDecision.agreement * 100)}%). Отправлено на проверку.`;
    } else {
      dbState.boxes = dbState.boxes.map((b) =>
        b.id === id
          ? {
              ...b,
              state: 'empty',
              occupancyScore: 0.03,
              vehicleVisual: 'empty',
              currentPlate: null,
              lastCaptureStatus: 'aborted',
              lastAgreement: 0,
              displayText: dbState.settings.p10IdleText,
            }
          : b,
      );
      appendLog('capture_aborted', `${id} · bo‘sh kadrlar sabab bekor qilindi`);
      persistState();
      summaryUz = `Ketma-ket ${anpr.noPlateAbortStreak} kadrda raqam topilmadi — soxta harakat bekor qilindi.`;
      summaryRu = `${anpr.noPlateAbortStreak} пустых кадров подряд — ложное срабатывание отменено.`;
    }

    res.json({
      frames,
      decision: finalDecision,
      summaryUz,
      summaryRu,
      state: dbState,
    });
  });

  app.post('/api/boxes/:id/pairing-code', (req, res) => {
    const { id } = req.params;
    const box = dbState.boxes.find((b) => b.id === id);
    if (!box) {
      res.status(404).json({ error: 'Box topilmadi' });
      return;
    }
    const code = String(crypto.randomInt(100000, 999999));
    pairingCodes.set(code, {
      code,
      boxId: id,
      expiresAt: Date.now() + 10 * 60 * 1000,
      used: false,
    });
    dbState.boxes = dbState.boxes.map((b) => (b.id === id ? { ...b, pairingCode: code } : b));
    appendLog('pairing_code_issued', `${id} uchun kod: ${code}`);
    persistState();
    res.json({ box_id: id, code, state: dbState });
  });

  app.post('/api/devices/pair', (req, res) => {
    const code = String(req.body?.code || '').trim();
    const record = pairingCodes.get(code);
    if (!record || record.used || record.expiresAt <= Date.now()) {
      res.status(400).json({ error: 'Kod noto‘g‘ri yoki muddati o‘tgan' });
      return;
    }
    record.used = true;
    dbState.boxes = dbState.boxes.map((b) =>
      b.id === record.boxId ? { ...b, esp32Paired: true, pairingCode: null } : b,
    );
    appendLog('esp32_paired', `${record.boxId} ESP32 ulandi`);
    persistState();
    res.json({ box_id: record.boxId, device_key: dbState.security.deviceKey, state: dbState });
  });

  app.get('/api/display', (req, res) => {
    const boxId = String(req.query.box_id || 'box-1');
    const box = dbState.boxes.find((b) => b.id === boxId);
    if (!box) {
      res.json({
        box_id: boxId,
        status: 'idle',
        text: dbState.settings.p10IdleText,
        bonus_left: 0,
        relay_pulse_ms: dbState.settings.relayPulseMs,
        relay_pause_ms: dbState.settings.relayPauseMs,
      });
      return;
    }
    res.json({
      box_id: box.id,
      status: box.activeBonusLeft > 0 ? 'bonus_active' : box.state === 'occupied' ? 'occupied' : 'idle',
      text: box.displayText,
      bonus_left: box.activeBonusLeft,
      relay_pulse_ms: dbState.settings.relayPulseMs,
      relay_pause_ms: dbState.settings.relayPauseMs,
    });
  });

  app.post('/api/bonus/press', (req, res) => {
    const boxId = String(req.body?.box_id || '');
    const pressId = String(req.body?.press_id || `p-${Date.now()}`);
    const existing = dbState.pulses.find((p) => p.pressId === pressId);
    if (existing) {
      res.json({ ok: true, duplicate: true, amount: existing.amount, state: dbState });
      return;
    }

    const box = dbState.boxes.find((b) => b.id === boxId);
    const activeVisit = dbState.visits.find(
      (v) => v.boxId === boxId && v.isActiveBonus && v.bonusLeft > 0,
    );
    if (!box || box.activeBonusLeft <= 0 || !activeVisit) {
      res.status(400).json({ error: 'Faol bonus topilmadi' });
      return;
    }

    const deducted = Math.min(dbState.settings.bonusPerPress, box.activeBonusLeft);
    const remaining = box.activeBonusLeft - deducted;
    const pulseCount = Math.max(1, Math.floor(deducted / Math.max(1, dbState.settings.pulseValue)));

    const pulse: BonusPulseRecord = {
      id: Date.now(),
      visitId: activeVisit.id,
      boxId,
      plate: activeVisit.plate,
      amount: deducted,
      pressId,
      createdAt: new Date().toISOString(),
      refundedAt: null,
    };

    dbState.pulses = [pulse, ...dbState.pulses];
    dbState.visits = dbState.visits.map((v) =>
      v.id === activeVisit.id
        ? { ...v, bonusLeft: remaining, isActiveBonus: remaining > 0 }
        : v,
    );
    dbState.boxes = dbState.boxes.map((b) =>
      b.id === boxId
        ? {
            ...b,
            activeBonusLeft: remaining,
            displayText:
              remaining > 0
                ? `MUKOFOT QOLDI: ${remaining.toLocaleString('fr-FR')} SO'M`
                : 'MUKOFOT TUGADI',
          }
        : b,
    );
    appendLog('bonus_pressed', `${boxId} · ${activeVisit.plate} · -${deducted.toLocaleString('fr-FR')} so‘m (${pulseCount} impuls)`);
    persistState();
    res.json({
      ok: true,
      amount: deducted,
      bonus_left: remaining,
      pulse_count: pulseCount,
      relay_pulse_ms: dbState.settings.relayPulseMs,
      relay_pause_ms: dbState.settings.relayPauseMs,
      state: dbState,
    });
  });

  app.post('/api/pulses/:id/refund', (req, res) => {
    const pulseId = Number(req.params.id);
    const pulse = dbState.pulses.find((p) => p.id === pulseId);
    if (!pulse || pulse.refundedAt !== null) {
      res.status(400).json({ error: 'Impuls topilmadi yoki qaytarilgan' });
      return;
    }
    const anyOtherActive = dbState.visits.some((v) => v.isActiveBonus && v.id !== pulse.visitId);
    if (anyOtherActive) {
      res.status(400).json({ error: 'Boshqa boxda faol bonus bor' });
      return;
    }

    dbState.pulses = dbState.pulses.map((p) =>
      p.id === pulseId ? { ...p, refundedAt: new Date().toISOString() } : p,
    );
    dbState.visits = dbState.visits.map((v) => {
      if (v.id !== pulse.visitId) return v;
      const restored = Math.min(v.bonusTotal, v.bonusLeft + pulse.amount);
      return { ...v, bonusLeft: restored, isActiveBonus: restored > 0 };
    });
    dbState.boxes = dbState.boxes.map((b) => {
      if (b.id !== pulse.boxId) return b;
      const restored = b.activeBonusLeft + pulse.amount;
      return {
        ...b,
        activeBonusLeft: restored,
        displayText: `MUKOFOT QOLDI: ${restored.toLocaleString('fr-FR')} SO'M`,
      };
    });
    appendLog('pulse_refunded', `${pulse.boxId} · ${pulse.plate} · +${pulse.amount.toLocaleString('fr-FR')} so‘m`);
    persistState();
    res.json({ ok: true, state: dbState });
  });

  app.post('/api/pending/:id/confirm', (req, res) => {
    const pendingId = Number(req.params.id);
    const plate = normalizePlate(String(req.body?.plate || ''));
    if (!PLATE_REGEX.test(plate)) {
      res.status(400).json({ error: 'Raqam formati noto‘g‘ri (masalan: 01A777BC)' });
      return;
    }
    const item = dbState.pending.find((p) => p.id === pendingId);
    if (!item) {
      res.status(404).json({ error: 'Kutilayotgan yozuv topilmadi' });
      return;
    }
    registerAutoVisitAndBonus(
      item.boxId,
      plate,
      item.agreementPct / 100,
      item.framesTaken,
      'manual_confirmed',
      'sedan',
    );
    dbState.pending = dbState.pending.filter((p) => p.id !== pendingId);
    persistState();
    res.json({ ok: true, state: dbState });
  });

  app.post('/api/pending/:id/dismiss', (req, res) => {
    const pendingId = Number(req.params.id);
    const item = dbState.pending.find((p) => p.id === pendingId);
    if (!item) {
      res.status(404).json({ error: 'Kutilayotgan yozuv topilmadi' });
      return;
    }
    dbState.pending = dbState.pending.filter((p) => p.id !== pendingId);
    dbState.boxes = dbState.boxes.map((b) =>
      b.id === item.boxId && b.lastCaptureStatus === 'pending'
        ? {
            ...b,
            state: 'empty',
            occupancyScore: 0.02,
            vehicleVisual: 'empty',
            displayText: dbState.settings.p10IdleText,
          }
        : b,
    );
    appendLog('pending_dismissed', `${item.boxId} · soxta navbat rad etildi`);
    persistState();
    res.json({ ok: true, state: dbState });
  });

  app.put('/api/settings', (req, res) => {
    const next = req.body as Partial<BonusSettings>;
    dbState.settings = {
      bonusAmount: Math.max(1000, Number(next.bonusAmount ?? dbState.settings.bonusAmount)),
      bonusPerPress: Math.max(1000, Number(next.bonusPerPress ?? dbState.settings.bonusPerPress)),
      bonusEveryVisits: Math.max(1, Number(next.bonusEveryVisits ?? dbState.settings.bonusEveryVisits)),
      pulseValue: Math.max(100, Number(next.pulseValue ?? dbState.settings.pulseValue)),
      relayPulseMs: Math.max(30, Math.min(2000, Number(next.relayPulseMs ?? dbState.settings.relayPulseMs))),
      relayPauseMs: Math.max(30, Math.min(2000, Number(next.relayPauseMs ?? dbState.settings.relayPauseMs))),
      p10IdleText: String(next.p10IdleText ?? dbState.settings.p10IdleText).trim() || "AVTOMOBIL YO'Q",
      p10VisitTemplate:
        String(next.p10VisitTemplate ?? dbState.settings.p10VisitTemplate).trim() || '{PLATE} - {VISIT}-KELISH',
      p10BonusTemplate:
        String(next.p10BonusTemplate ?? dbState.settings.p10BonusTemplate).trim() ||
        "{PLATE} - MUKOFOT {BONUS} SO'M",
    };
    dbState.boxes = dbState.boxes.map((b) =>
      b.state === 'empty' ? { ...b, displayText: dbState.settings.p10IdleText } : b,
    );
    appendLog('settings_updated', 'Bonus, rele va P10 shablonlari saqlandi');
    persistState();
    res.json({ ok: true, state: dbState });
  });

  app.put('/api/settings/anpr', (req, res) => {
    const next = req.body as Partial<AnprSettings>;
    dbState.anpr = {
      agreementThresholdPct: Math.max(
        50,
        Math.min(100, Number(next.agreementThresholdPct ?? dbState.anpr.agreementThresholdPct)),
      ),
      minFrames: Math.max(2, Math.min(15, Number(next.minFrames ?? dbState.anpr.minFrames))),
      windowSize: Math.max(2, Math.min(15, Number(next.windowSize ?? dbState.anpr.windowSize))),
      maxFrames: Math.max(5, Math.min(40, Number(next.maxFrames ?? dbState.anpr.maxFrames))),
      noPlateAbortStreak: Math.max(
        2,
        Math.min(15, Number(next.noPlateAbortStreak ?? dbState.anpr.noPlateAbortStreak)),
      ),
      ocrTimeoutSeconds: Math.max(
        1,
        Math.min(30, Number(next.ocrTimeoutSeconds ?? dbState.anpr.ocrTimeoutSeconds)),
      ),
    };
    appendLog(
      'anpr_updated',
      `ANPR: ${dbState.anpr.agreementThresholdPct}% · min ${dbState.anpr.minFrames} · max ${dbState.anpr.maxFrames}`,
    );
    persistState();
    res.json({ ok: true, state: dbState });
  });

  app.put('/api/settings/security', (req, res) => {
    const next = req.body as Partial<SystemSecuritySettings>;
    dbState.security = {
      authEnabled: Boolean(next.authEnabled ?? dbState.security.authEnabled),
      adminUsername:
        String(next.adminUsername ?? dbState.security.adminUsername).trim() ||
        dbState.security.adminUsername,
      adminPassword:
        String(next.adminPassword ?? dbState.security.adminPassword).trim() ||
        dbState.security.adminPassword,
      adminTokenSecret:
        String(next.adminTokenSecret ?? dbState.security.adminTokenSecret).trim() ||
        dbState.security.adminTokenSecret,
      deviceKey:
        String(next.deviceKey ?? dbState.security.deviceKey).trim() || dbState.security.deviceKey,
      appEnv: next.appEnv === 'dev' ? 'dev' : next.appEnv === 'prod' ? 'prod' : dbState.security.appEnv,
      serverPort: Math.max(80, Math.min(65535, Number(next.serverPort ?? dbState.security.serverPort) || 8000)),
      useVaapi: Boolean(next.useVaapi ?? dbState.security.useVaapi),
      vaapiDevice:
        String(next.vaapiDevice ?? dbState.security.vaapiDevice).trim() || '/dev/dri/renderD128',
      anprEnabled: Boolean(next.anprEnabled ?? dbState.security.anprEnabled),
      timezoneOffsetMinutes: Number(
        next.timezoneOffsetMinutes ?? dbState.security.timezoneOffsetMinutes,
      ),
    };
    appendLog('security_updated', 'Muhit, xavfsizlik va qurilma sozlamalari yangilandi');
    persistState();
    res.json({ ok: true, state: dbState });
  });

  app.delete('/api/logs', (_req, res) => {
    dbState.logs = [];
    persistState();
    res.json({ ok: true, state: dbState });
  });

  app.put('/api/system/tailscale', (req, res) => {
    const next = req.body as Partial<TailscaleConfig>;
    dbState.tailscale = {
      hostname: String(next.hostname ?? dbState.tailscale.hostname).trim(),
      servePort: Number(next.servePort ?? dbState.tailscale.servePort) || 8000,
      enabled: Boolean(next.enabled ?? dbState.tailscale.enabled),
    };
    appendLog('tailscale_updated', `Tailscale: ${dbState.tailscale.hostname}`);
    persistState();
    res.json({ ok: true, state: dbState });
  });

  app.get('/api/visits/export.csv', (_req, res) => {
    const lines = [
      'plate,visit_no,box_id,created_at,bonus_total,bonus_left,is_active_bonus,agreement_pct,source',
      ...dbState.visits.map(
        (v) =>
          `${v.plate},${v.visitNo},${v.boxId},${v.createdAt},${v.bonusTotal},${v.bonusLeft},${v.isActiveBonus ? 1 : 0},${v.agreementPct ?? ''},${v.source}`,
      ),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tomchi-visits.csv"');
    res.send(lines.join('\n'));
  });

  app.get('/api/firmware/files', (_req, res) => {
    const inoPath = path.resolve(__dirname, 'firmware/tomchi_panel/tomchi_panel.ino');
    const readmePath = path.resolve(__dirname, 'firmware/README.md');
    const ino = fs.existsSync(inoPath) ? fs.readFileSync(inoPath, 'utf-8') : '';
    const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf-8') : '';
    res.json({ ino, readme, filename: 'tomchi_panel.ino' });
  });

  app.get('/api/firmware/download', (_req, res) => {
    const inoPath = path.resolve(__dirname, 'firmware/tomchi_panel/tomchi_panel.ino');
    if (!fs.existsSync(inoPath)) {
      res.status(404).send('Firmware not found');
      return;
    }
    res.download(inoPath, 'tomchi_panel.ino');
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tomchi server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
