import type {
  AnprSettings,
  BonusPulseRecord,
  BonusSettings,
  DeviceLogRecord,
  SystemSecuritySettings,
  VisitRecord,
  WashBox,
} from '../types';

export const BAY_IMAGES = {
  empty: '/src/assets/images/cam_bay_empty_1794913984202.jpg',
  sedan: '/src/assets/images/cam_bay_sedan_1794913985084.jpg',
  suv: '/src/assets/images/cam_bay_suv_1794913984914.jpg',
} as const;

export const DEFAULT_BONUS_SETTINGS: BonusSettings = {
  bonusAmount: 20000,
  bonusPerPress: 5000,
  bonusEveryVisits: 5,
  pulseValue: 1000,
  relayPulseMs: 120,
  relayPauseMs: 120,
  p10IdleText: "AVTOMOBIL YO'Q",
  p10VisitTemplate: '{PLATE} - {VISIT}-KELISH',
  p10BonusTemplate: "{PLATE} - MUKOFOT {BONUS} SO'M",
};

export const DEFAULT_ANPR_SETTINGS: AnprSettings = {
  agreementThresholdPct: 80,
  minFrames: 5,
  windowSize: 5,
  maxFrames: 15,
  noPlateAbortStreak: 5,
  ocrTimeoutSeconds: 5,
};

export const DEFAULT_SECURITY_SETTINGS: SystemSecuritySettings = {
  authEnabled: false,
  adminUsername: 'admin',
  adminPassword: 'tomchi2026',
  adminTokenSecret: 'tomchi-token-secret-change-me',
  deviceKey: 'tomchi-local-device-key',
  appEnv: 'prod',
  serverPort: 8000,
  useVaapi: true,
  vaapiDevice: '/dev/dri/renderD128',
  anprEnabled: true,
  timezoneOffsetMinutes: 300,
};

export function createBoxTemplate(index: number): WashBox {
  const num = index + 1;
  const ip = `192.168.1.${100 + num}`;
  return {
    id: `box-${num}`,
    name: `Box ${num}`,
    virtualMode: true,
    state: 'empty',
    cameraBrand: 'hikvision',
    cameraIp: ip,
    lowStreamUrl: `rtsp://admin:pass@${ip}:554/Streaming/Channels/102`,
    highStreamUrl: `rtsp://admin:pass@${ip}:554/Streaming/Channels/101`,
    snapshotUrl: `http://admin:pass@${ip}:80/ISAPI/Streaming/channels/101/picture`,
    useVaapi: true,
    roi: { x: 0.22, y: 0.34, w: 0.56, h: 0.48 },
    occupancyScore: 0.02,
    currentPlate: null,
    activeBonusLeft: 0,
    vehicleVisual: 'empty',
    lastCaptureStatus: 'idle',
    lastAgreement: null,
    displayText: "AVTOMOBIL YO'Q",
    esp32Paired: num <= 2,
    pairingCode: null,
  };
}

export const INITIAL_BOXES: WashBox[] = [
  {
    ...createBoxTemplate(0),
    state: 'occupied',
    occupancyScore: 0.74,
    currentPlate: '01A777BC',
    activeBonusLeft: 15000,
    vehicleVisual: 'sedan',
    lastCaptureStatus: 'finalized',
    lastAgreement: 1.0,
    displayText: "01A777BC - 5-KELISH! MUKOFOT 15 000 SO'M",
  },
  {
    ...createBoxTemplate(1),
    state: 'occupied',
    occupancyScore: 0.68,
    currentPlate: '01K512DA',
    activeBonusLeft: 0,
    vehicleVisual: 'suv',
    lastCaptureStatus: 'finalized',
    lastAgreement: 0.8,
    displayText: '01K512DA - 3-KELISH',
  },
  createBoxTemplate(2),
  createBoxTemplate(3),
];

export const INITIAL_VISITS: VisitRecord[] = [
  {
    id: 102,
    plate: '01A777BC',
    boxId: 'box-1',
    visitNo: 5,
    createdAt: '2026-11-16T08:42:10Z',
    bonusTotal: 20000,
    bonusLeft: 15000,
    isActiveBonus: true,
    agreementPct: 100,
    framesUsed: 5,
    source: 'auto_80_anpr',
    imageUrl: BAY_IMAGES.sedan,
  },
  {
    id: 101,
    plate: '01K512DA',
    boxId: 'box-2',
    visitNo: 3,
    createdAt: '2026-11-16T08:31:04Z',
    bonusTotal: 0,
    bonusLeft: 0,
    isActiveBonus: false,
    agreementPct: 80,
    framesUsed: 5,
    source: 'auto_80_anpr',
    imageUrl: BAY_IMAGES.suv,
  },
  {
    id: 100,
    plate: '10M884BA',
    boxId: 'box-3',
    visitNo: 4,
    createdAt: '2026-11-16T07:55:21Z',
    bonusTotal: 0,
    bonusLeft: 0,
    isActiveBonus: false,
    agreementPct: 80,
    framesUsed: 6,
    source: 'auto_80_anpr',
    imageUrl: BAY_IMAGES.sedan,
  },
];

export const INITIAL_PULSES: BonusPulseRecord[] = [
  {
    id: 41,
    visitId: 102,
    boxId: 'box-1',
    plate: '01A777BC',
    amount: 5000,
    pressId: 'p-8a21f0c1-000142a0',
    createdAt: '2026-11-16T08:43:05Z',
    refundedAt: null,
  },
];

export const INITIAL_LOGS: DeviceLogRecord[] = [
  {
    id: 2,
    event: 'bonus_pressed',
    payload: 'box-1 · 01A777BC · -5 000 so‘m (5 impuls)',
    createdAt: '2026-11-16T08:43:05Z',
  },
  {
    id: 1,
    event: 'visit_registered',
    payload: 'box-1 · 01A777BC · 5-kelish · bonus 20 000 so‘m',
    createdAt: '2026-11-16T08:42:10Z',
  },
];
