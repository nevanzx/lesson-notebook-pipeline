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
  return res.json();
}

export async function gradeAll(workerUrl, apiKey, model, saMeta, answersByStudent, onProgress) {
  const batches = chunk10(answersByStudent);
  const out = new Map();
  let done = 0;
  const total = answersByStudent.length;
  async function worker() {
    while (batches.length > 0) {
      const batch = batches.shift();
      const rows = await gradeBatch(workerUrl, apiKey, {
        model,
        question: saMeta.question,
        rubric: saMeta.rubric,
        maxPoints: saMeta.maxPoints,
        answers: batch,
      });
      for (const r of rows) out.set(r.ref, { score: r.score, reason: r.reason });
      done += batch.length;
      if (onProgress) onProgress(done, total);
    }
  }
  const runners = [];
  const n = Math.min(2, batches.length);
  for (let i = 0; i < n; i++) runners.push(worker());
  await Promise.all(runners);
  return out;
}
