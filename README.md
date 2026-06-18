# المحلل المالي

واجهة محادثة عربية لمساعد تحليل البيانات المالية عبر Twin.so.

## الأسرار

| الاسم | الاستخدام |
|-------|-----------|
| `TWIN_AGENT_ID` | معرّف الوكيل من Twin |
| `TWIN_API_KEY` | مفتاح API من Twin → Agent → Settings |

## التشغيل المحلي

```bash
cp .env.example .env
# عدّل .env وأضف قيمك
npm install
npm start
```

افتح `http://localhost:3000`

## النشر على GitHub

### 1. أسرار المستودع (تم إعدادها)

في **Settings → Secrets and variables → Actions** أضف:

- `TWIN_AGENT_ID`
- `TWIN_API_KEY`

عند كل push، يشغّل GitHub Actions اختباراً تلقائياً للتأكد من صحة الإعداد.

### 2. النشر المباشر (Render — مجاني)

GitHub Pages لا يدعم خادم Node.js، لذا نستخدم [Render](https://render.com):

1. أنشئ حساباً على Render واربط مستودع GitHub
2. اختر **New → Blueprint** وحدّد هذا المستودع (يستخدم `render.yaml`)
3. في Render → Environment أضف:
   - `TWIN_AGENT_ID` = نفس قيمة GitHub Secret
   - `TWIN_API_KEY` = نفس قيمة GitHub Secret
4. بعد النشر ستحصل على رابط مثل `https://financial-agent.onrender.com`

### 3. (اختياري) نشر تلقائي عبر Deploy Hook

1. في Render → Service → Settings → Deploy Hook → انسخ الرابط
2. في GitHub أضف سراً جديداً: `RENDER_DEPLOY_HOOK`
3. عند كل push إلى `main` يُعاد النشر تلقائياً

## الأمان

- لا تضع المفاتيح في `index.html` أو أي ملف يُرفع إلى Git
- ملف `.env` مستثنى عبر `.gitignore`
- الخادم يتصل بـ Twin API ولا يُرسل المفتاح للمتصفح
