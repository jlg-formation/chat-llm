import { Server, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useConfig } from "../../store/configStore";
import { type Provider, type ApiFormat, PROVIDER_DEFAULTS } from "../../types";
import { Accordion } from "./Accordion";
import { fetchModels } from "../../services/models";
import {
  getDefaultAnthropicModels,
  getDefaultGoogleModels,
  getDefaultMistralModels,
  getDefaultOpenAiModels,
  getStaticPricing,
} from "../../services/pricing";
import { setCachedModels, useModelsCache } from "../../store/modelsStore";
import type { ModelInfo } from "../../services/models";

import { ApiFormatSelector } from "./ApiFormatSelector";
import {
  supportsFormat,
  modelLabel,
  isOvhChatModel,
  isOpenAiChatModel,
} from "./modelHelpers";

const DEFAULT_MODEL: Record<Provider, string> = {
  openai: "gpt-6-luna",
  anthropic: "claude-haiku-5-5",
  mistral: "ministral-3b-latest",
  ovh: "gpt-oss-20b",
  lmstudio: "",
  ollama: "",
  google: "gemini-3.8-flash",
};

export function ProviderSection() {
  const [config, update] = useConfig();
  const { llm } = config;
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cachedModels = useModelsCache(llm.provider);

  function handleProviderChange(provider: Provider) {
    const keepsCurrentFormat =
      llm.apiFormat === "lmstudio_chat" ||
      llm.apiFormat === "ollama_chat" ||
      llm.apiFormat === "anthropic_messages" ||
      llm.apiFormat === "google_interactions"
        ? "responses"
        : llm.apiFormat;
    const defaultFormat: Record<Provider, ApiFormat> = {
      openai: keepsCurrentFormat,
      anthropic: "anthropic_messages",
      mistral: "chat_completions",
      ovh: keepsCurrentFormat,
      lmstudio: "lmstudio_chat",
      ollama: "ollama_chat",
      google: "chat_completions",
    };
    update({
      llm: {
        ...llm,
        provider,
        baseUrl: PROVIDER_DEFAULTS[provider].baseUrl,
        apiFormat: defaultFormat[provider],
        model: DEFAULT_MODEL[provider],
      },
    });
    setLoadError(null);
  }

  async function handleLoadModels() {
    setLoadingModels(true);
    setLoadError(null);
    try {
      const models = await fetchModels(
        llm.provider,
        llm.baseUrl,
        llm.apiKeys[llm.provider],
      );
      const enriched = models.map((m) => ({
        ...m,
        ...getStaticPricing(m.id, llm.provider),
      }));
      setCachedModels(llm.provider, enriched);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoadingModels(false);
    }
  }

  // Modèles à afficher dans la liste
  function getDisplayModels(): ModelInfo[] {
    if (llm.provider === "openai") {
      if (cachedModels) {
        // Depuis l'API : on garde les gpt-* récents uniquement
        return cachedModels
          .filter(isOpenAiChatModel)
          .map((m) => ({ ...m, ...getStaticPricing(m.id, "openai") }))
          .sort((a, b) => a.id.localeCompare(b.id));
      }
      return getDefaultOpenAiModels();
    }
    if (llm.provider === "anthropic") {
      return cachedModels ?? getDefaultAnthropicModels();
    }
    if (llm.provider === "mistral") {
      return cachedModels ?? getDefaultMistralModels();
    }
    if (llm.provider === "google") {
      return cachedModels ?? getDefaultGoogleModels();
    }
    if (llm.provider === "ovh") {
      const models = cachedModels ?? [];
      return models.filter(isOvhChatModel);
    }
    return cachedModels ?? [];
  }

  const displayModels = getDisplayModels();
  const showDropdown =
    llm.provider === "openai" ||
    llm.provider === "anthropic" ||
    llm.provider === "mistral" ||
    llm.provider === "google" ||
    llm.provider === "ovh" ||
    cachedModels !== undefined;
  const modelInList = displayModels.some((m) => m.id === llm.model);
  const currentModelInfo = cachedModels?.find((m) => m.id === llm.model);
  const toolUseWarning = currentModelInfo?.supportsToolUse === false;

  return (
    <Accordion
      title="Provider LLM"
      icon={<Server className="w-4 h-4 text-blue-500" />}
      defaultOpen
    >
      <div className="space-y-3">
        <div>
          <label
            htmlFor="provider-select"
            className="block text-xs text-gray-500 mb-1"
          >
            Provider
          </label>
          <select
            id="provider-select"
            value={llm.provider}
            onChange={(e) => handleProviderChange(e.target.value as Provider)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {Object.entries(PROVIDER_DEFAULTS).map(([key, val]) => (
              <option key={key} value={key}>
                {val.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">Modèle</label>
            <button
              onClick={handleLoadModels}
              disabled={loadingModels}
              title="Charger les modèles depuis l'API"
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-40"
            >
              <RefreshCw
                className={`w-3 h-3 ${loadingModels ? "animate-spin" : ""}`}
              />
              {cachedModels ? "Actualiser" : "Charger"}
            </button>
          </div>

          {loadError && (
            <p className="text-xs text-red-500 mb-1">{loadError}</p>
          )}

          {showDropdown && displayModels.length > 0 ? (
            <select
              id="model-select"
              aria-label="Modèle"
              value={modelInList ? llm.model : "__custom__"}
              onChange={(e) => {
                if (e.target.value === "__custom__") return;
                const newModel = e.target.value;
                const apiFormat = supportsFormat(
                  llm.provider,
                  newModel,
                  llm.apiFormat,
                )
                  ? llm.apiFormat
                  : "chat_completions";
                update({ llm: { ...llm, model: newModel, apiFormat } });
              }}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {displayModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {modelLabel(m)}
                </option>
              ))}
              {!modelInList && (
                <option value="__custom__">{llm.model} (personnalisé)</option>
              )}
            </select>
          ) : (
            <input
              id="model-input"
              type="text"
              aria-label="Modèle"
              value={llm.model}
              onChange={(e) =>
                update({ llm: { ...llm, model: e.target.value } })
              }
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="llama3, mistral..."
            />
          )}
        </div>

        {toolUseWarning && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
            <TriangleAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-snug">
              Ce modèle n'est pas entraîné pour le tool calling. Les skills et
              outils MCP risquent de ne pas fonctionner correctement.
            </p>
          </div>
        )}

        <ApiFormatSelector
          llm={llm}
          onSelect={(apiFormat) => update({ llm: { ...llm, apiFormat } })}
        />

        <div>
          <label
            htmlFor="base-url"
            className="block text-xs text-gray-500 mb-1"
          >
            URL de base
          </label>
          <input
            id="base-url"
            type="url"
            value={llm.baseUrl}
            onChange={(e) =>
              update({ llm: { ...llm, baseUrl: e.target.value } })
            }
            disabled={llm.provider === "openai"}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
            placeholder="https://..."
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="api-key" className="block text-xs text-gray-500 mb-1">
            Clé API{" "}
            <span className="text-gray-400">
              (propre à {PROVIDER_DEFAULTS[llm.provider].label})
            </span>
          </label>
          <input
            id="api-key"
            type="password"
            value={llm.apiKeys[llm.provider]}
            onChange={(e) =>
              update({
                llm: {
                  ...llm,
                  apiKeys: { ...llm.apiKeys, [llm.provider]: e.target.value },
                },
              })
            }
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={
              PROVIDER_DEFAULTS[llm.provider].needsKey
                ? llm.provider === "anthropic"
                  ? "sk-ant-..."
                  : "sk-..."
                : "(optionnel)"
            }
            autoComplete="off"
          />
          <p className="text-xs text-amber-600 mt-1">
            Stockée en clair dans localStorage
          </p>
        </div>
      </div>
    </Accordion>
  );
}
