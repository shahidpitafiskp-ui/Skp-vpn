import React, { useState } from 'react';
import {
  X,
  BatteryCharging,
  Star,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { Language } from '../types/vpn';
import {
  isNativeAndroidVpn,
  openNativeBatterySettings,
} from '../utils/nativeVpn';

interface SupportBatteryModalProps {
  isOpen: boolean;
  language: Language;
  showBanner: boolean;
  onToggleBanner: (visible: boolean) => void;
  onClose: () => void;
}

export const SupportBatteryModal: React.FC<SupportBatteryModalProps> = ({
  isOpen,
  language,
  showBanner,
  onToggleBanner,
  onClose,
}) => {
  const [rating, setRating] = useState<number>(5);
  const [submitted, setSubmitted] = useState<boolean>(false);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-[#0D1E16] text-slate-900 dark:text-slate-100 rounded-t-3xl sm:rounded-2xl shadow-xl border border-transparent dark:border-emerald-900/40 overflow-hidden max-h-[88vh] flex flex-col transition-colors duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#F48A24] dark:bg-[#C66A12] px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BatteryCharging className="w-5 h-5 shrink-0" />
            <h2 className="text-base font-bold">
              {language === 'ur'
                ? 'بیٹری آپٹیمائزیشن اور سپورٹ'
                : 'Keep-Alive & Support'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-w-[40px] min-h-[40px] -mr-2 rounded-full flex items-center justify-center text-white/90 hover:bg-white/15 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Battery Optimization Guide */}
          <div className="space-y-2.5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {language === 'ur'
                ? 'ڈس کنیکٹ ہونے سے کیسے بچائیں؟'
                : 'Prevent Background Disconnections'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {language === 'ur'
                ? 'فون کی بیٹری سیور سیٹنگز وی پی این کو بیک گراؤنڈ میں بند کر سکتی ہیں۔ مسلسل کنیکشن کے لیے یہ 3 قدم اٹھائیں:'
                : 'Android & iOS battery savers can pause background VPN tunnels when the screen locks. Follow these steps for uninterrupted traffic:'}
            </p>
            <ol className="space-y-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-[#13291F] rounded-xl p-3.5 border border-slate-100 dark:border-emerald-900/40">
              <li>
                <span className="font-semibold text-slate-900 dark:text-white">
                  01.
                </span>{' '}
                {language === 'ur'
                  ? 'فون کی Settings ← Apps ← SKP VPN کھولیں'
                  : 'Open Device Settings → Apps → SKP VPN'}
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-white">
                  02.
                </span>{' '}
                {language === 'ur'
                  ? 'Battery کے آپشن پر ٹیپ کریں'
                  : 'Tap Battery Usage / Background Limits'}
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-white">
                  03.
                </span>{' '}
                {language === 'ur'
                  ? '"Unrestricted" (بلا رکاوٹ) منتخب کریں'
                  : 'Select "Unrestricted" (Allow background activity)'}
              </li>
            </ol>

            {isNativeAndroidVpn() && (
              <button
                type="button"
                onClick={() => openNativeBatterySettings()}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0B5D32] hover:bg-[#147A42] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-4 h-4 shrink-0" />
                <span>
                  {language === 'ur'
                    ? 'اینڈرائیڈ بیٹری سیٹنگز کھولیں'
                    : 'Allow Unrestricted Background VPN'}
                </span>
              </button>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {language === 'ur'
                  ? 'ہوم اسکرین پر اورنج نوٹس بینر دکھائیں'
                  : 'Show orange notice bar on home screen'}
              </span>
              <button
                type="button"
                onClick={() => onToggleBanner(!showBanner)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  showBanner
                    ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-500/30'
                    : 'bg-slate-100 dark:bg-[#13291F] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-emerald-900/40'
                }`}
              >
                {showBanner
                  ? language === 'ur'
                    ? 'بینر چھپائیں'
                    : 'Hide Notice'
                  : language === 'ur'
                  ? 'بینر دکھائیں'
                  : 'Show Notice'}
              </button>
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-emerald-900/40 pt-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {language === 'ur'
                ? 'ہمیں 5 اسٹار ریٹنگ دیں!'
                : 'Rate Your SKP VPN Experience'}
            </h3>

            {submitted ? (
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  {language === 'ur'
                    ? `بہت شکریہ! آپ کی ${rating} اسٹار ریٹنگ محفوظ کر لی گئی ہے۔`
                    : `Thank you for your ${rating}-star support!`}
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2 py-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      aria-label={`Rate ${star} stars`}
                      className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center hover:bg-amber-50 dark:hover:bg-[#13291F] transition-colors cursor-pointer"
                    >
                      <Star
                        className={`w-7 h-7 transition-colors ${
                          star <= rating
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-300 dark:text-slate-600'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSubmitted(true)}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#116932] text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  {language === 'ur'
                    ? 'ریٹنگ جمع کروائیں'
                    : `Submit ${rating}-Star Review`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
