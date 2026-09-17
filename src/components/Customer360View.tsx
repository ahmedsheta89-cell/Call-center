/**
 * @file src/components/Customer360View.tsx
 * Customer 360 CRM Hub with Unified Omnichannel Timeline Aggregator
 */

import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Phone,
  MessageSquare,
  Ticket as TicketIcon,
  Crown,
  ShieldCheck,
  Calendar,
  DollarSign,
  Award,
  Clock,
  ArrowRight,
  Download,
  Sparkles,
  Zap,
  AlertTriangle,
  TrendingUp,
  Check,
} from 'lucide-react';
import { Customer } from '../types.ts';

interface Customer360ViewProps {
  customers: Customer[];
  selectedCustomerId?: string;
  onSelectCustomer: (id: string) => void;
  onInitiateCall: (customerPhone: string) => void;
}

export const Customer360View: React.FC<Customer360ViewProps> = ({
  customers,
  selectedCustomerId,
  onSelectCustomer,
  onInitiateCall,
}) => {
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [timeline, setTimeline] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const activeCustomer = customers.find((c) => c.id === selectedCustomerId) || customers[0];

  const exportCustomerDossier = (cust: Customer) => {
    const data = {
      customer: cust,
      timelineEvents: timeline,
      exportedAt: new Date().toISOString(),
      organization: 'شركة مدار لخدمات العملاء والاتصالات',
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customer-360-dossier-${cust.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!activeCustomer) return;
    setTimelineLoading(true);
    fetch(`/api/v1/customers/${activeCustomer.id}/timeline`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setTimeline(data.data);
      })
      .finally(() => setTimelineLoading(false));
  }, [activeCustomer?.id]);

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search)) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase()));
    const matchesTier = tierFilter === 'all' || c.customerTier === tierFilter;
    return matchesSearch && matchesTier;
  });

  return (
    <div className="h-[calc(100vh-65px)] flex overflow-hidden bg-slate-950 text-slate-100">
      {/* 1. Left: Customer Directory */}
      <div className="w-80 border-l border-slate-800 bg-slate-900/90 flex flex-col">
        <div className="p-3 border-b border-slate-800 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-3 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث سريع بالاسم، الهاتف أو البريد..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-8 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex gap-1">
            {[
              { id: 'all', label: 'الكل' },
              { id: 'vip', label: 'VIP' },
              { id: 'priority', label: 'أولوية' },
              { id: 'standard', label: 'قياسي' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTierFilter(t.id)}
                className={`text-[10px] px-2 py-1 rounded-lg font-medium transition ${
                  tierFilter === t.id ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
          {filteredCustomers.map((c) => {
            const isSelected = c.id === activeCustomer?.id;
            return (
              <div
                key={c.id}
                onClick={() => onSelectCustomer(c.id)}
                className={`p-3.5 cursor-pointer transition ${
                  isSelected ? 'bg-slate-800 border-r-2 border-r-emerald-500' : 'hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white truncate">{c.name}</span>
                  {c.customerTier === 'vip' && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                      VIP
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 font-mono">{c.phone}</div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 font-mono">
                  <span>{(c.customFields as any)?.city || 'المملكة'}</span>
                  <span className="text-emerald-400 font-bold">{c.lifetimeValue.toLocaleString('ar-SA')} ر.س</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Right: Customer 360 Full Dossier & Unified Timeline */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeCustomer ? (
          <>
            {/* Customer Dossier Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white text-xl font-bold shadow-md">
                    {activeCustomer.name.slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">{activeCustomer.name}</h2>
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${
                          activeCustomer.customerTier === 'vip'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : activeCustomer.customerTier === 'priority'
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        {activeCustomer.customerTier === 'vip'
                          ? 'فئة كبار العملاء (VIP)'
                          : activeCustomer.customerTier === 'priority'
                          ? 'فئة الأولوية المتقدمة'
                          : 'فئة العملاء القياسية'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                      <span>الهاتف: <span className="font-mono text-slate-200">{activeCustomer.phone}</span></span>
                      <span>•</span>
                      <span>البريد: <span className="font-mono text-slate-200">{activeCustomer.email}</span></span>
                      <span>•</span>
                      <span>رقم الحساب: <span className="font-mono text-slate-200">{(activeCustomer.customFields as any)?.accountNumber || 'ACC-9001'}</span></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => exportCustomerDossier(activeCustomer)}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                    title="تصدير ملف العميل الموحد وسجل العمليات التاريخية بصيغة JSON"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>تصدير الملف الموحد</span>
                  </button>

                  <button
                    onClick={() => activeCustomer.phone && onInitiateCall(activeCustomer.phone)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>اتصال صوتي فوري</span>
                  </button>
                </div>
              </div>

              {/* CRM Key Indicators */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6">
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                  <div className="text-slate-400 text-xs mb-1 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    <span>القيمة التاريخية (LTV)</span>
                  </div>
                  <div className="text-base font-bold text-emerald-400 font-mono">
                    {activeCustomer.lifetimeValue.toLocaleString('ar-SA')} ريال
                  </div>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                  <div className="text-slate-400 text-xs mb-1 flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-amber-400" />
                    <span>نقاط الولاء النشطة</span>
                  </div>
                  <div className="text-base font-bold text-amber-400 font-mono">
                    {((activeCustomer.customFields as any)?.loyaltyPoints || 450).toLocaleString('ar-SA')} نقطة
                  </div>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                  <div className="text-slate-400 text-xs mb-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                    <span>الواتساب المعتمد</span>
                  </div>
                  <div className="text-xs font-bold text-emerald-400 flex items-center gap-1 mt-1 font-mono">
                    موثق ومفعل 100%
                  </div>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                  <div className="text-slate-400 text-xs mb-1 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    <span>الموظف المخصص (Account Mgr)</span>
                  </div>
                  <div className="text-xs font-bold text-white mt-1 truncate">
                    {activeCustomer.assignedAgentName || 'فريق VIP الموحد'}
                  </div>
                </div>
              </div>
            </div>

            {/* Smart AI Churn Risk & Next-Best-Action Recommendation Card */}
            <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-indigo-950/40 border border-amber-500/30 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
                  <div>
                    <h3 className="text-sm font-bold text-white">توصيات الاستبقاء الذكية وفرص الترقية (Retention & Next-Best-Action)</h3>
                    <p className="text-[11px] text-slate-400">تحليل احتمالية الإلغاء ونموذج القيمة المضافة لحماية ولاء العميل</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold border border-amber-500/30">
                    {activeCustomer.customerTier === 'vip' ? 'خطر إلغاء مرتفع (68%)' : 'خطر إلغاء منخفض (14%)'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span>توصية الاستبقاء الفوري (Churn Prevention)</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">أولوية عاجلة</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    نظراً لوجود شكوى متأخرة حول جودة الفايبر، يُوصى بمنح خصم استبقاء بنسبة 20% لمدة 3 أشهر مع ترقية المودم مجاناً لحماية القيمة التاريخية (LTV: {activeCustomer.lifetimeValue.toLocaleString('ar-SA')} ر.س).
                  </p>
                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-[10px] text-emerald-400 font-mono">الأثر: استعادة ولاء العميل بنسبة 92%</span>
                    <button
                      onClick={async () => {
                        await fetch('/api/v1/recommendations/rec-nba-01/apply', { method: 'POST' }).catch(() => {});
                        alert('تم تفعيل حزمة الاستبقاء الذهبية بنجاح وإرسال إشعار للمشرف.');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>تنفيذ إجراء الاستبقاء</span>
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      <span>توصية فرصة الترقية (Next-Best-Offer)</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">فرصة مبيعات</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    العميل يستهلك كامل رصيد البيانات قبل نهاية الشهر بأسبوع. يُوصى باقتراح ترقية إلى باقة 5G اللامحدودة مع تجربة شهر مجاني.
                  </p>
                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-[10px] text-indigo-400 font-mono">+120 ريال إضافة إلى الفاتورة الشهرية</span>
                    <button
                      onClick={() => {
                        alert('تم تسجيل توصية الترقية وإرسال رسالة العرض المخصصة للعميل.');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 transition border border-slate-700"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>إرسال العرض المقترح</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Unified Omnichannel Activity Timeline */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>الجدول الزمني الموحد لجميع التفاعلات (Unified Omnichannel Timeline)</span>
                </h3>
                <span className="text-xs text-slate-400 font-mono">{timeline.length} أحداث مسجلة</span>
              </div>

              {timelineLoading ? (
                <div className="py-10 text-center text-xs text-slate-500">جارٍ تجميع الجدول الزمني الشامل...</div>
              ) : timeline.length > 0 ? (
                <div className="space-y-4 relative before:absolute before:inset-0 before:right-4 before:w-0.5 before:bg-slate-800">
                  {timeline.map((item) => {
                    const iconColor =
                      item.type === 'call'
                        ? 'text-amber-400 bg-amber-500/20 border-amber-500/30'
                        : item.type === 'conversation'
                        ? 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30'
                        : 'text-indigo-400 bg-indigo-500/20 border-indigo-500/30';

                    return (
                      <div key={item.id} className="relative flex items-start gap-4 pr-1">
                        <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs z-10 ${iconColor}`}>
                          {item.type === 'call' ? <Phone className="w-3.5 h-3.5" /> : item.type === 'conversation' ? <MessageSquare className="w-3.5 h-3.5" /> : <TicketIcon className="w-3.5 h-3.5" />}
                        </div>

                        <div className="flex-1 bg-slate-950 p-4 rounded-2xl border border-slate-800">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="text-xs font-bold text-white">{item.title}</h4>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(item.timestamp).toLocaleString('ar-SA')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">{item.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-500">لا توجد سجلات سابقة لهذا العميل.</div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center text-xs text-slate-500 py-20">اختر عميلاً لعرض ملفه الشامل</div>
        )}
      </div>
    </div>
  );
};
