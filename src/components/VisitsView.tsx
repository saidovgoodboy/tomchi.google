import { Car, Download, Receipt, RotateCcw, Search, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { BonusPulseRecord, BonusSettings, Language, VisitRecord, WashBox } from '../types';

interface VisitsViewProps {
  language: Language;
  boxes: WashBox[];
  visits: VisitRecord[];
  pulses: BonusPulseRecord[];
  settings: BonusSettings;
  onRefundPulse: (pulseId: number) => void;
}

type VisitsSubTab = 'visits' | 'cars' | 'pulses';

export function VisitsView({
  language,
  boxes,
  visits,
  pulses,
  settings,
  onRefundPulse,
}: VisitsViewProps) {
  const [subTab, setSubTab] = useState<VisitsSubTab>('visits');
  const [search, setSearch] = useState('');
  const [boxFilter, setBoxFilter] = useState('all');

  const todayIso = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const todayVisits = visits.filter((v) => v.createdAt.startsWith(todayIso)).length;
    const totalBonusAwarded = visits.reduce((sum, v) => sum + v.bonusTotal, 0);
    const totalBonusSpent = pulses
      .filter((p) => p.refundedAt === null)
      .reduce((sum, p) => sum + p.amount, 0);
    return {
      todayVisits,
      totalVisits: visits.length,
      totalBonusAwarded,
      totalBonusSpent,
    };
  }, [visits, pulses, todayIso]);

  const filteredVisits = visits.filter((v) => {
    const matchesSearch = v.plate.toLowerCase().includes(search.trim().toLowerCase());
    const matchesBox = boxFilter === 'all' || v.boxId === boxFilter;
    return matchesSearch && matchesBox;
  });

  const carsSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        plate: string;
        totalVisits: number;
        lastBoxId: string;
        lastVisitAt: string;
        totalBonusEarned: number;
        hasActiveBonus: boolean;
      }
    >();
    for (const v of visits) {
      const existing = map.get(v.plate);
      if (!existing) {
        map.set(v.plate, {
          plate: v.plate,
          totalVisits: 1,
          lastBoxId: v.boxId,
          lastVisitAt: v.createdAt,
          totalBonusEarned: v.bonusTotal,
          hasActiveBonus: v.isActiveBonus,
        });
      } else {
        existing.totalVisits += 1;
        existing.totalBonusEarned += v.bonusTotal;
        if (v.isActiveBonus) existing.hasActiveBonus = true;
        if (v.createdAt > existing.lastVisitAt) {
          existing.lastVisitAt = v.createdAt;
          existing.lastBoxId = v.boxId;
        }
      }
    }
    return Array.from(map.values()).filter((c) =>
      c.plate.toLowerCase().includes(search.trim().toLowerCase()),
    );
  }, [visits, search]);

  const sourceLabel = (src: VisitRecord['source']) => {
    if (src === 'auto_80_anpr') return 'ANPR 80%';
    if (src === 'manual_confirmed') return language === 'uz' ? 'Tasdiqlangan' : 'Подтв.';
    return language === 'uz' ? 'Qo‘lda' : 'Вручную';
  };

  return (
    <div className="space-y-6">
      {/* Daily & Overall Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {language === 'uz' ? 'Bugungi kelishlar' : 'Визиты сегодня'}
          </p>
          <p className="mt-1 text-2xl font-display font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {stats.todayVisits}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {language === 'uz' ? 'Jami kelishlar' : 'Всего визитов'}
          </p>
          <p className="mt-1 text-2xl font-display font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {stats.totalVisits}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {language === 'uz' ? 'Berilgan bonus' : 'Начислено бонусов'}
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-display font-semibold tabular-nums text-slate-900 dark:text-slate-50 truncate">
            {stats.totalBonusAwarded.toLocaleString('fr-FR')}{' '}
            {language === 'uz' ? "so'm" : 'сум'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {language === 'uz' ? 'Sarflangan impuls' : 'Списано импульсов'}
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-display font-semibold tabular-nums text-slate-900 dark:text-slate-50 truncate">
            {stats.totalBonusSpent.toLocaleString('fr-FR')}{' '}
            {language === 'uz' ? "so'm" : 'сум'}
          </p>
        </div>
      </div>

      {/* Toolbar: Sub-tabs + Filter + Search + CSV */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-800 self-start">
          {(
            [
              { key: 'visits', uz: 'Kelishlar', ru: 'Визиты', icon: Receipt },
              { key: 'cars', uz: 'Avtomobillar', ru: 'Автомобили', icon: Car },
              { key: 'pulses', uz: 'Impulslar', ru: 'Импульсы', icon: Zap },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = subTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setSubTab(item.key)}
                className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
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

        <div className="flex flex-wrap items-center gap-2">
          {subTab === 'visits' && (
            <select
              value={boxFilter}
              onChange={(e) => setBoxFilter(e.target.value)}
              className="min-h-[44px] px-3 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            >
              <option value="all">{language === 'uz' ? 'Barcha boxlar' : 'Все боксы'}</option>
              {boxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          <div className="relative flex-1 sm:flex-initial">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={language === 'uz' ? 'Raqam qidirish…' : 'Поиск номера…'}
              className="w-full sm:w-44 min-h-[44px] pl-9 pr-3 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>

          <a
            href="/api/visits/export.csv"
            download="tomchi-visits.csv"
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>CSV</span>
          </a>
        </div>
      </div>

      {/* Sub-tab 1: Visits */}
      {subTab === 'visits' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
          <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
            {filteredVisits.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                {language === 'uz' ? 'Kelishlar topilmadi.' : 'Визиты не найдены.'}
              </p>
            ) : (
              filteredVisits.map((visit) => (
                <div key={visit.id} className="py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={visit.imageUrl}
                      alt={visit.plate}
                      referrerPolicy="no-referrer"
                      className="w-14 h-11 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {visit.plate}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {visit.boxId} · #{visit.visitNo} · {sourceLabel(visit.source)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono tabular-nums text-sm font-medium text-slate-900 dark:text-slate-100">
                      {visit.bonusLeft.toLocaleString('fr-FR')} {language === 'uz' ? "so'm" : 'сум'}
                    </p>
                    <p
                      className={`text-xs ${
                        visit.isActiveBonus
                          ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {visit.isActiveBonus
                        ? language === 'uz'
                          ? 'Faol bonus'
                          : 'Активен'
                        : language === 'uz'
                          ? 'Oddiy kelish'
                          : 'Обычный'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3 font-medium">{language === 'uz' ? 'Raqam' : 'Номер'}</th>
                  <th className="py-2.5 px-3 font-medium">{language === 'uz' ? 'Box' : 'Бокс'}</th>
                  <th className="py-2.5 px-3 font-medium text-right">
                    {language === 'uz' ? 'Kelish' : 'Визит'}
                  </th>
                  <th className="py-2.5 px-3 font-medium">{language === 'uz' ? 'Manba' : 'Источник'}</th>
                  <th className="py-2.5 px-3 font-medium text-right">
                    {language === 'uz' ? 'Qolgan bonus' : 'Остаток'}
                  </th>
                  <th className="py-2.5 px-3 font-medium">{language === 'uz' ? 'Vaqt' : 'Время'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredVisits.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 px-3 text-center text-slate-500 dark:text-slate-400">
                      {language === 'uz' ? 'Kelishlar topilmadi.' : 'Визиты не найдены.'}
                    </td>
                  </tr>
                ) : (
                  filteredVisits.map((visit) => (
                    <tr key={visit.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {visit.plate}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                        {visit.boxId}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-700 dark:text-slate-200">
                        #{visit.visitNo}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                        {sourceLabel(visit.source)}
                        {visit.agreementPct !== null ? ` · ${visit.agreementPct}%` : ''}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-900 dark:text-slate-100">
                        {visit.bonusLeft.toLocaleString('fr-FR')} {language === 'uz' ? "so'm" : 'сум'}
                        {visit.isActiveBonus ? (language === 'uz' ? ' (faol)' : ' (актив.)') : ''}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {visit.createdAt.replace('T', ' ').slice(0, 16)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Sub-tab 2: Cars Database & Bonus Progress */}
      {subTab === 'cars' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
          {carsSummary.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {language === 'uz' ? 'Avtomobillar topilmadi.' : 'Автомобили не найдены.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {carsSummary.map((car) => {
                const mod = car.totalVisits % settings.bonusEveryVisits;
                const progressLabel =
                  mod === 0
                    ? language === 'uz'
                      ? 'Bonus kelishi!'
                      : 'Бонусный визит!'
                    : `${mod}/${settings.bonusEveryVisits}`;
                return (
                  <div key={car.plate} className="py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {car.plate}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {car.lastBoxId} · {car.lastVisitAt.replace('T', ' ').slice(0, 16)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono tabular-nums text-sm font-medium text-slate-900 dark:text-slate-100">
                        {car.totalVisits} {language === 'uz' ? 'marta' : 'раз'} · {progressLabel}
                      </p>
                      <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {language === 'uz' ? 'Jami bonus:' : 'Бонус:'}{' '}
                        {car.totalBonusEarned.toLocaleString('fr-FR')}{' '}
                        {language === 'uz' ? "so'm" : 'сум'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Sub-tab 3: Bonus Pulses & Refunds */}
      {subTab === 'pulses' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3">
          {pulses.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {language === 'uz' ? 'Impulslar yo‘q' : 'Импульсов нет'}
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {pulses.map((pulse) => (
                <div
                  key={pulse.id}
                  className="py-3 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                      {pulse.plate} · {pulse.amount.toLocaleString('fr-FR')}{' '}
                      {language === 'uz' ? "so'm" : 'сум'}
                    </p>
                    <p className="font-mono text-slate-500 dark:text-slate-400 truncate">
                      {pulse.boxId} · {pulse.createdAt.replace('T', ' ').slice(0, 16)} · {pulse.pressId}
                    </p>
                  </div>
                  {pulse.refundedAt ? (
                    <span className="text-slate-500 dark:text-slate-400 shrink-0">
                      {language === 'uz' ? 'Qaytarilgan' : 'Возвращён'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRefundPulse(pulse.id)}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{language === 'uz' ? 'Qaytarish' : 'Вернуть'}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
