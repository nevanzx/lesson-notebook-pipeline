export function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function idMatch(answer, aliases) {
  const n = normalize(answer);
  return (aliases || []).some((a) => normalize(a) === n);
}

export function tfCorrect(answer, key) {
  return String(answer).trim().toLowerCase() === String(key).toLowerCase();
}

export function mcCorrect(answer, ans, choices) {
  // Index form (spec): number === number. Also accept numeric strings ("1" === 1).
  if (typeof ans === "number") {
    if (typeof answer === "number") return answer === ans;
    if (typeof answer === "string") {
      const t = answer.trim();
      if (t !== "" && String(Number(t)) === t && Number(t) === ans) return true;
      // Text form (what the notebook actually submits: state.answers[i] = choice text).
      // Compare normalized text against choices[ans].
      if (Array.isArray(choices) && typeof choices[ans] === "string") {
        const n = normalize(t);
        return n !== "" && n === normalize(choices[ans]);
      }
      return false;
    }
    return answer === ans;
  }
  return answer === ans;
}

export function weekdayInTz(iso, tz) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: tz || "Asia/Manila" })
      .format(d).toLowerCase();
  } catch {
    return "";
  }
}
