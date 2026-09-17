/**
 * @file src/components/DiagnosticsAndRegionalModal.tsx
 * Autonomous Diagnostics Engine & Multi-Region Telecom Hub
 * Includes VDSL/Fiber Ping & Loopback, eSIM Provisioning,
 * and Instant Wallets (InstaPay / Vodafone Cash / Fawry / Mada).
 */

import React, { useState } from 'react';
import {
  Activity,
  Wifi,
  Smartphone,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  QrCode,
  Zap,
  Globe,
  Check,
  Send,
  Radio,
  ExternalLink,
} from 'lucide-react';

interface DiagnosticsAndRegionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerPhone?: string;
  onInsertMessage?: (msg: string) => void;
}

export const DiagnosticsAndRegionalModal: React.FC<DiagnosticsAndRegionalModalProps> = ({
  isOpen,
  onClose,
  customerPhone = '01098765432',
  onInsertMessage,
}) => {
  const [activeTab, setActiveTab] = useState<'vdsl' | 'esim' | 'payment'>('vdsl');
  const [phoneInput, setPhoneInput] = useState(customerPhone);
  const [running, setRunning] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<any | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (!isOpen) return null;

  const runDiagnostic = async (type: 'vdsl_fiber_ping' | 'esim_profile_check' | 'instapay_fawry_link') => {
    setRunning(true);
    setDiagnosticResult(null);

    try {
      const res = await fetch('/api/v1/diagnostics/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineId: phoneInput,
          testType: type,
          customerPhone: phoneInput,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setDiagnosticResult(d.data);
      }
    } catch {
      // error handling
    } finally {
      setRunning(false);
    }
  };

  const handleShareToConversation = (summaryText: string) => {
    if (onInsertMessage) {
      onInsertMessage(summaryText);
      setToast('تم إدراج تقرير الفحص الفوري داخل صندوق المحادثة بنجاح!');
      setTimeout(() => {
        setToast(null);
        onClose();
      }, 1000);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>محرك التشخيص الذاتي المباشر وأدوات الدفع والـ eSIM</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  مصر & التوسع الإقليمي
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                فحص فني مباشر لكبائن الـ VDSL، توليد بروفايل الـ eSIM، وإنشاء روابط إنستاباي وفودافون كاش وفوري
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 text-sm font-bold">
            ✕
          </button>
        </div>

        {/* Navigation Sub-Tabs */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-slate-800 bg-slate-900">
          <button
            onClick={() => {
              setActiveTab('vdsl');
              setDiagnosticResult(null);
            }}
            className={`flex items-center gap-2 py-2.5 px-3 border-b-2 font-bold text-xs transition ${
              activeTab === 'vdsl'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>فحص خط الإنترنت المنزلي (VDSL / FTTH)</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('esim');
              setDiagnosticResult(null);
            }}
            className={`flex items-center gap-2 py-2.5 px-3 border-b-2 font-bold text-xs transition ${
              activeTab === 'esim'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>فحص وتفعيل شريحة الـ eSIM</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('payment');
              setDiagnosticResult(null);
            }}
            className={`flex items-center gap-2 py-2.5 px-3 border-b-2 font-bold text-xs transition ${
              activeTab === 'payment'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>محافظ الدفع (إنستاباي / كاش / فوري)</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Phone / Line Input */}
          <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <div className="flex-1">
              <label className="text-[11px] font-bold text-slate-400 block mb-1">
                رقم الهاتف أو كود الخط الأرضي المستهدف:
              </label>
              <input
                type="text"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="مثال: 01012345678 أو 0227940000"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              onClick={() => {
                if (activeTab === 'vdsl') runDiagnostic('vdsl_fiber_ping');
                else if (activeTab === 'esim') runDiagnostic('esim_profile_check');
                else runDiagnostic('instapay_fawry_link');
              }}
              disabled={running}
              className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
            >
              {running ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>جارٍ الفحص الآلي...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>بدء الفحص اللحظي</span>
                </>
              )}
            </button>
          </div>

          {/* Toast feedback */}
          {toast && (
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{toast}</span>
            </div>
          )}

          {/* Diagnostic Results Card */}
          {diagnosticResult && (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">نتائج الفحص للشبكة والمشغل:</span>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                  {diagnosticResult.operator}
                </span>
              </div>

              {/* Specific Details based on tab */}
              {activeTab === 'vdsl' && (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
                    <div className="bg-slate-900 border border-slate-800/80 p-2 rounded-xl">
                      <span className="text-[10px] text-slate-400 block">سرعة التنزيل</span>
                      <span className="text-emerald-400 font-bold">{diagnosticResult.result.downstreamRateMbps} Mbps</span>
                    </div>
                    <div className="bg-slate-900 border border-slate-800/80 p-2 rounded-xl">
                      <span className="text-[10px] text-slate-400 block">سرعة الرفع</span>
                      <span className="text-indigo-400 font-bold">{diagnosticResult.result.upstreamRateMbps} Mbps</span>
                    </div>
                    <div className="bg-slate-900 border border-slate-800/80 p-2 rounded-xl">
                      <span className="text-[10px] text-slate-400 block">زمن الاستجابة (Ping)</span>
                      <span className="text-amber-400 font-bold">{diagnosticResult.result.latencyMs} ms</span>
                    </div>
                    <div className="bg-slate-900 border border-slate-800/80 p-2 rounded-xl">
                      <span className="text-[10px] text-slate-400 block">المسافة للكابينة</span>
                      <span className="text-slate-200 font-bold">{diagnosticResult.result.cabinetDistanceMeters} م</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 space-y-1">
                    <div className="text-emerald-400 font-bold">التقرير الفني الآلي:</div>
                    <p className="leading-relaxed">{diagnosticResult.result.diagnosis}</p>
                    <div className="text-[11px] text-indigo-300 pt-1">
                      {diagnosticResult.result.recommendation}
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      handleShareToConversation(
                        `تقرير الفحص الفني الآلي لخط VDSL (${phoneInput}): سرعة التنزيل ${diagnosticResult.result.downstreamRateMbps} Mbps، زمن الاستجابة ${diagnosticResult.result.latencyMs}ms. ${diagnosticResult.result.diagnosis}`
                      )
                    }
                    className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition border border-slate-700"
                  >
                    <Send className="w-3.5 h-3.5 text-emerald-400" />
                    <span>مشاركة تقرير الفحص في محادثة العميل الحالية</span>
                  </button>
                </div>
              )}

              {activeTab === 'esim' && (
                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/30 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-indigo-300">حالة ملف التعريف (eSIM Profile):</div>
                      <div className="text-slate-300 text-[11px]">{diagnosticResult.result.diagnosis}</div>
                      <div className="text-slate-400 font-mono text-[10px] mt-1">
                        كود المرجع: {diagnosticResult.result.qrReference}
                      </div>
                    </div>
                    <div className="p-3 bg-white rounded-xl text-slate-950 shadow-md">
                      <QrCode className="w-8 h-8" />
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      handleShareToConversation(
                        `تم تجهيز وتفعيل شريحة الـ eSIM للرقم (${phoneInput}) بنجاح. مرجع التحميل: ${diagnosticResult.result.qrReference}، يمكنك مسح كود الـ QR عبر إعدادات الهاتف لتشغيل الشريحة فوراً.`
                      )
                    }
                    className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>إرسال بروفايل الـ eSIM وكود الـ QR للعميل عبر واتساب</span>
                  </button>
                </div>
              )}

              {activeTab === 'payment' && (
                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-400">بوابة الدفع: {diagnosticResult.result.paymentGateway}</span>
                      <span className="font-mono text-white font-black">{diagnosticResult.result.amountEgp} ج.م</span>
                    </div>
                    <div className="text-slate-300 text-[11px]">{diagnosticResult.result.diagnosis}</div>
                    <div className="font-mono text-[10px] text-slate-400">
                      كود السداد الفوري: {diagnosticResult.result.referenceCode}
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      handleShareToConversation(
                        `تم إنشاء أمر دفع مباشر بقيمة ${diagnosticResult.result.amountEgp} ج.م عبر إنستاباي / المحافظ الإلكترونية. كود الدفع السريع: (${diagnosticResult.result.referenceCode}) صالح لمدة 24 ساعة.`
                      )
                    }
                    className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition shadow"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>إرسال كود الدفع (إنستاباي / فودافون كاش) في المحادثة</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
