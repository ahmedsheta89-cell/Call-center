/**
 * @file src/lib/i18n.ts
 * Enterprise Arabic Localization Dictionary & Formatting Utilities
 * Standard terminology compliant with GCC / Saudi Enterprise Contact Center & CITC / CST frameworks.
 */

export const ar = {
  appName: 'نظام تشغيل مراكز الاتصال والعمليات الذكية',
  orgName: 'شركة مدار لخدمات العملاء المتقدمة (Madar Enterprise)',
  tagline: 'المنصة المؤسسية الموحدة لخدمة العملاء، التوجيه الذكي، وإدارة القوى العاملة بالذكاء الاصطناعي',

  // Roles
  roles: {
    Supervisor: 'مشرف العمليات التشغيلية (Supervisor)',
    Agent: 'وكيل خدمة العملاء (Customer Agent)',
    QA: 'مسؤول ضبط الجودة (QA Specialist)',
    Analyst: 'محلل بيانات الأعمال (BI Analyst)',
    Admin: 'مدير النظام التقني (System Admin)',
    Owner: 'مالك المنصة (Platform Owner)',
  },

  // Channels
  channels: {
    all: 'كافة القنوات',
    whatsapp: 'واتساب للأعمال (WhatsApp Cloud API)',
    webchat: 'الدردشة الحية الفورية (Web Chat)',
    voice: 'الاتصالات الهاتفية (Cloud PBX / SIP)',
    email: 'البريد الإلكتروني المؤسسي (Email)',
    instagram: 'رسائل إنستغرام (Instagram Direct)',
    messenger: 'فيسبوك ماسنجر (Messenger)',
    sms: 'الرسائل النصية القصيرة (SMS Gateway)',
  },

  // Ticket & Conversation Statuses
  statuses: {
    all: 'الكل',
    open: 'مفتوحة وجارية',
    pending: 'قيد الانتظار والمتابعة',
    resolved: 'تم الحل بنجاح',
    closed: 'مغلقة ومؤرشفة',
    new: 'تذكرة جديدة',
    in_progress: 'قيد المعالجة النشطة',
    pending_customer: 'بانتظار إفادة العميل',
  },

  // SLA Statuses
  slaStatuses: {
    healthy: 'ضمن نطاق الالتزام (Healthy)',
    warning: 'اقتراب موعد الاستحقاق (Warning)',
    at_risk: 'معرّضة لخطر التجاوز (At Risk)',
    breached: 'تم تجاوز اتفاقية الخدمة (Breached)',
  },

  // Priorities
  priorities: {
    low: 'منخفضة',
    medium: 'متوسطة',
    high: 'عالية',
    urgent: 'حرجة وعاجلة جداً',
  },

  // Customer Tiers
  tiers: {
    all: 'جميع الفئات',
    vip: 'كبار العملاء (VIP)',
    priority: 'أولوية ممتازة (Priority)',
    standard: 'عميل قياسي (Standard)',
  },

  // Agent States
  agentStates: {
    online: 'متاح ومستعد لاستقبال المحادثات',
    busy: 'مشغول بمحادثة أو مكالمة جارية',
    break: 'في فترة استراحة رسمية',
    offline: 'غير متصل بالخدمة',
  },

  // Metrics Terms
  metrics: {
    activeConversations: 'المحادثات النشطة',
    activeCalls: 'المكالمات الهاتفية الحية',
    waitingQueue: 'طابور الانتظار (Queue)',
    slaRisk: 'تذاكر حرجة مهددة للتجاوز',
    agentsOnline: 'الوكلاء المتصلون حالياً',
    agentsBusy: 'الوكلاء المنشغلون بالخدمة',
    csat: 'مؤشر رضا العملاء (CSAT)',
    fcr: 'معدل الحل من أول اتصال (FCR)',
    aht: 'متوسط زمن معالجة المحادثة (AHT)',
    adherence: 'نسبة الالتزام بالمناوبات (Adherence)',
    occupancy: 'معدل إشغال الوكلاء (Occupancy)',
  },

  // AI & Automation
  ai: {
    copilotTitle: 'المساعد الذكي للوكيل (AI Copilot)',
    zeroCostTitle: 'وضع التكلفة الصفرية (Zero-Cost Mode)',
    zeroCostDesc: 'معالجة محلية آمنة دون استهلاك أرصدة سحابية',
    cloudAiTitle: 'الذكاء السحابي المتقدم (Gemini 2.5 Flash)',
    confidence: 'نسبة موثوقية الاقتباس',
    citation: 'المرجع النظامي المعتمد من السياسات',
    antiHallucination: 'فحص انعدام الهلوسة (Anti-Hallucination Safe)',
    useReply: 'اعتماد الرد المولد',
  },
};

/**
 * Format currency in Saudi Riyals (SAR / ر.س)
 */
export function formatSAR(amount: number): string {
  return `${amount.toLocaleString('ar-SA')} ر.س`;
}

/**
 * Format timestamp in Arabic local time
 */
export function formatArabicTime(isoDate: string): string {
  if (!isoDate) return '-';
  try {
    const d = new Date(isoDate);
    return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoDate;
  }
}

/**
 * Format full date in Arabic
 */
export function formatArabicDate(isoDate: string): string {
  if (!isoDate) return '-';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}
