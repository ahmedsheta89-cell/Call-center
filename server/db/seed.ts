/**
 * @file server/db/seed.ts
 * Realistic Enterprise Seed Data for AI Contact Center OS
 * Complies with Rule 43: Organization, 10 Agents, 3 Teams, 100 Customers, Conversations, Tickets, Calls, KB, QA.
 */

import { db, SLAPolicy } from './store.ts';
import { UUID, Organization, User, AgentProfile, Customer, CustomerChannel, Conversation, UnifiedMessage, CallSession, Ticket } from '../core/types.ts';

export const DEMO_ORG_ID: UUID = 'org-madar-enterprise-001';

export function initializeSeedData() {
  if (db.organizations.has(DEMO_ORG_ID)) {
    return; // Already initialized
  }

  console.log('[Seed] Initializing enterprise demo dataset...');

  // 1. Organization
  const org: Organization = {
    id: DEMO_ORG_ID,
    name: 'شركة مدار لعمليات وخدمات العملاء الذكية (Madar Ops MEA)',
    slug: 'madar-ops',
    plan: 'enterprise',
    settings: {
      timezone: 'Asia/Riyadh',
      defaultLanguage: 'ar',
      workingHours: { start: '08:00', end: '20:00', days: [0, 1, 2, 3, 4] },
      zeroCostMode: false,
      aiMonthlyBudgetUsd: 250.0,
      aiCurrentMonthSpendUsd: 18.45,
    },
    isActive: true,
    createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.organizations.set(org.id, org);

  // 2. Teams
  const teamsData = [
    { id: 'team-vip-01', name: 'فريق كبار العملاء (VIP Support)', description: 'دعم عملاء الفئة الذهبية وأصحاب الاشتراكات المؤسسية' },
    { id: 'team-general-02', name: 'خدمة العملاء العامة والشكاوى (Omnichannel Ops)', description: 'استقبال استفسارات الواتساب، الشات، والإنستغرام' },
    { id: 'team-tech-03', name: 'الدعم التقني والفوترة (Tech & Billing)', description: 'معالجة مشاكل التطبيق، الفواتير، وبوابات الدفع' },
  ];
  teamsData.forEach((t) => {
    db.teams.set(t.id, {
      id: t.id,
      organizationId: DEMO_ORG_ID,
      name: t.name,
      description: t.description,
      memberCount: 3,
    });
  });

  // 3. Users & Agents (10 Agents + Supervisor + QA + Owner)
  const usersData: Array<{
    id: UUID;
    email: string;
    fullName: string;
    role: string;
    teamId?: UUID;
    skills: string[];
    status: 'online' | 'busy' | 'break' | 'offline';
  }> = [
    { id: 'usr-admin-01', email: 'director@madar.com', fullName: 'سلطان القحطاني', role: 'Owner', skills: ['Leadership', 'All'], status: 'online' },
    { id: 'usr-sup-01', email: 'supervisor@madar.com', fullName: 'منى الشمري', role: 'Supervisor', skills: ['Escalations', 'QA', 'Supervision'], status: 'online' },
    { id: 'usr-qa-01', email: 'qa.lead@madar.com', fullName: 'خالد العتيبي', role: 'QA', skills: ['Compliance', 'Auditing'], status: 'online' },
    { id: 'usr-analyst-01', email: 'analyst@madar.com', fullName: 'ريم الزهراني', role: 'Analyst', skills: ['BI', 'Reporting'], status: 'online' },
    
    // 10 Contact Center Agents
    { id: 'usr-agt-01', email: 'sara.ahmed@madar.com', fullName: 'سارة أحمد', role: 'Agent', teamId: 'team-vip-01', skills: ['VIP', 'Billing', 'Arabic', 'English'], status: 'online' },
    { id: 'usr-agt-02', email: 'omar.khalid@madar.com', fullName: 'عمر خالد', role: 'Agent', teamId: 'team-vip-01', skills: ['VIP', 'Enterprise', 'Retention'], status: 'busy' },
    { id: 'usr-agt-03', email: 'noura.fahad@madar.com', fullName: 'نورة فهد', role: 'Agent', teamId: 'team-vip-01', skills: ['VIP', 'Contracts'], status: 'online' },
    { id: 'usr-agt-04', email: 'tariq.mansoor@madar.com', fullName: 'طارق منصور', role: 'Agent', teamId: 'team-general-02', skills: ['WhatsApp', 'Omnichannel', 'Arabic'], status: 'online' },
    { id: 'usr-agt-05', email: 'hind.saleh@madar.com', fullName: 'هند صالح', role: 'Agent', teamId: 'team-general-02', skills: ['Social Media', 'Instagram', 'Messenger'], status: 'online' },
    { id: 'usr-agt-06', email: 'yousef.ali@madar.com', fullName: 'يوسف علي', role: 'Agent', teamId: 'team-general-02', skills: ['Returns', 'Complaints'], status: 'break' },
    { id: 'usr-agt-07', email: 'asma.rashid@madar.com', fullName: 'أسماء راشد', role: 'Agent', teamId: 'team-general-02', skills: ['Chat', 'FAQ', 'Fast Response'], status: 'online' },
    { id: 'usr-agt-08', email: 'faisal.nasser@madar.com', fullName: 'فيصل ناصر', role: 'Agent', teamId: 'team-tech-03', skills: ['API', 'System Outages', 'Tech Support'], status: 'busy' },
    { id: 'usr-agt-09', email: 'lama.ibrahim@madar.com', fullName: 'لمى إبراهيم', role: 'Agent', teamId: 'team-tech-03', skills: ['Refunds', 'Payment Gateways'], status: 'online' },
    { id: 'usr-agt-10', email: 'abdulaziz.saud@madar.com', fullName: 'عبدالعزيز سعود', role: 'Agent', teamId: 'team-tech-03', skills: ['Hardware', 'Voice Telephony'], status: 'offline' },
  ];

  usersData.forEach((u) => {
    const user: User = {
      id: u.id,
      organizationId: DEMO_ORG_ID,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      avatarUrl: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`,
      phoneNumber: '+9665000000' + u.id.slice(-2),
      isActive: true,
      mfaEnabled: true,
      createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.users.set(user.id, user);

    if (u.role === 'Agent' || u.role === 'Supervisor') {
      const agent: AgentProfile = {
        id: 'agt-' + u.id,
        organizationId: DEMO_ORG_ID,
        userId: u.id,
        teamId: u.teamId,
        status: u.status,
        skills: u.skills,
        languages: ['ar', 'en'],
        maxConcurrency: 4,
        currentActiveChats: u.status === 'busy' ? 3 : u.status === 'online' ? 1 : 0,
        currentActiveCalls: u.status === 'busy' ? 1 : 0,
        updatedAt: new Date().toISOString(),
      };
      db.agents.set(agent.id, agent);
    }
  });

  // 4. SLA Policies
  const slaPolicies: SLAPolicy[] = [
    { id: 'sla-urgent', organizationId: DEMO_ORG_ID, name: 'SLA - حالات حرجة وVIP', priority: 'urgent', firstResponseTimeMinutes: 5, resolutionTimeMinutes: 60 },
    { id: 'sla-high', organizationId: DEMO_ORG_ID, name: 'SLA - أولوية عالية', priority: 'high', firstResponseTimeMinutes: 15, resolutionTimeMinutes: 180 },
    { id: 'sla-medium', organizationId: DEMO_ORG_ID, name: 'SLA - قياسي', priority: 'medium', firstResponseTimeMinutes: 30, resolutionTimeMinutes: 720 },
    { id: 'sla-low', organizationId: DEMO_ORG_ID, name: 'SLA - استفسارات عامة', priority: 'low', firstResponseTimeMinutes: 60, resolutionTimeMinutes: 1440 },
  ];
  slaPolicies.forEach((p) => db.slaPolicies.set(p.id, p));

  // 5. Seed 100 Realistic Customers
  const arabFirstNames = ['محمد', 'عبدالله', 'أحمد', 'فاطمة', 'نورة', 'سارة', 'خالد', 'عبدالرحمن', 'مريم', 'ياسر', 'سعود', 'شهد', 'بندر', 'مشاعل', 'طلال', 'ريم', 'حسام', 'العنود', 'ماجد', 'هيا'];
  const arabFamilyNames = ['الغامدي', 'القحطاني', 'العتيبي', 'الشمري', 'الدوسري', 'الحربي', 'المطيري', 'الشهري', 'العسيري', 'التميمي', 'السبيعي', 'العمري', 'القرني', 'الخالدي', 'الرويلي'];
  const cities = ['الرياض', 'جدة', 'الدمام', 'الخبر', 'مكة المكرمة', 'المدينة المنورة', 'أبها', 'تبوك'];

  for (let i = 1; i <= 100; i++) {
    const fn = arabFirstNames[i % arabFirstNames.length];
    const ln = arabFamilyNames[(i * 3) % arabFamilyNames.length];
    const city = cities[i % cities.length];
    const customerId: UUID = `cust-auto-${i.toString().padStart(3, '0')}`;
    const tier = i <= 15 ? 'vip' : i <= 45 ? 'priority' : 'standard';
    const phone = `+9665${(50000000 + i * 791).toString().slice(0, 8)}`;
    const email = `client.${i}@example.com`;

    const customer: Customer = {
      id: customerId,
      organizationId: DEMO_ORG_ID,
      name: `${fn} ${ln}`,
      email,
      phone,
      customerTier: tier,
      lifetimeValue: tier === 'vip' ? 14500 + i * 200 : tier === 'priority' ? 4200 + i * 50 : 850 + i * 15,
      assignedAgentId: 'agt-usr-agt-0' + ((i % 10) + 1).toString().slice(-2),
      tags: tier === 'vip' ? ['كبار العملاء', 'حساب مؤسسي', city] : ['عميل نشط', city],
      customFields: {
        preferredLanguage: 'ar',
        loyaltyPoints: i * 120,
        city,
        accountNumber: `ACC-900${i}`,
      },
      createdAt: new Date(Date.now() - (100 - i) * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.customers.set(customer.id, customer);

    // Customer Channels
    db.customerChannels.set(`chn-${customerId}-wa`, {
      id: `chn-${customerId}-wa`,
      customerId,
      channelType: 'whatsapp',
      externalIdentifier: phone,
      isVerified: true,
      lastInteractionAt: new Date(Date.now() - (i % 5) * 3600000).toISOString(),
    });
  }

  // 6. Seed Conversations & Messages
  const conversationTemplates = [
    {
      channel: 'whatsapp' as const,
      subject: 'طلب ترقية الباقة السنوية إلى فئة الأعمال',
      intent: 'upgrade_package',
      sentiment: 'positive' as const,
      priority: 'high' as const,
      messages: [
        { sender: 'customer', text: 'السلام عليكم، أود معرفة عروض الترقية لباقة الشركات المتاحة حالياً.' },
        { sender: 'agent', text: 'أهلاً بك أستاذي الكريم، يسعدنا خدمتك. باقة الشركات السنوية تتضمن حالياً خصم 20% مع ميزة الرقم الموحد والاتصال غير المحدود.' },
        { sender: 'customer', text: 'ممتاز جداً، هل يمكن إصدار فاتورة ضريبية رسمية باسم المؤسسة؟' },
        { sender: 'agent', text: 'نعم بالتأكيد، يتم إصدار الفاتورة الضريبية فوراً وإرسالها لبريدكم الإلكتروني المعتمد.' },
      ],
    },
    {
      channel: 'whatsapp' as const,
      subject: 'شكوى: تأخر تفعيل خط الألياف البصرية',
      intent: 'complaint_delay',
      sentiment: 'negative' as const,
      priority: 'urgent' as const,
      messages: [
        { sender: 'customer', text: 'السلام عليكم، الفني لم يحضر في الموعد المحدد صباح اليوم وأنا أنتظر منذ 4 ساعات!' },
        { sender: 'agent', text: 'نعتذر بشدة عن هذا التأخير الخارج عن إرادتنا. أقوم حالياً بالتواصل المباشر مع مشرف الفريق الميداني لمعرفة السبب الفوري.' },
        { sender: 'customer', text: 'أرجو حسم الأمر اليوم، لدي أعمال ضرورية مرتبطة باتصال الإنترنت.' },
      ],
    },
    {
      channel: 'webchat' as const,
      subject: 'استفسار عن طريقة سداد الفاتورة عبر Apple Pay',
      intent: 'payment_inquiry',
      sentiment: 'neutral' as const,
      priority: 'medium' as const,
      messages: [
        { sender: 'customer', text: 'مرحباً، هل يمكنني دفع الفاتورة مباشرة عبر Apple Pay من داخل بوابة العملاء؟' },
        { sender: 'agent', text: 'مرحباً بك! نعم بكل تأكيد، خيار Apple Pay متاح مباشرة عند الدخول لخانة سداد الفواتير واختيار البطاقة المحفوظة.' },
      ],
    },
    {
      channel: 'voice' as const,
      subject: 'مكالمة واردة: طلب تفاصيل شريحة التجوال الدولي',
      intent: 'roaming_inquiry',
      sentiment: 'positive' as const,
      priority: 'medium' as const,
      messages: [
        { sender: 'customer', text: '[مكالمة صوتية مسجلة] استفسار بخصوص تغطية باقة تجوال الخليج في دولة الإمارات.' },
        { sender: 'agent', text: '[رد صوتي] تم توضيح أن الباقة تشمل 20 جيجابايت إنترنت ومكالمات استقبال مجانية بدون أي رسوم تجوال إضافية.' },
      ],
    },
    {
      channel: 'instagram' as const,
      subject: 'استفسار عبر رسائل الإنستغرام عن الأجهزة الذكية',
      intent: 'device_inquiry',
      sentiment: 'neutral' as const,
      priority: 'low' as const,
      messages: [
        { sender: 'customer', text: 'مرحبا، هل هاتف iPhone 16 Pro Max متوفر باللون الصحراوي بفرع التحلية؟' },
        { sender: 'agent', text: 'أهلاً بك عزيزي، نعم متوفر حالياً بعدد محدود، هل تود حجز جهاز باسمك لاستلامه اليوم؟' },
      ],
    },
  ];

  for (let cIdx = 1; cIdx <= 25; cIdx++) {
    const tpl = conversationTemplates[(cIdx - 1) % conversationTemplates.length];
    const custId = `cust-auto-${cIdx.toString().padStart(3, '0')}`;
    const convId: UUID = `conv-auto-${cIdx.toString().padStart(3, '0')}`;
    const agentId = `agt-usr-agt-0${((cIdx % 10) + 1).toString().slice(-2)}`;

    const conversation: Conversation = {
      id: convId,
      organizationId: DEMO_ORG_ID,
      customerId: custId,
      channel: tpl.channel,
      status: cIdx === 2 ? 'open' : cIdx % 4 === 0 ? 'resolved' : 'open',
      priority: tpl.priority,
      assignedAgentId: agentId,
      assignedTeamId: 'team-vip-01',
      subject: tpl.subject,
      sentiment: tpl.sentiment,
      intent: tpl.intent,
      slaDueAt: new Date(Date.now() + (tpl.priority === 'urgent' ? 15 : 60) * 60000).toISOString(),
      lastMessageAt: new Date(Date.now() - (cIdx * 7) * 60000).toISOString(),
      createdAt: new Date(Date.now() - (cIdx * 60) * 60000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.conversations.set(conversation.id, conversation);

    // Messages
    tpl.messages.forEach((msg, mIdx) => {
      const msgId: UUID = `msg-${convId}-${mIdx + 1}`;
      const message: UnifiedMessage = {
        id: msgId,
        organizationId: DEMO_ORG_ID,
        conversationId: convId,
        customerId: custId,
        channel: tpl.channel,
        direction: msg.sender === 'customer' ? 'inbound' : 'outbound',
        type: 'text',
        body: msg.text,
        sender: {
          id: msg.sender === 'customer' ? custId : agentId,
          type: msg.sender as 'customer' | 'agent',
          name: msg.sender === 'customer' ? db.customers.get(custId)?.name : 'سارة أحمد',
        },
        status: 'delivered',
        metadata: {},
        createdAt: new Date(Date.now() - (25 - cIdx) * 3600000 + mIdx * 60000).toISOString(),
      };
      db.messages.set(message.id, message);
    });
  }

  // 7. Seed Tickets
  const ticketCategories = ['الفوترة والمدفوعات', 'الدعم الفني والشبكات', 'إلغاء وطلب استرجاع', 'ترقية الباقات', 'استفسارات عامة'];
  for (let t = 1; t <= 15; t++) {
    const custId = `cust-auto-${t.toString().padStart(3, '0')}`;
    const ticketId: UUID = `tkt-auto-${t.toString().padStart(3, '0')}`;
    const prio = t === 1 ? 'urgent' : t <= 5 ? 'high' : 'medium';
    const slaStatus = t === 1 ? 'at_risk' : t === 2 ? 'warning' : 'healthy';

    const ticket: Ticket = {
      id: ticketId,
      organizationId: DEMO_ORG_ID,
      ticketNumber: 1040 + t,
      customerId: custId,
      conversationId: `conv-auto-${t.toString().padStart(3, '0')}`,
      assignedAgentId: `agt-usr-agt-0${((t % 10) + 1).toString().slice(-2)}`,
      teamId: 'team-vip-01',
      title: t === 1 ? 'تأخر زيارة الفني لتركيب الألياف البصرية (طوارئ)' : `طلب معالجة فنية #${1040 + t}`,
      description: 'العميل يطلب التدخل العاجل لحل مشكلة عدم الاتصال وفق معايير الجودة المعتمدة.',
      status: t === 1 ? 'in_progress' : t % 3 === 0 ? 'resolved' : 'new',
      priority: prio,
      category: ticketCategories[t % ticketCategories.length],
      firstResponseDueAt: new Date(Date.now() + 20 * 60000).toISOString(),
      resolutionDueAt: new Date(Date.now() + 120 * 60000).toISOString(),
      slaStatus: slaStatus,
      createdAt: new Date(Date.now() - t * 7200000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.tickets.set(ticket.id, ticket);
  }

  // 8. Seed Calls (Voice sessions)
  for (let c = 1; c <= 8; c++) {
    const custId = `cust-auto-${c.toString().padStart(3, '0')}`;
    const callId: UUID = `call-auto-${c.toString().padStart(3, '0')}`;
    const call: CallSession = {
      id: callId,
      organizationId: DEMO_ORG_ID,
      customerId: custId,
      agentId: 'agt-usr-agt-01',
      direction: c % 2 === 0 ? 'inbound' : 'outbound',
      status: c === 1 ? 'in_progress' : 'completed',
      callerNumber: '+96650123456' + c,
      calleeNumber: '920001234',
      durationSeconds: c === 1 ? 145 : 280 + c * 30,
      recordingUrl: 'https://example.com/recordings/call-' + c + '.wav',
      transcript: 'الموظف: مرحباً بك في شركة مدار لخدمات العملاء، معك سارة. كيف يمكنني مساعدتك اليوم؟\nالعميل: أهلاً أخت سارة، أردت التأكد من تفاصيل العرض السنوي وهل يشمل التجوال الدولي.\nالموظف: نعم أستاذي الفاضل، العرض يشمل 20GB تجوال في دول الخليج بدون أي رسوم إضافية.\nالعميل: ممتاز جداً، سأقوم بالتجديد الآن عبر التطبيق، شكراً لكِ.',
      disposition: 'resolved',
      aiSummary: 'استفسر العميل عن تفاصيل باقة التجوال الخليجي، وتم تأكيد الشمولية وقرر التجديد عبر التطبيق برضا تام.',
      aiSentiment: 'positive',
      startedAt: new Date(Date.now() - c * 3600000).toISOString(),
      endedAt: c === 1 ? undefined : new Date(Date.now() - c * 3600000 + 320000).toISOString(),
    };
    db.calls.set(call.id, call);
  }

  // 9. Knowledge Base Documents
  const kbDocs = [
    {
      id: 'kb-policy-refund',
      title: 'سياسة الاسترجاع والتعويضات المالية الرسمية',
      category: 'السياسات المالية',
      content: 'يحق للعميل استرجاع كامل المبلغ خلال 14 يوماً من تاريخ الاشتراك في حال عدم تفعيل الخدمة من قبل الشركة. يتم تحويل التعويض عبر الحساب البنكي المسجل خلال 3 إلى 5 أيام عمل بعد موافقة المشرف المالي.',
      chunks: [
        { id: 'chunk-1', content: 'يحق للعميل استرجاع كامل المبلغ خلال 14 يوماً من تاريخ الاشتراك إذا لم يتم تفعيل الخدمة.', embeddingKeyword: 'استرجاع تعويض مالي 14 يوم' },
        { id: 'chunk-2', content: 'يتم تحويل التعويض عبر الحساب البنكي المسجل خلال 3-5 أيام عمل بموافقة المشرف المالي.', embeddingKeyword: 'تحويل الحساب البنكي أيام عمل' },
      ],
    },
    {
      id: 'kb-roaming-rules',
      title: 'دليل باقات التجوال الدولي وخدمات المسافرين',
      category: 'الباقات والاشتراكات',
      content: 'باقة تجوال الخليج تشمل 20 جيجابايت إنترنت ومكالمات استقبال مجانية في الكويت، الإمارات، البحرين، قطر، وعمان. يتم تفعيل الباقة تلقائياً عند الاتصال بأي شبكة شريكة.',
      chunks: [
        { id: 'chunk-3', content: 'باقة تجوال الخليج تشمل 20 جيجابايت إنترنت ومكالمات استقبال مجانية في دول مجلس التعاون.', embeddingKeyword: 'تجوال الخليج إنترنت استقبال مجاني' },
      ],
    },
  ];
  kbDocs.forEach((doc) => {
    db.knowledgeDocuments.set(doc.id, {
      id: doc.id,
      organizationId: DEMO_ORG_ID,
      title: doc.title,
      category: doc.category,
      tags: ['سياسات', 'معتمدة'],
      version: 1,
      status: 'published',
      content: doc.content,
      chunks: doc.chunks,
      citationsCount: 18,
      publishedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  // 10. QA Rubric & Evaluation
  const rubricId = 'rubric-standard-v1';
  db.qaRubrics.set(rubricId, {
    id: rubricId,
    organizationId: DEMO_ORG_ID,
    title: 'معيار تقييم المكالمات والمحادثات الموحد (Omnichannel Rubric)',
    criteria: [
      { category: 'الترحيب والتعريف بالهوية (Greeting)', weight: 10, description: 'الترحيب الودود وذكر الاسم والشركة بوضوح' },
      { category: 'التحقق من هوية العميل وأمان البيانات (Verification)', weight: 10, description: 'التحقق من رقم الحساب أو الهوية عند العمليات الحساسة' },
      { category: 'دقة المعلومات وصحة الحل (Accuracy)', weight: 25, description: 'تقديم معلومات مطابقة لقاعدة المعرفة والسياسات الرسمية' },
      { category: 'التعاطف وحسن الاستماع (Empathy & Tone)', weight: 15, description: 'إظهار التفهم لشكوى العميل واستخدام نبرة مهنية إيجابية' },
      { category: 'حل المشكلة من أول اتصال (FCR / Resolution)', weight: 25, description: 'إغلاق المشكلة أو اتخاذ إجراء ملموس فوري دون تشتيت' },
      { category: 'الامتثال والإنهاء اللبق (Compliance & Closing)', weight: 15, description: 'السؤال عما إذا كان هناك استفسار آخر وتوديع العميل بلطف' },
    ],
    passingScore: 80,
    isActive: true,
    createdAt: new Date().toISOString(),
  });

  db.qaEvaluations.set('eval-01', {
    id: 'eval-01',
    organizationId: DEMO_ORG_ID,
    rubricId,
    conversationId: 'conv-auto-001',
    agentId: 'agt-usr-agt-01',
    evaluatorType: 'ai_evaluator',
    evaluatorName: 'AI QA Inspector Core',
    totalScore: 94,
    passed: true,
    findings: [
      { criterion: 'Greeting', score: 10, maxScore: 10, note: 'ترحيب ممتاز ومطابق للدليل' },
      { criterion: 'Accuracy', score: 25, maxScore: 25, note: 'تم شرح باقة الشركات ونسب الخصم بدقة 100%' },
      { criterion: 'Compliance', score: 14, maxScore: 15, note: 'التزام تام بسياسة عدم الوعد بأي خصم غير معتمد' },
    ],
    feedback: 'أداء متميز واستجابة سريعة مع التزام كامل بسياسات الفوترة والامتثال المؤسسي.',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  });

  // 11. Automation & AI Routing Rules
  const autoRules = [
    {
      id: 'rule-vip-routing',
      name: 'التوجيه الذكي لعملاء كبار الشخصيات (VIP Skill Routing)',
      trigger: 'conversation_created',
      conditions: [
        { field: 'customer.tier', operator: 'equals', value: 'vip' },
      ],
      actions: [
        { type: 'assign_team', payload: { teamId: 'team-vip-01', teamName: 'فريق كبار العملاء VIP' } },
        { type: 'set_priority', payload: { priority: 'urgent' } },
        { type: 'notify_supervisor', payload: { channel: 'in_app', message: 'محادثة جديدة من عميل VIP' } },
      ],
      isActive: true,
      executionCount: 142,
      lastExecutedAt: new Date(Date.now() - 15 * 60000).toISOString(),
    },
    {
      id: 'rule-churn-prevention',
      name: 'كشف الاستياء والتصعيد التلقائي (AI Churn Risk Shield)',
      trigger: 'message_received',
      conditions: [
        { field: 'message.sentiment', operator: 'equals', value: 'negative' },
        { field: 'conversation.intent', operator: 'contains', value: 'complaint' },
      ],
      actions: [
        { type: 'set_priority', payload: { priority: 'urgent' } },
        { type: 'tag_conversation', payload: { tag: 'خطر_إلغاء_اشتراك' } },
        { type: 'ai_copilot_suggest', payload: { context: 'تقديم خيار التعويض الفوري أو إحالة لمدير الخدمة' } },
      ],
      isActive: true,
      executionCount: 88,
      lastExecutedAt: new Date(Date.now() - 28 * 60000).toISOString(),
    },
    {
      id: 'rule-sla-auto-escalate',
      name: 'التصعيد التلقائي قبل اختراق اتفاقية مستوى الخدمة (SLA Auto-Escalation)',
      trigger: 'sla_warning',
      conditions: [
        { field: 'ticket.slaStatus', operator: 'equals', value: 'at_risk' },
      ],
      actions: [
        { type: 'escalate_tier', payload: { targetTier: 'Tier 2 Senior Specialists' } },
        { type: 'send_webhook', payload: { url: 'https://pager.madar.sa/api/escalate-sla', event: 'SLA_NEAR_BREACH' } },
      ],
      isActive: true,
      executionCount: 29,
      lastExecutedAt: new Date(Date.now() - 65 * 60000).toISOString(),
    },
    {
      id: 'rule-whatsapp-auto-ack',
      name: 'التأكيد الفوري وإنشاء تذكرة للمراسلات الواردة عبر واتساب',
      trigger: 'conversation_created',
      conditions: [
        { field: 'conversation.channel', operator: 'equals', value: 'whatsapp' },
      ],
      actions: [
        { type: 'send_whatsapp_template', payload: { template: 'order_status_update_ar' } },
        { type: 'auto_create_ticket', payload: { category: 'خدمة عملاء عامة' } },
      ],
      isActive: true,
      executionCount: 312,
      lastExecutedAt: new Date(Date.now() - 5 * 60000).toISOString(),
    },
  ];

  autoRules.forEach((rule) => {
    db.automationRules.set(rule.id, {
      ...rule,
      organizationId: DEMO_ORG_ID,
    });
  });

  // 12. Workforce Management (WFM) & Shift Schedules
  const todayStr = new Date().toISOString().split('T')[0];
  const shiftsData = [
    { agentId: 'agt-usr-agt-01', start: '08:00', end: '16:00', status: 'active' as const, adherence: 96 },
    { agentId: 'agt-usr-agt-02', start: '08:00', end: '16:00', status: 'active' as const, adherence: 94 },
    { agentId: 'agt-usr-agt-03', start: '08:00', end: '16:00', status: 'break' as const, adherence: 91 },
    { agentId: 'agt-usr-agt-04', start: '09:00', end: '17:00', status: 'active' as const, adherence: 98 },
    { agentId: 'agt-usr-agt-05', start: '09:00', end: '17:00', status: 'active' as const, adherence: 92 },
    { agentId: 'agt-usr-agt-06', start: '12:00', end: '20:00', status: 'active' as const, adherence: 89 },
    { agentId: 'agt-usr-agt-07', start: '14:00', end: '22:00', status: 'scheduled' as const, adherence: 95 },
    { agentId: 'agt-usr-agt-08', start: '14:00', end: '22:00', status: 'scheduled' as const, adherence: 93 },
    { agentId: 'agt-usr-agt-09', start: '16:00', end: '00:00', status: 'scheduled' as const, adherence: 97 },
    { agentId: 'agt-usr-agt-10', start: '00:00', end: '08:00', status: 'completed' as const, adherence: 99 },
  ];

  shiftsData.forEach((s, idx) => {
    const shiftId = `shift-2026-${(idx + 1).toString().padStart(3, '0')}`;
    db.shifts.set(shiftId, {
      id: shiftId,
      organizationId: DEMO_ORG_ID,
      agentId: s.agentId,
      startTime: `${todayStr}T${s.start}:00Z`,
      endTime: `${todayStr}T${s.end}:00Z`,
      status: s.status,
      adherencePercentage: s.adherence,
    });
  });

  console.log('[Seed] Enterprise demo dataset seeded successfully with full multi-tenant records.');
}
