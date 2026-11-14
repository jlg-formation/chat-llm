import type { ApiFormat, LLMConfig, Provider } from "../../types";
import { supportsFormat } from "./modelHelpers";

interface FormatOption {
  fmt: ApiFormat;
  path: string;
  name: string;
}

const RESPONSES: FormatOption = {
  fmt: "responses",
  path: "/v1/responses",
  name: "API Responses",
};
const CHAT_COMPLETIONS: FormatOption = {
  fmt: "chat_completions",
  path: "/v1/chat/completions",
  name: "API Chat Completions",
};

const FORMAT_OPTIONS: Record<Provider, FormatOption[]> = {
  openai: [RESPONSES, CHAT_COMPLETIONS],
  ovh: [RESPONSES, CHAT_COMPLETIONS],
  lmstudio: [
    { fmt: "lmstudio_chat", path: "/api/v1/chat", name: "LM Studio Chat" },
    CHAT_COMPLETIONS,
    RESPONSES,
  ],
  ollama: [
    { fmt: "ollama_chat", path: "/api/chat", name: "Ollama natif" },
    { ...CHAT_COMPLETIONS, name: "OpenAI compatible" },
  ],
};

export function ApiFormatSelector({
  llm,
  onSelect,
}: {
  llm: LLMConfig;
  onSelect: (fmt: ApiFormat) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">Format API</label>
      <div
        className="flex flex-col gap-1.5"
        role="radiogroup"
        aria-label="Format API"
      >
        {FORMAT_OPTIONS[llm.provider].map(({ fmt, path, name }) => {
          const active = llm.apiFormat === fmt;
          const disabled = !supportsFormat(llm.provider, llm.model, fmt);
          return (
            <button
              key={fmt}
              role="radio"
              aria-checked={active}
              onClick={() => !disabled && onSelect(fmt)}
              disabled={disabled}
              className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${
                disabled
                  ? "bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed"
                  : active
                    ? "bg-blue-50 border-blue-500 text-blue-700"
                    : "bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-gray-700"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                    disabled
                      ? "border-gray-200"
                      : active
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-300"
                  }`}
                />
                <div>
                  <div className="text-xs font-semibold leading-tight">
                    {name}
                  </div>
                  <div className="text-xs font-mono opacity-70 leading-tight">
                    {path}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
