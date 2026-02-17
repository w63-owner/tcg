type LogLevel = "info" | "error";

type LogPayload = {
  event: string;
  message?: string;
  context?: Record<string, unknown>;
};

function formatPayload(level: LogLevel, payload: LogPayload) {
  return JSON.stringify({
    level,
    event: payload.event,
    message: payload.message ?? "",
    context: payload.context ?? {},
    ts: new Date().toISOString(),
  });
}

export function logInfo(payload: LogPayload) {
  // Structured JSON logs for ingestion by any platform.
  console.log(formatPayload("info", payload));
}

export function logError(payload: LogPayload) {
  console.error(formatPayload("error", payload));
}
