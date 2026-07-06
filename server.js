require('dotenv').config();

const express = require('express');
const path = require('path');
const { buildSheetReport, listProjects, listExpenseGroups, listExpenseAccounts, isSheetConfigured } = require('./sheets');
const { SYSTEM_PROMPT } = require('./prompt');
const { extractRole, cleanQuery } = require('./analytics');

const app = express();
const PORT = process.env.PORT || 3000;

const AI_PROVIDER = (process.env.AI_PROVIDER || 'groq').toLowerCase();
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const isConfigured = () => {
  if (AI_PROVIDER === 'gemini') {
    return GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY';
  }
  return GROQ_API_KEY && GROQ_API_KEY !== 'YOUR_GROQ_API_KEY';
};

function cleanReply(text) {
  return text
    .replace(/\n*💡[\s\S]*$/g, '')
    .replace(/\n*هل تريد[\s\S]*$/g, '')
    .replace(/\n*يمكنني[\s\S]*$/g, '')
    .trim();
}

async function buildUserMessage(userMessage, sheetContext) {
  const role = extractRole(userMessage);
  const query = cleanQuery(userMessage);

  let msg = '## البيانات المتاحة\n\n';
  msg += sheetContext || 'لا تتوفر بيانات.';
  msg += '\n\n(الجداول والمخططات تُعرض في الواجهة — لا تكررها)\n\n---\n\n';
  msg += `## سؤال المستخدم\n`;
  if (role) msg += `الدور: ${role}\n`;
  msg += query;
  msg += '\n\nاكتب تفسيراً مختصراً يركز على **نوع السجل** ومعنى الأرقام. بدون نصائح.';

  return msg;
}

async function chatWithGroq(message, sheetContext) {
  const content = await buildUserMessage(message, sheetContext);
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
        { role: 'user', content },
      ],
      temperature: 0.1,
      max_tokens: 600,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'فشل الاتصال بـ Groq API');

  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw new Error('لم يُرجع النموذج إجابة');
  return cleanReply(reply);
}

async function chatWithGemini(message, sheetContext) {
  const content = await buildUserMessage(message, sheetContext);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: content }] }],
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'فشل الاتصال بـ Gemini API');

  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error('لم يُرجع النموذج إجابة');
  return cleanReply(reply);
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/api/health', (_req, res) => {
  res.json({
    configured: isConfigured(),
    provider: AI_PROVIDER,
    sheet: isSheetConfigured(),
  });
});

app.get('/api/projects', async (_req, res) => {
  try {
    const projects = await listProjects();
    res.json({ projects });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/expense-groups', async (req, res) => {
  try {
    const { projectCode, projectName } = req.query;
    const groups = await listExpenseGroups({
      projectCode: projectCode || undefined,
      projectName: projectName || undefined,
    });
    res.json({ groups });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/expense-accounts', async (req, res) => {
  try {
    const { projectCode, projectName, groupName } = req.query;
    const accounts = await listExpenseAccounts({
      projectCode: projectCode || undefined,
      projectName: projectName || undefined,
      groupName: groupName || undefined,
    });
    res.json({ accounts });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/chat', async (req, res) => {
  if (!isConfigured()) {
    const keyName = AI_PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'GROQ_API_KEY';
    return res.status(503).json({
      error: `الأسرار غير مُعدّة. أضف ${keyName} في ملف .env أو Render`,
    });
  }

  const { message, currency } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ error: 'الرسالة فارغة' });
  }

  try {
    const report = await buildSheetReport(message, currency);
    const reply = AI_PROVIDER === 'gemini'
      ? await chatWithGemini(message, report.context)
      : await chatWithGroq(message, report.context);

    res.json({
      reply,
      tables: report.tables,
      charts: report.charts,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/favicon.ico', (_req, res) => res.status(204).end());

app.listen(PORT, () => {
  console.log(`المحلل المالي يعمل على http://localhost:${PORT} (${AI_PROVIDER})`);
  if (isSheetConfigured()) console.log(`Google Sheet: ${process.env.GOOGLE_SHEET_ID}`);
  if (!isConfigured()) {
    const keyName = AI_PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'GROQ_API_KEY';
    console.warn(`تحذير: أضف ${keyName}`);
  }
});
