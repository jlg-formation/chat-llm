import type { ApiFormat, LLMConfig } from "../../types";
import { supportsFormat } from "./modelHelpers";

export function ApiFormatSelector({
  llm,
  onSelect,
}: {
  llm: LLMConfig;
  onSelect: (fmt: ApiFormat) => void;
}) {
  return (
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Format API
            </label>
            <div
              className="flex flex-col gap-1.5"
              role="radiogroup"
              aria-label="Format API"
            >
              {(llm.provider === "lmstudio"
                ? [
                    {
                      fmt: "lmstudio_chat" as ApiFormat,
                      path: "/api/v1/chat",
                      name: "LM Studio Chat",
                    },
                    {
                      fmt: "chat_completions" as ApiFormat,
                      path: "/v1/chat/completions",
                      name: "API Chat Completions",
                    },
                    {
                      fmt: "responses" as ApiFormat,
                      path: "/v1/responses",
                      name: "API Responses",
                    },
                  ]
                : llm.provider === "ollama"
                  ? [
                      {
                        fmt: "ollama_chat" as ApiFormat,
                        path: "/api/chat",
                        name: "Ollama natif",
                      },
                      {
                        fmt: "chat_completions" as ApiFormat,
                        path: "/v1/chat/completions",
                        name: "OpenAI compatible",
                      },
                    ]
                  : [
                      {
                        fmt: "responses" as ApiFormat,
                        path: "/v1/responses",
                        name: "API Responses",
                      },
                      {
                        fmt: "chat_completions" as ApiFormat,
                        path: "/v1/chat/completions",
                        name: "API Chat Completions",
                      },
                    ]
              ).map(({ fmt, path, name }) => {
                const active = llm.apiFormat === fmt;
                const disabled = !supportsFormat(llm.provider, llm.model, fmt);
                return (
                  <button
                    key={fmt}
                    role="radio"
                    aria-checked={active}
                    onClick={() =>
                      !disabled && onSelect(fmt)
                    }
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
