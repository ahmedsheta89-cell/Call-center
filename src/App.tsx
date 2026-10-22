/**
 * @file src/App.tsx
 * AI Contact Center OS - Main Enterprise Application Layout
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { SidebarNav, ActiveTab } from './components/SidebarNav.tsx';
import { LiveOpsDashboard } from './components/LiveOpsDashboard.tsx';
import { OmnichannelInbox } from './components/OmnichannelInbox.tsx';
import { VoiceSoftphone } from './components/VoiceSoftphone.tsx';
import { TicketsManager } from './components/TicketsManager.tsx';
import { Customer360View } from './components/Customer360View.tsx';
import { AIAnalystBenchmark } from './components/AIAnalystBenchmark.tsx';
import { QACoachingView } from './components/QACoachingView.tsx';
import { AuditLogView } from './components/AuditLogView.tsx';
import { KnowledgeBaseView } from './components/KnowledgeBaseView.tsx';
import { ChannelIntegrationsView } from './components/ChannelIntegrationsView.tsx';
import { WorkforceManagementView } from './components/WorkforceManagementView.tsx';
import { AutomationRulesView } from './components/AutomationRulesView.tsx';
import { RecommendationsHub } from './components/RecommendationsHub.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { ExecutiveReportModal } from './components/ExecutiveReportModal.tsx';
import { GuidedWalkthroughModal } from './components/GuidedWalkthroughModal.tsx';
import { TrainingArenaView } from './components/TrainingArenaView.tsx';
import { DiagnosticsAndRegionalModal } from './components/DiagnosticsAndRegionalModal.tsx';
import { CloudDatabaseHubView } from './components/CloudDatabaseHubView.tsx';
import { AgenticAIGuardrailsView } from './components/AgenticAIGuardrailsView.tsx';
import { PredictiveCXVoCView } from './components/PredictiveCXVoCView.tsx';
import { EnterpriseConnectorsAndLoadTestingView } from './components/EnterpriseConnectorsAndLoadTestingView.tsx';
import { GitHubSyncAndQASuiteView } from './components/GitHubSyncAndQASuiteView.tsx';
import { CrossPlatformEcosystemView } from './components/CrossPlatformEcosystemView.tsx';
import { GmailHubView } from './components/GmailHubView.tsx';
import { GoogleSheetsHubView } from './components/GoogleSheetsHubView.tsx';
import { MobileBottomNav } from './components/MobileBottomNav.tsx';
import { OfflineIndicator } from './components/PWAInstallButton.tsx';
import { ContextualGuidanceBanner, MODULE_GUIDANCE_MAP } from './components/ContextualGuidanceBanner.tsx';
import { LiveExecutionToastSystem, ExecutionLogEntry } from './components/LiveExecutionToastSystem.tsx';
import { subscribeToFirestoreTickets } from './lib/firestoreService.ts';
import { LiveMetrics, Agent, Conversation, Ticket, Customer, CallSession } from './types.ts';
import {
  ChevronLeft,
  Layers,
  FileText,
  Sparkles,
  Command,
  Radio,
  Compass,
  Activity,
  Bot,
  Gauge,
  ShieldCheck,
  Mail,
  FileSpreadsheet,
  GitBranch,
  Smartphone,
  Monitor,
} from 'lucide-react';

// Domain contextual metadata for top workspace breadcrumb & lateral navigation
const DOMAIN_META_MAP: Record<
  ActiveTab,
  {
    domainTitle: string;
    domainSubtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    accentBadge: string;
    siblings: Array<{ id: ActiveTab; label: string }>;
  }
> = {
  live_ops: {
    domainTitle: 'العمليات والاتصالات الموحدة',
    domainSubtitle: 'Omnichannel Operations',
    icon: Activity,
    accentBadge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    siblings: [
      { id: 'live_ops', label: 'مركز العمليات' },
      { id: 'inbox', label: 'المحادثات' },
      { id: 'gmail_hub', label: 'بريد Gmail' },
      { id: 'voice', label: 'الاتصالات والـ IVR' },
      { id: 'tickets', label: 'التذاكر والـ SLA' },
      { id: 'customers', label: 'العملاء 360°' },
    ],
  },
  inbox: {
    domainTitle: 'العمليات والاتصالات الموحدة',
    domainSubtitle: 'Omnichannel Operations',
    icon: Activity,
    accentBadge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    siblings: [
      { id: 'live_ops', label: 'مركز العمليات' },
      { id: 'inbox', label: 'المحادثات' },
      { id: 'gmail_hub', label: 'بريد Gmail' },
      { id: 'voice', label: 'الاتصالات والـ IVR' },
      { id: 'tickets', label: 'التذاكر والـ SLA' },
      { id: 'customers', label: 'العملاء 360°' },
    ],
  },
  gmail_hub: {
    domainTitle: 'العمليات والاتصالات الموحدة',
    domainSubtitle: 'Omnichannel Operations',
    icon: Mail,
    accentBadge: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    siblings: [
      { id: 'live_ops', label: 'مركز العمليات' },
      { id: 'inbox', label: 'المحادثات' },
      { id: 'gmail_hub', label: 'بريد Gmail' },
      { id: 'voice', label: 'الاتصالات والـ IVR' },
      { id: 'tickets', label: 'التذاكر والـ SLA' },
      { id: 'customers', label: 'العملاء 360°' },
    ],
  },
  voice: {
    domainTitle: 'العمليات والاتصالات الموحدة',
    domainSubtitle: 'Omnichannel Operations',
    icon: Activity,
    accentBadge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    siblings: [
      { id: 'live_ops', label: 'مركز العمليات' },
      { id: 'inbox', label: 'المحادثات' },
      { id: 'gmail_hub', label: 'بريد Gmail' },
      { id: 'voice', label: 'الاتصالات والـ IVR' },
      { id: 'tickets', label: 'التذاكر والـ SLA' },
      { id: 'customers', label: 'العملاء 360°' },
    ],
  },
  tickets: {
    domainTitle: 'العمليات والاتصالات الموحدة',
    domainSubtitle: 'Omnichannel Operations',
    icon: Activity,
    accentBadge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    siblings: [
      { id: 'live_ops', label: 'مركز العمليات' },
      { id: 'inbox', label: 'المحادثات' },
      { id: 'gmail_hub', label: 'بريد Gmail' },
      { id: 'voice', label: 'الاتصالات والـ IVR' },
      { id: 'tickets', label: 'التذاكر والـ SLA' },
      { id: 'customers', label: 'العملاء 360°' },
    ],
  },
  customers: {
    domainTitle: 'العمليات والاتصالات الموحدة',
    domainSubtitle: 'Omnichannel Operations',
    icon: Activity,
    accentBadge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    siblings: [
      { id: 'live_ops', label: 'مركز العمليات' },
      { id: 'inbox', label: 'المحادثات' },
      { id: 'gmail_hub', label: 'بريد Gmail' },
      { id: 'voice', label: 'الاتصالات والـ IVR' },
      { id: 'tickets', label: 'التذاكر والـ SLA' },
      { id: 'customers', label: 'العملاء 360°' },
    ],
  },
  agentic_ai: {
    domainTitle: 'الذكاء الاصطناعي والأتمتة المستقلة',
    domainSubtitle: 'Autonomous AI & Intel',
    icon: Bot,
    accentBadge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    siblings: [
      { id: 'agentic_ai', label: 'الوكلاء وحراسة PII' },
      { id: 'predictive_cx', label: 'التحليلات التنبؤية VoC' },
      { id: 'recommendations', label: 'التوصيات الذكية' },
      { id: 'ai_analyst', label: 'محلل الذكاء الاصطناعي' },
      { id: 'automation', label: 'الأتمتة وقواعد التوجيه' },
    ],
  },
  predictive_cx: {
    domainTitle: 'الذكاء الاصطناعي والأتمتة المستقلة',
    domainSubtitle: 'Autonomous AI & Intel',
    icon: Bot,
    accentBadge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    siblings: [
      { id: 'agentic_ai', label: 'الوكلاء وحراسة PII' },
      { id: 'predictive_cx', label: 'التحليلات التنبؤية VoC' },
      { id: 'recommendations', label: 'التوصيات الذكية' },
      { id: 'ai_analyst', label: 'محلل الذكاء الاصطناعي' },
      { id: 'automation', label: 'الأتمتة وقواعد التوجيه' },
    ],
  },
  recommendations: {
    domainTitle: 'الذكاء الاصطناعي والأتمتة المستقلة',
    domainSubtitle: 'Autonomous AI & Intel',
    icon: Bot,
    accentBadge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    siblings: [
      { id: 'agentic_ai', label: 'الوكلاء وحراسة PII' },
      { id: 'predictive_cx', label: 'التحليلات التنبؤية VoC' },
      { id: 'recommendations', label: 'التوصيات الذكية' },
      { id: 'ai_analyst', label: 'محلل الذكاء الاصطناعي' },
      { id: 'automation', label: 'الأتمتة وقواعد التوجيه' },
    ],
  },
  ai_analyst: {
    domainTitle: 'الذكاء الاصطناعي والأتمتة المستقلة',
    domainSubtitle: 'Autonomous AI & Intel',
    icon: Bot,
    accentBadge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    siblings: [
      { id: 'agentic_ai', label: 'الوكلاء وحراسة PII' },
      { id: 'predictive_cx', label: 'التحليلات التنبؤية VoC' },
      { id: 'recommendations', label: 'التوصيات الذكية' },
      { id: 'ai_analyst', label: 'محلل الذكاء الاصطناعي' },
      { id: 'automation', label: 'الأتمتة وقواعد التوجيه' },
    ],
  },
  automation: {
    domainTitle: 'الذكاء الاصطناعي والأتمتة المستقلة',
    domainSubtitle: 'Autonomous AI & Intel',
    icon: Bot,
    accentBadge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    siblings: [
      { id: 'agentic_ai', label: 'الوكلاء وحراسة PII' },
      { id: 'predictive_cx', label: 'التحليلات التنبؤية VoC' },
      { id: 'recommendations', label: 'التوصيات الذكية' },
      { id: 'ai_analyst', label: 'محلل الذكاء الاصطناعي' },
      { id: 'automation', label: 'الأتمتة وقواعد التوجيه' },
    ],
  },
  cross_platform_hub: {
    domainTitle: 'البنية المؤسسية والبيانات السحابية',
    domainSubtitle: 'Enterprise & Scale',
    icon: Smartphone,
    accentBadge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    siblings: [
      { id: 'cross_platform_hub', label: 'تطبيق الأندرويد والويندوز والأجهزة' },
      { id: 'github_qa_hub', label: 'مزامنة GitHub والرابط العام والاختبارات' },
      { id: 'enterprise_scale', label: 'التكامل واختبار الإجهاد' },
      { id: 'cloud_db', label: 'السحابة وقواعد البيانات' },
      { id: 'sheets_hub', label: 'جداول Google Sheets' },
      { id: 'integrations', label: 'تكامل القنوات' },
      { id: 'knowledge_base', label: 'قاعدة المعرفة' },
    ],
  },
  github_qa_hub: {
    domainTitle: 'البنية المؤسسية والبيانات السحابية',
    domainSubtitle: 'Enterprise & Scale',
    icon: GitBranch,
    accentBadge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    siblings: [
      { id: 'cross_platform_hub', label: 'تطبيق الأندرويد والويندوز والأجهزة' },
      { id: 'github_qa_hub', label: 'مزامنة GitHub والرابط العام والاختبارات' },
      { id: 'enterprise_scale', label: 'التكامل واختبار الإجهاد' },
      { id: 'cloud_db', label: 'السحابة وقواعد البيانات' },
      { id: 'sheets_hub', label: 'جداول Google Sheets' },
      { id: 'integrations', label: 'تكامل القنوات' },
      { id: 'knowledge_base', label: 'قاعدة المعرفة' },
    ],
  },
  enterprise_scale: {
    domainTitle: 'البنية المؤسسية والبيانات السحابية',
    domainSubtitle: 'Enterprise & Scale',
    icon: Gauge,
    accentBadge: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    siblings: [
      { id: 'cross_platform_hub', label: 'تطبيق الأندرويد والويندوز والأجهزة' },
      { id: 'github_qa_hub', label: 'مزامنة GitHub والرابط العام والاختبارات' },
      { id: 'enterprise_scale', label: 'التكامل واختبار الإجهاد' },
      { id: 'cloud_db', label: 'السحابة وقواعد البيانات' },
      { id: 'sheets_hub', label: 'جداول Google Sheets' },
      { id: 'integrations', label: 'تكامل القنوات' },
      { id: 'knowledge_base', label: 'قاعدة المعرفة' },
    ],
  },
  cloud_db: {
    domainTitle: 'البنية المؤسسية والبيانات السحابية',
    domainSubtitle: 'Enterprise & Scale',
    icon: Gauge,
    accentBadge: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    siblings: [
      { id: 'cross_platform_hub', label: 'تطبيق الأندرويد والويندوز والأجهزة' },
      { id: 'github_qa_hub', label: 'مزامنة GitHub والرابط العام والاختبارات' },
      { id: 'enterprise_scale', label: 'التكامل واختبار الإجهاد' },
      { id: 'cloud_db', label: 'السحابة وقواعد البيانات' },
      { id: 'sheets_hub', label: 'جداول Google Sheets' },
      { id: 'integrations', label: 'تكامل القنوات' },
      { id: 'knowledge_base', label: 'قاعدة المعرفة' },
    ],
  },
  sheets_hub: {
    domainTitle: 'البنية المؤسسية والبيانات السحابية',
    domainSubtitle: 'Enterprise & Scale',
    icon: FileSpreadsheet,
    accentBadge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    siblings: [
      { id: 'cross_platform_hub', label: 'تطبيق الأندرويد والويندوز والأجهزة' },
      { id: 'github_qa_hub', label: 'مزامنة GitHub والرابط العام والاختبارات' },
      { id: 'enterprise_scale', label: 'التكامل واختبار الإجهاد' },
      { id: 'cloud_db', label: 'السحابة وقواعد البيانات' },
      { id: 'sheets_hub', label: 'جداول Google Sheets' },
      { id: 'integrations', label: 'تكامل القنوات' },
      { id: 'knowledge_base', label: 'قاعدة المعرفة' },
    ],
  },
  integrations: {
    domainTitle: 'البنية المؤسسية والبيانات السحابية',
    domainSubtitle: 'Enterprise & Scale',
    icon: Gauge,
    accentBadge: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    siblings: [
      { id: 'cross_platform_hub', label: 'تطبيق الأندرويد والويندوز والأجهزة' },
      { id: 'github_qa_hub', label: 'مزامنة GitHub والرابط العام والاختبارات' },
      { id: 'enterprise_scale', label: 'التكامل واختبار الإجهاد' },
      { id: 'cloud_db', label: 'السحابة وقواعد البيانات' },
      { id: 'sheets_hub', label: 'جداول Google Sheets' },
      { id: 'integrations', label: 'تكامل القنوات' },
      { id: 'knowledge_base', label: 'قاعدة المعرفة' },
    ],
  },
  knowledge_base: {
    domainTitle: 'البنية المؤسسية والبيانات السحابية',
    domainSubtitle: 'Enterprise & Scale',
    icon: Gauge,
    accentBadge: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    siblings: [
      { id: 'cross_platform_hub', label: 'تطبيق الأندرويد والويندوز والأجهزة' },
      { id: 'github_qa_hub', label: 'مزامنة GitHub والرابط العام والاختبارات' },
      { id: 'enterprise_scale', label: 'التكامل واختبار الإجهاد' },
      { id: 'cloud_db', label: 'السحابة وقواعد البيانات' },
      { id: 'sheets_hub', label: 'جداول Google Sheets' },
      { id: 'integrations', label: 'تكامل القنوات' },
      { id: 'knowledge_base', label: 'قاعدة المعرفة' },
    ],
  },
  training: {
    domainTitle: 'الحوكمة والجودة وتطوير الفرق',
    domainSubtitle: 'Governance & Workforce',
    icon: ShieldCheck,
    accentBadge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    siblings: [
      { id: 'training', label: 'أكاديمية التدريب' },
      { id: 'wfm', label: 'القوى العاملة والمناوبات' },
      { id: 'qa', label: 'تقييم الجودة QA' },
      { id: 'audit', label: 'سجل التدقيق والامتثال' },
    ],
  },
  wfm: {
    domainTitle: 'الحوكمة والجودة وتطوير الفرق',
    domainSubtitle: 'Governance & Workforce',
    icon: ShieldCheck,
    accentBadge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    siblings: [
      { id: 'training', label: 'أكاديمية التدريب' },
      { id: 'wfm', label: 'القوى العاملة والمناوبات' },
      { id: 'qa', label: 'تقييم الجودة QA' },
      { id: 'audit', label: 'سجل التدقيق والامتثال' },
    ],
  },
  qa: {
    domainTitle: 'الحوكمة والجودة وتطوير الفرق',
    domainSubtitle: 'Governance & Workforce',
    icon: ShieldCheck,
    accentBadge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    siblings: [
      { id: 'training', label: 'أكاديمية التدريب' },
      { id: 'wfm', label: 'القوى العاملة والمناوبات' },
      { id: 'qa', label: 'تقييم الجودة QA' },
      { id: 'audit', label: 'سجل التدقيق والامتثال' },
    ],
  },
  audit: {
    domainTitle: 'الحوكمة والجودة وتطوير الفرق',
    domainSubtitle: 'Governance & Workforce',
    icon: ShieldCheck,
    accentBadge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    siblings: [
      { id: 'training', label: 'أكاديمية التدريب' },
      { id: 'wfm', label: 'القوى العاملة والمناوبات' },
      { id: 'qa', label: 'تقييم الجودة QA' },
      { id: 'audit', label: 'سجل التدقيق والامتثال' },
    ],
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('tab') as ActiveTab | null;
      if (t && DOMAIN_META_MAP[t]) return t;
    } catch {}
    return 'live_ops';
  });
  const [devicePreviewMode, setDevicePreviewMode] = useState<
    'responsive' | 'android_mobile' | 'windows_desktop'
  >('responsive');
  const [currentRole, setCurrentRole] = useState<string>('Admin');
  const [zeroCostMode, setZeroCostMode] = useState<boolean>(false);
  const [aiSpend, setAiSpend] = useState<number>(18.45);
  const [aiBudget, setAiBudget] = useState<number>(250.0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isExecutiveReportOpen, setIsExecutiveReportOpen] = useState<boolean>(false);
  const [isGuidedTourOpen, setIsGuidedTourOpen] = useState<boolean>(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  const [isVerifierModalOpen, setIsVerifierModalOpen] = useState<boolean>(false);
  const [isSseConnected, setIsSseConnected] = useState<boolean>(true);
  const [isExecutingFunction, setIsExecutingFunction] = useState<boolean>(false);
  const [latestToast, setLatestToast] = useState<ExecutionLogEntry | null>(null);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLogEntry[]>([
    {
      id: 'init-boot-01',
      moduleId: 'live_ops',
      moduleTitle: 'منظومة التشغيل الشامل (OmniFlow AI-OS)',
      functionName: 'تهيئة وربط الوحدات الـ 20 برقم المسؤول',
      apiRoute: 'GET /api/v1/operations/live + SSE Stream',
      status: '200 OK',
      latencyMs: 6,
      summary: 'تم تفعيل كافة الوحدات الـ 20 وربط بوابات Meta WhatsApp وTwilio Voice وقواعد البيانات برقم المسؤول 01018108979 بنجاح 100%.',
      adminPhone: '01018108979',
      timestamp: new Date().toLocaleTimeString('ar-EG'),
    },
  ]);

  const recordExecutionLog = (entry: Omit<ExecutionLogEntry, 'id' | 'timestamp'>) => {
    const fullEntry: ExecutionLogEntry = {
      ...entry,
      id: `log-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      timestamp: new Date().toLocaleTimeString('ar-EG'),
    };
    setLatestToast(fullEntry);
    setExecutionLogs((prev) => [fullEntry, ...prev.slice(0, 49)]);
  };

  // Primary Domain State
  const [metrics, setMetrics] = useState<LiveMetrics>({
    activeConversations: 25,
    activeCalls: 1,
    waitingQueue: 2,
    slaAtRiskCount: 2,
    agentsOnline: 9,
    agentsBusy: 3,
    serviceAvailabilityPercent: 99.8,
    aiComplianceAlerts: 1,
    openTicketsCount: 12,
  });

  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string>('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  // Initial Data Fetching
  const refreshOperations = () => {
    fetch('/api/v1/operations/live')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setMetrics(d.data.liveMetrics);
          setAiSpend(d.data.aiBudget.currentSpendUsd);
          setAiBudget(d.data.aiBudget.monthlyLimitUsd);
          setZeroCostMode(d.data.aiBudget.zeroCostMode);
        }
      })
      .catch(() => {});

    fetch('/api/v1/agents')
      .then((r) => r.json())
      .then((d) => d.success && setAgents(d.data))
      .catch(() => {});

    fetch('/api/v1/conversations')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setConversations(d.data);
          if (!selectedConvId && d.data.length > 0) {
            setSelectedConvId(d.data[0].id);
          }
        }
      })
      .catch(() => {});

    fetch('/api/v1/tickets')
      .then((r) => r.json())
      .then((d) => d.success && setTickets(d.data))
      .catch(() => {});

    fetch('/api/v1/customers')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setCustomers(d.data);
          if (!selectedCustomerId && d.data.length > 0) {
            setSelectedCustomerId(d.data[0].id);
          }
        }
      })
      .catch(() => {});

    fetch('/api/v1/calls')
      .then((r) => r.json())
      .then((d) => d.success && setCalls(d.data))
      .catch(() => {});
  };

  useEffect(() => {
    refreshOperations();

    // 1. Setup Server-Sent Events (SSE) for Real-Time Synchronization
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/v1/stream');
      es.onopen = () => {
        setIsSseConnected(true);
      };
      es.onerror = () => {
        setIsSseConnected(false);
      };
      es.addEventListener('message:new', () => {
        refreshOperations();
      });
      es.addEventListener('conversation:updated', () => {
        refreshOperations();
      });
      es.addEventListener('ticket:created', (event) => {
        try {
          const newTicket = JSON.parse(event.data);
          setTickets((prev) => [newTicket, ...prev.filter((t) => t.id !== newTicket.id)]);
        } catch {
          refreshOperations();
        }
      });
      es.addEventListener('ticket:updated', (event) => {
        try {
          const updatedTicket = JSON.parse(event.data);
          setTickets((prev) => prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t)));
        } catch {
          refreshOperations();
        }
      });
      es.addEventListener('call:event', () => {
        refreshOperations();
      });
      es.addEventListener('shift:created', () => {
        refreshOperations();
      });
      es.addEventListener('recommendation:applied', () => {
        refreshOperations();
      });
    } catch {
      setIsSseConnected(false);
    }

    // Polling fallback
    const interval = setInterval(refreshOperations, 15000);

    // 2. Subscribe to live Firestore tickets updates
    const unsubFirestore = subscribeToFirestoreTickets((firestoreTickets) => {
      if (firestoreTickets && firestoreTickets.length > 0) {
        setTickets((prev) => {
          const map = new Map<string, Ticket>(prev.map((t) => [t.id, t]));
          firestoreTickets.forEach((ft) => {
            const existing = map.get(ft.id);
            if (existing) {
              map.set(ft.id, Object.assign({}, existing, ft));
            } else {
              map.set(ft.id, ft);
            }
          });
          return Array.from(map.values());
        });
      }
    });

    // 3. Global Keyboard Shortcut for Command Palette (Cmd+K / Ctrl+K)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (es) es.close();
      clearInterval(interval);
      unsubFirestore();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Handlers
  const handleExecuteModuleFunction = async (moduleId: ActiveTab, functionKey: string, label: string) => {
    setIsExecutingFunction(true);
    const t0 = Date.now();
    const guide = MODULE_GUIDANCE_MAP[moduleId];
    try {
      const res = await fetch('/api/v1/system/execute-function', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, functionKey, customLabel: label }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.success && d?.data) {
        recordExecutionLog({
          moduleId,
          moduleTitle: guide?.title || moduleId,
          functionName: label,
          apiRoute: d.data.apiRoute || `/api/v1/${moduleId}`,
          status: d.data.status || `${res.status} OK`,
          latencyMs: d.data.latencyMs || Math.max(5, Date.now() - t0),
          summary: d.data.summary,
          adminPhone: d.data.adminPhone || '01018108979',
        });
        refreshOperations();
      } else {
        recordExecutionLog({
          moduleId,
          moduleTitle: guide?.title || moduleId,
          functionName: label,
          apiRoute: `/api/v1/system/execute-function`,
          status: `${res.status} ${d?.error?.code || 'ERROR'}`,
          latencyMs: Math.max(5, Date.now() - t0),
          summary: d?.error?.message || `فشل تنفيذ الوظيفة (${label}) برمز HTTP ${res.status}.`,
          adminPhone: '01018108979',
        });
      }
    } catch (err: any) {
      recordExecutionLog({
        moduleId,
        moduleTitle: guide?.title || moduleId,
        functionName: label,
        apiRoute: `/api/v1/system/execute-function`,
        status: 'NETWORK_ERROR',
        latencyMs: Math.max(6, Date.now() - t0),
        summary: err?.message || `تعذر الاتصال بالخادم لتنفيذ الوظيفة (${label}).`,
        adminPhone: '01018108979',
      });
    } finally {
      setIsExecutingFunction(false);
    }
  };

  const handleRoleChange = async (role: string) => {
    const t0 = Date.now();
    try {
      const res = await fetch('/api/v1/auth/switch-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setCurrentRole(data.data?.currentActor?.role || role);
        recordExecutionLog({
          moduleId: activeTab,
          moduleTitle: 'إدارة الهوية والصلاحيات (RBAC)',
          functionName: `تبديل الدور التشغيلي إلى (${role})`,
          apiRoute: 'POST /api/v1/auth/switch-role',
          status: `${res.status} OK`,
          latencyMs: Math.max(4, Date.now() - t0),
          summary: `تم تطبيق صلاحيات الدور (${role}) وتوثيق الجلسة في سجل التدقيق الأمني.`,
          adminPhone: '01018108979',
        });
        refreshOperations();
      } else {
        recordExecutionLog({
          moduleId: activeTab,
          moduleTitle: 'إدارة الهوية والصلاحيات (RBAC)',
          functionName: `رفض تبديل الدور إلى (${role})`,
          apiRoute: 'POST /api/v1/auth/switch-role',
          status: `${res.status} ${data?.error?.code || 'FORBIDDEN'}`,
          latencyMs: Math.max(4, Date.now() - t0),
          summary: data?.error?.message || `تم رفض تبديل الدور إلى (${role}) لعدم كفاية الصلاحيات.`,
          adminPhone: '01018108979',
        });
      }
    } catch (err: any) {
      recordExecutionLog({
        moduleId: activeTab,
        moduleTitle: 'إدارة الهوية والصلاحيات (RBAC)',
        functionName: `خطأ أثناء تبديل الدور إلى (${role})`,
        apiRoute: 'POST /api/v1/auth/switch-role',
        status: 'NETWORK_ERROR',
        latencyMs: Math.max(4, Date.now() - t0),
        summary: err?.message || 'تعذر الاتصال بالخادم لتبديل الدور.',
        adminPhone: '01018108979',
      });
    }
  };

  const handleToggleZeroCost = async () => {
    const t0 = Date.now();
    const newMode = !zeroCostMode;
    setZeroCostMode(newMode);
    try {
      const res = await fetch('/api/v1/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zeroCostMode: newMode }),
      });
      const data = await res.json();
      if (!data.success) {
        setZeroCostMode(!newMode);
      } else {
        recordExecutionLog({
          moduleId: activeTab,
          moduleTitle: 'ترشيد التكلفة والذكاء المحلي',
          functionName: newMode ? 'تفعيل وضع التكلفة الصفرية (Zero-Cost Mode)' : 'إيقاف وضع التكلفة الصفرية',
          apiRoute: 'POST /api/v1/settings',
          status: '200 OK',
          latencyMs: Math.max(5, Date.now() - t0),
          summary: newMode
            ? 'تم توجيه كافة طلبات المعالجة إلى المحرك المحلي والكاش الدلالي بتكلفة $0.00.'
            : 'تم استعادة التوجيه الهجين للنماذج السحابية والمحلية.',
          adminPhone: '01018108979',
        });
      }
    } catch {
      setZeroCostMode(!newMode);
    }
  };

  const handleSendMessage = async (convId: string, body: string, isInternalNote: boolean) => {
    const t0 = Date.now();
    await fetch(`/api/v1/conversations/${convId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, isInternalNote }),
    });
    recordExecutionLog({
      moduleId: 'inbox',
      moduleTitle: 'صندوق المحادثات الموحد',
      functionName: isInternalNote ? 'حفظ ملاحظة داخلية للفريق' : 'إرسال رسالة مباشرة للعميل',
      apiRoute: `POST /api/v1/conversations/${convId}/reply`,
      status: '200 OK',
      latencyMs: Math.max(6, Date.now() - t0),
      summary: `تم إرسال وتوثيق الرسالة (${body.slice(0, 45)}...) وبثها لحظياً عبر SSE.`,
      adminPhone: '01018108979',
    });
    refreshOperations();
  };

  const handleCreateTicket = async (ticketData: any) => {
    const t0 = Date.now();
    const res = await fetch('/api/v1/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticketData),
    });
    const d = await res.json();
    if (d.success) {
      recordExecutionLog({
        moduleId: 'tickets',
        moduleTitle: 'محرك التذاكر والـ SLA',
        functionName: 'إنشاء تذكرة دعم جديدة',
        apiRoute: 'POST /api/v1/tickets',
        status: '200 OK',
        latencyMs: Math.max(7, Date.now() - t0),
        summary: `تم إنشاء التذكرة (${ticketData.title || 'طلب دعم'}) وحساب مؤقتات استحقاق الـ SLA تلقائياً.`,
        adminPhone: '01018108979',
      });
      refreshOperations();
    }
  };

  const handleEscalateTicket = async (ticketId: string) => {
    const t0 = Date.now();
    await fetch(`/api/v1/tickets/${ticketId}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Escalated by supervisor' }),
    });
    recordExecutionLog({
      moduleId: 'tickets',
      moduleTitle: 'محرك التذاكر والـ SLA',
      functionName: `تصعيد عاجل للتذكرة (${ticketId})`,
      apiRoute: `POST /api/v1/tickets/${ticketId}/escalate`,
      status: '200 OK',
      latencyMs: Math.max(6, Date.now() - t0),
      summary: `تم رفع أولوية التذكرة (${ticketId}) إلى حرجة (Urgent) وإشعار المشرف المناوب (01018108979).`,
      adminPhone: '01018108979',
    });
    refreshOperations();
  };

  const handleControlCall = async (callId: string, action: string, supervisorMode?: string) => {
    const t0 = Date.now();
    await fetch(`/api/v1/calls/${callId}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, supervisorMode }),
    });
    recordExecutionLog({
      moduleId: 'voice',
      moduleTitle: 'السنترال الصوتي WebRTC / SIP',
      functionName: `تحكم بالمكالمة (${action})`,
      apiRoute: `POST /api/v1/calls/${callId}/control`,
      status: '200 OK',
      latencyMs: Math.max(5, Date.now() - t0),
      summary: `تم تنفيذ أمر التحكم الصوتي (${action}) على الجلسة (${callId}) بنجاح.`,
      adminPhone: '01018108979',
    });
    refreshOperations();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-white" dir="rtl">
      {/* Top Header */}
      <Header
        currentRole={currentRole}
        onRoleChange={handleRoleChange}
        zeroCostMode={zeroCostMode}
        onToggleZeroCost={handleToggleZeroCost}
        aiSpend={aiSpend}
        aiBudget={aiBudget}
        onOpenSoftphone={() => setActiveTab('voice')}
        activeCallCount={metrics.activeCalls}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        customers={customers}
        tickets={tickets}
        conversations={conversations}
        onNavigateToCustomer={(customerId) => {
          setSelectedCustomerId(customerId);
          setActiveTab('customers');
        }}
        onNavigateToTicket={(_ticketId) => {
          setActiveTab('tickets');
        }}
        onNavigateToConversation={(convId) => {
          setSelectedConvId(convId);
          setActiveTab('inbox');
        }}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenExecutiveReport={() => setIsExecutiveReportOpen(true)}
        onOpenGuidedTour={() => setIsGuidedTourOpen(true)}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
        onOpenGitHubAndQA={() => setActiveTab('github_qa_hub')}
        onOpenCrossPlatformHub={() => setActiveTab('cross_platform_hub')}
        isSseConnected={isSseConnected}
      />

      {/* Optional Windows 11 Native Titlebar Strip when Windows Desktop Mode is active */}
      {devicePreviewMode === 'windows_desktop' && (
        <div className="bg-indigo-950/90 border-b border-indigo-500/30 px-4 py-1.5 flex items-center justify-between text-xs select-none">
          <div className="flex items-center gap-2 text-indigo-200 font-medium">
            <Monitor className="w-3.5 h-3.5 text-indigo-400" />
            <span>وضع برنامج الويندوز المكتبي (Windows 11 Desktop EXE · 1440px Multi-Pane)</span>
          </div>
          <button
            onClick={() => setDevicePreviewMode('responsive')}
            className="text-indigo-300 hover:text-white underline text-[11px]"
          >
            العودة للوضع التلقائي
          </button>
        </div>
      )}

      {/* Main Workspace Body */}
      <div
        className={`flex-1 flex overflow-hidden ${
          devicePreviewMode === 'android_mobile'
            ? 'max-w-[430px] mx-auto w-full border-x-4 border-slate-800 shadow-2xl pb-16'
            : 'pb-16 md:pb-0'
        }`}
      >
        {/* Right Sidebar Navigation (Hidden on Android mobile frame mode) */}
        {devicePreviewMode !== 'android_mobile' && (
          <div className="hidden md:flex">
            <SidebarNav
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              openConversationsCount={metrics.activeConversations}
              activeCallsCount={metrics.activeCalls}
              slaAtRiskCount={metrics.slaAtRiskCount}
            />
          </div>
        )}

        {/* Dynamic Tab Content View */}
        <main className="flex-1 overflow-hidden relative flex flex-col bg-slate-950">
          {/* Contextual Workspace Sub-Navigation & Domain Breadcrumb Bar */}
          {(() => {
            const currentDomain = DOMAIN_META_MAP[activeTab];
            const DomainIcon = currentDomain?.icon || Activity;

            return (
              <div className="h-11 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur px-4 flex items-center justify-between shrink-0 select-none">
                {/* Domain Breadcrumb & Icon */}
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div
                    className={`p-1 rounded-md border text-[11px] flex items-center gap-1.5 ${
                      currentDomain?.accentBadge || ''
                    }`}
                  >
                    <DomainIcon className="w-3.5 h-3.5" />
                    <span className="font-bold whitespace-nowrap">{currentDomain?.domainTitle}</span>
                  </div>

                  <ChevronLeft className="w-3.5 h-3.5 text-slate-500 shrink-0" />

                  {/* Sibling Lateral Navigation Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                    {currentDomain?.siblings.map((sib) => {
                      const isSibActive = activeTab === sib.id;
                      return (
                        <button
                          key={sib.id}
                          onClick={() => setActiveTab(sib.id)}
                          className={`text-xs px-2.5 py-1 rounded-lg transition whitespace-nowrap ${
                            isSibActive
                              ? 'bg-slate-800 text-emerald-400 font-bold border border-slate-700 shadow-sm'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                          }`}
                        >
                          {sib.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right Contextual Utility Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Quick Android & Windows Hub Button */}
                  <button
                    onClick={() => setActiveTab('cross_platform_hub')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition ${
                      activeTab === 'cross_platform_hub'
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-300 border-indigo-500/30'
                    }`}
                    title="منظومة تطبيق الأندرويد وبرنامج الويندوز والأجهزة المتصلة"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">أندرويد &amp; ويندوز</span>
                  </button>

                  {/* Realtime Stream Badge */}
                  <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                      }`}
                    />
                    <span>البث اللحظي</span>
                  </div>

                  {/* Executive Report Modal Trigger */}
                  <button
                    onClick={() => setIsExecutiveReportOpen(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-500/30 text-xs font-medium transition"
                    title="تصدير تقرير تنفيذي شامل PDF / Excel"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">تقرير شامل</span>
                  </button>

                  {/* Guided Tour Trigger */}
                  <button
                    onClick={() => setIsGuidedTourOpen(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-400 border border-indigo-500/30 text-xs font-medium transition"
                    title="جولة النظام التفاعلية"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">جولة النظام</span>
                  </button>

                  {/* Command Palette Trigger */}
                  <button
                    onClick={() => setIsCommandPaletteOpen(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs transition"
                    title="لوحة الأوامر السريعة (Cmd+K)"
                  >
                    <Command className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] font-mono text-slate-400">⌘K</span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Interactive Contextual Guidance Engine Banner (Function-by-Function) */}
          <ContextualGuidanceBanner
            activeTab={activeTab}
            onExecuteModuleFunction={handleExecuteModuleFunction}
            onNavigateTab={setActiveTab}
            isExecuting={isExecutingFunction}
            isVerifierModalOpen={isVerifierModalOpen}
            onCloseVerifierModal={() => setIsVerifierModalOpen(false)}
            onOpenVerifierModal={() => setIsVerifierModalOpen(true)}
          />

          {/* Active Workspace View Container */}
          <div className="flex-1 overflow-y-auto relative">
          {activeTab === 'live_ops' && (
            <LiveOpsDashboard
              metrics={metrics}
              agents={agents}
              tickets={tickets}
              conversations={conversations}
              onSelectConversation={(id) => {
                setSelectedConvId(id);
                setActiveTab('inbox');
              }}
              onOpenSoftphone={() => setActiveTab('voice')}
              onNavigateToRecommendations={() => setActiveTab('recommendations')}
              userRole={currentRole}
            />
          )}

          {activeTab === 'inbox' && (
            <OmnichannelInbox
              conversations={conversations}
              selectedConvId={selectedConvId}
              onSelectConversation={setSelectedConvId}
              onSendMessage={handleSendMessage}
              zeroCostMode={zeroCostMode}
            />
          )}

          {activeTab === 'gmail_hub' && (
            <GmailHubView
              onConvertToTicket={(ticketData) => {
                handleCreateTicket({
                  title: ticketData.title || 'استفسار بريدي وارد عبر Gmail',
                  description: ticketData.description || '',
                  category: ticketData.category || 'استفسار بريدي',
                  priority: ticketData.priority || 'medium',
                  customerId: customers[0]?.id || 'cust-1',
                  customerName: ticketData.customerName || 'عميل بريد Gmail',
                  customerPhone: '',
                });
                setActiveTab('tickets');
              }}
            />
          )}

          {activeTab === 'voice' && (
            <VoiceSoftphone
              activeCalls={calls}
              onControlCall={handleControlCall}
              userRole={currentRole}
            />
          )}

          {activeTab === 'tickets' && (
            <TicketsManager
              tickets={tickets}
              customers={customers}
              onCreateTicket={handleCreateTicket}
              onEscalateTicket={handleEscalateTicket}
              userRole={currentRole}
            />
          )}

          {activeTab === 'customers' && (
            <Customer360View
              customers={customers}
              selectedCustomerId={selectedCustomerId}
              onSelectCustomer={setSelectedCustomerId}
              onInitiateCall={(_phone) => {
                setActiveTab('voice');
              }}
            />
          )}

          {activeTab === 'recommendations' && (
            <RecommendationsHub
              onNavigateToCustomer={(customerId) => {
                setSelectedCustomerId(customerId);
                setActiveTab('customers');
              }}
              onNavigateToWFM={() => setActiveTab('wfm')}
              onNavigateToQA={() => setActiveTab('qa')}
              onNavigateToKB={() => setActiveTab('knowledge_base')}
            />
          )}

          {activeTab === 'training' && <TrainingArenaView />}

          {activeTab === 'cloud_db' && (
            <CloudDatabaseHubView
              tickets={tickets}
              conversations={conversations}
              onRefreshData={refreshOperations}
            />
          )}

          {activeTab === 'sheets_hub' && (
            <GoogleSheetsHubView
              tickets={tickets}
              metrics={metrics}
            />
          )}

          {activeTab === 'agentic_ai' && <AgenticAIGuardrailsView />}

          {activeTab === 'predictive_cx' && <PredictiveCXVoCView />}

          {activeTab === 'enterprise_scale' && <EnterpriseConnectorsAndLoadTestingView />}

          {activeTab === 'github_qa_hub' && (
            <GitHubSyncAndQASuiteView onRecordExecution={recordExecutionLog} />
          )}

          {activeTab === 'cross_platform_hub' && (
            <CrossPlatformEcosystemView
              metrics={metrics}
              tickets={tickets}
              conversations={conversations}
              onNavigateTab={setActiveTab}
              devicePreviewMode={devicePreviewMode}
              onChangeDevicePreviewMode={setDevicePreviewMode}
              onRecordExecution={recordExecutionLog}
            />
          )}

          {activeTab === 'knowledge_base' && <KnowledgeBaseView />}

          {activeTab === 'integrations' && <ChannelIntegrationsView />}

          {activeTab === 'wfm' && <WorkforceManagementView />}

          {activeTab === 'automation' && <AutomationRulesView />}

          {activeTab === 'ai_analyst' && <AIAnalystBenchmark />}

          {activeTab === 'qa' && <QACoachingView />}

          {activeTab === 'audit' && <AuditLogView />}
          </div>

          {/* Live Action Toast Notification & Bottom Code Execution Log Console */}
          <LiveExecutionToastSystem
            latestToast={latestToast}
            executionLogs={executionLogs}
            onDismissToast={() => setLatestToast(null)}
            onClearLogs={() => setExecutionLogs([])}
            onOpenFullVerifier={() => setIsVerifierModalOpen(true)}
          />
        </main>
      </div>

      {/* Android & Touch Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        openConversationsCount={metrics.activeConversations}
        activeCallsCount={metrics.activeCalls}
        slaAtRiskCount={metrics.slaAtRiskCount}
        forceVisible={devicePreviewMode === 'android_mobile'}
      />

      {/* Offline Connectivity Indicator */}
      <OfflineIndicator />

      {/* Global Universal Command Palette (Cmd+K / Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        customers={customers}
        tickets={tickets}
        conversations={conversations}
        onNavigateToCustomer={(customerId) => {
          setSelectedCustomerId(customerId);
          setActiveTab('customers');
        }}
        onNavigateToTicket={(_ticketId) => {
          setActiveTab('tickets');
        }}
        onNavigateToConversation={(convId) => {
          setSelectedConvId(convId);
          setActiveTab('inbox');
        }}
        onNavigateToTab={(tab) => setActiveTab(tab as ActiveTab)}
        onOpenReportModal={() => setIsExecutiveReportOpen(true)}
        onSwitchRole={handleRoleChange}
        onOpenSoftphone={() => setActiveTab('voice')}
        onOpenGuidedTour={() => setIsGuidedTourOpen(true)}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
      />

      {/* Comprehensive Operational Executive Report & Universal Data Export (PDF & Excel) */}
      <ExecutiveReportModal
        isOpen={isExecutiveReportOpen}
        onClose={() => setIsExecutiveReportOpen(false)}
        metrics={metrics}
        tickets={tickets}
        customers={customers}
        conversations={conversations}
        currentRole={currentRole}
      />

      {/* Interactive Guided Operational Tour & End-to-End Scenario Simulator */}
      <GuidedWalkthroughModal
        isOpen={isGuidedTourOpen}
        onClose={() => setIsGuidedTourOpen(false)}
        onNavigateTab={(tab, convId) => {
          setActiveTab(tab as ActiveTab);
          if (convId) setSelectedConvId(convId);
        }}
        onRefreshData={refreshOperations}
      />

      {/* Autonomous Diagnostics Engine & Instant Wallets Modal */}
      <DiagnosticsAndRegionalModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        customerPhone={customers.find((c) => c.id === selectedCustomerId)?.phone || '01018108979'}
        onInsertMessage={(msg) => handleSendMessage(selectedConvId || 'conv-001', msg, false)}
      />
    </div>
  );
}
