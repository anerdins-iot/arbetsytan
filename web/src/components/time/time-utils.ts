export function formatMinutes(
  minutes: number,
  labels: { hour: string; minute: string }
): string {
  if (minutes < 60) {
    return `${minutes} ${labels.minute}`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) {
    return `${hours} ${labels.hour}`;
  }
  return `${hours} ${labels.hour} ${rest} ${labels.minute}`;
}

export function formatDateKey(dateIso: string, locale: string): string {
  const date = new Date(dateIso);
  return new Intl.DateTimeFormat(locale === "sv" ? "sv-SE" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function toInputDate(dateIso: string): string {
  return new Date(dateIso).toISOString().slice(0, 10);
}

export function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}
