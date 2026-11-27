/**
 * @file src/components/TicketsManager.tsx
 * Comprehensive Tickets & SLA Monitoring Console with Live Status Transitions & Comments
 */

import React, { useState, useEffect } from 'react';
import {
  Ticket as TicketIcon,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Plus,
  ArrowUpRight,
  Filter,
  User,
  Tag,
  Download,
  Search,
  CheckCheck,
  MessageSquare,
  Send,
  X,
  Check,
} from 'lucide-react';
import { Ticket, Customer } from '../types.ts';

interface TicketsManagerProps {
  tickets: Ticket[];
  customers: Customer[];
  onCreateTicket: (ticket: {
    customerId: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    category: string;
  }) => Promise<void>;
  onEscalateTicket: (ticketId: string) => Promise<void>;
  userRole: string;
}

interface TicketCommentItem {
  id: string;
  authorName: string;
  authorRole: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export const TicketsManager: React.FC<TicketsManagerProps> = ({
  tickets: initialTickets,
  customers,
  onCreateTicket,
  onEscalateTicket,
  userRole,
}) => {
  const [localTickets, setLocalTickets] = useState<Ticket[]>(initialTickets);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New ticket form state
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [newCategory, setNewCategory] = useState('الدعم الفني والشبكات');
  const [newCustomerId, setNewCustomerId] = useState(customers[0]?.id || '');

  // Comments Modal State
  const [activeCommentTicket, setActiveCommentTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<TicketCommentItem[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newCommentBody, setNewCommentBody] = useState('');
  const [newCommentIsInternal, setNewCommentIsInternal] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    setLocalTickets(initialTickets);
  }, [initialTickets]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const filteredTickets = localTickets.filter((t) => {
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(t.ticketNumber).includes(searchQuery) ||
      (t.customerPhone && t.customerPhone.includes(searchQuery));
    return matchesStatus && matchesSearch;
  });

  // Calculate high-level SLA metrics
  const totalCount = localTickets.length;
  const newCount = localTickets.filter((t) => t.status === 'new').length;
  const inProgressCount = localTickets.filter((t) => t.status === 'in_progress').length;
  const atRiskCount = localTickets.filter((t) => t.slaStatus === 'at_risk' || t.slaStatus === 'warning').length;

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    setLocalTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus as any } : t))
    );
    try {
      await fetch(`/api/v1/tickets/${ticketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      showToast(`تم تحديث حالة التذكرة إلى: ${newStatus}`);
    } catch {
      showToast('تعذر تحديث حالة التذكرة في السيرفر');
    }
  };

  const handleAssignChange = async (ticketId: string, agentId: string, agentName: string) => {
    setLocalTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, assignedToAgentId: agentId, assignedAgentName: agentName } : t))
    );
    try {
      await fetch(`/api/v1/tickets/${ticketId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, agentName }),
      });
      showToast(`تم إسناد التذكرة إلى: ${agentName}`);
    } catch {
      showToast('تعذر إسناد التذكرة في السيرفر');
    }
  };

  const openCommentsModal = async (ticket: Ticket) => {
    setActiveCommentTicket(ticket);
    setLoadingComments(true);
    try {
      const res = await fetch(`/api/v1/tickets/${ticket.id}/comments`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setComments(data.data);
      } else {
        setComments([]);
      }
    } catch {
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCommentTicket || !newCommentBody.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/v1/tickets/${activeCommentTicket.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: newCommentBody.trim(),
          isInternal: newCommentIsInternal,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setComments((prev) => [...prev, data.data]);
        setNewCommentBody('');
        showToast('تمت إضافة التعليق بنجاح');
      } else {
        showToast(data.error?.message || 'فشل حفظ التعليق');
      }
    } catch {
      showToast('حدث خطأ أثناء حفظ التعليق');
    } finally {
      setSubmittingComment(false);
    }
  };

  // Export Tickets to CSV with UTF-8 BOM for Excel Arabic compatibility
  const exportTicketsToCSV = () => {
    const headers = [
      'رقم التذكرة',
      'عنوان التذكرة',
      'الوصف',
      'اسم العميل',
      'هاتف العميل',
      'الفئة',
      'الأولوية',
      'الحالة',
      'حالة SLA',
      'الموظف المعين',
      'تاريخ الإنشاء',
    ];

    const rows = filteredTickets.map((t) => [
      `#${t.ticketNumber}`,
      `"${t.title.replace(/"/g, '""')}"`,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      `"${t.customerName.replace(/"/g, '""')}"`,
      `"${t.customerPhone || ''}"`,
      `"${t.category}"`,
      t.priority,
      t.status,
      t.slaStatus,
      `"${t.assignedAgentName || 'غير مسند'}"`,
      `"${new Date(t.createdAt).toLocaleString('ar-SA')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `madar-tickets-report-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await onCreateTicket({
      customerId: newCustomerId,
      title: newTitle,
      description: newDesc,
      priority: newPriority,
      category: newCategory,
    });
    setShowCreateModal(false);
    setNewTitle('');
    setNewDesc('');
  };

  return (
    <div className="p-6 h-[calc(100vh-65px)] overflow-y-auto space-y-6 bg-slate-950 text-slate-100">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <TicketIcon className="w-5 h-5 text-emerald-400" />
            <span>نظام إدارة التذاكر واتفاقيات مستوى الخدمة (SLA Engine)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            تتبع أزمنة الاستجابة والحل لضمان الامتثال الصارم لمعايير الجودة ومراقبة المؤشرات
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* Export CSV Button */}
          <button
            onClick={exportTicketsToCSV}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
            title="تصدير التذاكر المصفاة بصيغة Excel CSV المعتمدة"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>تصدير CSV</span>
          </button>

          {/* Status Filter Tabs */}
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
            {['all', 'new', 'in_progress', 'resolved'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg capitalize transition ${
                  statusFilter === st ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {st === 'all' ? 'الكل' : st === 'new' ? 'جديدة' : st === 'in_progress' ? 'قيد العمل' : 'مكتملة'}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>تذكرة جديدة</span>
          </button>
        </div>
      </div>

      {/* High-Level SLA Metric Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-slate-400 text-[11px] mb-1">إجمالي التذاكر المفتوحة</div>
            <div className="text-lg font-bold font-mono text-white">{totalCount}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <TicketIcon className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-slate-400 text-[11px] mb-1">تذاكر جديدة بانتظار الإسناد</div>
            <div className="text-lg font-bold font-mono text-cyan-400">{newCount}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-slate-400 text-[11px] mb-1">قيد المعالجة التشغيلية</div>
            <div className="text-lg font-bold font-mono text-indigo-300">{inProgressCount}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-rose-500/30 p-3.5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-rose-400 text-[11px] mb-1 font-semibold">تحذير أو خطر SLA</div>
            <div className="text-lg font-bold font-mono text-rose-300 flex items-center gap-1.5">
              <span>{atRiskCount}</span>
              {atRiskCount > 0 && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Internal Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-3.5 h-3.5 absolute right-3 top-3 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="تصفية التذاكر بالعنوان، العميل، الهاتف أو رقم التذكرة..."
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-9 pl-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Tickets Table View */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-4 font-semibold">رقم التذكرة</th>
                <th className="p-4 font-semibold">عنوان الحالة والوصف</th>
                <th className="p-4 font-semibold">العميل</th>
                <th className="p-4 font-semibold">الفئة</th>
                <th className="p-4 font-semibold">الأولوية</th>
                <th className="p-4 font-semibold">حالة التذكرة</th>
                <th className="p-4 font-semibold">حالة الـ SLA</th>
                <th className="p-4 font-semibold">الموظف المعين</th>
                <th className="p-4 font-semibold text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredTickets.map((t) => {
                const slaBadge =
                  t.slaStatus === 'healthy'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : t.slaStatus === 'warning'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse';

                return (
                  <tr key={t.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-4 font-mono font-bold text-white">#{t.ticketNumber}</td>
                    <td className="p-4">
                      <div className="font-bold text-slate-100">{t.title}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">{t.description}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-white font-medium">{t.customerName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{t.customerPhone}</div>
                    </td>
                    <td className="p-4 text-slate-300">{t.category}</td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          t.priority === 'urgent'
                            ? 'bg-rose-500/20 text-rose-300 font-bold'
                            : t.priority === 'high'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {t.priority === 'urgent'
                          ? 'حرجة جداً'
                          : t.priority === 'high'
                          ? 'عالية'
                          : t.priority === 'medium'
                          ? 'متوسطة'
                          : 'منخفضة'}
                      </span>
                    </td>
                    {/* Status Dropdown */}
                    <td className="p-4">
                      <select
                        value={t.status}
                        onChange={(e) => handleStatusChange(t.id, e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] font-medium text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="new">جديدة (New)</option>
                        <option value="in_progress">قيد العمل (In Progress)</option>
                        <option value="resolved">مكتملة (Resolved)</option>
                        <option value="closed">مغلقة (Closed)</option>
                      </select>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-medium border ${slaBadge}`}>
                        {t.slaStatus === 'healthy' ? 'ملتزم بالمعيار (Healthy)' : t.slaStatus === 'warning' ? 'تحذير اقتراب (Warning)' : 'خطر التجاوز (At Risk)'}
                      </span>
                    </td>
                    {/* Agent Assignment Selector */}
                    <td className="p-4">
                      <select
                        value={t.assignedToAgentId || ''}
                        onChange={(e) => {
                          const name = e.target.options[e.target.selectedIndex].text;
                          handleAssignChange(t.id, e.target.value, name);
                        }}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500 max-w-[130px] truncate"
                      >
                        <option value="" disabled>بانتظار الإسناد</option>
                        <option value="usr-agent-01">سارة أحمد</option>
                        <option value="usr-agent-02">فهد السالم</option>
                        <option value="usr-agent-03">عمر خالد</option>
                        <option value="usr-agent-04">منى زكي</option>
                      </select>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openCommentsModal(t)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-[11px] font-medium border border-indigo-500/20 transition flex items-center gap-1"
                          title="عرض وإضافة تعليقات التذكرة"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>التعليقات</span>
                        </button>
                        {t.priority !== 'urgent' && (
                          <button
                            onClick={() => onEscalateTicket(t.id)}
                            className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] font-medium border border-rose-500/20 transition flex items-center gap-1"
                            title="تصعيد الحالة لدرجة قصوى"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>تصعيد</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white pb-2 border-b border-slate-800">
              فتح تذكرة دعم فني جديدة
            </h3>

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">العميل المستفيد:</label>
                <select
                  value={newCustomerId}
                  onChange={(e) => setNewCustomerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500"
                >
                  {customers.slice(0, 15).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone}) - {c.customerTier.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">عنوان التذكرة:</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="مثال: انقطاع الخدمة أو طلب استرجاع مالي"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">التصنيف:</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="الفوترة والمدفوعات">الفوترة والمدفوعات</option>
                    <option value="الدعم الفني والشبكات">الدعم الفني والشبكات</option>
                    <option value="باقات التجوال والاشتراكات">باقات التجوال والاشتراكات</option>
                    <option value="شكاوى التأخير">شكاوى التأخير</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">الأولوية (تحدد الـ SLA تلقائياً):</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  >
                    <option value="low">Low (استجابة خلال 60 دقيقة)</option>
                    <option value="medium">Medium (استجابة خلال 30 دقيقة)</option>
                    <option value="high">High (استجابة خلال 15 دقيقة)</option>
                    <option value="urgent">Urgent (طوارئ: استجابة خلال 5 دقائق)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">تفاصيل المشكلة والحل المطلوب:</label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="شرح الإجراءات المتخذة وملاحظات العميل..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  data-close-modal
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  حفظ وإنشاء التذكرة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ticket Comments Modal */}
      {activeCommentTicket && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-400" />
                  <span>تعليقات التذكرة #{activeCommentTicket.ticketNumber}</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-sm">{activeCommentTicket.title}</p>
              </div>
              <button data-close-modal onClick={() => setActiveCommentTicket(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Comments List */}
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {loadingComments ? (
                <div className="py-6 text-center text-xs text-slate-500">جارٍ تحميل التعليقات...</div>
              ) : comments.length > 0 ? (
                comments.map((c) => (
                  <div
                    key={c.id}
                    className={`p-3 rounded-2xl text-xs border ${
                      c.isInternal
                        ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                        : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span className="font-bold text-slate-200">
                        {c.authorName} ({c.authorRole}) {c.isInternal && '• ملاحظة داخلية'}
                      </span>
                      <span className="font-mono">{new Date(c.createdAt).toLocaleTimeString('ar-SA')}</span>
                    </div>
                    <p className="leading-relaxed">{c.body}</p>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-xs text-slate-500">لا توجد تعليقات سابقة على هذه التذكرة</div>
              )}
            </div>

            {/* Add Comment Form */}
            <form onSubmit={handleAddComment} className="space-y-3 pt-2 border-t border-slate-800 text-xs">
              <div>
                <textarea
                  rows={3}
                  required
                  value={newCommentBody}
                  onChange={(e) => setNewCommentBody(e.target.value)}
                  placeholder="أضف تعليقاً فنياً أو رداً على العميل..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="commentInternal"
                    checked={newCommentIsInternal}
                    onChange={(e) => setNewCommentIsInternal(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0"
                  />
                  <label htmlFor="commentInternal" className="text-slate-300 text-xs">ملاحظة داخلية (فريق العمل فقط)</label>
                </div>

                <button
                  type="submit"
                  disabled={submittingComment}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submittingComment ? 'جارٍ الإرسال...' : 'إرسال التعليق'}</span>
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
