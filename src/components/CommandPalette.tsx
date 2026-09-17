/**
 * @file src/components/CommandPalette.tsx
 * Global Command Palette & Universal Omnisearch (Cmd+K / Ctrl+K)
 * Fast keyboard-first search across Tickets, Customers, Conversations, KB, and System Actions
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  Ticket as TicketIcon,
  Users,
  MessageSquare,
  BookOpen,
  Zap,
  PhoneCall,
  Calendar,
  Award,
  Shield,
  FileDown,
  ArrowRight,
  Sparkles,
  Command,
  CornerDownLeft,
  GraduationCap,
  Activity,
  Database,
  Bot,
  TrendingUp,
  Gauge,
  Mail,
  FileSpreadsheet,
} from 'lucide-react';
import { Customer, Ticket, Conversation } from '../types.ts';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  tickets: Ticket[];
  conversations: Conversation[];
  onNavigateToCustomer: (id: string) => void;
  onNavigateToTicket: (id: string) => void;
  onNavigateToConversation: (id: string) => void;
  onNavigateToTab: (tab: string) => void;
  onOpenReportModal: () => void;
  onSwitchRole: (role: string) => void;
  onOpenSoftphone: () => void;
  onOpenGuidedTour?: () => void;
  onOpenDiagnostics?: () => void;
}

type FilterCategory = 'all' | 'tickets' | 'customers' | 'conversations' | 'actions';

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  customers,
  tickets,
  conversations,
  onNavigateToCustomer,
  onNavigateToTicket,
  onNavigateToConversation,
  onNavigateToTab,
  onOpenReportModal,
  onSwitchRole,
  onOpenSoftphone,
  onOpenGuidedTour,
  onOpenDiagnostics,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FilterCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // System Quick Actions
  const quickActions = [
    {
      id: 'act-tour',
      category: 'actions' as const,
      title: 'تشغيل جولة المحاكاة التشغيلية التفاعلية (Guided Scenario Tour)',
      subtitle: 'محاكاة دورة العمل الشاملة من وصول رسالة VIP وحتى الإغلاق والامتثال',
      icon: Sparkles,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      action: () => {
        onClose();
        if (onOpenGuidedTour) onOpenGuidedTour();
      },
    },
    {
      id: 'act-training',
      category: 'actions' as const,
      title: 'أكاديمية التدريب والمحاكاة التفاعلية للوكلاء (AI Roleplay Arena)',
      subtitle: 'سيناريوهات تدريب حية باللهجة المصرية، والـ Global BPO، والخليج العربي',
      icon: GraduationCap,
      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
      action: () => {
        onClose();
        onNavigateToTab('training');
      },
    },
    {
      id: 'act-diagnostics',
      category: 'actions' as const,
      title: 'محرك التشخيص الذاتي الفوري لخطوط VDSL والـ eSIM ومحافظ الدفع',
      subtitle: 'فحص جودة الخط، تفعيل الشرائح، وإنشاء أكواد إنستاباي وفودافون كاش',
      icon: Activity,
      color: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
      action: () => {
        onClose();
        if (onOpenDiagnostics) onOpenDiagnostics();
      },
    },
    {
      id: 'act-recommendations',
      category: 'actions' as const,
      title: 'مركز التوصيات الذكية وتفادي فقدان العملاء (AI Hub)',
      subtitle: 'توصيات استباقية لتقليل Churn وموازنة أعباء الورديات وفق SLA',
      icon: Zap,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      action: () => {
        onClose();
        onNavigateToTab('recommendations');
      },
    },
    {
      id: 'act-automation-sim',
      category: 'actions' as const,
      title: 'محرك أتمتة الإجراءات وسير العمل (Workflow Automations)',
      subtitle: 'إعداد قواعد التصعيد الآلي، رسائل واتساب المشروطة، والتوجيه الذكي',
      icon: Zap,
      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
      action: () => {
        onClose();
        onNavigateToTab('automation');
      },
    },
    {
      id: 'act-cloud-db',
      category: 'actions' as const,
      title: 'مركز السحابة وقواعد البيانات المزدوجة (Cloud SQL & Firestore Hub)',
      subtitle: 'فحص اتصالات PostgreSQL (europe-west2) ومجموعات وثائق Firestore اللحظية',
      icon: Database,
      color: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
      action: () => {
        onClose();
        onNavigateToTab('cloud_db');
      },
    },
    {
      id: 'act-agentic-ai',
      category: 'actions' as const,
      title: 'وكلاء الذكاء الاصطناعي الذاتيون وحراسة البيانات (Agentic AI & PII)',
      subtitle: 'تنفيذ الإجراءات المؤسسية ذاتياً (TR-069، باقات الطوارئ، تسويات الفواتير) وحجب PII',
      icon: Bot,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      action: () => {
        onClose();
        onNavigateToTab('agentic_ai');
      },
    },
    {
      id: 'act-predictive-cx',
      category: 'actions' as const,
      title: 'التحليلات التنبؤية وصوت العميل (Predictive CSAT & VoC Clusters)',
      subtitle: 'التنبؤ اللحظي باحتمالية مغادرة العميل Churn Risk وتجميع الأسباب الجذرية RCA',
      icon: TrendingUp,
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      action: () => {
        onClose();
        onNavigateToTab('predictive_cx');
      },
    },
    {
      id: 'act-gmail-hub',
      category: 'actions' as const,
      title: 'مركز بريد Gmail ودعم العملاء الموحد (Gmail Workspace Hub)',
      subtitle: 'قراءة الرسائل الواردة، الرد الذكي المساعد، وتحويل الإيميلات إلى تذاكر SLA',
      icon: Mail,
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      action: () => {
        onClose();
        onNavigateToTab('gmail_hub');
      },
    },
    {
      id: 'act-sheets-hub',
      category: 'actions' as const,
      title: 'تكامل جداول Google Sheets وتصدير التقارير (Sheets Live Sync)',
      subtitle: 'مزامنة التذاكر، مؤشرات الأداء KIPs، وجداول الدعم آلياً إلى Google Drive',
      icon: FileSpreadsheet,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      action: () => {
        onClose();
        onNavigateToTab('sheets_hub');
      },
    },
    {
      id: 'act-enterprise-scale',
      category: 'actions' as const,
      title: 'التكامل المؤسسي واختبار الإجهاد والأحمال (Enterprise & Stress Test)',
      subtitle: 'موصلات Salesforce/Dynamics ومحاكي إجهاد حتى 5000 جلسة وتحكم Canary Rollout',
      icon: Gauge,
      color: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
      action: () => {
        onClose();
        onNavigateToTab('enterprise_scale');
      },
    },
    {
      id: 'act-report',
      category: 'actions' as const,
      title: 'استخراج التقرير التنفيذي الشامل (PDF & Excel)',
      subtitle: 'تقرير الأداء، الالتزام باتفاقيات الخدمة SLA، وجاهزية الفرق',
      icon: FileDown,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      action: () => {
        onClose();
        onOpenReportModal();
      },
    },
    {
      id: 'act-ticket-new',
      category: 'actions' as const,
      title: 'إنشاء تذكرة دعم فني جديدة',
      subtitle: 'فتح تذكرة فورية وربطها بالعميل مع حساب زمن SLA التلقائي',
      icon: TicketIcon,
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      action: () => {
        onClose();
        onNavigateToTab('tickets');
      },
    },
    {
      id: 'act-call-new',
      category: 'actions' as const,
      title: 'إجراء مكالمة هاتفية صادرة (Softphone)',
      subtitle: 'تشغيل الهاتف السحابي وطلب رقم عميل مع تسجيل فوري',
      icon: PhoneCall,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      action: () => {
        onClose();
        onOpenSoftphone();
      },
    },
    {
      id: 'act-wfm-shift',
      category: 'actions' as const,
      title: 'إدارة القوى العاملة وجدولة الورديات (WFM)',
      subtitle: 'حساب Erlang C ومراقبة نسب الالتزام الزمني ومناوبات الوكلاء',
      icon: Calendar,
      color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
      action: () => {
        onClose();
        onNavigateToTab('wfm');
      },
    },
    {
      id: 'act-qa-plan',
      category: 'actions' as const,
      title: 'تقييم الجودة وإنشاء خطة تطوير (QA & Coaching)',
      subtitle: 'مراجعة المعايير وتكليف الوكلاء بأهداف تدريبية ونسب تقدم',
      icon: Award,
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      action: () => {
        onClose();
        onNavigateToTab('qa');
      },
    },
    {
      id: 'act-role-supervisor',
      category: 'actions' as const,
      title: 'التبديل إلى دور المشرف (Supervisor Role)',
      subtitle: 'صلاحيات كاملة للمراقبة الحية والتدخل في المكالمات وتصعيد التذاكر',
      icon: Shield,
      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
      action: () => {
        onClose();
        onSwitchRole('Supervisor');
      },
    },
    {
      id: 'act-role-agent',
      category: 'actions' as const,
      title: 'التبديل إلى دور الوكيل (Agent Role)',
      subtitle: 'واجهة مخصصة لاستقبال الشات والردود واقتراحات المساعد الذكي',
      icon: Shield,
      color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
      action: () => {
        onClose();
        onSwitchRole('Agent');
      },
    },
    {
      id: 'act-backup-download',
      category: 'actions' as const,
      title: 'تنزيل نسخة احتياطية فورية من قاعدة البيانات (JSON)',
      subtitle: 'أرشفة دائمة لكافة التذاكر، العملاء، المحادثات وسجلات التدقيق',
      icon: FileDown,
      color: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
      action: () => {
        window.open('/api/v1/system/backup', '_blank');
        onClose();
      },
    },
  ];

  // KB Articles Sample Matches
  const kbArticles = [
    {
      id: 'kb-1',
      title: 'سياسة التعويض التلقائي عند انقطاع الخدمة',
      category: 'السياسات المالية',
      tags: 'تعويض, خصم, انقطاع',
    },
    {
      id: 'kb-2',
      title: 'دليل تفعيل الشريحة المدمجة (eSIM) للأجهزة الذكية',
      category: 'الدعم التقني',
      tags: 'esim, شريحة, تفعيل, qr',
    },
    {
      id: 'kb-3',
      title: 'معايير تصعيد الشكاوى لهيئة الاتصالات والفضاء والتقنية (CST)',
      category: 'الحوكمة والامتثال',
      tags: 'هيئة الاتصالات, شكوى, تصعيد, نظامي',
    },
  ];

  const q = query.toLowerCase().trim();

  // Filtered Tickets
  const filteredTickets = tickets
    .filter((t) => {
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.ticketNumber.toString().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.priority.toLowerCase().includes(q)
      );
    })
    .slice(0, 5)
    .map((t) => ({
      id: `ticket-${t.id}`,
      type: 'ticket' as const,
      title: `#${t.ticketNumber} - ${t.title}`,
      subtitle: `العميل: ${t.customerName} | الأولوية: ${t.priority} | الحالة: ${t.status}`,
      icon: TicketIcon,
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      action: () => {
        onClose();
        onNavigateToTicket(t.id);
      },
    }));

  // Filtered Customers
  const filteredCustomers = customers
    .filter((c) => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        c.customerTier.toLowerCase().includes(q)
      );
    })
    .slice(0, 5)
    .map((c) => ({
      id: `customer-${c.id}`,
      type: 'customer' as const,
      title: c.name,
      subtitle: `الهاتف: ${c.phone || 'غير مسجل'} | الفئة: ${c.customerTier.toUpperCase()} | القيمة: $${c.lifetimeValue}`,
      icon: Users,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      action: () => {
        onClose();
        onNavigateToCustomer(c.id);
      },
    }));

  // Filtered Conversations
  const filteredConversations = conversations
    .filter((conv) => {
      if (!q) return true;
      return (
        conv.customerName.toLowerCase().includes(q) ||
        conv.channel.toLowerCase().includes(q) ||
        (conv.latestMessageSnippet && conv.latestMessageSnippet.toLowerCase().includes(q))
      );
    })
    .slice(0, 5)
    .map((conv) => ({
      id: `conv-${conv.id}`,
      type: 'conversation' as const,
      title: `محادثة ${conv.customerName} (${conv.channel})`,
      subtitle: conv.latestMessageSnippet || 'لا توجد رسائل سابقة',
      icon: MessageSquare,
      color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
      action: () => {
        onClose();
        onNavigateToConversation(conv.id);
      },
    }));

  // Filtered KB
  const filteredKB = kbArticles
    .filter((kb) => {
      if (!q) return true;
      return (
        kb.title.toLowerCase().includes(q) ||
        kb.category.toLowerCase().includes(q) ||
        kb.tags.toLowerCase().includes(q)
      );
    })
    .slice(0, 4)
    .map((kb) => ({
      id: `kb-${kb.id}`,
      type: 'kb' as const,
      title: kb.title,
      subtitle: `التصنيف: ${kb.category} | الكلمات الدلالية: ${kb.tags}`,
      icon: BookOpen,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      action: () => {
        onClose();
        onNavigateToTab('knowledge_base');
      },
    }));

  // Filtered Actions
  const filteredActions = quickActions
    .filter((act) => {
      if (!q) return true;
      return act.title.toLowerCase().includes(q) || act.subtitle.toLowerCase().includes(q);
    })
    .map((act) => ({
      ...act,
      type: 'action' as const,
    }));

  // Assemble full items based on category
  const allResults = [
    ...(category === 'all' || category === 'actions' ? filteredActions : []),
    ...(category === 'all' || category === 'tickets' ? filteredTickets : []),
    ...(category === 'all' || category === 'customers' ? filteredCustomers : []),
    ...(category === 'all' || category === 'conversations' ? filteredConversations : []),
    ...(category === 'all' ? filteredKB : []),
  ];

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < allResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allResults[selectedIndex]) {
        allResults[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-700/70 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Top Search Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800 bg-slate-900/90">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="ابحث عن تذكرة، عميل، هاتف، مقال، أو إجراء سريع..."
            className="w-full bg-transparent text-slate-100 placeholder:text-slate-500 text-base focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-1 bg-slate-800/80 border border-slate-700 px-2 py-1 rounded-md text-xs text-slate-400">
            <span>Esc</span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-950/50 border-b border-slate-800/60 overflow-x-auto text-xs">
          {(
            [
              { id: 'all', label: 'الكل' },
              { id: 'actions', label: 'إجراءات سريعة' },
              { id: 'tickets', label: 'التذاكر' },
              { id: 'customers', label: 'العملاء' },
              { id: 'conversations', label: 'المحادثات' },
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setCategory(cat.id);
                setSelectedIndex(0);
              }}
              className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                category === cat.id
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-slate-800/30">
          {allResults.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Search className="w-8 h-8 mx-auto text-slate-600 mb-2 opacity-50" />
              <p className="text-sm font-medium">لا توجد نتائج تطابق "{query}"</p>
              <p className="text-xs text-slate-500 mt-1">جرب البحث برقم التذكرة أو اسم العميل أو جزء من السؤال.</p>
            </div>
          ) : (
            allResults.map((item, index) => {
              const isSelected = index === selectedIndex;
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-slate-800/90 text-white shadow-sm border border-slate-700/80'
                      : 'text-slate-300 hover:bg-slate-800/40 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg border shrink-0 ${item.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{item.title}</span>
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{item.subtitle}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isSelected && (
                      <div className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                        <span>اختيار</span>
                        <CornerDownLeft className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-t border-slate-800 text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300">↑↓</kbd>
              <span>للتنقل</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300">Enter</kbd>
              <span>للاختيار والتنفيذ</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300">Esc</kbd>
              <span>للإغلاق</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px]">نظام التشغيل المدعوم بالذكاء الاصطناعي</span>
          </div>
        </div>
      </div>
    </div>
  );
};
