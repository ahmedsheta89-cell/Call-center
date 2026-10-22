/**
 * @file src/components/PWAInstallButton.tsx
 * Mandatory In-App PWA Install Prompt Button, Cross-Platform Installer Modal & Offline Connectivity Indicator
 * Supports Android Mobile, Windows 11 Desktop, iOS Safari, and Direct Package Downloads.
 */

import React, { useState } from 'react';
import { usePWAInstall, useOnlineStatus } from '../lib/usePWAInstall';
import {
  Download,
  Smartphone,
  Monitor,
  CheckCircle2,
  X,
  WifiOff,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
} from 'lucide-react';

interface PWAInstallButtonProps {
  onOpenCrossPlatformHub?: () => void;
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  onOpenCrossPlatformHub,
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, deviceProfile, install } = usePWAInstall();
  const [showInstallGuideModal, setShowInstallGuideModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const sharedPublicUrl = 'https://ais-pre-gqer3k5difwfcjdekzfmz2-100774856489.europe-west1.run.app';

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowInstallGuideModal(true);
      }
    } else {
      setShowInstallGuideModal(true);
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(sharedPublicUrl).catch(() => {});
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  if (isInstalled && compact) {
    return (
      <button
        onClick={onOpenCrossPlatformHub}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 whitespace-nowrap shrink-0"
        title="التطبيق مثبت ويعمل بوضع Standalone المتكامل"
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        <span>مثبت ({deviceProfile.osName})</span>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={handleInstallClick}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-sm whitespace-nowrap shrink-0 min-h-[36px]"
        title="تثبيت المنصة كتطبيق أندرويد (Android App) أو برنامج كمبيوتر (Windows Desktop App)"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{compact ? 'تثبيت أندرويد / ويندوز' : 'تثبيت التطبيق (Android & Windows)'}</span>
      </button>

      {showInstallGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          dir="rtl"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    تثبيت وتشغيل المنصة على الأندرويد والويندوز وجميع الأجهزة
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    جهازك الحالي: {deviceProfile.osName} · {deviceProfile.browserName} · معرف الجهاز:{' '}
                    <span className="font-mono text-emerald-400">{deviceProfile.deviceId}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowInstallGuideModal(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Direct Public Install Link */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-400">
                  الرابط العام المباشر للتثبيت الفوري على الموبايل والكمبيوتر:
                </span>
                <span className="font-mono text-slate-400">HTTPS · PWA + Native Ready</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={sharedPublicUrl}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 select-all"
                />
                <button
                  onClick={handleCopyUrl}
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl ? 'تم النسخ' : 'نسخ الرابط'}</span>
                </button>
              </div>
            </div>

            {/* Two Columns: Android + Windows Desktop */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Android Card */}
              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-sm font-bold text-white">تطبيق الأندرويد (Android App)</h4>
                  </div>
                  <span className="text-xs font-mono text-slate-400">APK / TWA / PWA</span>
                </div>
                <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li>افتح الرابط العام أعلاه في متصفح Chrome على هاتف الأندرويد.</li>
                  <li>
                    اضغط على زر <strong>تثبيت التطبيق (Install App)</strong> أو من القائمة اختر{' '}
                    <strong>الإضافة إلى الشاشة الرئيسية</strong>.
                  </li>
                  <li>أو قم بتحميل حزمة مشروع Android Studio / Capacitor الرسمية لبناء ملف APK.</li>
                </ol>
                <div className="pt-2 flex items-center gap-2">
                  <a
                    href="/api/v1/platforms/download-bundle?platform=android"
                    download="omniflow-android-package.json"
                    className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تحميل حزمة الأندرويد (Android Capacitor/TWA)</span>
                  </a>
                </div>
              </div>

              {/* Windows Desktop Card */}
              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-indigo-400" />
                    <h4 className="text-sm font-bold text-white">برنامج الويندوز (Windows Desktop)</h4>
                  </div>
                  <span className="text-xs font-mono text-slate-400">EXE / Electron / PWA</span>
                </div>
                <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li>
                    من متصفح Edge أو Chrome على الويندوز، اضغط أيقونة <strong>تثبيت التطبيق</strong> في شريط العنوان لتشغيله في نافذة مستقلة على سطح المكتب.
                  </li>
                  <li>يدعم اختصارات لوحة المفاتيح السريعة وشريط المهام (Windows Taskbar).</li>
                  <li>أو قم بتحميل حزمة Windows Electron / Tauri لبناء ملف التثبيت `.exe`.</li>
                </ol>
                <div className="pt-2 flex items-center gap-2">
                  <a
                    href="/api/v1/platforms/download-bundle?platform=windows"
                    download="omniflow-windows-desktop-package.json"
                    className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تحميل حزمة الويندوز (Windows EXE Builder)</span>
                  </a>
                </div>
              </div>
            </div>

            {isIOS && (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
                <strong>تثبيت على أجهزة iPhone / iPad (iOS Safari):</strong> اضغط على زر{' '}
                <strong>المشاركة (Share)</strong> في شريط Safari السفلي ثم اختر{' '}
                <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>جميع الأجهزة مترابطة لحظياً بقاعدة البيانات الموحدة ورقم المسؤول 01018108979</span>
              </div>
              <div className="flex items-center gap-2">
                {onOpenCrossPlatformHub && (
                  <button
                    onClick={() => {
                      setShowInstallGuideModal(false);
                      onOpenCrossPlatformHub();
                    }}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>فتح مركز الأندرويد والويندوز والاختبارات</span>
                  </button>
                )}
                <button
                  onClick={() => setShowInstallGuideModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      className="fixed bottom-16 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg"
      dir="rtl"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>وضع عدم الاتصال نشط — يتم عرض البيانات المخزنة محلياً ومزامنتها فور عودة الإنترنت.</span>
    </div>
  );
};
