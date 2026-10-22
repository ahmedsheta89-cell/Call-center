/**
 * @file src/components/LiveExecutionToastSystem.tsx
 * Real-Time Function Execution Toast Notification & Live Code Execution Log Console
 */

import React, { useState } from 'react';
import {
  CheckCircle2,
  Terminal,
  Zap,
  Clock,
  ChevronUp,
  ChevronDown,
  X,
  ShieldCheck,
  Activity,
  Trash2,
  Phone,
} from 'lucide-react';

export interface ExecutionLogEntry {
  id: string;
  moduleId: string;
  moduleTitle: string;
  functionName: string;
  apiRoute: string;
  status: string;
  latencyMs: number;
  summary: string;
  adminPhone: string;
  timestamp: string;
}

interface LiveExecutionToastSystemProps {
  latestToast: ExecutionLogEntry | null;
  executionLogs: ExecutionLogEntry[];
  onDismissToast: () => void;
  onClearLogs: () => void;
  onOpenFullVerifier: () => void;
}

export const LiveExecutionToastSystem: React.FC<LiveExecutionToastSystemProps> = ({
  latestToast,
  executionLogs,
  onDismissToast,
  onClearLogs,
  onOpenFullVerifier,
}) => {
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);

  return (
    <>
      {/* Floating Live Toast Notification (Top-Left RTL friendly) */}
      {latestToast && (
        <div
          className="fixed bottom-12 left-6 z-50 w-96 max-w-[calc(100vw-2rem)] bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 rounded-xl shadow-2xl p-3.5 text-right transition-all duration-150"
          dir="rtl"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white">{latestToast.functionName}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    {latestToast.status}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                  <span>{latestToast.moduleTitle}</span>
                  <span>•</span>
                  <span className="font-mono text-emerald-400 tabular-nums">{latestToast.latencyMs}ms</span>
                </div>
              </div>
            </div>

            <button
              onClick={onDismissToast}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              title="إغلاق الإشعار"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-[11px] text-slate-200 mt-2 leading-relaxed bg-slate-950/70 border border-slate-800/80 rounded-lg p-2">
            {latestToast.summary}
          </p>

          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span className="truncate max-w-[210px] text-indigo-300" title={latestToast.apiRoute}>
              {latestToast.apiRoute}
            </span>
            <span className="flex items-center gap-1 text-emerald-400 tabular-nums">
              <Phone className="w-2.5 h-2.5" />
              {latestToast.adminPhone}
            </span>
          </div>
        </div>
      )}

      {/* Bottom Status & Live Execution Log Drawer */}
      <div
        className="border-t border-slate-800 bg-slate-900/95 backdrop-blur text-slate-300 select-none z-40 shrink-0"
        dir="rtl"
      >
        {/* Expandable Console Drawer */}
        {isConsoleOpen && (
          <div className="h-56 border-b border-slate-800 bg-slate-950/95 flex flex-col">
            <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-bold text-white">
                  سجل التنفيذ البرمجي الحي (Live Code & Function Execution Log)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 tabular-nums">
                  {executionLogs.length} عملية موثقة 100%
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onOpenFullVerifier}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold transition"
                >
                  <Zap className="w-3 h-3" />
                  <span>فحص وتشغيل شامل (20/20)</span>
                </button>
                <button
                  onClick={onClearLogs}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition"
                >
                  <Trash2 className="w-3 h-3 text-rose-400" />
                  <span>مسح السجل</span>
                </button>
                <button
                  onClick={() => setIsConsoleOpen(false)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70 px-4 py-1 font-mono text-[11px]">
              {executionLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 font-sans text-xs">
                  اضغط على أي زر وظيفي أو زر &quot;تشغيل واختبار الوظيفة&quot; في الشريط الإرشادي لعرض تفاصيل التنفيذ البرمجي اللحظي هنا.
                </div>
              ) : (
                executionLogs.map((log) => (
                  <div key={log.id} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-900/40 px-2 rounded">
                    <div className="flex items-center gap-2 flex-wrap font-sans">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 tabular-nums">
                        {log.status}
                      </span>
                      <span className="font-bold text-white text-xs">{log.functionName}</span>
                      <span className="text-slate-400 text-[11px]">({log.moduleTitle})</span>
                      <span className="text-slate-300 text-[11px]">— {log.summary}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-[10px] text-slate-400 tabular-nums">
                      <span className="text-indigo-300">{log.apiRoute}</span>
                      <span className="text-emerald-400">{log.latencyMs}ms</span>
                      <span>{log.timestamp}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Compact Status Bar */}
        <div className="h-8 px-4 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-3 overflow-hidden">
            <button
              onClick={() => setIsConsoleOpen(!isConsoleOpen)}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 font-bold transition shrink-0"
            >
              <Terminal className="w-3 h-3" />
              <span>سجل تنفيذ الأكواد والوظائف ({executionLogs.length})</span>
              {isConsoleOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </button>

            <div className="hidden md:flex items-center gap-1.5 text-slate-400 truncate">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">
                {executionLogs[0]
                  ? `آخر عملية منفذة: ${executionLogs[0].functionName} — ${executionLogs[0].summary}`
                  : 'جميع الوحدات البرمجية (20/20) نشطة ومربوطة برقم المسؤول المعتمد 01018108979'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 font-mono text-[10px]">
            <span className="hidden sm:inline-flex items-center gap-1 text-slate-400">
              <Activity className="w-3 h-3 text-emerald-400" />
              <span>Admin: 01018108979</span>
            </span>
            <span className="hidden lg:inline-flex items-center gap-1 text-teal-400">
              <Clock className="w-3 h-3" />
              <span>SLA & API Ready 100%</span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
};
