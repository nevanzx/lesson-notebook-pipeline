export function chunk10(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i += 10) out.push(arr.slice(i, i + 10));
  return out;
}

export async function gradeBatch(workerUrl, apiKey, payload) {
  const res = await fetch(`${workerUrl.replace(/\/$/, "")}/grade`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = new Error(`grade failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  // New worker shape is {rows, usage}; accept a bare array (old worker) too.
  if (Array.isArray(data)) return { rows: data, usage: { input: 0, output: 0, total: 0 } };
  const usage = (data && data.usage) || {};
  return {
    rows: (data && data.rows) || [],
    usage: {
      input: usage.input || 0,
      output: usage.output || 0,
      total: usage.total || 0,
    },
  };
}

export async function gradeAll(workerUrl, apiKey, model, saMeta, answersByStudent, onProgress) {
  const batches = chunk10(answersByStudent);
  const grades = new Map();
  const usage = { input: 0, output: 0, total: 0 };
  let done = 0;
  const total = answersByStudent.length;
  async function worker() {
    while (batches.length > 0) {
      const batch = batches.shift();
      const { rows, usage: u } = await gradeBatch(workerUrl, apiKey, {
        model,
        question: saMeta.question,
        rubric: saMeta.rubric,
        maxPoints: saMeta.maxPoints,
        answers: batch,
      });
      for (const r of rows) grades.set(r.ref, { score: r.score, reason: r.reason });
      usage.input += u.input || 0;
      usage.output += u.output || 0;
      usage.total += u.total || 0;
      done += batch.length;
      if (onProgress) onProgress(done, total);
    }
  }
  const runners = [];
  const n = Math.min(2, batches.length);
  for (let i = 0; i < n; i++) runners.push(worker());
  await Promise.all(runners);
  return { grades, usage };
}
