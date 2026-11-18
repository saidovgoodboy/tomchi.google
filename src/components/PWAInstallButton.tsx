import { Download, Smartphone, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';
import type { Language } from '../types';

export function PWAInstallButton({
  language,
  compact = false,
}: {
  language: Language;
  compact?: boolean;
}) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0 ${
          compact ? 'px-3 py-2 text-xs min-h-[40px]' : 'px-4 py-2.5 text-sm min-h-[44px]'
        }`}
      >
        <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{language === 'uz' ? 'Ilovani o‘rnatish' : 'Установить'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 ${
            compact ? 'px-3 py-2 text-xs min-h-[40px]' : 'px-4 py-2.5 text-sm min-h-[44px]'
          }`}
        >
          <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{language === 'uz' ? 'Telefonga o‘rnatish' : 'На iPhone'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
              <h3 className="text-lg font-display font-semibold text-slate-900 dark:text-white">
                {language === 'uz' ? 'iPhone / iPad ga qo‘shish' : 'Установка на iPhone / iPad'}
              </h3>
              <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-300 list-decimal pl-5">
                <li>
                  {language === 'uz'
                    ? 'Safari pastki panelidagi Ulashish (Share) tugmasini bosing.'
                    : 'Нажмите кнопку «Поделиться» в нижней панели Safari.'}
                </li>
                <li>
                  {language === 'uz'
                    ? '«Asosiy ekranga qo‘shish» (Add to Home Screen) bandini tanlang.'
                    : 'Выберите «На экран Домой».'}
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-sky-600 text-white text-sm font-medium"
              >
                {language === 'uz' ? 'Tushunarli' : 'Понятно'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator({ language }: { language: Language }) {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg">
      <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>
        {language === 'uz'
          ? 'Oflayn rejim — keshlangan ma’lumot ko‘rsatilmoqda'
          : 'Офлайн-режим — показаны сохранённые данные'}
      </span>
    </div>
  );
}
