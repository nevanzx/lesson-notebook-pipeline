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

export function mcCorrect(answer, ans) {
  return answer === ans;
}
