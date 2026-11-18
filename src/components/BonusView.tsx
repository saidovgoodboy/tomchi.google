import { Ban, Save, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { BonusSettings, Language, WashBox } from '../types';

interface BonusViewProps {
  language: Language;
  boxes: WashBox[];
  settings: BonusSettings;
  onUpdateSettings: (next: BonusSettings) => void;
  onPressBonus: (boxId: string) => void;
  onCancelBonus: (boxId: string) => void;
}

interface BonusDraftStrings {
  bonusEveryVisits: string;
  bonusAmount: string;
  bonusPerPress: string;
  pulseValue: string;
  relayPulseMs: string;
  relayPauseMs: string;
  p10IdleText: string;
  p10VisitTemplate: string;
  p10BonusTemplate: string;
}

function toDraftStrings(s: BonusSettings): BonusDraftStrings {
  return {
    bonusEveryVisits: String(s.bonusEveryVisits),
    bonusAmount: String(s.bonusAmount),
    bonusPerPress: String(s.bonusPerPress),
    pulseValue: String(s.pulseValue),
    relayPulseMs: String(s.relayPulseMs),
    relayPauseMs: String(s.relayPauseMs),
    p10IdleText: s.p10IdleText,
    p10VisitTemplate: s.p10VisitTemplate,
    p10BonusTemplate: s.p10BonusTemplate,
  };
}

function parseClampedInt(raw: string, fallback: number, min: number, max: number): number {
  const cleaned = raw.replace(/[^\d]/g, '');
  if (!cleaned) return fallback;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

export function BonusView({
  language,
  boxes,
  settings,
  onUpdateSettings,
  onPressBonus,
  onCancelBonus,
}: BonusViewProps) {
  const [draft, setDraft] = useState<BonusDraftStrings>(() => toDraftStrings(settings));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(toDraftStrings(settings));
  }, [settings]);

  const activeBonusBox = boxes.find((b) => b.activeBonusLeft > 0);

  const handleNumericChange = (
    field: 'bonusEveryVisits' | 'bonusAmount' | 'bonusPerPress' | 'pulseValue' | 'relayPulseMs' | 'relayPauseMs',
    value: string,
  ) => {
    // Allow clearing completely or typing digits freely without snapping mid-edit
    if (value === '' || /^\d+$/.test(value)) {
      setDraft((s) => ({ ...s, [field]: value }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed: BonusSettings = {
      bonusEveryVisits: parseClampedInt(draft.bonusEveryVisits, settings.bonusEveryVisits, 1, 50),
      bonusAmount: parseClampedInt(draft.bonusAmount, settings.bonusAmount, 1000, 10000000),
      bonusPerPress: parseClampedInt(draft.bonusPerPress, settings.bonusPerPress, 1000, 10000000),
      pulseValue: parseClampedInt(draft.pulseValue, settings.pulseValue, 100, 1000000),
      relayPulseMs: parseClampedInt(draft.relayPulseMs, settings.relayPulseMs, 30, 2000),
      relayPauseMs: parseClampedInt(draft.relayPauseMs, settings.relayPauseMs, 30, 2000),
      p10IdleText: draft.p10IdleText.trim() || "AVTOMOBIL YO'Q",
      p10VisitTemplate: draft.p10VisitTemplate.trim() || '{PLATE} - {VISIT}-KELISH',
      p10BonusTemplate: draft.p10BonusTemplate.trim() || "{PLATE} - MUKOFOT {BONUS} SO'M",
    };
    setDraft(toDraftStrings(parsed));
    onUpdateSettings(parsed);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Bonus, Relay & P10 Templates Form */}
      <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
        <div>
          <h2 className="text-base font-display font-semibold text-slate-900 dark:text-slate-50">
            {language === 'uz'
              ? 'Bonus, Bill Acceptor (puls) va P10 qoidalari'
              : 'Правила бонусов, Bill Acceptor (импульсы) и P10'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'uz'
              ? 'Butun moyka bo‘yicha bir vaqtda faqat bitta avtomobilga faol bonus beriladi.'
              : 'Одновременно активен только один бонус на всю автомойку.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {language === 'uz' ? 'Har necha kelishda bonus (1–50)' : 'Бонус каждые N визитов'}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={draft.bonusEveryVisits}
                onChange={(e) => handleNumericChange('bonusEveryVisits', e.target.value)}
                placeholder="5"
                className="w-full min-h-[44px] px-3 font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {language === 'uz' ? 'Bonus summasi (so‘m)' : 'Сумма бонуса (сум)'}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={draft.bonusAmount}
                onChange={(e) => handleNumericChange('bonusAmount', e.target.value)}
                placeholder="20000"
                className="w-full min-h-[44px] px-3 font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {language === 'uz' ? '1 bosishda yechiladi (so‘m)' : 'За 1 нажатие (сум)'}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={draft.bonusPerPress}
                onChange={(e) => handleNumericChange('bonusPerPress', e.target.value)}
                placeholder="5000"
                className="w-full min-h-[44px] px-3 font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {language === 'uz'
                  ? '1 ta Bill Acceptor pulsi qiymati (so‘m)'
                  : 'Цена 1 импульса Bill Acceptor (сум)'}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={draft.pulseValue}
                onChange={(e) => handleNumericChange('pulseValue', e.target.value)}
                placeholder="1000"
                className="w-full min-h-[44px] px-3 font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {language === 'uz'
                  ? 'Bill Acceptor puls davomiyligi (ms)'
                  : 'Длительность импульса Bill Acceptor (мс)'}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={draft.relayPulseMs}
                onChange={(e) => handleNumericChange('relayPulseMs', e.target.value)}
                placeholder="120"
                className="w-full min-h-[44px] px-3 font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {language === 'uz'
                  ? 'Pulslar orasidagi pauza (ms)'
                  : 'Пауза между импульсами (мс)'}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={draft.relayPauseMs}
                onChange={(e) => handleNumericChange('relayPauseMs', e.target.value)}
                placeholder="120"
                className="w-full min-h-[44px] px-3 font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {language === 'uz'
                ? 'P10 LED ekran matn shablonlari ({PLATE}, {VISIT}, {BONUS})'
                : 'Шаблоны текста для экрана P10 ({PLATE}, {VISIT}, {BONUS})'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <label className="block space-y-1">
                <span className="text-slate-500 dark:text-slate-400">
                  {language === 'uz' ? 'Bo‘sh holatda' : 'Когда пусто'}
                </span>
                <input
                  type="text"
                  value={draft.p10IdleText}
                  onChange={(e) => setDraft((s) => ({ ...s, p10IdleText: e.target.value }))}
                  className="w-full min-h-[40px] px-3 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-500 dark:text-slate-400">
                  {language === 'uz' ? 'Oddiy kelishda' : 'Обычный визит'}
                </span>
                <input
                  type="text"
                  value={draft.p10VisitTemplate}
                  onChange={(e) => setDraft((s) => ({ ...s, p10VisitTemplate: e.target.value }))}
                  className="w-full min-h-[40px] px-3 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-500 dark:text-slate-400">
                  {language === 'uz' ? 'Faol bonusda' : 'Активный бонус'}
                </span>
                <input
                  type="text"
                  value={draft.p10BonusTemplate}
                  onChange={(e) => setDraft((s) => ({ ...s, p10BonusTemplate: e.target.value }))}
                  className="w-full min-h-[40px] px-3 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 text-sm font-medium rounded-lg bg-slate-900 dark:bg-sky-600 text-white hover:bg-slate-800 dark:hover:bg-sky-700 transition-colors whitespace-nowrap"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              <span>{language === 'uz' ? 'Qoidalarni saqlash' : 'Сохранить правила'}</span>
            </button>
            {saved && (
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {language === 'uz' ? 'Saqlandi' : 'Сохранено'}
              </span>
            )}
          </div>
        </form>
      </section>

      {/* Active Bonus P10 Button Simulator & Cancel Control */}
      <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div>
          <h3 className="text-base font-display font-semibold text-slate-900 dark:text-slate-50">
            {language === 'uz' ? 'Faol bonus va P10 tugma' : 'Активный бонус и кнопка P10'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'uz'
              ? 'Mijoz boxdagi tugmani bosgandek main boardga bill-acceptor pulsi yuborishni sinang yoki bonusni bekor qiling.'
              : 'Тестируйте отправку импульса Bill Acceptor на основную плату или отмените бонус.'}
          </p>
        </div>

        {activeBonusBox ? (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-slate-950 text-white space-y-1.5">
              <p className="text-xs text-slate-400">
                {activeBonusBox.name} · {activeBonusBox.currentPlate}
              </p>
              <p className="font-mono text-xl font-semibold tabular-nums text-amber-400">
                {activeBonusBox.activeBonusLeft.toLocaleString('fr-FR')}{' '}
                {language === 'uz' ? "so'm" : 'сум'}
              </p>
              <p className="font-mono text-xs text-cyan-300 truncate">{activeBonusBox.displayText}</p>
            </div>

            <button
              type="button"
              onClick={() => onPressBonus(activeBonusBox.id)}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[48px] px-4 text-sm font-medium rounded-xl bg-sky-600 text-white hover:bg-sky-700 transition-colors"
            >
              <Zap className="w-4 h-4" aria-hidden="true" />
              <span>
                {language === 'uz'
                  ? `Tugmani bosish (-${settings.bonusPerPress.toLocaleString('fr-FR')} so'm)`
                  : `Нажать (-${settings.bonusPerPress.toLocaleString('fr-FR')} сум)`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onCancelBonus(activeBonusBox.id)}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 text-xs font-medium rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            >
              <Ban className="w-4 h-4" aria-hidden="true" />
              <span>
                {language === 'uz' ? 'Faol bonusni qo‘lda bekor qilish' : 'Отменить активный бонус'}
              </span>
            </button>
          </div>
        ) : (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {language === 'uz' ? 'Hozir faol bonus yo‘q.' : 'Сейчас нет активного бонуса.'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'uz'
                ? 'Boxlar bo‘limida mashina kirishini bir necha marta sinang — kelishlar soni yetganda bonus avtomatik yoqiladi.'
                : 'Запустите въезд в разделе Боксы — бонус включится на кратном визите.'}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
