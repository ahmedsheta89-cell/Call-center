/**
 * @file src/components/Customer360View.tsx
 * Customer 360 CRM Hub with Unified Omnichannel Timeline Aggregator, Notes & Follow-ups
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
  Plus,
  StickyNote,
  CalendarCheck,
  UserCheck,
  Copy,
  AlertCircle,
  FileText,
  X,
} from 'lucide-react';
import { Customer } from '../types.ts';

interface Customer360ViewProps {
  customers: Customer[];
  selectedCustomerId?: string;
  onSelectCustomer: (id: string) => void;
  onInitiateCall: (customerPhone: string) => void;
  onCustomerCreated?: (customer: Customer) => void;
}

interface NoteItem {
  id: string;
  authorName: string;
  content: string;
  pinned: boolean;
  createdAt: string;
}

interface FollowUpItem {
  id: string;
  title: string;
  dueAt: string;
  priority: string;
  assignedAgentName?: string;
  status: string;
  createdAt: string;
}

export const Customer360View: React.FC<Customer360ViewProps> = ({
  customers: initialCustomers,
  selectedCustomerId,
  onSelectCustomer,
  onInitiateCall,
  onCustomerCreated,
}) => {
  const [localCustomers, setLocalCustomers] = useState<Customer[]>(initialCustomers);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [timeline, setTimeline] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Notes & Follow-ups state
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);

  // Modals state
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [showDuplicateCheckModal, setShowDuplicateCheckModal] = useState(false);
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [showScheduleFollowUpModal, setShowScheduleFollowUpModal] = useState(false);

  // New Customer Form State
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustTier, setNewCustTier] = useState<'standard' | 'priority' | 'vip'>('standard');
  const [newCustCity, setNewCustCity] = useState('القاهرة');
  const [newCustLTV, setNewCustLTV] = useState(500);
  const [isSubmittingCustomer, setIsSubmittingCustomer] = useState(false);

  // Duplicate Check Form State
  const [dupPhone, setDupPhone] = useState('');
  const [dupEmail, setDupEmail] = useState('');
  const [dupName, setDupName] = useState('');
  const [dupResults, setDupResults] = useState<any[] | null>(null);
  const [dupLoading, setDupLoading] = useState(false);

  // Add Note Form State
  const [noteContent, setNoteContent] = useState('');
  const [notePinned, setNotePinned] = useState(false);
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  // Schedule FollowUp Form State
  const [fuTitle, setFuTitle] = useState('');
  const [fuDueAt, setFuDueAt] = useState('');
  const [fuPriority, setFuPriority] = useState('medium');
  const [fuAgentName, setFuAgentName] = useState('سارة أحمد');
  const [fuSubmitting, setFuSubmitting] = useState(false);

  useEffect(() => {
    setLocalCustomers(initialCustomers);
  }, [initialCustomers]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const activeCustomer = localCustomers.find((c) => c.id === selectedCustomerId) || localCustomers[0];

  // Fetch timeline, notes, and followups when activeCustomer changes
  useEffect(() => {
    if (!activeCustomer) return;
    setTimelineLoading(true);

    fetch(`/api/v1/customers/${activeCustomer.id}/timeline`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setTimeline(data.data);
      })
      .catch(() => {})
      .finally(() => setTimelineLoading(false));

    fetch(`/api/v1/customers/${activeCustomer.id}/notes`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) setNotes(data.data);
      })
      .catch(() => {});

    fetch(`/api/v1/customers/${activeCustomer.id}/follow-ups`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) setFollowUps(data.data);
      })
      .catch(() => {});
  }, [activeCustomer?.id]);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim() || !newCustPhone.trim()) {
      showToast('يرجى ملء الاسم ورقم الهاتف.');
      return;
    }
    setIsSubmittingCustomer(true);
    try {
      const res = await fetch('/api/v1/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustName.trim(),
          phone: newCustPhone.trim(),
          email: newCustEmail.trim() || undefined,
          customerTier: newCustTier,
          lifetimeValue: Number(newCustLTV) || 0,
          customFields: { city: newCustCity, source: 'CRM Manual Entry' },
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setLocalCustomers((prev) => [data.data, ...prev]);
        onSelectCustomer(data.data.id);
        if (onCustomerCreated) onCustomerCreated(data.data);
        showToast(`تم إنشاء العميل بنجاح: ${data.data.name}`);
        setShowNewCustomerModal(false);
        setNewCustName('');
        setNewCustPhone('');
        setNewCustEmail('');
      } else {
        showToast(data.error?.message || 'تعذر إنشاء العميل');
      }
    } catch {
      showToast('حدث خطأ أثناء حفظ بيانات العميل');
    } finally {
      setIsSubmittingCustomer(false);
    }
  };

  const handleCheckDuplicates = async (e: React.FormEvent) => {
    e.preventDefault();
    setDupLoading(true);
    try {
      const res = await fetch('/api/v1/customers/detect-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: dupPhone.trim() || undefined,
          email: dupEmail.trim() || undefined,
          name: dupName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDupResults(data.data?.matches || []);
      } else {
        showToast(data.error?.message || 'فشل فحص التكرار');
      }
    } catch {
      showToast('حدث خطأ أثناء فحص السجلات المكررة');
    } finally {
      setDupLoading(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCustomer || !noteContent.trim()) return;
    setNoteSubmitting(true);
    try {
      const res = await fetch(`/api/v1/customers/${activeCustomer.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: noteContent.trim(),
          pinned: notePinned,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setNotes((prev) => [data.data, ...prev]);
        showToast('تمت إضافة الملاحظة بنجاح');
        setShowAddNoteModal(false);
        setNoteContent('');
        setNotePinned(false);
      } else {
        showToast(data.error?.message || 'فشل حفظ الملاحظة');
      }
    } catch {
      showToast('حدث خطأ أثناء حفظ الملاحظة');
    } finally {
      setNoteSubmitting(false);
    }
  };

  const handleScheduleFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCustomer || !fuTitle.trim()) return;
    setFuSubmitting(true);
    try {
      const res = await fetch(`/api/v1/customers/${activeCustomer.id}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: fuTitle.trim(),
          dueAt: fuDueAt || new Date(Date.now() + 86400000).toISOString(),
          priority: fuPriority,
          assignedAgentName: fuAgentName,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setFollowUps((prev) => [data.data, ...prev]);
        showToast('تمت جدولة المتابعة بنجاح');
        setShowScheduleFollowUpModal(false);
        setFuTitle('');
        setFuDueAt('');
      } else {
        showToast(data.error?.message || 'فشل جدولة المتابعة');
      }
    } catch {
      showToast('حدث خطأ أثناء جدولة المتابعة');
    } finally {
      setFuSubmitting(false);
    }
  };

  const exportCustomerDossier = (cust: Customer) => {
    const data = {
      customer: cust,
      notes,
      followUps,
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

  const filteredCustomers = localCustomers.filter((c) => {
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
          {/* Action buttons: New Customer + Duplicate Check */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowNewCustomerModal(true)}
              className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>عميل جديد</span>
            </button>
            <button
              onClick={() => {
                setShowDuplicateCheckModal(true);
                setDupResults(null);
              }}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1 transition"
              title="فحص واكتشاف السجلات المكررة"
            >
              <Copy className="w-3.5 h-3.5 text-cyan-400" />
              <span>فحص التكرار</span>
            </button>
          </div>

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
                      <span>البريد: <span className="font-mono text-slate-200">{activeCustomer.email || 'غير مسجل'}</span></span>
                      <span>•</span>
                      <span>رقم الحساب: <span className="font-mono text-slate-200">{(activeCustomer.customFields as any)?.accountNumber || 'ACC-9001'}</span></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setShowAddNoteModal(true)}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <StickyNote className="w-3.5 h-3.5 text-amber-400" />
                    <span>إضافة ملاحظة</span>
                  </button>

                  <button
                    onClick={() => setShowScheduleFollowUpModal(true)}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <CalendarCheck className="w-3.5 h-3.5 text-cyan-400" />
                    <span>جدولة متابعة</span>
                  </button>

                  <button
                    onClick={() => exportCustomerDossier(activeCustomer)}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                    title="تصدير ملف العميل الموحد وسجل العمليات التاريخية بصيغة JSON"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>تصدير الملف</span>
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

            {/* Customer Notes & Scheduled Follow-ups Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Notes Box */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <StickyNote className="w-4 h-4 text-amber-400" />
                    <span>ملاحظات الحساب الداخلية ({notes.length})</span>
                  </h4>
                  <button
                    onClick={() => setShowAddNoteModal(true)}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>إضافة</span>
                  </button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {notes.length > 0 ? (
                    notes.map((n) => (
                      <div
                        key={n.id}
                        className={`p-3 rounded-2xl text-xs border ${
                          n.pinned ? 'bg-amber-950/20 border-amber-500/30' : 'bg-slate-950 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                          <span className="font-bold text-slate-200">{n.authorName}</span>
                          <span className="font-mono">{new Date(n.createdAt).toLocaleDateString('ar-SA')}</span>
                        </div>
                        <p className="text-slate-300 leading-relaxed">{n.content}</p>
                      </div>
                    ))
                  ) : (
                    <div className="py-4 text-center text-xs text-slate-500">لا توجد ملاحظات مسجلة لهذا العميل</div>
                  )}
                </div>
              </div>

              {/* Follow-ups Box */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <CalendarCheck className="w-4 h-4 text-cyan-400" />
                    <span>المتابعات المجدولة والمهام ({followUps.length})</span>
                  </h4>
                  <button
                    onClick={() => setShowScheduleFollowUpModal(true)}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>جدولة</span>
                  </button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {followUps.length > 0 ? (
                    followUps.map((fu) => (
                      <div key={fu.id} className="p-3 rounded-2xl text-xs bg-slate-950 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white">{fu.title}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                              fu.priority === 'urgent'
                                ? 'bg-rose-500/20 text-rose-300'
                                : fu.priority === 'high'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {fu.priority}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span>المسند إليه: {fu.assignedAgentName || 'فريق الخدمة'}</span>
                          <span>الموعد: {new Date(fu.dueAt).toLocaleString('ar-SA')}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-4 text-center text-xs text-slate-500">لا توجد مهام متابعة مجدولة</div>
                  )}
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
                        showToast('تم تفعيل حزمة الاستبقاء الذهبية بنجاح وإرسال إشعار للمشرف.');
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
                        showToast('تم تسجيل توصية الترقية وإرسال رسالة العرض المخصصة للعميل.');
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

      {/* MODAL 1: New Customer Modal */}
      {showNewCustomerModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>إضافة عميل جديد في قاعدة بيانات CRM</span>
              </h3>
              <button data-close-modal onClick={() => setShowNewCustomerModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">الاسم الكامل *:</label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="مثال: أحمد محمد علي"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">رقم الهاتف (مصر / دولي) *:</label>
                  <input
                    type="text"
                    required
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    placeholder="01012345678 أو +201..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">البريد الإلكتروني:</label>
                  <input
                    type="email"
                    value={newCustEmail}
                    onChange={(e) => setNewCustEmail(e.target.value)}
                    placeholder="ahmed@example.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">الفئة (Tier):</label>
                  <select
                    value={newCustTier}
                    onChange={(e) => setNewCustTier(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  >
                    <option value="standard">Standard</option>
                    <option value="priority">Priority</option>
                    <option value="vip">VIP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">المدينة / المحافظة:</label>
                  <input
                    type="text"
                    value={newCustCity}
                    onChange={(e) => setNewCustCity(e.target.value)}
                    placeholder="القاهرة / الرياض"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">القيمة المبدئية (LTV):</label>
                  <input
                    type="number"
                    value={newCustLTV}
                    onChange={(e) => setNewCustLTV(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewCustomerModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCustomer}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50"
                >
                  {isSubmittingCustomer ? 'جارٍ الحفظ...' : 'حفظ العميل الجديد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Duplicate Detection Modal */}
      {showDuplicateCheckModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Copy className="w-4 h-4 text-cyan-400" />
                <span>محرك كشف وتفادي تكرار العملاء (Duplicate Detection)</span>
              </h3>
              <button data-close-modal onClick={() => setShowDuplicateCheckModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCheckDuplicates} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">رقم الهاتف:</label>
                  <input
                    type="text"
                    value={dupPhone}
                    onChange={(e) => setDupPhone(e.target.value)}
                    placeholder="010..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">البريد:</label>
                  <input
                    type="text"
                    value={dupEmail}
                    onChange={(e) => setDupEmail(e.target.value)}
                    placeholder="example@..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">الاسم:</label>
                <input
                  type="text"
                  value={dupName}
                  onChange={(e) => setDupName(e.target.value)}
                  placeholder="الاسم الكامل أو جزء منه"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={dupLoading}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs disabled:opacity-50"
                >
                  {dupLoading ? 'جارٍ الفحص...' : 'بدء فحص السجلات'}
                </button>
              </div>
            </form>

            {/* Results */}
            {dupResults && (
              <div className="border-t border-slate-800 pt-3 space-y-2">
                <div className="text-xs font-bold text-white flex items-center justify-between">
                  <span>نتائج المطابقة:</span>
                  <span className="font-mono text-cyan-400">{dupResults.length} سجل مطابق</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {dupResults.length > 0 ? (
                    dupResults.map((r) => (
                      <div key={r.customer?.id} className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-xs flex items-center justify-between">
                        <div>
                          <div className="font-bold text-white">{r.customer?.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{r.customer?.phone} • {r.customer?.email}</div>
                          <div className="text-[10px] text-amber-400 mt-0.5">سبب المطابقة: {r.matchedOn?.join(', ')}</div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">
                            تطابق: {r.score}%
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-4 text-center text-xs text-emerald-400 bg-emerald-950/20 rounded-xl border border-emerald-500/30">
                      ✓ لا يوجد سجل مكرر! الرقم والبيانات فريدة تماماً.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: Add Note Modal */}
      {showAddNoteModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-amber-400" />
                <span>إضافة ملاحظة على ملف العميل</span>
              </h3>
              <button data-close-modal onClick={() => setShowAddNoteModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddNote} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">الملاحظة *:</label>
                <textarea
                  rows={4}
                  required
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="اكتب الملاحظة الفنية أو الإدارية هنا..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="notePin"
                  checked={notePinned}
                  onChange={(e) => setNotePinned(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0"
                />
                <label htmlFor="notePin" className="text-slate-300 text-xs">تثبيت الملاحظة في أعلى الملف (Pin)</label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddNoteModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={noteSubmitting}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold disabled:opacity-50"
                >
                  {noteSubmitting ? 'جارٍ الحفظ...' : 'حفظ الملاحظة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Schedule Follow-Up Modal */}
      {showScheduleFollowUpModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-cyan-400" />
                <span>جدولة متابعة لاحقة مع العميل</span>
              </h3>
              <button data-close-modal onClick={() => setShowScheduleFollowUpModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleScheduleFollowUp} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">موضوع المتابعة *:</label>
                <input
                  type="text"
                  required
                  value={fuTitle}
                  onChange={(e) => setFuTitle(e.target.value)}
                  placeholder="مثال: الاتصال للتحقق من تركيب الراوتر"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">تاريخ وموعد الاستحقاق:</label>
                  <input
                    type="datetime-local"
                    value={fuDueAt}
                    onChange={(e) => setFuDueAt(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">الأولوية:</label>
                  <select
                    value={fuPriority}
                    onChange={(e) => setFuPriority(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value="low">منخفضة</option>
                    <option value="medium">متوسطة</option>
                    <option value="high">عالية</option>
                    <option value="urgent">طارئة</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">الموظف المسؤول:</label>
                <input
                  type="text"
                  value={fuAgentName}
                  onChange={(e) => setFuAgentName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowScheduleFollowUpModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={fuSubmitting}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold disabled:opacity-50"
                >
                  {fuSubmitting ? 'جارٍ الحفظ...' : 'حفظ وجدولة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border border-emerald-500/50 text-white px-5 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold z-50 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
