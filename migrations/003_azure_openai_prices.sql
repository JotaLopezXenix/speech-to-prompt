-- 003_azure_openai_prices.sql — flujo 4 (pivote 24-jun-2026): precios del destilador
-- Azure OpenAI (GPT). Claude se retira del diseño del LLM porque es oferta de
-- Marketplace (Anthropic) y NO es facturable contra el crédito de la suscripción;
-- Azure OpenAI es first-party y sí lo es. El STT (azure-whisper) no cambia.
--
-- Precios APROXIMADOS (USD por millón de tokens) — VERIFICAR con la tarifa real de
-- Azure OpenAI. El `model` debe coincidir con el NOMBRE DEL DEPLOYMENT (y con
-- defaults.llm_model) para que el coste por sesión se calcule; recomendado gpt-4.1.
INSERT INTO dbo.model_prices (provider, model, kind, input_per_million, output_per_million, per_audio_minute) VALUES
  ('azure-openai', 'gpt-4.1',      'llm', 2.000000, 8.000000, NULL),
  ('azure-openai', 'gpt-4.1-mini', 'llm', 0.400000, 1.600000, NULL);
