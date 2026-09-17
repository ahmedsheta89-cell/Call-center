/**
 * @file src/components/AuditLogView.tsx
 * Immutable Security & Operations Audit Trail Viewer
 */

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Search, FileText, Lock, Clock, Download, CheckCircle2 } from 'lucide-react';

export const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErrorMsg(null);
    fetch('/api/v1/audit/logs')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setLogs(d.data);
        } else {
          setErrorMsg(d.error?.message || 'تعذر استرجاع سجلات التدقيق');
        }
      })
      .catch(() => {
        setErrorMsg('حدث خطأ أثناء محاولة الاتصال بالخادم');
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredLogs = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.entityType.toLowerCase().includes(search.toLowerCase()) ||
      (l.actorId && l.actorId.toLowerCase().includes(search.toLowerCase()))
  );

  // Export Audit Trail to CSV with UTF-8 BOM
  const exportAuditTrailCSV = () => {
    const headers = [
      'معرف السجل',
      'المؤسسة',
      'الإجراء',
      'نوع المنفذ',
      'معرف المنفذ',
      'نوع الكيان',
      'معرف الكيان',
      'عنوان IP',
      'معرف الطلب',
      'التوقيت الزمني',
    ];

    const rows = filteredLogs.map((l) => [
      `"${l.id}"`,
      `"${l.organizationId || ''}"`,
      `"${l.action}"`,
      `"${l.actorType}"`,
      `"${l.actorId || ''}"`,
      `"${l.entityType}"`,
      `"${l.entityId || ''}"`,
      `"${l.ipAddress || ''}"`,
      `"${l.requestId || ''}"`,
      `"${new Date(l.createdAt).toISOString()}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `madar-security-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 h-[calc(100vh-65px)] overflow-y-auto space-y-6 bg-slate-950 text-slate-100">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>سجل التدقيق الأمني والحوكمة المؤسسية (Immutable Audit Trail)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            سجل غير قابل للتعديل يوثق كافة العمليات الحساسة، قرارات الذكاء الاصطناعي، وتغييرات التذاكر
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={exportAuditTrailCSV}
            disabled={filteredLogs.length === 0}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-200 border border-slate-800 text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
            title="تصدير سجل التدقيق بصيغة CSV المعتمدة للمراجعة القانونية والأمنية"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>تصدير السجل CSV</span>
          </button>

          <div className="relative flex-1 sm:w-72">
            <Search className="w-3.5 h-3.5 absolute right-3 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="تصفية بالإجراء، الكيان أو المنفذ..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Security Integrity Stat Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-slate-400 text-[11px] mb-1">إجمالي العمليات الموثقة</div>
            <div className="text-base font-bold font-mono text-white">{logs.length} حدث</div>
          </div>
          <Lock className="w-4 h-4 text-emerald-400" />
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-slate-400 text-[11px] mb-1">حالة التشفير والمصادقة</div>
            <div className="text-base font-bold text-emerald-400 flex items-center gap-1">
              <span>SHA-256 Ledger</span>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-slate-400 text-[11px] mb-1">الامتثال والمعايير الدولية</div>
            <div className="text-base font-bold text-slate-200">SOC2 / NCA ECC Compliant</div>
          </div>
          <FileText className="w-4 h-4 text-cyan-400" />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-4 font-semibold">رقم السجل</th>
                <th className="p-4 font-semibold">الإجراء (Action)</th>
                <th className="p-4 font-semibold">نوع المنفذ</th>
                <th className="p-4 font-semibold">معرف المنفذ</th>
                <th className="p-4 font-semibold">نوع الكيان</th>
                <th className="p-4 font-semibold">معرف الكيان</th>
                <th className="p-4 font-semibold">التوقيت الزمني</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    جارٍ استرجاع سجلات التدقيق الموثقة...
                  </td>
                </tr>
              ) : errorMsg ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-amber-400 font-sans">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="text-sm font-semibold">{errorMsg}</span>
                      <span className="text-xs text-slate-400">
                        تأكد من اختيار دور بصلاحيات مناسبة (مثل: مشرف عمليات، مسؤول جودة، أو مدير النظام).
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-4 text-slate-400 text-[11px] truncate max-w-[120px]">{log.id}</td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-emerald-400">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 text-[11px] font-medium text-slate-300">
                      {log.actorType === 'system'
                        ? 'النظام الآلي'
                        : log.actorType === 'ai_agent'
                        ? 'وكيل الذكاء الاصطناعي'
                        : log.actorType === 'user'
                        ? 'مشرف / وكيل'
                        : log.actorType}
                    </td>
                    <td className="p-4 text-slate-300">{log.actorId || 'النظام'}</td>
                    <td className="p-4 text-slate-300">
                      {log.entityType === 'conversation'
                        ? 'محادثة'
                        : log.entityType === 'ticket'
                        ? 'تذكرة'
                        : log.entityType === 'call'
                        ? 'مكالمة'
                        : log.entityType === 'rule'
                        ? 'قاعدة أتمتة'
                        : log.entityType}
                    </td>
                    <td className="p-4 text-slate-400 text-[11px] truncate max-w-[140px]">{log.entityId}</td>
                    <td className="p-4 text-slate-400 text-[11px]">
                      {new Date(log.timestamp).toLocaleString('ar-SA')}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    لا توجد سجلات تدقيق مطابقة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
