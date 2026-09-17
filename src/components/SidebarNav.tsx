/**
 * @file src/components/SidebarNav.tsx
 * RTL Enterprise Sidebar Navigation for AI Contact Center OS
 */

import React from 'react';
import {
  Activity,
  MessageSquare,
  PhoneCall,
  Ticket as TicketIcon,
  Users,
  BrainCircuit,
  Award,
  ShieldCheck,
  Settings,
  BookOpen,
  Share2,
  Calendar,
  Zap,
  Sparkles,
} from 'lucide-react';

export type ActiveTab =
  | 'live_ops'
  | 'inbox'
  | 'voice'
  | 'tickets'
  | 'customers'
  | 'recommendations'
  | 'knowledge_base'
  | 'integrations'
  | 'wfm'
  | 'automation'
  | 'ai_analyst'
  | 'qa'
  | 'audit';

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
  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    badgeColor?: string;
  }> = [
    {
      id: 'live_ops',
      label: 'مركز العمليات المباشر',
      icon: Activity,
    },
    {
      id: 'inbox',
      label: 'صندوق المحادثات الموحد',
      icon: MessageSquare,
      badge: openConversationsCount,
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    },
    {
      id: 'voice',
      label: 'الاتصالات الهاتفية',
      icon: PhoneCall,
      badge: activeCallsCount > 0 ? activeCallsCount : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse',
    },
    {
      id: 'tickets',
      label: 'التذاكر والـ SLA',
      icon: TicketIcon,
      badge: slaAtRiskCount > 0 ? slaAtRiskCount : undefined,
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    },
    {
      id: 'customers',
      label: 'العملاء وCustomer 360',
      icon: Users,
    },
    {
      id: 'recommendations',
      label: 'التوصيات الذكية الشاملة',
      icon: Sparkles,
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    },
    {
      id: 'knowledge_base',
      label: 'قاعدة المعرفة والسياسات',
      icon: BookOpen,
    },
    {
      id: 'integrations',
      label: 'تكامل القنوات وواتساب',
      icon: Share2,
    },
    {
      id: 'wfm',
      label: 'القوى العاملة والمناوبات',
      icon: Calendar,
    },
    {
      id: 'automation',
      label: 'الأتمتة والتوجيه الذكي',
      icon: Zap,
    },
    {
      id: 'ai_analyst',
      label: 'محلل الذكاء الاصطناعي',
      icon: BrainCircuit,
    },
    {
      id: 'qa',
      label: 'تقييم الجودة (QA)',
      icon: Award,
    },
    {
      id: 'audit',
      label: 'سجل التدقيق والامتثال',
      icon: ShieldCheck,
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-l border-slate-800 flex flex-col justify-between select-none">
      <div className="py-4 px-3 space-y-1">
        <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          وحدات النظام الأساسية
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    isActive ? 'bg-white/20 text-white border-white/30' : item.badgeColor
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* System Status Footer Card */}
      <div className="p-3 m-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
        <div className="flex items-center justify-between text-slate-400 mb-1.5">
          <span>حالة السيرفر:</span>
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
            متصل 99.9%
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <span>عزل البيانات:</span>
          <span className="text-slate-300 font-mono text-[11px]">Tenant Safe</span>
        </div>
      </div>
    </aside>
  );
};
