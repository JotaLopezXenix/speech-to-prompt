-- Modelos candidatos para experimentación con destilado GPT.
-- enabled=0: disponibles para habilitar por SQL a medida que se creen
-- los deployments en Azure OpenAI Studio.
--
-- Habilitar un modelo:
--   UPDATE dbo.llm_models SET enabled=1 WHERE provider='azure-openai' AND model='<id>';
--
-- Cambiar el default:
--   UPDATE dbo.llm_models SET is_default=0 WHERE is_default=1 AND provider='azure-openai';
--   UPDATE dbo.llm_models SET is_default=1 WHERE provider='azure-openai' AND model='<id>';

INSERT INTO dbo.llm_models (provider, model, family, enabled, is_default, label)
SELECT v.provider, v.model, v.family, v.enabled, v.is_default, v.label
FROM (VALUES
  ('azure-openai', 'o3',      'openai', 0, 0, 'o3 (Azure OpenAI)'),
  ('azure-openai', 'o3-pro',  'openai', 0, 0, 'o3-pro (Azure OpenAI)'),
  ('azure-openai', 'o4-mini', 'openai', 0, 0, 'o4-mini (Azure OpenAI)'),
  ('azure-openai', 'gpt-5',   'openai', 0, 0, 'GPT-5 (Azure OpenAI)'),
  ('azure-openai', 'gpt-5.1', 'openai', 0, 0, 'GPT-5.1 (Azure OpenAI)'),
  ('azure-openai', 'gpt-5.4', 'openai', 0, 0, 'GPT-5.4 (Azure OpenAI)')
) AS v(provider, model, family, enabled, is_default, label)
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.llm_models m
  WHERE m.provider = v.provider AND m.model = v.model
);
