/**
 * @file src/components/MobileBottomNav.tsx
 * Ergonomic Thumb-Zone Mobile Bottom Tab Bar & Full Module Sheet Drawer for Android & Touch Viewports
 * Enforces >= 44x44px hitboxes and < 15% sticky surface cap.
 */

import React, { useState } from 'react';
import { ActiveTab } from './SidebarNav';
import {
  Activity,
  MessageSquare,
  PhoneCall,
  Ticket as TicketIcon,
  Smartphone,
  LayoutGrid,
  X,
  GitBranch,
  Bot,
  Database,
  FileSpreadsheet,
  Mail,
  Users,
  ShieldCheck,
  Award,
  Calendar,
  GraduationCap,
  Zap,
  BrainCircuit,
  TrendingUp,
  Sparkles,
  Gauge,
  Share2,
  BookOpen,
} from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  openConversationsCount: number;
  activeCallsCount: number;
  slaAtRiskCount: number;
  forceVisible?: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  openConversationsCount,
  activeCallsCount,
  slaAtRiskCount,
  forceVisible = false,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const primaryTabs: Array<{
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'live_ops', label: 'العمليات', icon: Activity },
    { id: 'inbox', label: 'المحادثات', icon: MessageSquare, badge: openConversationsCount },
    { id: 'voice', label: 'الهاتف', icon: PhoneCall, badge: activeCallsCount > 0 ? activeCallsCount : undefined },
    { id: 'tickets', label: 'التذاكر', icon: TicketIcon, badge: slaAtRiskCount > 0 ? slaAtRiskCount : undefined },
    { id: 'cross_platform_hub', label: 'الأجهزة', icon: Smartphone },
  ];

  const allModules: Array<{
    id: ActiveTab;
    label: string;
    category: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'live_ops', label: 'مركز العمليات المباشر', category: 'العمليات', icon: Activity },
    { id: 'inbox', label: 'صندوق المحادثات الموحد', category: 'العمليات', icon: MessageSquare },
    { id: 'gmail_hub', label: 'بريد Gmail والدعم', category: 'العمليات', icon: Mail },
    { id: 'voice', label: 'السنترال الصوتي WebRTC', category: 'العمليات', icon: PhoneCall },
    { id: 'tickets', label: 'التذاكر وإدارة الـ SLA', category: 'العمليات', icon: TicketIcon },
    { id: 'customers', label: 'سجلات العملاء 360°', category: 'العمليات', icon: Users },
    { id: 'cross_platform_hub', label: 'تطبيق الأندرويد والويندوز والأجهزة', category: 'المؤسسة والأجهزة', icon: Smartphone },
    { id: 'github_qa_hub', label: 'مزامنة GitHub والاختبارات الشاملة', category: 'المؤسسة والأجهزة', icon: GitBranch },
    { id: 'enterprise_scale', label: 'التكامل واختبار الإجهاد', category: 'المؤسسة والأجهزة', icon: Gauge },
    { id: 'cloud_db', label: 'السحابة وقواعد البيانات', category: 'المؤسسة والأجهزة', icon: Database },
    { id: 'sheets_hub', label: 'جداول Google Sheets', category: 'المؤسسة والأجهزة', icon: FileSpreadsheet },
    { id: 'integrations', label: 'تكامل القنوات وواتساب', category: 'المؤسسة والأجهزة', icon: Share2 },
    { id: 'knowledge_base', label: 'قاعدة المعرفة والسياسات', category: 'المؤسسة والأجهزة', icon: BookOpen },
    { id: 'agentic_ai', label: 'الوكلاء المستقلون وحراسة PII', category: 'الذكاء الاصطناعي', icon: Bot },
    { id: 'predictive_cx', label: 'التحليلات التنبؤية VoC', category: 'الذكاء الاصطناعي', icon: TrendingUp },
    { id: 'recommendations', label: 'التوصيات الذكية', category: 'الذكاء الاصطناعي', icon: Sparkles },
    { id: 'ai_analyst', label: 'محلل الذكاء الاصطناعي', category: 'الذكاء الاصطناعي', icon: BrainCircuit },
    { id: 'automation', label: 'الأتمتة وقواعد التوجيه', category: 'الذكاء الاصطناعي', icon: Zap },
    { id: 'training', label: 'أكاديمية التدريب', category: 'الحوكمة والجودة', icon: GraduationCap },
    { id: 'wfm', label: 'القوى العاملة والمناوبات', category: 'الحوكمة والجودة', icon: Calendar },
    { id: 'qa', label: 'تقييم ومراقبة الجودة QA', category: 'الحوكمة والجودة', icon: Award },
    { id: 'audit', label: 'سجل التدقيق والامتثال', category: 'الحوكمة والجودة', icon: ShieldCheck },
  ];

  return (
    <>
      <nav
        className={`${
          forceVisible ? 'flex' : 'flex md:hidden'
        } fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 h-16 px-2 items-center justify-around select-none`}
        dir="rtl"
        aria-label="شريط التنقل السفلي للأندرويد والموبايل"
      >
        {primaryTabs.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`relative min-h-[44px] min-w-[56px] px-2 py-1 rounded-xl flex flex-col items-center justify-center transition-colors ${
                isActive ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -left-2.5 px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[9px] font-mono tabular-nums">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight mt-1 whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}

        {/* More Modules Drawer Trigger */}
        <button
          onClick={() => setIsDrawerOpen(true)}
          className="min-h-[44px] min-w-[56px] px-2 py-1 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-white transition-colors"
        >
          <LayoutGrid className="w-5 h-5" />
          <span className="text-[10px] tracking-tight mt-1 whitespace-nowrap">كل الوحدات</span>
        </button>
      </nav>

      {/* Bottom Sheet Drawer for All 22 Modules */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col justify-end"
          dir="rtl"
          onClick={() => setIsDrawerOpen(false)}
        >
          <div
            className="bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[82vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle */}
            <div className="w-10 h-1.5 bg-slate-700 rounded-full mx-auto mt-3 mb-1 shrink-0" />

            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-white">جميع وحدات المنصة (22 وحدة متكاملة)</h3>
                <p className="text-xs text-slate-400">واجهة اللمس الذكية لتطبيق الأندرويد والأجهزة المحمولة</p>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {allModules.map((mod) => {
                const ModIcon = mod.icon;
                const isSelected = activeTab === mod.id;
                return (
                  <button
                    key={mod.id}
                    onClick={() => {
                      onSelectTab(mod.id);
                      setIsDrawerOpen(false);
                    }}
                    className={`min-h-[56px] p-3 rounded-2xl border text-right flex items-center gap-2.5 transition-colors ${
                      isSelected
                        ? 'bg-emerald-600/20 border-emerald-500/40 text-white font-bold'
                        : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-emerald-400'
                      }`}
                    >
                      <ModIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs truncate">{mod.label}</div>
                      <div className="text-[10px] text-slate-500 truncate">{mod.category}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
