require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const AI_PROVIDER = (process.env.AI_PROVIDER || 'groq').toLowerCase();
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const SYSTEM_PROMPT = `أنت المحلل المالي لشركة مقاولات. تجيب بالعربية بشكل واضح ومهني.
تكيّف مستوى التفصيل حسب صفة المستخدم المذكورة في رسالته (مدير عام، مدير مالي، مدير مشروع، محاسب).
قدّم تحليلاً مالياً عملياً: أرقام، مقارنات، هوامش ربح، وتنبيهات للمخاطر عند الحاجة.
إذا لم تتوفر بيانات فعلية عن مشروع أو مقاول معيّن، وضّح ذلك واطلب الأرقام أو مصدر البيانات بدلاً من اختلاق أرقام.`;

const isConfigured = () => {
  if (AI_PROVIDER === 'gemini') {
    return GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY';
  }
  return GROQ_API_KEY && GROQ_API_KEY !== 'YOUR_GROQ_API_KEY';
};

async function chatWithGroq(message) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'فشل الاتصال بـ Groq API');
  }

  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw new Error('لم يُرجع النموذج إجابة');
  return reply;
}

async function chatWithGemini(message) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: message }] }],
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'فشل الاتصال بـ Gemini API');
  }

  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error('لم يُرجع النموذج إجابة');
  return reply;
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/api/health', (_req, res) => {
  res.json({ configured: isConfigured(), provider: AI_PROVIDER });
});

app.post('/api/chat', async (req, res) => {
  if (!isConfigured()) {
    const keyName = AI_PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'GROQ_API_KEY';
    return res.status(503).json({
      error: `الأسرار غير مُعدّة. أضف ${keyName} في ملف .env أو Render`,
    });
  }

  const { message } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ error: 'الرسالة فارغة' });
  }

  try {
    const reply = AI_PROVIDER === 'gemini'
      ? await chatWithGemini(message)
      : await chatWithGroq(message);
    res.json({ reply });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/favicon.ico', (_req, res) => res.status(204).end());

app.listen(PORT, () => {
  console.log(`المحلل المالي يعمل على http://localhost:${PORT} (${AI_PROVIDER})`);
  if (!isConfigured()) {
    const keyName = AI_PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'GROQ_API_KEY';
    console.warn(`تحذير: أضف ${keyName}`);
  }
});
