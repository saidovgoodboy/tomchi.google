import {
  Activity,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  Globe,
  KeyRound,
  Lock,
  Moon,
  Play,
  RefreshCw,
  Save,
  Shield,
  Sun,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BAY_IMAGES } from '../data/initialData';
import type {
  AnprSettings,
  CameraBrand,
  CaptureFrameLog,
  DeviceLogRecord,
  Language,
  NormalizedROI,
  SystemDiagnostics,
  SystemSecuritySettings,
  TailscaleConfig,
  Theme,
  WashBox,
} from '../types';
import { PWAInstallButton } from './PWAInstallButton';

export type BurstPresetKey = 'consensus_5_5' | 'consensus_4_5' | 'mixed_pending' | 'empty_abort';
type SettingsSubTab = 'cameras' | 'esp32' | 'tailscale' | 'security';

interface SettingsViewProps {
  boxes: WashBox[];
  selectedBoxId: string;
  onSelectBox: (boxId: string) => void;
  language: Language;
  onChangeLanguage: (lang: Language) => void;
  theme: Theme;
  onToggleTheme: () => void;
  runningBurst: boolean;
  frameLogs: CaptureFrameLog[];
  lastOutcomeText: string | null;
  onStartBurst: (boxId: string, preset: BurstPresetKey, customPlate: string) => void;
  onUpdateCameraConfig: (
    boxId: string,
    patch: {
      name: string;
      virtualMode: boolean;
      cameraBrand: CameraBrand;
      cameraIp: string;
      lowStreamUrl: string;
      highStreamUrl: string;
      snapshotUrl: string;
      useVaapi: boolean;
      roi: NormalizedROI;
    },
  ) => void;
  onDeleteBox: (boxId: string) => void;
  anprSettings: AnprSettings;
  onSaveAnprSettings: (next: AnprSettings) => void;
  onGenerateEsp32Code: (boxId: string) => void;
  onSimulateEsp32Claim: (boxId: string, code: string) => void;
  logs: DeviceLogRecord[];
  onClearLogs: () => void;
  tailscale: TailscaleConfig;
  onSaveTailscale: (next: TailscaleConfig) => void;
  security: SystemSecuritySettings;
  onSaveSecurity: (next: SystemSecuritySettings) => void;
  onLockPanel: () => void;
}

export function SettingsView({
  boxes,
  selectedBoxId,
  onSelectBox,
  language,
  onChangeLanguage,
  theme,
  onToggleTheme,
  runningBurst,
  frameLogs,
  lastOutcomeText,
  onStartBurst,
  onUpdateCameraConfig,
  onDeleteBox,
  anprSettings,
  onSaveAnprSettings,
  onGenerateEsp32Code,
  onSimulateEsp32Claim,
  logs,
  onClearLogs,
  tailscale,
  onSaveTailscale,
  security,
  onSaveSecurity,
  onLockPanel,
}: SettingsViewProps) {
  const [subTab, setSubTab] = useState<SettingsSubTab>('cameras');
  const box = boxes.find((b) => b.id === selectedBoxId) ?? boxes[0];

  const [boxName, setBoxName] = useState(box.name);
  const [virtualMode, setVirtualMode] = useState(box.virtualMode);
  const [brand, setBrand] = useState<CameraBrand>(box.cameraBrand);
  const [camIp, setCamIp] = useState(box.cameraIp);
  const [camUser, setCamUser] = useState('admin');
  const [camPass, setCamPass] = useState('pass');
  const [lowUrl, setLowUrl] = useState(box.lowStreamUrl);
  const [highUrl, setHighUrl] = useState(box.highStreamUrl);
  const [snapUrl, setSnapUrl] = useState(box.snapshotUrl);
  const [useVaapi, setUseVaapi] = useState(box.useVaapi);
  const [roi, setRoi] = useState<NormalizedROI>(box.roi);
  const [camSaved, setCamSaved] = useState(false);

  const [anprDraft, setAnprDraft] = useState<Record<keyof AnprSettings, string>>({
    agreementThresholdPct: String(anprSettings.agreementThresholdPct),
    minFrames: String(anprSettings.minFrames),
    windowSize: String(anprSettings.windowSize),
    maxFrames: String(anprSettings.maxFrames),
    noPlateAbortStreak: String(anprSettings.noPlateAbortStreak),
    ocrTimeoutSeconds: String(anprSettings.ocrTimeoutSeconds),
  });
  const [anprSaved, setAnprSaved] = useState(false);

  const [preset, setPreset] = useState<BurstPresetKey>('consensus_4_5');
  const [customPlate, setCustomPlate] = useState('01A888BC');

  const [firmwareCode, setFirmwareCode] = useState<string>('');
  const [firmwareCopied, setFirmwareCopied] = useState(false);
  const [deviceKeyCopied, setDeviceKeyCopied] = useState(false);

  const [tsDraft, setTsDraft] = useState<TailscaleConfig>(tailscale);
  const [tsSaved, setTsSaved] = useState(false);
  const [tsCopied, setTsCopied] = useState(false);

  const [secDraft, setSecDraft] = useState<SystemSecuritySettings>(security);
  const [secPortDraft, setSecPortDraft] = useState<string>(String(security.serverPort ?? 8000));
  const [secSaved, setSecSaved] = useState(false);
  const [envCopied, setEnvCopied] = useState(false);

  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const roiBoxRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setBoxName(box.name);
    setVirtualMode(box.virtualMode);
    setBrand(box.cameraBrand);
    setCamIp(box.cameraIp);
    setLowUrl(box.lowStreamUrl);
    setHighUrl(box.highStreamUrl);
    setSnapUrl(box.snapshotUrl);
    setUseVaapi(box.useVaapi);
    setRoi(box.roi);
  }, [box]);

  useEffect(() => {
    setAnprDraft({
      agreementThresholdPct: String(anprSettings.agreementThresholdPct),
      minFrames: String(anprSettings.minFrames),
      windowSize: String(anprSettings.windowSize),
      maxFrames: String(anprSettings.maxFrames),
      noPlateAbortStreak: String(anprSettings.noPlateAbortStreak),
      ocrTimeoutSeconds: String(anprSettings.ocrTimeoutSeconds),
    });
  }, [anprSettings]);

  useEffect(() => {
    setTsDraft(tailscale);
  }, [tailscale]);

  useEffect(() => {
    setSecDraft(security);
    setSecPortDraft(String(security.serverPort ?? 8000));
  }, [security]);

  useEffect(() => {
    if (subTab !== 'esp32' || firmwareCode) return;
    fetch('/api/firmware/files')
      .then((r) => r.json())
      .then((d: { ino?: string }) => {
        if (d.ino) setFirmwareCode(d.ino);
      })
      .catch(() => {});
  }, [subTab, firmwareCode]);

  const loadDiagnostics = () => {
    setDiagLoading(true);
    fetch('/api/system/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SystemDiagnostics | null) => {
        if (d) setDiagnostics(d);
      })
      .catch(() => {})
      .finally(() => setDiagLoading(false));
  };

  useEffect(() => {
    if (subTab === 'tailscale' && !diagnostics) {
      loadDiagnostics();
    }
  }, [subTab, diagnostics]);

  const buildTemplates = (nextBrand: CameraBrand, ip: string, user: string, pass: string) => {
    const cleanIp = ip.trim() || '192.168.1.101';
    const auth = user.trim() ? `${encodeURIComponent(user.trim())}:${encodeURIComponent(pass)}@` : '';
    if (nextBrand === 'hikvision') {
      return {
        low: `rtsp://${auth}${cleanIp}:554/Streaming/Channels/102`,
        high: `rtsp://${auth}${cleanIp}:554/Streaming/Channels/101`,
        snap: `http://${auth}${cleanIp}:80/ISAPI/Streaming/channels/101/picture`,
      };
    }
    if (nextBrand === 'dahua') {
      return {
        low: `rtsp://${auth}${cleanIp}:554/cam/realmonitor?channel=1&subtype=1`,
        high: `rtsp://${auth}${cleanIp}:554/cam/realmonitor?channel=1&subtype=0`,
        snap: `http://${auth}${cleanIp}:80/cgi-bin/snapshot.cgi?channel=1`,
      };
    }
    if (nextBrand === 'uniview') {
      return {
        low: `rtsp://${auth}${cleanIp}:554/unicast/c1/s1/live`,
        high: `rtsp://${auth}${cleanIp}:554/unicast/c1/s0/live`,
        snap: `http://${auth}${cleanIp}:80/LAPI/V1.0/Channels/0/Media/Video/Streams/0/Snapshot`,
      };
    }
    return {
      low: `rtsp://${auth}${cleanIp}:554/stream2`,
      high: `rtsp://${auth}${cleanIp}:554/stream1`,
      snap: '',
    };
  };

  const applyTemplates = (b = brand, ip = camIp, u = camUser, p = camPass) => {
    const urls = buildTemplates(b, ip, u, p);
    setLowUrl(urls.low);
    setHighUrl(urls.high);
    setSnapUrl(urls.snap);
  };

  const pointerToNormalized = (clientX: number, clientY: number) => {
    const rect = roiBoxRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const nx = Math.max(0.02, Math.min(0.98, (clientX - rect.left) / rect.width));
    const ny = Math.max(0.02, Math.min(0.98, (clientY - rect.top) / rect.height));
    return { x: nx, y: ny };
  };

  const handleRoiPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = pointerToNormalized(e.clientX, e.clientY);
    if (pt) dragStartRef.current = pt;
  };

  const handleRoiPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const pt = pointerToNormalized(e.clientX, e.clientY);
    if (!pt) return;
    const x = Math.min(dragStartRef.current.x, pt.x);
    const y = Math.min(dragStartRef.current.y, pt.y);
    const w = Math.max(0.15, Math.abs(pt.x - dragStartRef.current.x));
    const h = Math.max(0.15, Math.abs(pt.y - dragStartRef.current.y));
    setRoi({
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      w: Number(Math.min(1 - x, w).toFixed(2)),
      h: Number(Math.min(1 - y, h).toFixed(2)),
    });
  };

  const handleRoiPointerUp = () => {
    dragStartRef.current = null;
  };

  const handleSaveCamera = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateCameraConfig(box.id, {
      name: boxName.trim() || box.name,
      virtualMode,
      cameraBrand: brand,
      cameraIp: camIp.trim() || box.cameraIp,
      lowStreamUrl: lowUrl.trim(),
      highStreamUrl: highUrl.trim(),
      snapshotUrl: snapUrl.trim(),
      useVaapi,
      roi,
    });
    setCamSaved(true);
    window.setTimeout(() => setCamSaved(false), 2000);
  };

  const handleCopyFirmware = async () => {
    try {
      await navigator.clipboard.writeText(firmwareCode);
      setFirmwareCopied(true);
      window.setTimeout(() => setFirmwareCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyDeviceKey = async () => {
    try {
      await navigator.clipboard.writeText(secDraft.deviceKey);
      setDeviceKeyCopied(true);
      window.setTimeout(() => setDeviceKeyCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyTailscaleUrl = async () => {
    const cleanHost = tsDraft.hostname.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    try {
      await navigator.clipboard.writeText(`https://${cleanHost}`);
      setTsCopied(true);
      window.setTimeout(() => setTsCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const previewImg =
    box.vehicleVisual === 'sedan'
      ? BAY_IMAGES.sedan
      : box.vehicleVisual === 'suv'
        ? BAY_IMAGES.suv
        : BAY_IMAGES.empty;

  const cleanTsHost = tsDraft.hostname.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  return (
    <div className="space-y-6">
      {/* Sub-navigation inside Settings */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-800">
          {(
            [
              { key: 'cameras', uz: 'Kamera va ANPR', ru: 'Камера и ANPR', icon: Camera },
              { key: 'esp32', uz: 'ESP32 va Loglar', ru: 'ESP32 и Логи', icon: Cpu },
              { key: 'tailscale', uz: 'Tailscale va Server', ru: 'Tailscale и Сервер', icon: Globe },
              { key: 'security', uz: 'Xavfsizlik va Ilova', ru: 'Доступ и PWA', icon: Shield },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = subTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setSubTab(item.key)}
                className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{item[language]}</span>
              </button>
            );
          })}
        </div>

        {(subTab === 'cameras' || subTab === 'esp32') && (
          <select
            aria-label={language === 'uz' ? 'Box tanlash' : 'Выбрать бокс'}
            value={box.id}
            onChange={(e) => onSelectBox(e.target.value)}
            className="min-h-[40px] px-3 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            {boxes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.virtualMode ? (language === 'uz' ? 'Virtual' : 'Виртуал.') : b.cameraIp})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Sub-tab 1: Cameras, Box Rename/Delete, Touch ROI & ANPR Settings + Test */}
      {subTab === 'cameras' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-display font-semibold text-slate-900 dark:text-slate-50">
                  {language === 'uz' ? `${box.name} · Kamera va ROI` : `${box.name} · Камера и ROI`}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {language === 'uz'
                    ? 'Rasm ustida barmoq yoki sichqoncha bilan mashina kiradigan hududni chizing.'
                    : 'Нарисуйте рамку ROI прямо поверх изображения.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVirtualMode((v) => !v)}
                className={`min-h-[40px] px-3 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  virtualMode
                    ? 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
                    : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {virtualMode
                  ? language === 'uz'
                    ? 'Rejim: Virtual (Test)'
                    : 'Режим: Виртуальный'
                  : language === 'uz'
                    ? 'Rejim: Real IP Kamera'
                    : 'Режим: Реальная IP'}
              </button>
            </div>

            {/* Interactive Touch / Mouse ROI Box */}
            <div
              ref={roiBoxRef}
              onPointerDown={handleRoiPointerDown}
              onPointerMove={handleRoiPointerMove}
              onPointerUp={handleRoiPointerUp}
              className="relative aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 touch-none select-none cursor-crosshair"
            >
              <img
                src={previewImg}
                alt={`${box.name} ROI`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover pointer-events-none"
              />
              <div
                className="absolute border-2 border-sky-400 bg-sky-500/15 pointer-events-none"
                style={{
                  left: `${roi.x * 100}%`,
                  top: `${roi.y * 100}%`,
                  width: `${roi.w * 100}%`,
                  height: `${roi.h * 100}%`,
                }}
              >
                <span className="bg-slate-950/85 text-sky-300 font-mono text-[10px] px-1.5 py-0.5 inline-block">
                  ROI {Math.round(roi.w * 100)}%×{Math.round(roi.h * 100)}%
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveCamera} className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="text-slate-600 dark:text-slate-300">
                  {language === 'uz' ? 'Box nomi' : 'Название бокса'}
                </span>
                <input
                  type="text"
                  value={boxName}
                  onChange={(e) => setBoxName(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </label>

              {!virtualMode && (
                <>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800 dark:text-slate-100">
                        {language === 'uz' ? 'Tezkor IP kamera ulash' : 'Быстрое подключение IP'}
                      </span>
                      <button
                        type="button"
                        onClick={() => applyTemplates()}
                        className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap"
                      >
                        <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{language === 'uz' ? 'URL yasash' : 'Сгенерировать'}</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={brand}
                        onChange={(e) => {
                          const b = e.target.value as CameraBrand;
                          setBrand(b);
                          applyTemplates(b, camIp, camUser, camPass);
                        }}
                        className="min-h-[40px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      >
                        <option value="hikvision">Hikvision</option>
                        <option value="dahua">Dahua</option>
                        <option value="uniview">Uniview</option>
                        <option value="onvif_generic">Generic ONVIF</option>
                      </select>
                      <input
                        type="text"
                        value={camIp}
                        onChange={(e) => setCamIp(e.target.value)}
                        placeholder="192.168.1.101"
                        className="min-h-[40px] px-2.5 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                      <input
                        type="text"
                        value={camUser}
                        onChange={(e) => setCamUser(e.target.value)}
                        placeholder="admin"
                        className="min-h-[40px] px-2.5 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                      <input
                        type="password"
                        value={camPass}
                        onChange={(e) => setCamPass(e.target.value)}
                        placeholder={language === 'uz' ? 'parol' : 'пароль'}
                        className="min-h-[40px] px-2.5 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-slate-600 dark:text-slate-300">Sub-stream RTSP</span>
                    <input
                      type="text"
                      value={lowUrl}
                      onChange={(e) => setLowUrl(e.target.value)}
                      className="w-full min-h-[40px] px-3 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-slate-600 dark:text-slate-300">Main-stream RTSP</span>
                    <input
                      type="text"
                      value={highUrl}
                      onChange={(e) => setHighUrl(e.target.value)}
                      className="w-full min-h-[40px] px-3 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-slate-600 dark:text-slate-300">Snapshot HTTP URL</span>
                    <input
                      type="text"
                      value={snapUrl}
                      onChange={(e) => setSnapUrl(e.target.value)}
                      placeholder="http://admin:pass@192.168.1.101:80/ISAPI/Streaming/channels/101/picture"
                      className="w-full min-h-[40px] px-3 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </label>

                  <label className="flex items-center gap-2 py-1 text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={useVaapi}
                      onChange={(e) => setUseVaapi(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700"
                    />
                    <span>AMD RX 580 VA-API (/dev/dri/renderD128)</span>
                  </label>
                </>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 text-xs font-medium rounded-lg bg-slate-900 dark:bg-sky-600 text-white hover:bg-slate-800 dark:hover:bg-sky-700 transition-colors whitespace-nowrap"
                  >
                    <Save className="w-4 h-4" aria-hidden="true" />
                    <span>{language === 'uz' ? 'Saqlash' : 'Сохранить'}</span>
                  </button>
                  {camSaved && (
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      {language === 'uz' ? 'Saqlandi' : 'Сохранено'}
                    </span>
                  )}
                </div>

                {boxes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteBox(box.id)}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 text-xs font-medium rounded-lg border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{language === 'uz' ? 'Boxni o‘chirish' : 'Удалить'}</span>
                  </button>
                )}
              </div>
            </form>
          </section>

          {/* Right column: ANPR Thresholds + 1 FPS Simulator */}
          <div className="lg:col-span-6 space-y-6">
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3">
              <div>
                <h2 className="text-base font-display font-semibold text-slate-900 dark:text-slate-50">
                  {language === 'uz' ? 'ANPR qaror chegaralari' : 'Параметры решения ANPR'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {language === 'uz'
                    ? 'Qancha kadrda va necha foiz kelishuvda raqam tasdiqlanishini sozlang.'
                    : 'Настройте порог консенсуса, количество кадров и таймаут OCR.'}
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const clamp = (raw: string, fallback: number, min: number, max: number) => {
                    const n = Number(raw);
                    if (!raw.trim() || !Number.isFinite(n)) return fallback;
                    return Math.max(min, Math.min(max, Math.round(n)));
                  };
                  const parsed: AnprSettings = {
                    agreementThresholdPct: clamp(anprDraft.agreementThresholdPct, anprSettings.agreementThresholdPct, 50, 100),
                    minFrames: clamp(anprDraft.minFrames, anprSettings.minFrames, 2, 15),
                    windowSize: clamp(anprDraft.windowSize, anprSettings.windowSize, 2, 15),
                    maxFrames: clamp(anprDraft.maxFrames, anprSettings.maxFrames, 5, 40),
                    noPlateAbortStreak: clamp(anprDraft.noPlateAbortStreak, anprSettings.noPlateAbortStreak, 2, 15),
                    ocrTimeoutSeconds: clamp(anprDraft.ocrTimeoutSeconds, anprSettings.ocrTimeoutSeconds, 1, 30),
                  };
                  setAnprDraft({
                    agreementThresholdPct: String(parsed.agreementThresholdPct),
                    minFrames: String(parsed.minFrames),
                    windowSize: String(parsed.windowSize),
                    maxFrames: String(parsed.maxFrames),
                    noPlateAbortStreak: String(parsed.noPlateAbortStreak),
                    ocrTimeoutSeconds: String(parsed.ocrTimeoutSeconds),
                  });
                  onSaveAnprSettings(parsed);
                  setAnprSaved(true);
                  window.setTimeout(() => setAnprSaved(false), 2000);
                }}
                className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs"
              >
                {(
                  [
                    {
                      key: 'agreementThresholdPct',
                      uz: 'Kelishuv (%)',
                      ru: 'Консенсус (%)',
                      placeholder: '80',
                    },
                    { key: 'minFrames', uz: 'Min kadrlar', ru: 'Мин кадров', placeholder: '5' },
                    { key: 'windowSize', uz: 'Oyna (kadr)', ru: 'Окно (кадр.)', placeholder: '5' },
                    { key: 'maxFrames', uz: 'Max kadrlar', ru: 'Макс кадров', placeholder: '15' },
                    {
                      key: 'noPlateAbortStreak',
                      uz: 'Bo‘sh bekor',
                      ru: 'Пустых отмена',
                      placeholder: '5',
                    },
                    { key: 'ocrTimeoutSeconds', uz: 'OCR timeout (s)', ru: 'OCR timeout (с)', placeholder: '5' },
                  ] as const
                ).map((field) => (
                  <label key={field.key} className="block space-y-1">
                    <span className="text-slate-600 dark:text-slate-300">{field[language]}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder={field.placeholder}
                      value={anprDraft[field.key]}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d+$/.test(val)) {
                          setAnprDraft((s) => ({ ...s, [field.key]: val }));
                        }
                      }}
                      className="w-full min-h-[40px] px-2.5 font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </label>
                ))}

                <div className="col-span-2 sm:col-span-3 flex items-center justify-between pt-1">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-4 text-xs font-medium rounded-lg bg-slate-900 dark:bg-sky-600 text-white"
                  >
                    <Save className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{language === 'uz' ? 'ANPR ni saqlash' : 'Сохранить ANPR'}</span>
                  </button>
                  {anprSaved && (
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      {language === 'uz' ? 'Saqlandi' : 'Сохранено'}
                    </span>
                  )}
                </div>
              </form>
            </section>

            {/* 1 FPS Consensus ANPR Simulator */}
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
              <div>
                <h2 className="text-base font-display font-semibold text-slate-900 dark:text-slate-50">
                  {language === 'uz'
                    ? `1 FPS ANPR (${anprSettings.agreementThresholdPct}% kelishuv) sinovi`
                    : `Тест 1 FPS ANPR (консенсус ${anprSettings.agreementThresholdPct}%)`}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {language === 'uz'
                    ? `Kamida ${anprSettings.minFrames} kadrda >= ${anprSettings.agreementThresholdPct}% bir xil raqam bo‘lsa kelish yaratiladi.`
                    : `При >= ${anprSettings.agreementThresholdPct}% за ${anprSettings.minFrames} кадров создаётся визит.`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80">
                {(
                  [
                    { key: 'consensus_4_5', uz: '4/5 (80%) · 1 xira', ru: '4/5 (80%)' },
                    { key: 'consensus_5_5', uz: '5/5 (100%) · Toza', ru: '5/5 (100%)' },
                    { key: 'mixed_pending', uz: '15 kadr -> Pending', ru: '15 кадр. -> Pending' },
                    { key: 'empty_abort', uz: '5x Bo‘sh -> Bekor', ru: '5x Пусто -> Отмена' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPreset(opt.key)}
                    className={`min-h-[40px] px-2.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap truncate ${
                      preset === opt.key
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {opt[language]}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="text"
                  value={customPlate}
                  onChange={(e) => setCustomPlate(e.target.value.toUpperCase())}
                  maxLength={10}
                  placeholder="01A888BC"
                  className="w-32 min-h-[44px] px-3 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={runningBurst}
                  onClick={() => onStartBurst(box.id, preset, customPlate)}
                  className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 text-xs font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <Play className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {runningBurst
                      ? language === 'uz'
                        ? 'Ishlamoqda…'
                        : 'Выполняется…'
                      : language === 'uz'
                        ? 'CaptureSession boshlash'
                        : 'Запустить CaptureSession'}
                  </span>
                </button>
              </div>

              {lastOutcomeText && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3.5 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-100">
                  {lastOutcomeText}
                </div>
              )}

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                      <th className="py-2 px-2.5 font-medium">#</th>
                      <th className="py-2 px-2.5 font-medium">OCR</th>
                      <th className="py-2 px-2.5 font-medium text-right">
                        {language === 'uz' ? 'Oyna' : 'Окно'}
                      </th>
                      <th className="py-2 px-2.5 font-medium">
                        {language === 'uz' ? 'Qaror' : 'Решение'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {frameLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 px-3 text-center text-slate-500 dark:text-slate-400">
                          {language === 'uz'
                            ? 'Ssenariyni tanlab sinab ko‘ring.'
                            : 'Выберите сценарий и запустите тест.'}
                        </td>
                      </tr>
                    ) : (
                      frameLogs.map((row) => (
                        <tr key={row.frameIndex}>
                          <td className="py-2 px-2.5 font-mono tabular-nums text-slate-500">
                            {row.frameIndex}
                          </td>
                          <td className="py-2 px-2.5 font-mono font-medium text-slate-900 dark:text-slate-100">
                            {row.plate ?? '—'}
                          </td>
                          <td className="py-2 px-2.5 font-mono tabular-nums text-right text-slate-700 dark:text-slate-200">
                            {row.windowVotes}/{row.windowLength} ({Math.round(row.agreement * 100)}%)
                          </td>
                          <td className="py-2 px-2.5 font-medium">
                            {row.decisionStatus === 'finalized' && (
                              <span className="text-emerald-700 dark:text-emerald-400">
                                {language === 'uz' ? 'Tasdiqlandi' : 'Подтверждён'}
                              </span>
                            )}
                            {row.decisionStatus === 'pending' && (
                              <span className="text-amber-700 dark:text-amber-400">
                                {language === 'uz' ? 'Tasdiq kutmoqda' : 'Ожидает'}
                              </span>
                            )}
                            {row.decisionStatus === 'aborted' && (
                              <span className="text-rose-700 dark:text-rose-400">
                                {language === 'uz' ? 'Bekor qilindi' : 'Отменён'}
                              </span>
                            )}
                            {row.decisionStatus === 'continue' && (
                              <span className="text-slate-400">
                                {language === 'uz' ? 'Davom etmoqda' : 'Далее'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Sub-tab 2: ESP32 Zero-Config Pairing + Device Key + Firmware + Device Logs */}
      {subTab === 'esp32' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-display font-semibold text-slate-900 dark:text-slate-50">
                  {language === 'uz' ? `${box.name} · ESP32 P10 ulash` : `${box.name} · Привязка ESP32`}
                </h2>
                {box.esp32Paired ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    <span>{language === 'uz' ? 'Ulangan' : 'Подключён'}</span>
                  </span>
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {language === 'uz' ? 'Ulanmagan' : 'Не подключён'}
                  </span>
                )}
              </div>

              <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal pl-4 leading-relaxed">
                <li>
                  {language === 'uz'
                    ? 'Universal proshivkali ESP32 ni yoqing — «Tomchi-Setup» Wi-Fi ochiladi.'
                    : 'Включите ESP32 — появится Wi-Fi «Tomchi-Setup».'}
                </li>
                <li>
                  {language === 'uz'
                    ? 'Telefondan shu Wi-Fi ga kirib, quyidagi 6 xonali kodni kiriting.'
                    : 'Подключитесь с телефона и введите 6-значный код.'}
                </li>
                <li>
                  {language === 'uz'
                    ? 'ESP32 box_id va device_key ni olib avtomatik ishlay boshlaydi.'
                    : 'ESP32 сам загрузит box_id и device_key.'}
                </li>
              </ol>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => onGenerateEsp32Code(box.id)}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 text-xs font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors whitespace-nowrap"
                >
                  <KeyRound className="w-4 h-4" aria-hidden="true" />
                  <span>{language === 'uz' ? '6 xonali kod olish' : 'Получить код'}</span>
                </button>

                {box.pairingCode && (
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-lg tracking-widest text-sky-700 dark:text-sky-300 px-2">
                      {box.pairingCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSimulateEsp32Claim(box.id, box.pairingCode!)}
                      className="min-h-[40px] px-3 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                    >
                      {language === 'uz' ? 'Ulashni sinash' : 'Тест привязки'}
                    </button>
                  </div>
                )}
              </div>

              {/* DEVICE_KEY section */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <p className="font-medium text-slate-800 dark:text-slate-200">
                  {language === 'uz' ? 'Qurilma kaliti (X-Device-Key)' : 'Ключ устройства (X-Device-Key)'}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={secDraft.deviceKey}
                    onChange={(e) => setSecDraft((s) => ({ ...s, deviceKey: e.target.value }))}
                    className="flex-1 min-h-[40px] px-3 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleCopyDeviceKey}
                    className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 whitespace-nowrap"
                  >
                    {deviceKeyCopied ? 'OK' : language === 'uz' ? 'Nusxa' : 'Копия'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSaveSecurity(secDraft)}
                    className="min-h-[40px] px-3 rounded-lg bg-slate-900 dark:bg-sky-600 text-white whitespace-nowrap"
                  >
                    {language === 'uz' ? 'Saqlash' : 'Сохранить'}
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  {language === 'uz'
                    ? 'Linuxda USB orqali proshivka yozish:'
                    : 'Прошивка по USB на Linux:'}
                </p>
                <pre className="rounded-lg bg-slate-950 text-slate-100 p-3 text-[11px] font-mono overflow-x-auto">
                  <code>
                    esptool.py --chip esp32 --port /dev/ttyUSB0 write_flash 0x10000 firmware/builds/tomchi_panel.bin
                  </code>
                </pre>
              </div>
            </section>

            {/* Embedded ESP32 Source Code Viewer */}
            <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-display font-semibold text-slate-900 dark:text-slate-50">
                    firmware/tomchi_panel/tomchi_panel.ino
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {language === 'uz'
                      ? 'Universal ESP32 kodi ilova ichida saqlangan (Captive Portal + P10 + Bill Acceptor Puls).'
                      : 'Универсальный код ESP32 внутри приложения.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyFirmware}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {firmwareCopied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {firmwareCopied
                        ? language === 'uz'
                          ? 'Nusxalandi'
                          : 'Скопировано'
                        : language === 'uz'
                          ? 'Nusxa'
                          : 'Копия'}
                    </span>
                  </button>
                  <a
                    href="/api/firmware/download"
                    download="tomchi_panel.ino"
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 text-xs font-medium rounded-lg bg-slate-900 dark:bg-sky-600 text-white hover:bg-slate-800 dark:hover:bg-sky-700"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>.ino</span>
                  </a>
                </div>
              </div>

              <pre className="max-h-[400px] rounded-xl bg-slate-950 text-slate-100 p-4 text-[11px] font-mono overflow-auto leading-relaxed border border-slate-800">
                <code>{firmwareCode || (language === 'uz' ? '// Yuklanmoqda...' : '// Загрузка...')}</code>
              </pre>
            </section>
          </div>

          {/* Device & System Events Log */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-display font-semibold text-slate-900 dark:text-slate-50">
                  {language === 'uz' ? 'Qurilma va hodisalar jurnali (DeviceLog)' : 'Журнал событий устройств'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {language === 'uz'
                    ? 'ESP32 ulanishi, kelishlar, bonus va sozlama o‘zgarishlari.'
                    : 'Подключения ESP32, визиты, бонусы и изменения настроек.'}
                </p>
              </div>
              {logs.length > 0 && (
                <button
                  type="button"
                  onClick={onClearLogs}
                  className="min-h-[36px] px-3 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {language === 'uz' ? 'Tozalash' : 'Очистить'}
                </button>
              )}
            </div>

            {logs.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                {language === 'uz' ? 'Jurnal bo‘sh.' : 'Журнал пуст.'}
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {logs.map((entry) => (
                  <div key={entry.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="min-w-0">
                      <span className="font-mono font-medium text-sky-700 dark:text-sky-400 mr-2">
                        {entry.event}
                      </span>
                      <span className="text-slate-700 dark:text-slate-200">{entry.payload}</span>
                    </div>
                    <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                      {entry.createdAt.replace('T', ' ').slice(0, 19)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Sub-tab 3: Tailscale Remote Access & System Diagnostics */}
      {subTab === 'tailscale' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
            <div>
              <h2 className="text-base font-display font-semibold text-slate-900 dark:text-slate-50">
                {language === 'uz'
                  ? 'Telefondan masofadan kirish (Tailscale)'
                  : 'Удалённый доступ с телефона (Tailscale)'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {language === 'uz'
                  ? 'Routerda port ochmasdan, xavfsiz HTTPS orqali istalgan joydan kiring.'
                  : 'Безопасный HTTPS доступ из любой точки без проброса портов.'}
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSaveTailscale(tsDraft);
                setTsSaved(true);
                window.setTimeout(() => setTsSaved(false), 2000);
              }}
              className="space-y-3 text-xs"
            >
              <label className="block space-y-1">
                <span className="text-slate-600 dark:text-slate-300">
                  {language === 'uz' ? 'Tailscale MagicDNS nomi' : 'Tailscale MagicDNS имя'}
                </span>
                <input
                  type="text"
                  value={tsDraft.hostname}
                  onChange={(e) => setTsDraft((s) => ({ ...s, hostname: e.target.value }))}
                  placeholder="moyka-server.tail84a12.ts.net"
                  className="w-full min-h-[44px] px-3 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </label>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-sky-700 dark:text-sky-300 truncate">
                  https://{cleanTsHost}
                </span>
                <button
                  type="button"
                  onClick={handleCopyTailscaleUrl}
                  className="inline-flex items-center gap-1 min-h-[36px] px-2.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 shrink-0"
                >
                  {tsCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{tsCopied ? 'OK' : language === 'uz' ? 'Nusxa' : 'Копия'}</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 text-xs font-medium rounded-lg bg-slate-900 dark:bg-sky-600 text-white"
                >
                  <Save className="w-4 h-4" aria-hidden="true" />
                  <span>{language === 'uz' ? 'Saqlash' : 'Сохранить'}</span>
                </button>
                {tsSaved && (
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                    {language === 'uz' ? 'Saqlandi' : 'Сохранено'}
                  </span>
                )}
              </div>
            </form>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                {language === 'uz' ? 'Linuxda 1 buyruq bilan o‘rnatish:' : 'Установка на Linux:'}
              </p>
              <pre className="rounded-xl bg-slate-950 text-slate-100 p-3 text-[11px] font-mono overflow-x-auto leading-relaxed">
                <code>{`sudo bash linux/install.sh\nsudo tailscale up\nsudo tailscale serve --bg 8000`}</code>
              </pre>
            </div>
          </section>

          {/* System Diagnostics */}
          <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                <h2 className="text-base font-display font-semibold text-slate-900 dark:text-slate-50">
                  {language === 'uz' ? 'Linux server diagnostikasi' : 'Диагностика Linux сервера'}
                </h2>
              </div>
              <button
                type="button"
                onClick={loadDiagnostics}
                disabled={diagLoading}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${diagLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span>{language === 'uz' ? 'Tekshirish' : 'Проверить'}</span>
              </button>
            </div>

            {diagnostics ? (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">
                    {language === 'uz' ? 'FFmpeg (RTSP oqim)' : 'FFmpeg (поток RTSP)'}
                  </span>
                  <span className={diagnostics.ffmpegPresent ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-amber-700 dark:text-amber-400'}>
                    {diagnostics.ffmpegPresent
                      ? language === 'uz'
                        ? 'O‘rnatilgan'
                        : 'Установлен'
                      : language === 'uz'
                        ? 'Topilmadi (Virtual rejim)'
                        : 'Не найден (Виртуальный режим)'}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Tesseract OCR</span>
                  <span className={diagnostics.tesseractPresent ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-amber-700 dark:text-amber-400'}>
                    {diagnostics.tesseractPresent
                      ? language === 'uz'
                        ? 'O‘rnatilgan'
                        : 'Установлен'
                      : language === 'uz'
                        ? 'Topilmadi'
                        : 'Не найден'}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">AMD RX 580 VA-API (/dev/dri/renderD128)</span>
                  <span className={diagnostics.vaapiDevicePresent ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-slate-500 dark:text-slate-400'}>
                    {diagnostics.vaapiDevicePresent
                      ? language === 'uz'
                        ? 'Faol'
                        : 'Активен'
                      : language === 'uz'
                        ? 'Aniqlanmadi (CPU/Virtual)'
                        : 'Не найден (CPU/Виртуальный)'}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">
                    {language === 'uz' ? 'Tailscale jonli holati' : 'Статус Tailscale'}
                  </span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {diagnostics.tailscaleUrl ??
                      (language === 'uz'
                        ? 'Ulanmagan (Sozlash kutilmoqda)'
                        : 'Не подключён (ожидает настройки)')}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">
                    {language === 'uz' ? 'Server / Baza' : 'Сервер / База'}
                  </span>
                  <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[240px]" title={diagnostics.dbPath}>
                    {diagnostics.runtime}
                  </span>
                </div>
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                {language === 'uz' ? 'Holat yuklanmoqda…' : 'Загрузка…'}
              </p>
            )}
          </section>
        </div>
      )}

      {/* Sub-tab 4: Admin Security, Timezone, Language, Theme & PWA */}
      {subTab === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-display font-semibold text-slate-900 dark:text-slate-50">
                  {language === 'uz' ? 'Admin kirish va xavfsizlik' : 'Вход администратора и защита'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {language === 'uz'
                    ? 'Panelni parol bilan himoyalash va vaqt mintaqasini belgilash.'
                    : 'Защита панели паролем и настройка часового пояса.'}
                </p>
              </div>
              {secDraft.authEnabled && (
                <button
                  type="button"
                  onClick={onLockPanel}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{language === 'uz' ? 'Qulflash' : 'Выйти'}</span>
                </button>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const parsedPort = Math.max(80, Math.min(65535, Number(secPortDraft) || 8000));
                const nextSec: SystemSecuritySettings = {
                  ...secDraft,
                  serverPort: parsedPort,
                };
                setSecPortDraft(String(parsedPort));
                onSaveSecurity(nextSec);
                setSecSaved(true);
                window.setTimeout(() => setSecSaved(false), 2000);
              }}
              className="space-y-3 text-xs"
            >
              <label className="flex items-center justify-between gap-3 py-2 border-b border-slate-200 dark:border-slate-800">
                <span className="text-sm text-slate-800 dark:text-slate-100">
                  {language === 'uz' ? 'Admin login/parol talab qilish' : 'Требовать логин и пароль'}
                </span>
                <input
                  type="checkbox"
                  checked={secDraft.authEnabled}
                  onChange={(e) => setSecDraft((s) => ({ ...s, authEnabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-700"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-slate-600 dark:text-slate-300">
                    {language === 'uz' ? 'Admin login (ADMIN_USERNAME)' : 'Логин администратора'}
                  </span>
                  <input
                    type="text"
                    value={secDraft.adminUsername}
                    onChange={(e) => setSecDraft((s) => ({ ...s, adminUsername: e.target.value }))}
                    className="w-full min-h-[40px] px-3 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-slate-600 dark:text-slate-300">
                    {language === 'uz' ? 'Admin parol (ADMIN_PASSWORD)' : 'Пароль администратора'}
                  </span>
                  <input
                    type="text"
                    value={secDraft.adminPassword}
                    onChange={(e) => setSecDraft((s) => ({ ...s, adminPassword: e.target.value }))}
                    className="w-full min-h-[40px] px-3 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-slate-600 dark:text-slate-300">APP_ENV</span>
                  <select
                    value={secDraft.appEnv}
                    onChange={(e) =>
                      setSecDraft((s) => ({
                        ...s,
                        appEnv: e.target.value === 'dev' ? 'dev' : 'prod',
                      }))
                    }
                    className="w-full min-h-[40px] px-3 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="prod">
                      {language === 'uz' ? 'prod (Ishchi rejim)' : 'prod (Рабочий режим)'}
                    </option>
                    <option value="dev">
                      {language === 'uz' ? 'dev (Sinov / Ishlab chiqish)' : 'dev (Тест / Разработка)'}
                    </option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-slate-600 dark:text-slate-300">
                    {language === 'uz' ? 'PORT (Linux server)' : 'PORT (Linux сервер)'}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={secPortDraft}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || /^\d+$/.test(val)) setSecPortDraft(val);
                    }}
                    placeholder="8000"
                    className="w-full min-h-[40px] px-3 font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>

              <div className="space-y-1">
                <span className="text-slate-600 dark:text-slate-300 block">DEVICE_KEY</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={secDraft.deviceKey}
                    onChange={(e) => setSecDraft((s) => ({ ...s, deviceKey: e.target.value }))}
                    className="flex-1 min-h-[40px] px-3 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSecDraft((s) => ({
                        ...s,
                        deviceKey: `tomchi-dev-${Math.random().toString(36).slice(2, 10)}`,
                      }))
                    }
                    className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 whitespace-nowrap"
                  >
                    {language === 'uz' ? 'Yangi kalit' : 'Сгенерировать'}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-slate-600 dark:text-slate-300 block">ADMIN_TOKEN_SECRET</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={secDraft.adminTokenSecret}
                    onChange={(e) =>
                      setSecDraft((s) => ({ ...s, adminTokenSecret: e.target.value }))
                    }
                    className="flex-1 min-h-[40px] px-3 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSecDraft((s) => ({
                        ...s,
                        adminTokenSecret: `tok-${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`,
                      }))
                    }
                    className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 whitespace-nowrap"
                  >
                    {language === 'uz' ? 'Yangi secret' : 'Сгенерировать'}
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <label className="flex items-center justify-between gap-3 py-1">
                  <span className="text-slate-700 dark:text-slate-200">
                    ANPR_ENABLED ({language === 'uz' ? 'Avto raqam o‘qish faol' : 'ANPR включён'})
                  </span>
                  <input
                    type="checkbox"
                    checked={secDraft.anprEnabled}
                    onChange={(e) => setSecDraft((s) => ({ ...s, anprEnabled: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-700"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 py-1">
                  <span className="text-slate-700 dark:text-slate-200">
                    USE_VAAPI ({language === 'uz' ? 'GPU apparat dekodlash (RX 580)' : 'Аппаратное декодирование VA-API'})
                  </span>
                  <input
                    type="checkbox"
                    checked={secDraft.useVaapi}
                    onChange={(e) => setSecDraft((s) => ({ ...s, useVaapi: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-700"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-slate-600 dark:text-slate-300">VAAPI_DEVICE</span>
                  <input
                    type="text"
                    value={secDraft.vaapiDevice}
                    onChange={(e) => setSecDraft((s) => ({ ...s, vaapiDevice: e.target.value }))}
                    placeholder="/dev/dri/renderD128"
                    className="w-full min-h-[40px] px-3 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-slate-600 dark:text-slate-300">
                  {language === 'uz' ? 'Hisobot vaqt mintaqasi (daqiqa)' : 'Часовой пояс отчётов (мин)'}
                </span>
                <select
                  value={secDraft.timezoneOffsetMinutes}
                  onChange={(e) =>
                    setSecDraft((s) => ({ ...s, timezoneOffsetMinutes: Number(e.target.value) }))
                  }
                  className="w-full min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value={300}>
                    {language === 'uz' ? 'UTC+5 (Toshkent / O‘zbekiston)' : 'UTC+5 (Ташкент / Узбекистан)'}
                  </option>
                  <option value={180}>{language === 'uz' ? 'UTC+3 (Moskva)' : 'UTC+3 (Москва)'}</option>
                  <option value={0}>UTC+0</option>
                </select>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 min-h-[44px] px-4 text-xs font-medium rounded-lg bg-slate-900 dark:bg-sky-600 text-white"
                  >
                    <Save className="w-4 h-4" aria-hidden="true" />
                    <span>{language === 'uz' ? 'Saqlash' : 'Сохранить'}</span>
                  </button>
                  {secSaved && (
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                      {language === 'uz' ? 'Saqlandi' : 'Сохранено'}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const envText = [
                      `APP_ENV=${secDraft.appEnv}`,
                      `PORT=${secPortDraft || 8000}`,
                      `DEVICE_KEY=${secDraft.deviceKey}`,
                      `ADMIN_USERNAME=${secDraft.adminUsername}`,
                      `ADMIN_PASSWORD=${secDraft.adminPassword}`,
                      `ADMIN_TOKEN_SECRET=${secDraft.adminTokenSecret}`,
                      `USE_VAAPI=${secDraft.useVaapi}`,
                      `VAAPI_DEVICE=${secDraft.vaapiDevice}`,
                      `ANPR_ENABLED=${secDraft.anprEnabled}`,
                    ].join('\n');
                    try {
                      await navigator.clipboard.writeText(envText);
                      setEnvCopied(true);
                      window.setTimeout(() => setEnvCopied(false), 2000);
                    } catch {
                      // ignore clipboard blocked
                    }
                  }}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  {envCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>
                    {envCopied
                      ? language === 'uz'
                        ? '.env nusxalandi'
                        : '.env скопирован'
                      : language === 'uz'
                        ? '.env nusxa olish'
                        : 'Копировать .env'}
                  </span>
                </button>
              </div>
            </form>
          </section>

          <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
            <h2 className="text-base font-display font-semibold text-slate-900 dark:text-slate-50">
              {language === 'uz' ? 'Ilova va ko‘rinish sozlamalari' : 'Настройки приложения'}
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-200 dark:border-slate-800">
                <span className="text-slate-700 dark:text-slate-200">
                  {language === 'uz' ? 'Interfeys tili' : 'Язык интерфейса'}
                </span>
                <select
                  value={language}
                  onChange={(e) => onChangeLanguage(e.target.value === 'ru' ? 'ru' : 'uz')}
                  className="min-h-[40px] px-3 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="uz">O‘zbekcha</option>
                  <option value="ru">Русский</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-200 dark:border-slate-800">
                <span className="text-slate-700 dark:text-slate-200">
                  {language === 'uz' ? 'Mavzu (Yorug‘ / Qorong‘i)' : 'Тема оформления'}
                </span>
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="inline-flex items-center gap-2 min-h-[40px] px-3.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  <span>
                    {theme === 'dark'
                      ? language === 'uz'
                        ? 'Yorug‘'
                        : 'Светлая'
                      : language === 'uz'
                        ? 'Qorong‘i'
                        : 'Тёмная'}
                  </span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-slate-700 dark:text-slate-200">
                    {language === 'uz' ? 'Telefonga PWA ilova sifatida o‘rnatish' : 'Установить как PWA'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {language === 'uz'
                      ? 'Tailscale HTTPS orqali telefon ekraniga belgi qo‘shiladi.'
                      : 'Добавляет иконку на главный экран телефона.'}
                  </p>
                </div>
                <PWAInstallButton language={language} />
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
