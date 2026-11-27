# OMNIFLOW OS — دليل التجهيز والتشغيل المحلي على Windows (Local Setup & Quickstart Guide)

**Platform:** Windows 10 Pro 64-bit  
**Runtime:** Node.js v24.13.0 / npm 11.6.2  
**Approved Root Path:** `F:\Dev_Workspace\Call-center`  
**License:** Private / Personal Zero-Cost Edition  

---

## 1. المتطلبات العتادية والبرمجية (Prerequisites)

* **نظام التشغيل:** Microsoft Windows 10 Pro (إصدار 22H2 أو أحدث).
* **المعالج والذاكرة:** Intel Core i7-4790 (4 Cores / 8 Threads) مع 16 GB RAM.
* **مساحة التخزين:** مساحة حرة لا تقل عن 15 GB على القرص `F:`. القرص `C:` محمي ولا يُستخدم.
* **البرمجيات المثبتة مسبقاً:**
  * Node.js (إصدار 22 أو 24)
  * Git for Windows
  * PowerShell 5.1 أو أحدث

---

## 2. بنية المجلدات المعتمدة (Workspace Directory Structure)

```text
F:\Dev_Workspace\
├── Call-center\           # كود المشروع والمستودع البرمجي المعتمد
│   ├── server.ts          # نقطة دخول الخادم (Express + Vite)
│   ├── src/               # واجهة المستخدم (React 19 + Tailwind)
│   ├── server/            # منطق الأعمال والمتحكمات والتدقيق
│   └── docs/              # وثائق التشغيل والأمان والمعمارية
├── Data\OMNIFLOW_OS\      # قاعدة البيانات المحلية والمفاتيح المشفرة (db_state.json)
├── Backups\OMNIFLOW_OS\   # النسخ الاحتياطية المؤرخة
├── Cache\OMNIFLOW_OS\     # كاش الحزم وأدوات البناء
├── Logs\OMNIFLOW_OS\      # سجلات التشغيل والأنشطة
└── Registry\projects.json # سجل المشاريع المركزي وعزل مساحات العمل
```

---

## 3. خطوات التجهيز والتشغيل خطوة بخطوة (Step-by-Step Execution)

### الخطوة 1: ضبط مسارات الكاش والبيانات
تأكد من ضبط مسارات npm لتظل دائماً على القرص `F:` لحماية القرص `C:`:
```powershell
npm config set cache "F:\Dev_Workspace\Cache\npm"
```

### الخطوة 2: تثبيت الحزم بنظام القفل المعتمد
داخل مجلد المستودع `F:\Dev_Workspace\Call-center`:
```powershell
npm ci --no-audit --no-fund
```

### الخطوة 3: التحقق من كود TypeScript والـ Lint
```powershell
npm run lint
```

### الخطوة 4: تشغيل التطبيق في وضع التطوير المحلي
```powershell
npm run dev
```

عند نجاح الإقلاع، ستظهر رسالة:
```text
[AI Contact Center OS] Server listening on http://127.0.0.1:3000
[Storage] Initialized durable persistence engine at F:\Dev_Workspace\Data\OMNIFLOW_OS\db_state.json
```

### الخطوة 5: التحقق من فحص الصحة (Health Check)
افتح المتصفح أو شغّل استعلام PowerShell:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/health"
```
الاستجابة المتوقعة:
```json
{
  "status": "healthy",
  "system": "AI Contact Center OS",
  "version": "1.0.2-enterprise",
  "mode": "LOCAL_ZERO_COST",
  "host": "127.0.0.1:3000"
}
```

---

## 4. بناء وتشغيل نسخة الإنتاج المحلية (Production Build & Start)

1. **بناء الواجهة والخادم:**
   ```powershell
   npm run build
   ```
2. **بدء التشغيل الإنتاجي المستقل:**
   ```powershell
   npm start
   ```
