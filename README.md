# المحلل المالي

واجهة محادثة عربية لمساعد تحليل البيانات المالية — مدعوم بـ **Groq** (مجاني).

## الأسرار

| الاسم | الاستخدام |
|-------|-----------|
| `GROQ_API_KEY` | مفتاح مجاني من [console.groq.com/keys](https://console.groq.com/keys) |
| `AI_PROVIDER` | `groq` (افتراضي) أو `gemini` |
| `GROQ_MODEL` | اختياري — الافتراضي `llama-3.3-70b-versatile` |

## التشغيل المحلي

```bash
cp .env.example .env
# أضف GROQ_API_KEY في .env
npm install
npm start
```

## النشر على Render

في Environment Variables:

| Key | Value |
|-----|-------|
| `AI_PROVIDER` | `groq` |
| `GROQ_API_KEY` | مفتاحك من Groq |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` |

## بديل: Google Gemini

إذا نجح إنشاء مشروع في Google AI Studio:

```
AI_PROVIDER=gemini
GEMINI_API_KEY=...
```

## ملاحظة

- لا يتصل تلقائياً ببيانات شركتك من Twin
- يمكن لاحقاً ربط ملف Excel أو Google Sheets
