import { Ban, Camera, Check, LogOut, Play, PlusCircle, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { BAY_IMAGES } from '../data/initialData';
import type {
  BoxOccupancyState,
  Language,
  PendingDetection,
  VehiclePreset,
  WashBox,
} from '../types';

interface BoxesViewProps {
  boxes: WashBox[];
  pending: PendingDetection[];
  language: Language;
  activeCaptureBoxId: string | null;
  onSimulateArrival: (boxId: string, preset: VehiclePreset) => void;
  onSimulateExit: (boxId: string) => void;
  onOpenBoxSettings: (boxId: string) => void;
  onConfirmPending: (pendingId: number, plate: string) => void;
  onDismissPending: (pendingId: number) => void;
  onManualVisit: (boxId: string, plate: string) => void;
  onCancelBonus: (boxId: string) => void;
}

const STATE_LABELS: Record<BoxOccupancyState, { uz: string; ru: string; tone: string }> = {
  empty: {
    uz: 'Bo‘sh',
    ru: 'Свободен',
    tone: 'text-slate-600 dark:text-slate-400',
  },
  confirming_arrival: {
    uz: 'Kirish tekshirilmoqda',
    ru: 'Проверка въезда',
    tone: 'text-amber-700 dark:text-amber-400',
  },
  capturing: {
    uz: 'Raqam o‘qilmoqda',
    ru: 'Чтение номера',
    tone: 'text-sky-700 dark:text-sky-400',
  },
  occupied: {
    uz: 'Yuvilmoqda',
    ru: 'Занят',
    tone: 'text-emerald-700 dark:text-emerald-400',
  },
  confirming_exit: {
    uz: 'Chiqish kutilmoqda',
    ru: 'Проверка выезда',
    tone: 'text-amber-700 dark:text-amber-400',
  },
};

export function BoxesView({
  boxes,
  pending,
  language,
  activeCaptureBoxId,
  onSimulateArrival,
  onSimulateExit,
  onOpenBoxSettings,
  onConfirmPending,
  onDismissPending,
  onManualVisit,
  onCancelBonus,
}: BoxesViewProps) {
  const [pendingPlates, setPendingPlates] = useState<Record<number, string>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBoxId, setManualBoxId] = useState(boxes[0]?.id ?? 'box-1');
  const [manualPlate, setManualPlate] = useState('');

  const occupiedCount = boxes.filter(
    (b) => b.state === 'occupied' || b.state === 'capturing',
  ).length;
  const activeBonusBox = boxes.find((b) => b.activeBonusLeft > 0);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPlate.trim()) return;
    onManualVisit(manualBoxId || boxes[0]?.id || 'box-1', manualPlate.trim().toUpperCase());
    setManualPlate('');
    setManualOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {language === 'uz' ? 'Jami boxlar' : 'Всего боксов'}
          </p>
          <p className="mt-1 text-2xl font-display font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {boxes.length} <span className="text-sm font-normal text-slate-400">/ 20</span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {language === 'uz' ? 'Band boxlar' : 'Занято сейчас'}
          </p>
          <p className="mt-1 text-2xl font-display font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {occupiedCount}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {language === 'uz' ? 'Faol bonus' : 'Активный бонус'}
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-display font-semibold tabular-nums text-slate-900 dark:text-slate-50 truncate">
            {activeBonusBox
              ? `${activeBonusBox.activeBonusLeft.toLocaleString('fr-FR')} ${language === 'uz' ? "so'm" : 'сум'}`
              : language === 'uz'
                ? '0 so‘m'
                : '0 сум'}
          </p>
          {activeBonusBox && (
            <p className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
              {activeBonusBox.name} · {activeBonusBox.currentPlate}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {language === 'uz' ? 'Tasdiq kutmoqda' : 'Ждут проверки'}
          </p>
          <p className="mt-1 text-2xl font-display font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {pending.length}
          </p>
        </div>
      </div>

      {/* Manual Visit Quick Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
              {language === 'uz' ? 'Qo‘lda kelish qo‘shish' : 'Ручной ввод визита'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'uz'
                ? 'Kamera o‘qimasa yoki tez sinov uchun davlat raqamini kiriting.'
                : 'Введите госномер вручную при необходимости.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setManualOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <PlusCircle className="w-4 h-4" aria-hidden="true" />
            <span>
              {manualOpen
                ? language === 'uz'
                  ? 'Yopish'
                  : 'Скрыть'
                : language === 'uz'
                  ? 'Raqam kiritish'
                  : 'Ввести номер'}
            </span>
          </button>
        </div>

        {manualOpen && (
          <form onSubmit={handleManualSubmit} className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-2.5">
            <select
              value={manualBoxId}
              onChange={(e) => setManualBoxId(e.target.value)}
              className="min-h-[44px] px-3 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              {boxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={manualPlate}
              onChange={(e) => setManualPlate(e.target.value.toUpperCase())}
              placeholder="01A777BC"
              maxLength={10}
              className="flex-1 min-h-[44px] px-3 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="min-h-[44px] px-5 text-xs font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 whitespace-nowrap"
            >
              {language === 'uz' ? 'Kelishni saqlash' : 'Записать визит'}
            </button>
          </form>
        )}
      </div>

      {/* Prominent Pending Review Card for Mobile Operators */}
      {pending.length > 0 && (
        <section className="rounded-xl border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3">
          <div>
            <h2 className="text-base font-display font-semibold text-slate-900 dark:text-slate-50">
              {language === 'uz'
                ? 'Raqamni tasdiqlang (80% ga yetmadi)'
                : 'Подтвердите номер (< 80%)'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {language === 'uz'
                ? 'Kamera xira o‘qidi — rasmga qarab raqamni to‘g‘rilab tasdiqlang yoki rad eting.'
                : 'Камера не набрала 80% — проверьте номер и подтвердите или отклоните.'}
            </p>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {pending.map((item) => {
              const value = pendingPlates[item.id] ?? item.suggestedPlate ?? '';
              return (
                <div
                  key={item.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={item.imageUrl}
                      alt={language === 'uz' ? `${item.boxId} kutilayotgan rasm` : `${item.boxId} снимок`}
                      referrerPolicy="no-referrer"
                      className="w-20 h-14 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                    <div className="text-xs space-y-0.5">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {item.boxId} · {item.votes}/{item.framesTaken} ({item.agreementPct}%)
                      </p>
                      <p className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {item.createdAt.replace('T', ' ').slice(0, 16)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={value}
                      onChange={(e) =>
                        setPendingPlates((prev) => ({
                          ...prev,
                          [item.id]: e.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="01A888BC"
                      className="flex-1 sm:w-36 min-h-[44px] px-3 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => onConfirmPending(item.id, value)}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 text-xs font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Check className="w-4 h-4" aria-hidden="true" />
                      <span>{language === 'uz' ? 'Tasdiqlash' : 'Ок'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDismissPending(item.id)}
                      aria-label={language === 'uz' ? 'Rad etish' : 'Отклонить'}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Wash Bay Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
        {boxes.map((box, index) => {
          const stateMeta = STATE_LABELS[box.state];
          const imageSrc =
            box.vehicleVisual === 'sedan'
              ? BAY_IMAGES.sedan
              : box.vehicleVisual === 'suv'
                ? BAY_IMAGES.suv
                : BAY_IMAGES.empty;
          const presetForArrival: VehiclePreset = index % 2 === 0 ? 'sedan' : 'suv';
          const isCapturing = box.state === 'capturing' || activeCaptureBoxId === box.id;

          return (
            <article
              key={box.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col"
            >
              {/* Card Header */}
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-base text-slate-900 dark:text-slate-50 truncate">
                    {box.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className={`font-medium ${stateMeta.tone}`}>{stateMeta[language]}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {box.virtualMode
                        ? language === 'uz'
                          ? 'Virtual kamera'
                          : 'Виртуальная'
                        : box.cameraIp}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {box.esp32Paired
                        ? language === 'uz'
                          ? 'P10 ulangan'
                          : 'P10 ок'
                        : language === 'uz'
                          ? 'P10 ulanmagan'
                          : 'Нет P10'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenBoxSettings(box.id)}
                  aria-label={language === 'uz' ? `${box.name} sozlash` : `Настройки ${box.name}`}
                  className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                >
                  <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {/* Bay Camera Image */}
              <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden">
                <img
                  src={imageSrc}
                  alt={language === 'uz' ? `${box.name} ko'rinishi` : `Вид ${box.name}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent pointer-events-none" />

                <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between gap-2 text-white">
                  <div className="min-w-0">
                    {box.currentPlate ? (
                      <p className="font-mono font-semibold tracking-wider text-base">
                        {box.currentPlate}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-200">
                        {language === 'uz' ? 'Avtomobil kutilmoqda' : 'Ожидание авто'}
                      </p>
                    )}
                  </div>
                  {box.lastAgreement !== null && box.currentPlate && (
                    <span className="font-mono tabular-nums text-xs text-slate-200 shrink-0">
                      {Math.round(box.lastAgreement * 100)}%
                    </span>
                  )}
                </div>
              </div>

              {/* P10 LED Display Preview */}
              <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
                <span className="text-[11px] font-mono text-slate-400 shrink-0">P10</span>
                <p
                  className={`font-mono text-xs truncate ${
                    box.activeBonusLeft > 0 ? 'text-amber-400' : 'text-cyan-300'
                  }`}
                  title={box.displayText}
                >
                  {box.displayText}
                </p>
              </div>

              {/* Action Footer */}
              <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                {box.state === 'empty' ? (
                  <button
                    type="button"
                    disabled={isCapturing}
                    onClick={() => onSimulateArrival(box.id, presetForArrival)}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 text-xs font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {language === 'uz' ? 'Mashina kirishini sinash' : 'Тест въезда'}
                    </span>
                  </button>
                ) : box.state === 'occupied' ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSimulateExit(box.id)}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                    >
                      <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{language === 'uz' ? 'Chiqdi' : 'Выехало'}</span>
                    </button>
                    {box.activeBonusLeft > 0 && (
                      <button
                        type="button"
                        onClick={() => onCancelBonus(box.id)}
                        title={language === 'uz' ? 'Faol bonusni bekor qilish' : 'Отменить бонус'}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0"
                      >
                        <Ban className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-2 min-h-[44px] text-xs font-medium text-sky-700 dark:text-sky-400">
                    <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>
                      {language === 'uz' ? '5+ kadr (80%) tahlil…' : 'Анализ 5+ кадров…'}
                    </span>
                  </span>
                )}

                <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                  {box.activeBonusLeft > 0
                    ? `${box.activeBonusLeft.toLocaleString('fr-FR')} ${language === 'uz' ? "so'm" : 'сум'}`
                    : language === 'uz'
                      ? 'Bonus 0'
                      : 'Бонус 0'}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
