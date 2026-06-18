# المحلل المالي

واجهة محادثة عربية لمساعد تحليل البيانات المالية — مدعوم بـ **Groq** + **Google Sheets**.

## الأسرار

| الاسم | الاستخدام |
|-------|-----------|
| `GROQ_API_KEY` | مفتاح مجاني من [console.groq.com/keys](https://console.groq.com/keys) |
| `GOOGLE_SHEET_ID` | معرّف الجدول من الرابط |
| `GOOGLE_SHEET_GID` | رقم التبويب (افتراضي `0`) |
| `AI_PROVIDER` | `groq` (افتراضي) أو `gemini` |

## Google Sheets

1. افتح الجدول → **مشاركة** → **أي شخص لديه الرابط — عارض**
2. انسخ المعرّف من الرابط:
   ```
   https://docs.google.com/spreadsheets/d/[هذا_المعرّف]/edit
   ```
3. أضفه في `.env` أو Render:
   ```
   GOOGLE_SHEET_ID=1gqj8SSDBcq7ZWHw4SK8DVYosLqaOQ6ovZzy1tWvQNRw
   ```

## التشغيل المحلي

```bash
cp .env.example .env
npm install
npm start
```

## النشر على Render

| Key | Value |
|-----|-------|
| `GROQ_API_KEY` | مفتاح Groq |
| `GOOGLE_SHEET_ID` | معرّف الجدول |
| `GOOGLE_SHEET_GID` | `0` |
| `AI_PROVIDER` | `groq` |

## كيف يعمل

- يجلب البيانات من Google Sheets كل 5 دقائق (تخزين مؤقت)
- يُلخّص المصاريف والإيرادات لكل مشروع
- يُرسل السياق مع كل سؤال للذكاء الاصطناعي
