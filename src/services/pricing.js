import { query } from './db.js';

// Precios por modelo, leídos de la tabla dbo.model_prices (editable por SQL).
// El coste es una ESTIMACIÓN; los precios son aproximados (ver seed de la migración 002).

let cache = null;

export async function getPriceMap() {
  if (cache) return cache;
  const r = await query(
    `SELECT provider, model, kind, input_per_million, output_per_million, per_audio_minute FROM dbo.model_prices`
  );
  cache = new Map(r.recordset.map((p) => [`${p.provider}:${p.model}`, p]));
  return cache;
}

// Invalida la caché (p. ej. tras editar precios por SQL, o en tests).
export function clearPriceCache() {
  cache = null;
}

// DECIMAL puede llegar como string desde el driver: normalizamos a número.
function num(v) {
  return v == null ? 0 : Number(v);
}

// Coste estimado (USD) de un evento de uso. priced=false si no hay tarifa.
export function estimateCost(event, priceMap) {
  const p = priceMap.get(`${event.provider}:${event.model}`);
  if (!p) return { usd: 0, priced: false };

  if (event.kind === 'llm' && (p.input_per_million != null || p.output_per_million != null)) {
    const usd =
      (num(event.input_tokens) / 1e6) * num(p.input_per_million) +
      (num(event.output_tokens) / 1e6) * num(p.output_per_million);
    return { usd, priced: true };
  }
  if (event.kind === 'stt' && p.per_audio_minute != null) {
    const usd = (num(event.audio_seconds) / 60) * num(p.per_audio_minute);
    return { usd, priced: true };
  }
  return { usd: 0, priced: false };
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

// Desglose de coste de una lista de eventos. `unpriced` = nº de eventos sin tarifa.
export async function summarizeCost(events) {
  const priceMap = await getPriceMap();
  let stt = 0;
  let llm = 0;
  let unpriced = 0;
  for (const e of events) {
    const { usd, priced } = estimateCost(e, priceMap);
    if (!priced) { unpriced++; continue; }
    if (e.kind === 'stt') stt += usd;
    else if (e.kind === 'llm') llm += usd;
  }
  return { currency: 'USD', stt: round6(stt), llm: round6(llm), total: round6(stt + llm), unpriced };
}
