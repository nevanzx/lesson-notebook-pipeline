import { HttpError } from "./validate.js";

export { HttpError };

export function buildSystemPrompt(maxPoints) {
  return (
    "You are grading short answers. Score each answer 0.." +
    `${maxPoints} using ONLY the rubric. Return EXACTLY a JSON array, ` +
    `one object per answer, no other text: ` +
    `[{"ref":"<id>","score":<number>,"reason":"<one sentence>"}]`
  );
}

export function buildUserPrompt({ question, rubric, maxPoints, answers }) {
  const lines = answers.map((a) => `[${a.ref}] ${a.text}`);
  return (
    `Question: ${question}\nRubric: ${rubric}\n` +
    `Max points: ${maxPoints}\nAnswers:\n${lines.join("\n")}`
  );
}

export function buildGoBody(kind, model, system, user) {
  if (kind === "chat") {
    return {
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
  }
  if (kind === "messages") {
    return {
      model,
      max_tokens: 1024,
      temperature: 0,
      system,
      messages: [{ role: "user", content: user }],
    };
  }
  if (kind === "responses") {
    return {
      model,
      temperature: 0,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
  }
  throw new HttpError(400, `unknown kind ${JSON.stringify(kind)}`);
}

function extractText(kind, json) {
  try {
    if (kind === "chat") {
      return json.choices[0].message.content;
    }
    if (kind === "messages") {
      return json.content.find((b) => b.type === "text").text;
    }
    const msg = json.output.find((o) => o.type === "message");
    return msg.content.find((c) => c.type === "output_text").text;
  } catch {
    throw new HttpError(502, "bad-model-shape");
  }
}

function unfence(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1] : text;
}

export function parseGoResult(kind, json, { refs, maxPoints }) {
  const raw = extractText(kind, json);
  if (typeof raw !== "string") {
    throw new HttpError(502, "bad-model-shape");
  }
  let rows;
  try {
    rows = JSON.parse(unfence(raw));
  } catch {
    throw new HttpError(502, "bad-model-json");
  }
  if (!Array.isArray(rows)) {
    throw new HttpError(502, "bad-model-json");
  }
  const want = new Set(refs);
  return rows.map((r, i) => {
    if (!r || typeof r !== "object" || !want.has(r.ref)) {
      throw new HttpError(502, `bad-model-json (row ${i})`);
    }
    if (typeof r.score !== "number" || !Number.isFinite(r.score) ||
        r.score < 0 || r.score > maxPoints) {
      throw new HttpError(502, `bad-model-json (row ${i})`);
    }
    if (typeof r.reason !== "string" || !r.reason.trim()) {
      throw new HttpError(502, `bad-model-json (row ${i})`);
    }
    return { ref: r.ref, score: r.score, reason: r.reason };
  });
}
