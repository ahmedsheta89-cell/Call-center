# OMNIFLOW OS — كتيب التشغيل والصيانة اليومية (Operations & Maintenance Runbook)

**Operating System:** Windows 10 Pro 64-bit  
**Platform Host:** `127.0.0.1:3000`  
**Data Directory:** `F:\Dev_Workspace\Data\OMNIFLOW_OS\`  

---

## 1. العمليات الروتينية (Standard Operating Procedures)

### A. بدء التشغيل في وضع التطوير (Start Dev Mode)
```powershell
Set-Location "F:\Dev_Workspace\Call-center"
npm run dev
```

### B. بدء التشغيل الإنتاجي المستقل (Start Production Mode)
```powershell
Set-Location "F:\Dev_Workspace\Call-center"
npm run build
npm start
```

### C. فحص حالة النظام والتحقق الصحي (Health Check)
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/health"
```

### D. إيقاف الخادم بطريقة آمنة (Graceful Shutdown)
* بالضغط على `Ctrl + C` في نافذة PowerShell.
* يقوم الخادم بحفظ كافة التعديلات العالقة في `db_state.json`، ومزامنة القرص `fsync`، وإطلاق قفل العمليات `db_state.lock` بأمان قبل الخروج.

---

## 2. إدارة واستكشاف الأخطاء (Troubleshooting & Remediation)

### 1. خطأ تعارض المنفذ 3000 (Port 3000 Already in Use)
إذا ظهر الخطأ `EADDRINUSE: address already in use 127.0.0.1:3000`:
```powershell
# 1. كشف العملية التي تستخدم المنفذ 3000
$conn = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "Process using port 3000: PID $($conn.OwningProcess)"
    # 2. إيقاف العملية العالقة
    Stop-Process -Id $conn.OwningProcess -Force
    Write-Host "Port 3000 released successfully."
}
```

### 2. معالجة القفل العالق (Stale Lock File Remediation)
إذا أُغلقت نافذة التشغيل فجأة أو انقطعت الكهرباء، قد يتبقى ملف `db_state.lock`:
* **المعالجة الآلية:** يتحقق خادم OmniFlow تلقائياً عند الإقلاع من الـ PID المسجل في القفل. إذا كانت العملية غير موجودة، يقوم الخادم بتنظيف القفل ومواصلة الإقلاع دون أي تدخل يدوي (`STALE_LOCK_RECOVERED`).
* **المعالجة اليدوية الطارئة (إن لزم):**
```powershell
Remove-Item "F:\Dev_Workspace\Data\OMNIFLOW_OS\db_state.lock" -Force -ErrorAction SilentlyContinue
```

### 3. استعادة البيانات من النسخة الاحتياطية المباشرة (Hot Backup Recovery)
إذا تعطل ملف البيانات الرئيسي `db_state.json`:
```powershell
Copy-Item "F:\Dev_Workspace\Data\OMNIFLOW_OS\db_state.json.bak" "F:\Dev_Workspace\Data\OMNIFLOW_OS\db_state.json" -Force
Write-Host "Database restored from hot backup."
```

---

## 3. التحقق الدوري من التكلفة الصفرية (Zero-Cost Verification Audit)

للتأكد من عدم وجود أي اتصالات شبكية خارجية تجريها المنصة أثناء العمل:
```powershell
# مراقبة الاتصالات الصادرة من عملية الخادم
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
foreach ($p in $nodeProcesses) {
    Get-NetTCPConnection -OwningProcess $p.Id -ErrorAction SilentlyContinue | 
        Where-Object { $_.RemoteAddress -ne '127.0.0.1' -and $_.RemoteAddress -ne '0.0.0.0' -and $_.RemoteAddress -ne '::' -and $_.RemoteAddress -ne '::1' } |
        Select-Object OwningProcess, LocalAddress, LocalPort, RemoteAddress, RemotePort, State
}
```
**النتيجة المتوقعة:** صفر اتصالات خارجية نشطة (جميع الاتصالات داخلية على Loopback).
