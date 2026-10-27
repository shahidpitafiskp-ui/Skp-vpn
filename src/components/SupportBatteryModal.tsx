import React, { useState } from 'react';
import { X, BatteryCharging, Star, CheckCircle2 } from 'lucide-react';
import { Language } from '../types/vpn';

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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#F48A24] px-6 py-4 text-white flex items-center justify-between">
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
            <h3 className="text-sm font-bold text-slate-900">
              {language === 'ur'
                ? 'ڈس کنیکٹ ہونے سے کیسے بچائیں؟'
                : 'Prevent Background Disconnections'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {language === 'ur'
                ? 'فون کی بیٹری سیور سیٹنگز وی پی این کو بیک گراؤنڈ میں بند کر سکتی ہیں۔ مسلسل کنیکشن کے لیے یہ 3 قدم اٹھائیں:'
                : 'Android & iOS battery savers can pause background VPN tunnels when the screen locks. Follow these steps for uninterrupted traffic:'}
            </p>
            <ol className="space-y-2 text-xs text-slate-700 bg-slate-50 rounded-xl p-3.5 border border-slate-100">
              <li>
                <span className="font-semibold text-slate-900">01.</span>{' '}
                {language === 'ur'
                  ? 'فون کی Settings ← Apps ← SKP VPN کھولیں'
                  : 'Open Device Settings → Apps → SKP VPN'}
              </li>
              <li>
                <span className="font-semibold text-slate-900">02.</span>{' '}
                {language === 'ur'
                  ? 'Battery کے آپشن پر ٹیپ کریں'
                  : 'Tap Battery Usage / Background Limits'}
              </li>
              <li>
                <span className="font-semibold text-slate-900">03.</span>{' '}
                {language === 'ur'
                  ? '"Unrestricted" (بلا رکاوٹ) منتخب کریں'
                  : 'Select "Unrestricted" (Allow background activity)'}
              </li>
            </ol>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500">
                {language === 'ur'
                  ? 'ہوم اسکرین پر اورنج نوٹس بینر دکھائیں'
                  : 'Show orange notice bar on home screen'}
              </span>
              <button
                type="button"
                onClick={() => onToggleBanner(!showBanner)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  showBanner
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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

          <div className="border-t border-slate-100 pt-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              {language === 'ur'
                ? 'ہمیں 5 اسٹار ریٹنگ دیں!'
                : 'Rate Your SKP VPN Experience'}
            </h3>

            {submitted ? (
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
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
                      className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center hover:bg-amber-50 transition-colors cursor-pointer"
                    >
                      <Star
                        className={`w-7 h-7 transition-colors ${
                          star <= rating
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-300'
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
                  {language === 'ur' ? 'ریٹنگ جمع کروائیں' : `Submit ${rating}-Star Review`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
