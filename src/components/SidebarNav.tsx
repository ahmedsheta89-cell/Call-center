/**
 * @file src/components/SidebarNav.tsx
 * Modern Hierarchical Enterprise Sidebar Navigation for OmniFlow AI Contact Center OS
 * Features:
 * - 4 Structured Domains (Operations, Autonomous AI, Enterprise Infrastructure, Workforce & Governance)
 * - Domain Filter Chips & Quick Search
 * - Expandable / Compact Rail Mode
 * - Real-time Badges, Accent Indicators & System Health Telemetry
 */

import React, { useState, useMemo } from 'react';
import {
  Activity,
  MessageSquare,
  PhoneCall,
  Ticket as TicketIcon,
  Users,
  BrainCircuit,
  Award,
  ShieldCheck,
  BookOpen,
  Share2,
  Calendar,
  Zap,
  Sparkles,
  GraduationCap,
  Database,
  Bot,
  TrendingUp,
  Gauge,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  SlidersHorizontal,
  Layers,
  CheckCircle2,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Mail,
  FileSpreadsheet,
} from 'lucide-react';

export type ActiveTab =
  | 'live_ops'
  | 'inbox'
  | 'gmail_hub'
  | 'voice'
  | 'tickets'
  | 'customers'
  | 'recommendations'
  | 'training'
  | 'cloud_db'
  | 'sheets_hub'
  | 'agentic_ai'
  | 'predictive_cx'
  | 'enterprise_scale'
  | 'knowledge_base'
  | 'integrations'
  | 'wfm'
  | 'automation'
  | 'ai_analyst'
  | 'qa'
  | 'audit';

export type DomainId = 'all' | 'ops' | 'ai' | 'enterprise' | 'governance';

export interface NavItemConfig {
  id: ActiveTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeColor?: string;
  tag?: string;
  tagColor?: string;
}

export interface DomainCategory {
  id: DomainId;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  items: NavItemConfig[];
}

interface SidebarNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  openConversationsCount: number;
  activeCallsCount: number;
  slaAtRiskCount: number;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeTab,
  onSelectTab,
  openConversationsCount,
  activeCallsCount,
  slaAtRiskCount,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<DomainId>('all');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // 4 Structured Domains
  const categories: DomainCategory[] = useMemo(
    () => [
      {
        id: 'ops',
        title: 'العمليات والاتصالات الموحدة',
        subtitle: 'Omnichannel Ops',
        icon: Activity,
        accentColor: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
        items: [
          {
            id: 'live_ops',
            label: 'مركز العمليات المباشر',
            shortLabel: 'العمليات',
            icon: Activity,
          },
          {
            id: 'inbox',
            label: 'صندوق المحادثات الموحد',
            shortLabel: 'المحادثات',
            icon: MessageSquare,
            badge: openConversationsCount,
            badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
          },
          {
            id: 'gmail_hub',
            label: 'بريد Gmail والدعم الموحد',
            shortLabel: 'Gmail',
            icon: Mail,
            tag: 'Google',
            tagColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          },
          {
            id: 'voice',
            label: 'الاتصالات الهاتفية والـ IVR',
            shortLabel: 'الهاتف',
            icon: PhoneCall,
            badge: activeCallsCount > 0 ? activeCallsCount : undefined,
            badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse',
          },
          {
            id: 'tickets',
            label: 'التذاكر وإدارة الـ SLA',
            shortLabel: 'التذاكر',
            icon: TicketIcon,
            badge: slaAtRiskCount > 0 ? slaAtRiskCount : undefined,
            badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          },
          {
            id: 'customers',
            label: 'سجلات العملاء 360°',
            shortLabel: 'العملاء',
            icon: Users,
          },
        ],
      },
      {
        id: 'ai',
        title: 'الذكاء الاصطناعي والأتمتة',
        subtitle: 'Autonomous AI & Intel',
        icon: Bot,
        accentColor: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
        items: [
          {
            id: 'agentic_ai',
            label: 'الوكلاء المستقلون وحراسة PII',
            shortLabel: 'الوكلاء PII',
            icon: Bot,
            tag: 'L3 Auto',
            tagColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
          },
          {
            id: 'predictive_cx',
            label: 'التحليلات التنبؤية وصوت العميل',
            shortLabel: 'التنبؤي VoC',
            icon: TrendingUp,
            tag: 'Churn',
            tagColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
          },
          {
            id: 'recommendations',
            label: 'التوصيات الذكية الشاملة',
            shortLabel: 'التوصيات',
            icon: Sparkles,
          },
          {
            id: 'ai_analyst',
            label: 'محلل الذكاء الاصطناعي',
            shortLabel: 'المحلل',
            icon: BrainCircuit,
          },
          {
            id: 'automation',
            label: 'الأتمتة وقواعد التوجيه',
            shortLabel: 'الأتمتة',
            icon: Zap,
          },
        ],
      },
      {
        id: 'enterprise',
        title: 'البنية المؤسسية والبيانات',
        subtitle: 'Enterprise & Cloud',
        icon: Gauge,
        accentColor: 'text-teal-400 border-teal-500/30 bg-teal-500/10',
        items: [
          {
            id: 'enterprise_scale',
            label: 'التكامل المؤسسي واختبار الإجهاد',
            shortLabel: 'المؤسسي',
            icon: Gauge,
            tag: '5K TPS',
            tagColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
          },
          {
            id: 'cloud_db',
            label: 'السحابة وقواعد البيانات المزدوجة',
            shortLabel: 'السحابة',
            icon: Database,
          },
          {
            id: 'sheets_hub',
            label: 'تقارير وجداول Google Sheets',
            shortLabel: 'Sheets',
            icon: FileSpreadsheet,
            tag: 'Sync',
            tagColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          },
          {
            id: 'integrations',
            label: 'تكامل القنوات وواتساب',
            shortLabel: 'التكاملات',
            icon: Share2,
          },
          {
            id: 'knowledge_base',
            label: 'قاعدة المعرفة والسياسات',
            shortLabel: 'المعرفة',
            icon: BookOpen,
          },
        ],
      },
      {
        id: 'governance',
        title: 'الحوكمة والجودة والقوى العاملة',
        subtitle: 'Governance & WFM',
        icon: ShieldCheck,
        accentColor: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
        items: [
          {
            id: 'training',
            label: 'أكاديمية التدريب والمحاكاة',
            shortLabel: 'الأكاديمية',
            icon: GraduationCap,
          },
          {
            id: 'wfm',
            label: 'القوى العاملة والمناوبات',
            shortLabel: 'المناوبات',
            icon: Calendar,
          },
          {
            id: 'qa',
            label: 'تقييم ومراقبة الجودة QA',
            shortLabel: 'الجودة',
            icon: Award,
          },
          {
            id: 'audit',
            label: 'سجل التدقيق والامتثال التنظيمي',
            shortLabel: 'التدقيق',
            icon: ShieldCheck,
          },
        ],
      },
    ],
    [openConversationsCount, activeCallsCount, slaAtRiskCount]
  );

  // Filter categories and items based on search and domain selection
  const filteredCategories = useMemo(() => {
    return categories
      .filter((cat) => selectedDomain === 'all' || cat.id === selectedDomain)
      .map((cat) => {
        if (!searchQuery.trim()) return cat;
        const query = searchQuery.toLowerCase().trim();
        const matchedItems = cat.items.filter(
          (item) =>
            item.label.toLowerCase().includes(query) ||
            item.shortLabel.toLowerCase().includes(query) ||
            cat.title.toLowerCase().includes(query)
        );
        return {
          ...cat,
          items: matchedItems,
        };
      })
      .filter((cat) => cat.items.length > 0);
  }, [categories, selectedDomain, searchQuery]);

  const toggleCategoryCollapse = (catId: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  return (
    <aside
      className={`bg-slate-900/95 border-l border-slate-800/80 flex flex-col justify-between select-none transition-all duration-300 relative backdrop-blur-md z-30 ${
        isCollapsed ? 'w-20' : 'w-72'
      }`}
      dir="rtl"
    >
      {/* Top Header & Collapse Toggle */}
      <div className="p-3 border-b border-slate-800/80 flex items-center justify-between">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">هيكلية المنظومة</span>
              <span className="text-[10px] text-slate-400 font-mono">OmniFlow OS Modules</span>
            </div>
          </div>
        )}

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'توسيع الشريط الجانبي' : 'طي الشريط الجانبي'}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition mx-auto"
        >
          {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Domain Category Filter Chips & Quick Search (Only in expanded mode) */}
      {!isCollapsed && (
        <div className="px-3 pt-3 pb-2 space-y-2 border-b border-slate-800/60">
          {/* Quick Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث سريع في القوائم..."
              className="w-full bg-slate-950/70 border border-slate-800 rounded-lg pr-8 pl-6 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-2 top-2 text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Domain Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 text-[10px] font-medium">
            <button
              onClick={() => setSelectedDomain('all')}
              className={`px-2 py-1 rounded-md whitespace-nowrap transition ${
                selectedDomain === 'all'
                  ? 'bg-slate-700 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setSelectedDomain('ops')}
              className={`px-2 py-1 rounded-md whitespace-nowrap transition ${
                selectedDomain === 'ops'
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-bold'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              العمليات
            </button>
            <button
              onClick={() => setSelectedDomain('ai')}
              className={`px-2 py-1 rounded-md whitespace-nowrap transition ${
                selectedDomain === 'ai'
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 font-bold'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              الذكاء الاصطناعي
            </button>
            <button
              onClick={() => setSelectedDomain('enterprise')}
              className={`px-2 py-1 rounded-md whitespace-nowrap transition ${
                selectedDomain === 'enterprise'
                  ? 'bg-teal-600/30 text-teal-300 border border-teal-500/40 font-bold'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              المؤسسة
            </button>
            <button
              onClick={() => setSelectedDomain('governance')}
              className={`px-2 py-1 rounded-md whitespace-nowrap transition ${
                selectedDomain === 'governance'
                  ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40 font-bold'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              الحوكمة
            </button>
          </div>
        </div>
      )}

      {/* Navigation Scrollable Area */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4 custom-scrollbar">
        {filteredCategories.map((cat) => {
          const isCategoryCollapsed = collapsedCategories[cat.id];
          const CatIcon = cat.icon;

          return (
            <div key={cat.id} className="space-y-1">
              {/* Category Header */}
              {!isCollapsed ? (
                <div
                  onClick={() => toggleCategoryCollapse(cat.id)}
                  className="px-2 py-1.5 flex items-center justify-between text-slate-400 hover:text-white cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5">
                    <CatIcon className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition" />
                    <span className="text-[11px] font-bold tracking-tight text-slate-300 group-hover:text-white">
                      {cat.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                      {cat.items.length}
                    </span>
                    {isCategoryCollapsed ? (
                      <ChevronLeft className="w-3 h-3 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-slate-500" />
                    )}
                  </div>
                </div>
              ) : (
                <div className="w-full flex justify-center py-1">
                  <div className={`p-1 rounded border text-[10px] ${cat.accentColor}`} title={cat.title}>
                    <CatIcon className="w-3.5 h-3.5" />
                  </div>
                </div>
              )}

              {/* Items List */}
              {(!isCategoryCollapsed || isCollapsed) && (
                <div className="space-y-0.5">
                  {cat.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;

                    return (
                      <button
                        key={item.id}
                        onClick={() => onSelectTab(item.id)}
                        title={isCollapsed ? item.label : undefined}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-950/40 font-bold border-r-2 border-white'
                            : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon
                            className={`w-4 h-4 shrink-0 transition-colors ${
                              isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                            }`}
                          />
                          {!isCollapsed && <span className="truncate">{item.label}</span>}
                        </div>

                        {!isCollapsed && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.tag && (
                              <span
                                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                                  isActive ? 'bg-white/20 text-white border-white/30' : item.tagColor
                                }`}
                              >
                                {item.tag}
                              </span>
                            )}
                            {item.badge !== undefined && (
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                                  isActive ? 'bg-white/20 text-white border-white/30' : item.badgeColor
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* System Status Footer Card */}
      {!isCollapsed ? (
        <div className="p-3 m-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-1.5 shadow-inner">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px]">مجمّع السحابة (Cluster):</span>
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium font-mono text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
              europe-west2
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>التزامن المزدوج:</span>
            <span className="text-teal-300 font-mono text-[10px]">Cloud SQL + Firestore</span>
          </div>
        </div>
      ) : (
        <div className="p-2 flex justify-center border-t border-slate-800">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" title="النظام متصل" />
        </div>
      )}
    </aside>
  );
};
