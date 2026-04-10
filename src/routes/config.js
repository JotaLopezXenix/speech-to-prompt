import { Router } from 'express';
import { getConfigMasked, updateConfig, isConfigured } from '../services/config-store.js';
import { listLLMProviders } from '../providers/llm/index.js';
import { listSTTProviders } from '../providers/stt/index.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const config = getConfigMasked();
    const llmProviders = listLLMProviders();
    const sttProviders = listSTTProviders();
    res.json({ config, llmProviders, sttProviders, configured: isConfigured() });
  } catch (err) {
    res.status(500).json({ error: { code: 'CONFIG_READ_ERROR', message: err.message } });
  }
});

router.put('/', (req, res) => {
  try {
    const { api_keys, defaults } = req.body;
    const updated = updateConfig({ api_keys, defaults });
    // Return masked version
    const masked = getConfigMasked();
    res.json({ config: masked });
  } catch (err) {
    res.status(500).json({ error: { code: 'CONFIG_WRITE_ERROR', message: err.message } });
  }
});

export default router;
