import { Award, LayoutGrid, Lock, Plus, Receipt, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BonusView } from './components/BonusView';
import { BoxesView } from './components/BoxesView';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { SettingsView, type BurstPresetKey } from './components/SettingsView';
import { VisitsView } from './components/VisitsView';
import {
  DEFAULT_ANPR_SETTINGS,
  DEFAULT_BONUS_SETTINGS,
  DEFAULT_SECURITY_SETTINGS,
  INITIAL_BOXES,
  INITIAL_LOGS,
  INITIAL_PULSES,
  INITIAL_VISITS,
} from './data/initialData';
import type {
  AnprSettings,
  AppServerState,
  BonusPulseRecord,
  BonusSettings,
  CameraBrand,
  CaptureFrameLog,
  DeviceLogRecord,
  Language,
  NormalizedROI,
  PendingDetection,
  SystemSecuritySettings,
  TabKey,
  TailscaleConfig,
  Theme,
  VehiclePreset,
  VisitRecord,
  WashBox,
} from './types';

const NAV_ITEMS: Array<{
  key: TabKey;
  uz: string;
  ru: string;
  icon: typeof LayoutGrid;
}> = [
  { key: 'boxes', uz: 'Boxlar', ru: 'Боксы', icon: LayoutGrid },
  { key: 'visits', uz: 'Kelishlar', ru: 'Визиты', icon: Receipt },
  { key: 'bonus', uz: 'Bonus', ru: 'Бонус', icon: Award },
  { key: 'settings', uz: 'Sozlash', ru: 'Настройки', icon: Settings },
];

export default function App() {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const saved = window.localStorage.getItem('tomchi_language');
      return saved === 'ru' ? 'ru' : 'uz';
    } catch {
      return 'uz';
    }
  });
  const [theme, setTheme] = useState<Theme>('light');
  const [activeTab, setActiveTab] = useState<TabKey>('boxes');

  const handleChangeLanguage = (nextLang: Language) => {
    setLanguage(nextLang);
    try {
      window.localStorage.setItem('tomchi_language', nextLang);
    } catch {
      // ignore storage blocked
    }
  };

  const [boxes, setBoxes] = useState<WashBox[]>(INITIAL_BOXES);
  const [selectedBoxId, setSelectedBoxId] = useState<string>(INITIAL_BOXES[0].id);
  const [visits, setVisits] = useState<VisitRecord[]>(INITIAL_VISITS);
  const [pending, setPending] = useState<PendingDetection[]>([]);
  const [pulses, setPulses] = useState<BonusPulseRecord[]>(INITIAL_PULSES);
  const [bonusSettings, setBonusSettings] = useState<BonusSettings>(DEFAULT_BONUS_SETTINGS);
  const [anprSettings, setAnprSettings] = useState<AnprSettings>(DEFAULT_ANPR_SETTINGS);
  const [security, setSecurity] = useState<SystemSecuritySettings>(DEFAULT_SECURITY_SETTINGS);
  const [logs, setLogs] = useState<DeviceLogRecord[]>(INITIAL_LOGS);
  const [tailscale, setTailscale] = useState<TailscaleConfig>({
    hostname: 'moyka-server.tail84a12.ts.net',
    servePort: 8000,
    enabled: true,
  });

  const [authToken, setAuthToken] = useState<string>(() => {
    try {
      return window.localStorage.getItem('tomchi_auth_token') || '';
    } catch {
      return '';
    }
  });
  const [loginUser, setLoginUser] = useState('admin');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [activeCaptureBoxId, setActiveCaptureBoxId] = useState<string | null>(null);
  const [frameLogs, setFrameLogs] = useState<CaptureFrameLog[]>([]);
  const [lastOutcomeText, setLastOutcomeText] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const applyServerState = (state: AppServerState) => {
    setBoxes(state.boxes);
    if (!state.boxes.some((b) => b.id === selectedBoxId) && state.boxes[0]) {
      setSelectedBoxId(state.boxes[0].id);
    }
    setVisits(state.visits);
    setPending(state.pending);
    setPulses(state.pulses);
    setBonusSettings(state.settings);
    if (state.anpr) setAnprSettings(state.anpr);
    if (state.security) setSecurity(state.security);
    if (state.logs) setLogs(state.logs);
    if (state.tailscale) setTailscale(state.tailscale);
  };

  useEffect(() => {
    fetch('/api/state')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AppServerState | null) => {
        if (data?.boxes) applyServerState(data);
      })
      .catch(() => {});
  }, []);

  const showError = (msg: string) => {
    setErrorBanner(msg);
    window.setTimeout(() => setErrorBanner(null), 3500);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });
      const data = (await resp.json()) as { token?: string; error?: string };
      if (!resp.ok || !data.token) {
        setLoginError(
          data.error ||
            (language === 'uz' ? 'Login yoki parol noto‘g‘ri' : 'Неверный логин или пароль'),
        );
        return;
      }
      setAuthToken(data.token);
      setLoginPass('');
      try {
        window.localStorage.setItem('tomchi_auth_token', data.token);
      } catch {
        // ignore storage blocked
      }
    } catch {
      setLoginError(
        language === 'uz' ? 'Server bilan aloqa xatosi' : 'Ошибка связи с сервером',
      );
    }
  };

  const handleLockPanel = () => {
    setAuthToken('');
    try {
      window.localStorage.removeItem('tomchi_auth_token');
    } catch {
      // ignore
    }
  };

  const runBurst = async (
    boxId: string,
    preset: BurstPresetKey,
    customPlate: string,
    visual: VehiclePreset = 'sedan',
  ) => {
    setSelectedBoxId(boxId);
    setActiveCaptureBoxId(boxId);
    setFrameLogs([]);
    setLastOutcomeText(null);

    setBoxes((prev) =>
      prev.map((b) =>
        b.id === boxId
          ? {
              ...b,
              state: 'capturing',
              vehicleVisual: preset === 'empty_abort' ? 'empty' : visual,
              displayText: language === 'uz' ? 'ANIQLANMOQDA...' : 'ОПРЕДЕЛЕНИЕ...',
            }
          : b,
      ),
    );

    try {
      const resp = await fetch(`/api/boxes/${boxId}/burst`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset, customPlate, visual }),
      });
      const data = (await resp.json()) as {
        frames: CaptureFrameLog[];
        summaryUz: string;
        summaryRu: string;
        state: AppServerState;
      };
      if (!resp.ok) {
        throw new Error('Burst error');
      }

      for (let i = 0; i < data.frames.length; i += 1) {
        await new Promise((r) => window.setTimeout(r, 240));
        setFrameLogs(data.frames.slice(0, i + 1));
      }

      applyServerState(data.state);
      setLastOutcomeText(language === 'uz' ? data.summaryUz : data.summaryRu);
    } catch {
      showError(language === 'uz' ? 'Server bilan aloqa xatosi' : 'Ошибка связи с сервером');
    } finally {
      setActiveCaptureBoxId(null);
    }
  };

  const handleSimulateArrival = (boxId: string, preset: VehiclePreset) => {
    const samplePlates = ['01N405BC', '01A777BC', '10M884BA', '01Z909FA'];
    const num = Number(boxId.replace('box-', '')) || 1;
    const plate = samplePlates[(num - 1) % samplePlates.length];
    void runBurst(boxId, 'consensus_4_5', plate, preset);
  };

  const handleSimulateExit = async (boxId: string) => {
    try {
      const resp = await fetch(`/api/boxes/${boxId}/simulate-exit`, { method: 'POST' });
      const data = (await resp.json()) as { state?: AppServerState };
      if (data.state) applyServerState(data.state);
    } catch {
      showError(language === 'uz' ? 'Xatolik' : 'Ошибка');
    }
  };

  const handleCancelBonus = async (boxId: string) => {
    try {
      const resp = await fetch(`/api/boxes/${boxId}/cancel-bonus`, { method: 'POST' });
      const data = (await resp.json()) as { state?: AppServerState };
      if (data.state) applyServerState(data.state);
    } catch {
      showError(language === 'uz' ? 'Bonusni bekor qilishda xato' : 'Ошибка отмены бонуса');
    }
  };

  const handleManualVisit = async (boxId: string, plate: string) => {
    try {
      const resp = await fetch('/api/visits/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ box_id: boxId, plate }),
      });
      const data = (await resp.json()) as { error?: string; state?: AppServerState };
      if (!resp.ok && data.error) {
        showError(data.error);
        return;
      }
      if (data.state) applyServerState(data.state);
    } catch {
      showError(language === 'uz' ? 'Qo‘lda kiritishda xato' : 'Ошибка ручного ввода');
    }
  };

  const handleAddBox = async () => {
    if (boxes.length >= 20) return;
    try {
      const resp = await fetch('/api/boxes', { method: 'POST' });
      const data = (await resp.json()) as { state?: AppServerState };
      if (data.state) applyServerState(data.state);
    } catch {
      showError(language === 'uz' ? 'Box qo‘shishda xato' : 'Ошибка добавления бокса');
    }
  };

  const handleDeleteBox = async (boxId: string) => {
    try {
      const resp = await fetch(`/api/boxes/${boxId}`, { method: 'DELETE' });
      const data = (await resp.json()) as { error?: string; state?: AppServerState };
      if (!resp.ok && data.error) {
        showError(data.error);
        return;
      }
      if (data.state) applyServerState(data.state);
    } catch {
      showError(language === 'uz' ? 'Box o‘chirishda xato' : 'Ошибка удаления бокса');
    }
  };

  const handleUpdateCameraConfig = async (
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
  ) => {
    try {
      const resp = await fetch(`/api/boxes/${boxId}/camera`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = (await resp.json()) as { state?: AppServerState };
      if (data.state) applyServerState(data.state);
    } catch {
      showError(language === 'uz' ? 'Saqlashda xato' : 'Ошибка сохранения');
    }
  };

  const handleSaveAnprSettings = async (next: AnprSettings) => {
    try {
      const resp = await fetch('/api/settings/anpr', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = (await resp.json()) as { state?: AppServerState };
      if (data.state) applyServerState(data.state);
    } catch {
      showError(language === 'uz' ? 'ANPR saqlashda xato' : 'Ошибка сохранения ANPR');
    }
  };

  const handleGenerateEsp32Code = async (boxId: string) => {
    try {
      const resp = await fetch(`/api/boxes/${boxId}/pairing-code`, { method: 'POST' });
      const data = (await resp.json()) as { state?: AppServerState };
      if (data.state) applyServerState(data.state);
    } catch {
      showError(language === 'uz' ? 'Kod olishda xato' : 'Ошибка получения кода');
    }
  };

  const handleSimulateEsp32Claim = async (_boxId: string, code: string) => {
    try {
      const resp = await fetch('/api/devices/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = (await resp.json()) as { state?: AppServerState };
      if (data.state) applyServerState(data.state);
    } catch {
      showError(language === 'uz' ? 'Ulashda xato' : 'Ошибка привязки');
    }
  };

  const handleUpdateSettings = async (next: BonusSettings) => {
    try {
      const resp = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = (await resp.json()) as { state?: AppServerState };
      if (data.state) applyServerState(data.state);
    } catch {
      showError(language === 'uz' ? 'Saqlashda xato' : 'Ошибка сохранения');
    }
  };

  const handlePressBonus = async (boxId: string) => {
    try {
      const resp = await fetch('/api/bonus/press', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ box_id: boxId, press_id: `ui-${Date.now()}` }),
      });
      const data = (await resp.json()) as { state?: AppServerState };
      if (data.state) applyServerState(data.state);
    } catch {
      showError(language === 'uz' ? 'Impuls yuborishda xato' : 'Ошибка отправки импульса');
    }
  };

  const handleRefundPulse = async (pulseId: number) => {
    try {
      const resp = await fetch(`/api/pulses/${pulseId}/refund`, { method: 'POST' });
      const data = (await resp.json()) as { error?: string; state?: AppServerState };
      if (!resp.ok && data.error) {
        showError(data.error);
        return;
      }
      if (data.state) applyServerState(data.state);
    } catch {
      showError(language === 'uz' ? 'Qaytarishda xato' : 'Ошибка возврата');
    }
  };

  const handleConfirmPending = async (pendingId: number, plate: string) => {
    try {
      const resp = await fetch(`/api/pending/${pendingId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate }),
      });
      const data = (await resp.json()) as { error?: string; state?: AppServerState };
      if (!resp.ok && data.error) {
        showError(data.error);
        return;
      }
      if (data.state) applyServerState(data.state);
    } catch {
      showError(language === 'uz' ? 'Tasdiqlashda xato' : 'Ошибка подтверждения');
    }
  };

  const handleDismissPending = async (pendingId: number) => {
    try {
      const resp = await fetch(`/api/pending/${pendingId}/dismiss`, { method: 'POST' });
      const data = (await resp.json()) as { state?: AppServerState };
      if (data.state) applyServerState(data.state);
    } catch {
      showError(language === 'uz' ? 'Rad etishda xato' : 'Ошибка отклонения');
    }
  };

  const handleSaveTailscale = async (next: TailscaleConfig) => {
    try {
      const resp = await fetch('/api/system/tailscale', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = (await resp.json()) as { state?: AppServerState };
      if (data.state) applyServerState(data.state);
    } catch {
      showError(language === 'uz' ? 'Tailscale saqlashda xato' : 'Ошибка сохранения Tailscale');
    }
  };

  const handleSaveSecurity = async (next: SystemSecuritySettings) => {
    try {
      const resp = await fetch('/api/settings/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = (await resp.json()) as { state?: AppServerState };
      if (data.state) applyServerState(data.state);
    } catch {
      showError(
        language === 'uz' ? 'Xavfsizlik sozlamalarini saqlashda xato' : 'Ошибка сохранения безопасности',
      );
    }
  };

  const handleClearLogs = async () => {
    try {
      const resp = await fetch('/api/logs', { method: 'DELETE' });
      const data = (await resp.json()) as { state?: AppServerState };
      if (data.state) applyServerState(data.state);
    } catch {
      showError(language === 'uz' ? 'Jurnalni tozalashda xato' : 'Ошибка очистки журнала');
    }
  };

  if (security.authEnabled && !authToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="space-y-1">
            <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-3">
              <Lock className="w-5 h-5" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">
              Tomchi Admin
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'uz'
                ? 'Boshqaruv paneliga kirish uchun login va parolni kiriting.'
                : 'Введите логин и пароль администратора.'}
            </p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-3 text-sm">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {language === 'uz' ? 'Login' : 'Логин'}
              </span>
              <input
                type="text"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                required
                className="w-full min-h-[44px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {language === 'uz' ? 'Parol' : 'Пароль'}
              </span>
              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                required
                className="w-full min-h-[44px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </label>
            {loginError && (
              <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{loginError}</p>
            )}
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
            >
              {language === 'uz' ? 'Kirish' : 'Войти'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20 md:pb-0">
      {/* Clean 3-Zone Top Bar (Desktop) / Compact App Bar (Mobile) */}
      <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between gap-4 sm:gap-8">
          <span className="font-display font-bold text-lg tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
            Tomchi
          </span>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveTab(item.key)}
                  className={`py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    isActive
                      ? 'border-sky-600 text-slate-900 dark:text-white'
                      : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item[language]}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block">
              <PWAInstallButton language={language} compact />
            </div>
            <button
              type="button"
              disabled={boxes.length >= 20}
              onClick={handleAddBox}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 text-xs font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>
                {boxes.length >= 20
                  ? '20/20'
                  : language === 'uz'
                    ? `Box qo‘shish (${boxes.length}/20)`
                    : `Бокс (${boxes.length}/20)`}
              </span>
            </button>
          </div>
        </div>
      </header>

      {errorBanner && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-3">
          <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 px-4 py-2.5 text-xs font-medium text-rose-800 dark:text-rose-200">
            {errorBanner}
          </div>
        </div>
      )}

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6">
        {activeTab === 'boxes' && (
          <BoxesView
            boxes={boxes}
            pending={pending}
            language={language}
            activeCaptureBoxId={activeCaptureBoxId}
            onSimulateArrival={handleSimulateArrival}
            onSimulateExit={handleSimulateExit}
            onOpenBoxSettings={(boxId) => {
              setSelectedBoxId(boxId);
              setActiveTab('settings');
            }}
            onConfirmPending={handleConfirmPending}
            onDismissPending={handleDismissPending}
            onManualVisit={handleManualVisit}
            onCancelBonus={handleCancelBonus}
          />
        )}

        {activeTab === 'visits' && (
          <VisitsView
            language={language}
            boxes={boxes}
            visits={visits}
            pulses={pulses}
            settings={bonusSettings}
            onRefundPulse={handleRefundPulse}
          />
        )}

        {activeTab === 'bonus' && (
          <BonusView
            language={language}
            boxes={boxes}
            settings={bonusSettings}
            onUpdateSettings={handleUpdateSettings}
            onPressBonus={handlePressBonus}
            onCancelBonus={handleCancelBonus}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            boxes={boxes}
            selectedBoxId={selectedBoxId}
            onSelectBox={setSelectedBoxId}
            language={language}
            onChangeLanguage={handleChangeLanguage}
            theme={theme}
            onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            runningBurst={activeCaptureBoxId !== null}
            frameLogs={frameLogs}
            lastOutcomeText={lastOutcomeText}
            onStartBurst={(bId, p, plate) => void runBurst(bId, p, plate, 'sedan')}
            onUpdateCameraConfig={handleUpdateCameraConfig}
            onDeleteBox={handleDeleteBox}
            anprSettings={anprSettings}
            onSaveAnprSettings={handleSaveAnprSettings}
            onGenerateEsp32Code={handleGenerateEsp32Code}
            onSimulateEsp32Claim={handleSimulateEsp32Claim}
            logs={logs}
            onClearLogs={handleClearLogs}
            tailscale={tailscale}
            onSaveTailscale={handleSaveTailscale}
            security={security}
            onSaveSecurity={handleSaveSecurity}
            onLockPanel={handleLockPanel}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Tab Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-4 items-center px-1"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
                isActive
                  ? 'text-sky-600 dark:text-sky-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-[11px] font-medium whitespace-nowrap">{item[language]}</span>
            </button>
          );
        })}
      </nav>

      <OfflineIndicator language={language} />
    </div>
  );
}
