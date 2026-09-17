/**
 * @file src/components/Header.tsx
 * Top Navigation Bar with Role Switcher, Universal Search, Notifications Center, Zero-Cost Mode & AI Budget Monitor
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Shield,
  Zap,
  Phone,
  Search,
  Bell,
  Cpu,
  UserCheck,
  CheckCircle2,
  DollarSign,
  Headphones,
  Languages,
  Clock,
  X,
  AlertTriangle,
  Ticket as TicketIcon,
  MessageSquare,
  Users,
  ChevronLeft,
  Sparkles,
  ExternalLink,
  FileSpreadsheet,
  Radio,
  Command,
  Globe,
  Activity,
  Wifi,
} from 'lucide-react';
import { Customer, Ticket, Conversation } from '../types.ts';
import { GoogleWorkspaceAuthButton } from './GoogleWorkspaceAuthButton';

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  type: 'critical' | 'warning' | 'info';
  timestamp: string;
  actionTab?: 'tickets' | 'inbox' | 'voice' | 'live_ops';
  targetId?: string;
  read: boolean;
}

interface HeaderProps {
  currentRole: string;
  onRoleChange: (role: string) => void;
  zeroCostMode: boolean;
  onToggleZeroCost: () => void;
  aiSpend: number;
  aiBudget: number;
  onOpenSoftphone: () => void;
  activeCallCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  customers?: Customer[];
  tickets?: Ticket[];
  conversations?: Conversation[];
  onNavigateToCustomer?: (customerId: string) => void;
  onNavigateToTicket?: (ticketId: string) => void;
  onNavigateToConversation?: (conversationId: string) => void;
  onOpenCommandPalette?: () => void;
  onOpenExecutiveReport?: () => void;
  onOpenGuidedTour?: () => void;
  onOpenDiagnostics?: () => void;
  isSseConnected?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onRoleChange,
  zeroCostMode,
  onToggleZeroCost,
  aiSpend,
  aiBudget,
  onOpenSoftphone,
  activeCallCount,
  searchQuery,
  onSearchChange,
  customers = [],
  tickets = [],
  conversations = [],
  onNavigateToCustomer,
  onNavigateToTicket,
  onNavigateToConversation,
  onOpenCommandPalette,
  onOpenExecutiveReport,
  onOpenGuidedTour,
  onOpenDiagnostics,
  isSseConnected = true,
}) => {
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);
  const [regionConfig, setRegionConfig] = useState<{
    currentRegion: 'EG' | 'SA' | 'AE' | 'GLOBAL';
    currency: string;
    regulatoryBody: string;
    dataProtectionLaw: string;
  }>({
    currentRegion: 'EG',
    currency: 'EGP',
    regulatoryBody: 'الجهاز القومي لتنظيم الاتصالات المصري (NTRA)',
    dataProtectionLaw: 'قانون حماية البيانات الشخصية رقم 151 لسنة 2020',
  });

  const regionContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/v1/regional/config')
      .then((r) => r.json())
      .then((d) => d.success && setRegionConfig(d.data))
      .catch(() => {});
  }, []);

  const handleSwitchRegion = async (region: 'EG' | 'SA' | 'GLOBAL', curr: string) => {
    try {
      const res = await fetch('/api/v1/regional/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region, currency: curr }),
      });
      const d = await res.json();
      if (d.success) {
        setRegionConfig(d.data);
        setShowRegionDropdown(false);
      }
    } catch {}
  };
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const notifContainerRef = useRef<HTMLDivElement>(null);

  // Live Mock System Notifications with Arabic domain context
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-1',
      title: 'تحذير اقتراب انتهاء SLA',
      description: 'التذكرة #1002 للعميل أحمد الغامدي متبقي عليها 11 دقيقة للاستجابة الأولية.',
      type: 'critical',
      timestamp: 'منذ دقيقتين',
      actionTab: 'tickets',
      targetId: 'tck-1002',
      read: false,
    },
    {
      id: 'notif-2',
      title: 'محادثة واردة ذات أولوية VIP',
      description: 'سارة العتيبي (فئة VIP) ترغب بالاستفسار عن تجديد اشتراك الأعمال عبر واتساب.',
      type: 'warning',
      timestamp: 'منذ 5 دقائق',
      actionTab: 'inbox',
      targetId: 'conv-001',
      read: false,
    },
    {
      id: 'notif-3',
      title: 'فحص سياسات الذكاء الاصطناعي (Anti-Hallucination)',
      description: 'تم اعتماد مسودة الرد الآلي بنسبة ثقة 98% وتأكيد الاستناد إلى مستودع السياسات المعتمد.',
      type: 'info',
      timestamp: 'منذ 15 دقيقة',
      actionTab: 'live_ops',
      read: true,
    },
  ]);

  const roles = [
    { key: 'Supervisor', label: 'مشرف عمليات (Supervisor)' },
    { key: 'Agent', label: 'وكيل خدمة (Agent)' },
    { key: 'QA', label: 'مسؤول جودة (QA Lead)' },
    { key: 'Analyst', label: 'محلل بيانات (Analyst)' },
    { key: 'Admin', label: 'مدير النظام (Admin)' },
    { key: 'Owner', label: 'مالك المنصة (Owner)' },
  ];

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
      if (notifContainerRef.current && !notifContainerRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter search results across collections
  const q = searchQuery.trim().toLowerCase();
  const matchedCustomers = q
    ? customers
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.phone && c.phone.includes(q)) ||
            (c.email && c.email.toLowerCase().includes(q))
        )
        .slice(0, 3)
    : [];

  const matchedTickets = q
    ? tickets
        .filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            String(t.ticketNumber).includes(q) ||
            t.customerName.toLowerCase().includes(q)
        )
        .slice(0, 3)
    : [];

  const matchedConversations = q
    ? conversations
        .filter(
          (c) =>
            c.customerName.toLowerCase().includes(q) ||
            (c.latestMessageSnippet && c.latestMessageSnippet.toLowerCase().includes(q))
        )
        .slice(0, 3)
    : [];

  const totalResults = matchedCustomers.length + matchedTickets.length + matchedConversations.length;

  const unreadNotifsCount = notifications.filter((n) => !n.read).length;

  const markAllNotifsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const dismissNotif = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 px-5 py-3 sticky top-0 z-40 flex items-center justify-between gap-4 shadow-sm select-none">
      {/* Brand & Organization Title */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-bold shadow-md shadow-emerald-950/40">
          <Headphones className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              <span>نظام تشغيل مركز الاتصال الذكي</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono border border-emerald-500/30">
                OS v1.0
              </span>
            </h1>
          </div>
          <p className="text-xs text-slate-400">
            شركة مدار لخدمات العملاء والاتصالات (Madar Enterprise MEA)
          </p>
        </div>
      </div>

      {/* Global Search Bar with Live Instant Results Overlay */}
      <div ref={searchContainerRef} className="hidden md:flex items-center flex-1 max-w-md relative">
        <Search className="w-4 h-4 absolute right-3 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onFocus={() => setShowSearchDropdown(true)}
          onChange={(e) => {
            onSearchChange(e.target.value);
            setShowSearchDropdown(true);
          }}
          placeholder="بحث شامل بالعميل، التذكرة، أو نص الرسالة..."
          className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pr-9 pl-20 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        />
        <div className="absolute left-2.5 flex items-center gap-1.5">
          {searchQuery ? (
            <button
              onClick={() => {
                onSearchChange('');
                setShowSearchDropdown(false);
              }}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onOpenCommandPalette}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-mono text-slate-400 transition-colors"
              title="فتح لوحة الأوامر السريعة (Cmd+K)"
            >
              <Command className="w-2.5 h-2.5" />
              <span>K</span>
            </button>
          )}
        </div>

        {/* Live Search Results Popup Dropdown */}
        {showSearchDropdown && searchQuery.trim() && (
          <div className="absolute top-full right-0 left-0 mt-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3 z-50 max-h-96 overflow-y-auto space-y-3">
            {totalResults === 0 ? (
              <div className="text-center py-4 text-xs text-slate-400">
                لا توجد نتائج مطابقة لـ &quot;{searchQuery}&quot;
              </div>
            ) : (
              <>
                {/* 1. Customers Results */}
                {matchedCustomers.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center gap-1.5 px-2">
                      <Users className="w-3 h-3 text-emerald-400" />
                      <span>العملاء ({matchedCustomers.length})</span>
                    </div>
                    <div className="space-y-1">
                      {matchedCustomers.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => {
                            onNavigateToCustomer?.(c.id);
                            setShowSearchDropdown(false);
                          }}
                          className="p-2 rounded-xl hover:bg-slate-800 cursor-pointer flex items-center justify-between transition"
                        >
                          <div>
                            <div className="text-xs font-bold text-white">{c.name}</div>
                            <div className="text-[10px] font-mono text-slate-400">{c.phone}</div>
                          </div>
                          {c.customerTier === 'vip' ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                              VIP
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">
                              {c.customerTier === 'priority' ? 'أولوية' : 'قياسي'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Tickets Results */}
                {matchedTickets.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center gap-1.5 px-2 pt-1 border-t border-slate-800/80">
                      <TicketIcon className="w-3 h-3 text-cyan-400" />
                      <span>التذاكر والـ SLA ({matchedTickets.length})</span>
                    </div>
                    <div className="space-y-1">
                      {matchedTickets.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => {
                            onNavigateToTicket?.(t.id);
                            setShowSearchDropdown(false);
                          }}
                          className="p-2 rounded-xl hover:bg-slate-800 cursor-pointer flex items-center justify-between transition"
                        >
                          <div>
                            <div className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span className="text-cyan-400 font-mono">#{t.ticketNumber}</span>
                              <span className="truncate max-w-xs">{t.title}</span>
                            </div>
                            <div className="text-[10px] text-slate-400">العميل: {t.customerName}</div>
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                              t.priority === 'urgent'
                                ? 'bg-rose-500/20 text-rose-300'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {t.priority === 'urgent' ? 'حرجة' : t.priority}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Conversations Results */}
                {matchedConversations.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center gap-1.5 px-2 pt-1 border-t border-slate-800/80">
                      <MessageSquare className="w-3 h-3 text-indigo-400" />
                      <span>المحادثات الموحدة ({matchedConversations.length})</span>
                    </div>
                    <div className="space-y-1">
                      {matchedConversations.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => {
                            onNavigateToConversation?.(c.id);
                            setShowSearchDropdown(false);
                          }}
                          className="p-2 rounded-xl hover:bg-slate-800 cursor-pointer flex items-center justify-between transition"
                        >
                          <div className="truncate max-w-xs">
                            <div className="text-xs font-bold text-white">{c.customerName}</div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {c.latestMessageSnippet}
                            </div>
                          </div>
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {c.channel}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* System Controls & Operators */}
      <div className="flex items-center gap-2.5">
        {/* Riyadh Timezone Indicator */}
        <div
          className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs font-mono"
          title="التوقيت القياسي لمركز العمليات (توقيت مكة والرياض GMT+3)"
        >
          <Clock className="w-3.5 h-3.5 text-emerald-400" />
          <span>توقيت الرياض GMT+3</span>
        </div>

        {/* Primary Language Indicator */}
        <div
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 text-xs font-semibold"
          title="اللغة العربية هي اللغة الأساسية المعتمدة للمنصة ومراكز الاتصال"
        >
          <Languages className="w-3.5 h-3.5 text-emerald-400" />
          <span>العربية (الرئيسية)</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
        </div>

        {/* Interactive Notification Bell */}
        <div ref={notifContainerRef} className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="مركز التنبيهات والإشعارات اللحظية"
          >
            <Bell className="w-4 h-4 text-slate-300" />
            {unreadNotifsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-mono font-bold flex items-center justify-center animate-pulse">
                {unreadNotifsCount}
              </span>
            )}
          </button>

          {/* Notifications Drawer Dropdown */}
          {showNotifications && (
            <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-4 z-50 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">التنبيهات اللحظية</span>
                  {unreadNotifsCount > 0 && (
                    <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      {unreadNotifsCount} غير مقروءة
                    </span>
                  )}
                </div>
                {unreadNotifsCount > 0 && (
                  <button
                    onClick={markAllNotifsRead}
                    className="text-[11px] text-emerald-400 hover:underline"
                  >
                    تحديد الكل كمقروء
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">
                    لا توجد تنبيهات جديدة في الوقت الراهن
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-3 rounded-xl border text-xs space-y-1 transition ${
                        !n.read
                          ? 'bg-slate-950/80 border-slate-700'
                          : 'bg-slate-950/40 border-slate-800/60 opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-bold text-xs flex items-center gap-1.5 ${
                            n.type === 'critical'
                              ? 'text-rose-400'
                              : n.type === 'warning'
                              ? 'text-amber-300'
                              : 'text-cyan-400'
                          }`}
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{n.title}</span>
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">{n.timestamp}</span>
                      </div>

                      <p className="text-[11px] text-slate-300 leading-relaxed">{n.description}</p>

                      <div className="pt-2 flex items-center justify-between">
                        <button
                          onClick={() => {
                            if (n.actionTab === 'tickets' && n.targetId) {
                              onNavigateToTicket?.(n.targetId);
                            } else if (n.actionTab === 'inbox' && n.targetId) {
                              onNavigateToConversation?.(n.targetId);
                            }
                            setShowNotifications(false);
                          }}
                          className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                        >
                          <span>عرض التفاصيل</span>
                          <ChevronLeft className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => dismissNotif(n.id)}
                          className="text-[10px] text-slate-500 hover:text-slate-300"
                        >
                          تجاهل
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* SSE Real-Time Stream Status Indicator */}
        <div
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
            isSseConnected
              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
              : 'bg-amber-950/40 text-amber-300 border-amber-500/30'
          }`}
          title={isSseConnected ? 'الاتصال اللحظي المباشر عبر SSE نشط ومستقر' : 'جارٍ إعادة الاتصال بالبث اللحظي...'}
        >
          <span className="relative flex h-2 w-2">
            {isSseConnected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isSseConnected ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            ></span>
          </span>
          <span className="text-[11px]">{isSseConnected ? 'بث حي (SSE)' : 'إعادة الاتصال...'}</span>
        </div>

        {/* Regional Hub & Compliance Selector (Egypt / Gulf / Global BPO) */}
        <div className="relative" ref={regionContainerRef}>
          <button
            onClick={() => setShowRegionDropdown(!showRegionDropdown)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-indigo-500/40 transition-all shadow-sm"
            title="تبديل النطاق الإقليمي والتنظيمي (مصر / الخليج / التعهيد العالمي)"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-mono">
              {regionConfig.currentRegion === 'EG'
                ? '🇪🇬 مصر (NTRA)'
                : regionConfig.currentRegion === 'SA'
                ? '🇸🇦 السعودية (CST)'
                : '🌐 Global BPO'}
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 text-emerald-400 font-mono">
              {regionConfig.currency}
            </span>
          </button>

          {showRegionDropdown && (
            <div className="absolute left-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2.5 z-50 text-xs space-y-1.5">
              <div className="text-[10px] font-bold text-slate-400 px-2 py-1">النطاق والاشتراطات التنظيمية:</div>
              <button
                onClick={() => handleSwitchRegion('EG', 'EGP')}
                className={`w-full text-right p-2 rounded-xl flex items-center justify-between transition ${
                  regionConfig.currentRegion === 'EG'
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                    : 'hover:bg-slate-800 text-slate-200'
                }`}
              >
                <div>
                  <div className="font-bold flex items-center gap-1.5">
                    <span>🇪🇬 مصر (مركز العمليات الإقليمي)</span>
                  </div>
                  <div className="text-[10px] text-slate-400">NTRA • إنستاباي • فودافون كاش</div>
                </div>
                <span className="font-mono text-[11px] text-emerald-400 font-bold">EGP</span>
              </button>

              <button
                onClick={() => handleSwitchRegion('SA', 'SAR')}
                className={`w-full text-right p-2 rounded-xl flex items-center justify-between transition ${
                  regionConfig.currentRegion === 'SA'
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                    : 'hover:bg-slate-800 text-slate-200'
                }`}
              >
                <div>
                  <div className="font-bold flex items-center gap-1.5">
                    <span>🇸🇦 السعودية والخليج العربي</span>
                  </div>
                  <div className="text-[10px] text-slate-400">CST • SDAIA • مدى • سداد</div>
                </div>
                <span className="font-mono text-[11px] text-emerald-400 font-bold">SAR</span>
              </button>

              <button
                onClick={() => handleSwitchRegion('GLOBAL', 'USD')}
                className={`w-full text-right p-2 rounded-xl flex items-center justify-between transition ${
                  regionConfig.currentRegion === 'GLOBAL'
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                    : 'hover:bg-slate-800 text-slate-200'
                }`}
              >
                <div>
                  <div className="font-bold flex items-center gap-1.5">
                    <span>🌐 Global BPO & Enterprise</span>
                  </div>
                  <div className="text-[10px] text-slate-400">GDPR • SOC-2 • Stripe • Multi-Voice</div>
                </div>
                <span className="font-mono text-[11px] text-emerald-400 font-bold">USD</span>
              </button>
            </div>
          )}
        </div>

        {/* Autonomous Network & Billing Diagnostics Button */}
        <button
          onClick={onOpenDiagnostics}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-teal-600/30 to-emerald-600/30 hover:from-teal-600/50 hover:to-emerald-600/50 text-teal-200 border border-teal-500/40 hover:border-teal-400 transition-all shadow-sm"
          title="تشغيل محرك التشخيص الفني الذاتي للخطوط والـ eSIM ومحافظ الدفع"
        >
          <Activity className="w-3.5 h-3.5 text-teal-400 animate-pulse" />
          <span className="hidden sm:inline">تشخيص الخط / eSIM (⚡)</span>
        </button>

        {/* Guided Walkthrough Scenario Tour Button */}
        <button
          onClick={onOpenGuidedTour}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-600/30 to-indigo-600/30 hover:from-emerald-600/50 hover:to-indigo-600/50 text-emerald-200 border border-emerald-500/40 hover:border-emerald-400 transition-all shadow-sm"
          title="تشغيل جولة المحاكاة التشغيلية التفاعلية الحية (End-to-End Walkthrough)"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span className="hidden sm:inline">جولة المحاكاة (⚡)</span>
        </button>

        {/* Executive Report & Export Modal Button */}
        <button
          onClick={onOpenExecutiveReport}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-emerald-500/50 transition-all"
          title="عرض التقرير التنفيذي الشامل وتصدير ملفات Excel و PDF"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden md:inline">التقرير التنفيذي</span>
        </button>

        {/* Softphone Quick Dial Button */}
        <button
          onClick={onOpenSoftphone}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            activeCallCount > 0
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
          }`}
          title="فتح لوحة الهاتف الصوتي والاتصالات"
        >
          <Phone className="w-3.5 h-3.5 text-emerald-400" />
          <span>الهاتف الرقمي</span>
          {activeCallCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block animate-ping" />
          )}
        </button>

        {/* Zero-Cost Mode Toggle */}
        <button
          onClick={onToggleZeroCost}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            zeroCostMode
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50'
              : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600'
          }`}
          title={
            zeroCostMode
              ? 'وضع التكلفة الصفرية مفعّل: يعتمد على المعالجة المحلية الآمنة 100%'
              : 'الوضع السحابي الذكي مفعّل مع Google Gemini Flash'
          }
        >
          <Cpu className={`w-3.5 h-3.5 ${zeroCostMode ? 'text-emerald-400' : 'text-cyan-400'}`} />
          <span>{zeroCostMode ? 'وضع التكلفة الصفرية: نشط' : 'الذكاء السحابي: نشط'}</span>
        </button>

        {/* AI Budget Meter */}
        <div className="hidden lg:flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
          <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-slate-400">ميزانية الـ AI:</span>
          <span className="font-mono font-bold text-slate-200">
            ${aiSpend.toFixed(2)} / ${aiBudget.toFixed(0)}
          </span>
          <div className="w-12 bg-slate-800 h-1.5 rounded-full overflow-hidden mr-1">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, (aiSpend / aiBudget) * 100)}%` }}
            />
          </div>
        </div>

        {/* Google Workspace Connection Status Button */}
        <GoogleWorkspaceAuthButton compact />

        {/* RBAC Role Switcher */}
        <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 rounded-lg px-2.5 py-1">
          <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs text-slate-400">الدور:</span>
          <select
            value={currentRole}
            onChange={(e) => onRoleChange(e.target.value)}
            className="bg-transparent text-xs font-semibold text-slate-100 focus:outline-none cursor-pointer"
          >
            {roles.map((r) => (
              <option key={r.key} value={r.key} className="bg-slate-900 text-slate-200">
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
};

