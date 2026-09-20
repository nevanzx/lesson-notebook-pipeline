export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const GO = "https://opencode.ai/zen/go/v1";

export const MODELS = {
  "muse-spark-1.3-contributor": { path: `${GO}/responses`, kind: "responses" },
  "glm-5.3-flash": { path: `${GO}/chat/completions`, kind: "chat" },
  "deepseek-v4.1-flash": { path: `${GO}/chat/completions`, kind: "chat" },
  "qwen3.8-flash": { path: `${GO}/messages`, kind: "messages" },
};

function nonEmptyString(v, name) {
  if (typeof v !== "string" || !v.trim()) {
    throw new HttpError(400, `${name} must be a non-empty string`);
  }
  return v;
}

export function validateGradeRequest(body) {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "body must be a JSON object");
  }
  const { model, question, rubric, maxPoints, answers } = body;
  if (!Object.hasOwn(MODELS, model)) {
    throw new HttpError(400, `unknown model ${JSON.stringify(model)}`);
  }
  nonEmptyString(question, "question");
  nonEmptyString(rubric, "rubric");
  if (typeof maxPoints !== "number" || !Number.isInteger(maxPoints) || maxPoints <= 0) {
    throw new HttpError(400, "maxPoints must be a positive integer");
  }
  if (!Array.isArray(answers) || answers.length < 1 || answers.length > 10) {
    throw new HttpError(400, "answers must be an array of 1..10 items");
  }
  for (const [i, a] of answers.entries()) {
    if (!a || typeof a !== "object") {
      throw new HttpError(400, `answers[${i}] must be an object`);
    }
    nonEmptyString(a.ref, `answers[${i}].ref`);
    if (typeof a.text !== "string" || !a.text.trim()) {
      throw new HttpError(400, `answers[${i}].text must be a non-empty string`);
    }
  }
  return { model, question, rubric, maxPoints, answers };
}
