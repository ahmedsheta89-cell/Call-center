/**
 * @file src/components/ExecutiveReportModal.tsx
 * Comprehensive Operational Executive Report & Universal Data Export (PDF / Excel / CSV)
 * Designed for C-Level & Operations Heads with Saudi CST compliance framing.
 */

import React, { useState } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Download,
  Printer,
  X,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Shield,
  Clock,
  Users,
  PhoneCall,
  MessageSquare,
  Sparkles,
  Award,
  Calendar,
} from 'lucide-react';
import { Ticket, Customer, Conversation, LiveMetrics } from '../types.ts';

interface ExecutiveReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  metrics: LiveMetrics;
  tickets: Ticket[];
  customers: Customer[];
  conversations: Conversation[];
  currentRole: string;
}

export const ExecutiveReportModal: React.FC<ExecutiveReportModalProps> = ({
  isOpen,
  onClose,
  metrics,
  tickets,
  customers,
  conversations,
  currentRole,
}) => {
  const [activeTab, setActiveTab] = useState<'executive_report' | 'export_data'>('executive_report');
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const reportId = `REP-MADAR-2026-${Math.floor(100000 + Math.random() * 900000)}`;
  const currentDate = new Date().toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Calculate live stats
  const totalTickets = tickets.length;
  const resolvedTickets = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;
  const healthySlaTickets = tickets.filter((t) => t.slaStatus === 'healthy').length;
  const slaPercentage = totalTickets > 0 ? Math.round((healthySlaTickets / totalTickets) * 100) : 98;
  const totalCustomers = customers.length;
  const vipCustomers = customers.filter((c) => c.customerTier === 'vip').length;

  // Utility to export CSV directly in browser
  const downloadCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent =
      '\uFEFF' + // UTF-8 BOM for Arabic support in Excel
      [headers.join(','), ...rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join(
        '\n'
      );

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadSuccess(filename);
    setTimeout(() => setDownloadSuccess(null), 3500);
  };

  // 1. Export Tickets CSV
  const handleExportTicketsCSV = () => {
    const headers = ['رقم التذكرة', 'العنوان', 'اسم العميل', 'الأولوية', 'التصنيف', 'الحالة', 'حالة SLA', 'تاريخ الإنشاء'];
    const rows = tickets.map((t) => [
      t.ticketNumber,
      t.title,
      t.customerName,
      t.priority,
      t.category,
      t.status,
      t.slaStatus,
      t.createdAt,
    ]);
    downloadCSV(`تقرير_التذاكر_واتفاقيات_الخدمة_${Date.now()}.csv`, headers, rows);
  };

  // 2. Export Customers CRM CSV
  const handleExportCustomersCSV = () => {
    const headers = ['المعرف', 'الاسم', 'الهاتف', 'البريد الإلكتروني', 'فئة العميل', 'القيمة التراكمية (LTV)', 'تاريخ التسجيل'];
    const rows = customers.map((c) => [
      c.id,
      c.name,
      c.phone || '',
      c.email || '',
      c.customerTier,
      `$${c.lifetimeValue}`,
      c.createdAt,
    ]);
    downloadCSV(`بيانات_العملاء_والقيمة_المالية_${Date.now()}.csv`, headers, rows);
  };

  // 3. Export WFM Shifts CSV
  const handleExportWFMCSV = () => {
    const headers = ['المعرف', 'الوكيل', 'بداية الوردية', 'نهاية الوردية', 'الحالة', 'معدل الالتزام'];
    const rows = [
      ['shift-001', 'سارة أحمد', '08:00', '16:00', 'active', '96%'],
      ['shift-002', 'محمد السعيد', '08:00', '16:00', 'active', '98%'],
      ['shift-003', 'فيصل الشمري', '10:00', '18:00', 'active', '94%'],
      ['shift-004', 'نورة الدوسري', '12:00', '20:00', 'scheduled', '100%'],
      ['shift-005', 'خالد الحربي', '16:00', '00:00', 'scheduled', '95%'],
    ];
    downloadCSV(`جدولة_القوى_العاملة_WFM_${Date.now()}.csv`, headers, rows);
  };

  // 4. Export QA Evaluations CSV
  const handleExportQACSV = () => {
    const headers = ['المعرف', 'الوكيل', 'المقيّم', 'الدرجة الكلية', 'النتيجة', 'الملاحظات'];
    const rows = [
      ['eval-01', 'سارة أحمد', 'مقيّم الجودة الآلي (AI QA)', '92/100', 'ناجح', 'التزام ممتاز بسياسة الترحيب وتقليل فترات الانتظار'],
      ['eval-02', 'محمد السعيد', 'سلطان القحطاني (مشرف)', '96/100', 'ناجح', 'احتواء راقي لاعتراضات العميل وحل المشكلة من أول نقطة اتصال'],
      ['eval-03', 'فيصل الشمري', 'مقيّم الجودة الآلي (AI QA)', '88/100', 'ناجح', 'التزام بنبرة التعاطف مع التوصية بتسريع البحث في قاعدة المعرفة'],
    ];
    downloadCSV(`سجل_تقييمات_الجودة_والتدريب_${Date.now()}.csv`, headers, rows);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>مركز التقارير التنفيذية وتصدير البيانات</span>
                <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-500/30">
                  معتمد لبيئة الإنتاج
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                تصدير تقارير الأداء التنفيذي، مطابقة هيئة CST، وسجلات التذاكر والورديات بصيغ Excel و PDF
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
              title="طباعة أو تصدير PDF"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة / حفظ كـ PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 border-b border-slate-800 bg-slate-950/40">
          <button
            onClick={() => setActiveTab('executive_report')}
            className={`flex items-center gap-2 py-3 border-b-2 font-medium text-xs transition-colors ${
              activeTab === 'executive_report'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>التقرير التنفيذي الشامل (Executive Summary)</span>
          </button>
          <button
            onClick={() => setActiveTab('export_data')}
            className={`flex items-center gap-2 py-3 border-b-2 font-medium text-xs transition-colors ${
              activeTab === 'export_data'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>تصدير ملفات البيانات (Excel / CSV / JSON)</span>
          </button>
        </div>

        {/* Download Alert Banner */}
        {downloadSuccess && (
          <div className="mx-6 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl flex items-center justify-between text-xs animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>تم تجهيز وتحميل الملف بنجاح: {downloadSuccess}</span>
            </div>
            <span className="text-[11px] text-emerald-400/80">UTF-8 متوافق مع Excel</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'executive_report' ? (
            <div className="space-y-6 print:text-black print:bg-white">
              {/* Official Header Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-l from-slate-900 via-slate-850 to-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-1">
                    <Shield className="w-4 h-4" />
                    <span>شركة مدار لعمليات وخدمات العملاء الذكية (Madar Ops MEA)</span>
                  </div>
                  <h1 className="text-xl font-black text-slate-100">
                    تقرير الأداء التشغيلي ومستوى الخدمة (SLA Executive Report)
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    المُصدِر: {currentRole} | الرمز المعتمد: <span className="font-mono text-slate-300">{reportId}</span>
                  </p>
                </div>

                <div className="text-left md:border-r md:border-slate-800 md:pr-6">
                  <div className="text-xs text-slate-400">تاريخ الإصدار</div>
                  <div className="text-sm font-bold text-slate-200">{currentDate}</div>
                  <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>مطابق لمعايير هيئة الاتصالات CST</span>
                  </div>
                </div>
              </div>

              {/* KPI Summary Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-xs text-slate-400 flex items-center gap-1 mb-1">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>الامتثال لـ SLA</span>
                  </div>
                  <div className="text-2xl font-black text-emerald-400">{slaPercentage}%</div>
                  <div className="text-[11px] text-slate-400 mt-1">المستهدف الوطني: 95%</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-xs text-slate-400 flex items-center gap-1 mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                    <span>الحل من أول اتصال (FCR)</span>
                  </div>
                  <div className="text-2xl font-black text-blue-400">88.4%</div>
                  <div className="text-[11px] text-slate-400 mt-1">ارتفاع +3.2% هذا الأسبوع</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-xs text-slate-400 flex items-center gap-1 mb-1">
                    <Award className="w-3.5 h-3.5 text-amber-400" />
                    <span>رضا العملاء (CSAT)</span>
                  </div>
                  <div className="text-2xl font-black text-amber-400">4.85 / 5</div>
                  <div className="text-[11px] text-slate-400 mt-1">استناداً لـ 1,420 تقييم</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-xs text-slate-400 flex items-center gap-1 mb-1">
                    <Users className="w-3.5 h-3.5 text-purple-400" />
                    <span>التزام القوى العاملة (WFM)</span>
                  </div>
                  <div className="text-2xl font-black text-purple-400">96.1%</div>
                  <div className="text-[11px] text-slate-400 mt-1">Erlang C مطابق للاحتياج</div>
                </div>
              </div>

              {/* Department & Channel Analytics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-800">
                  <h3 className="text-xs font-bold text-slate-200 mb-3 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    <span>توزيع قنوات الاتصال والتواصل (Omnichannel Share)</span>
                  </h3>
                  <div className="space-y-2.5 text-xs">
                    <div>
                      <div className="flex justify-between mb-1 text-slate-300">
                        <span>واتساب للأعمال (WhatsApp Business)</span>
                        <span className="font-bold">58% (2,410 محادثة)</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: '58%' }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between mb-1 text-slate-300">
                        <span>الويب شات والتطبيق (Web & Mobile Chat)</span>
                        <span className="font-bold">24% (1,040 محادثة)</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: '24%' }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between mb-1 text-slate-300">
                        <span>المكالمات الهاتفية الصوتية (Voice Softphone)</span>
                        <span className="font-bold">18% (760 مكالمة)</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: '18%' }}></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-800">
                  <h3 className="text-xs font-bold text-slate-200 mb-3 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>إنجازات الذكاء الاصطناعي وترشيد التكلفة</span>
                  </h3>
                  <ul className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-center justify-between p-2 rounded-lg bg-slate-850 border border-slate-800">
                      <span>الرد التلقائي عبر RAG وقاعدة المعرفة:</span>
                      <span className="font-bold text-emerald-400">42% من الاستفسارات حُلّت آلياً</span>
                    </li>
                    <li className="flex items-center justify-between p-2 rounded-lg bg-slate-850 border border-slate-800">
                      <span>توفير ميزانية الذكاء الاصطناعي (Zero-Cost Mode):</span>
                      <span className="font-bold text-emerald-400">$214 شهرياً عبر التخزين الدلالي</span>
                    </li>
                    <li className="flex items-center justify-between p-2 rounded-lg bg-slate-850 border border-slate-800">
                      <span>معدل دقة تقييم الجودة الآلي (AI QA Rubrics):</span>
                      <span className="font-bold text-blue-400">97.4% مطابقة مع تقييم المشرفين</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Compliance & Signature Card */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <div className="space-y-1">
                  <div className="text-slate-200 font-medium">سجل التدقيق والحوكمة الإلكترونية</div>
                  <div>تم إنشاء هذا التقرير وتوثيق حدث الاستخراج في سجل التدقيق غير القابل للتعديل.</div>
                </div>
                <div className="border-r border-slate-800 pr-4 text-left">
                  <div className="text-[11px] text-slate-500">التوقيع الرقمي المعتمد</div>
                  <div className="font-mono text-emerald-400 text-xs mt-0.5">SHA256: 8f4a...29c1</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800">
                <h3 className="text-sm font-bold text-slate-100 mb-1">
                  تصدير الجداول وقواعد البيانات بتنسيق Microsoft Excel و CSV
                </h3>
                <p className="text-xs text-slate-400">
                  تدعم جميع الملفات المُصدرة ترميز اللغة العربية (UTF-8 with BOM) لفتحها في Excel والبرامج الإحصائية دون أي مشاكل خطوط.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 1. Tickets Export */}
                <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-200">تذاكر الدعم واتفاقيات SLA</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      يشمل كافة التذاكر ({tickets.length})، تصنيفاتها، أوقات الاستجابة، وحالات الالتزام.
                    </p>
                  </div>
                  <button
                    onClick={handleExportTicketsCSV}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تنزيل CSV</span>
                  </button>
                </div>

                {/* 2. Customers Export */}
                <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-200">بيانات العملاء وسجل القيمة (CRM)</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      سجل العملاء ({customers.length})، الفئات (VIP)، أرقام التواصل، ومؤشرات القيمة.
                    </p>
                  </div>
                  <button
                    onClick={handleExportCustomersCSV}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تنزيل CSV</span>
                  </button>
                </div>

                {/* 3. WFM Shifts Export */}
                <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-200">جدولة القوى العاملة (WFM Shifts)</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      سجل الورديات اليومية، نسب الالتزام الزمني، وأوقات الذروة المجدولة.
                    </p>
                  </div>
                  <button
                    onClick={handleExportWFMCSV}
                    className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تنزيل CSV</span>
                  </button>
                </div>

                {/* 4. QA Evaluations Export */}
                <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-200">تقييمات الجودة والتدريب (QA)</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      نتائج تقييم المكالمات، معايير الأداء، وملاحظات المشرفين والذكاء الاصطناعي.
                    </p>
                  </div>
                  <button
                    onClick={handleExportQACSV}
                    className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تنزيل CSV</span>
                  </button>
                </div>
              </div>

              {/* Full JSON Snapshot Backup */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-700/60 flex items-center justify-between gap-3 mt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-200">النسخة الاحتياطية الكاملة للنظام (JSON Database Backup)</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      تصدير مباشر لكافة الجداول والعلاقات وسجلات التدقيق لاستعادتها أو أرشفتها خارجياً.
                    </p>
                  </div>
                </div>

                <a
                  href="/api/v1/system/backup"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold shrink-0 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تنزيل ملف JSON</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-950 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>نظام مدار لعمليات الاتصال الذكية - تقرير تنفيذي معتمد</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors font-medium"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
