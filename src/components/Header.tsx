import { Globe, Lock, Radio, Wifi, WifiOff } from "lucide-react";
import { useConfig } from "../store/configStore";
import { PROVIDER_DEFAULTS } from "../types";
import { webSearchActive } from "../services/llm/helpers";
import {
  getSpendLimitUsd,
  isSpendLimitReached,
  useSpentUsd,
} from "../store/spendGuard";
import { GitHubIcon } from "./GitHubIcon";

const formatUsd = (usd: number) => `${usd.toFixed(2).replace(".", ",")} $`;

function RestrictedBadge() {
  const spent = useSpentUsd();
  if (!isSpendLimitReached()) return null;

  return (
    <div className="relative group">
      <div className="flex items-center gap-1.5 bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs font-medium">
        <Lock className="w-3.5 h-3.5" /> restricted
      </div>
      <div className="pointer-events-none absolute right-0 top-full mt-2 w-64 rounded-md bg-gray-900 p-3 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        <p>Seuil de dépense atteint : les appels sont bloqués.</p>
        <p className="mt-1">
          Dépensé : {formatUsd(spent)} / Seuil : {formatUsd(getSpendLimitUsd())}
        </p>
      </div>
    </div>
  );
}

export function Header() {
  const [config] = useConfig();
  const providerLabel = PROVIDER_DEFAULTS[config.llm.provider].label;

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm shrink-0">
      <div className="flex items-center gap-3">
        <Radio className="w-6 h-6 text-blue-600" />
        <span className="text-lg font-semibold text-gray-900">
          Chat Pédagogique IA
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-600">
        <RestrictedBadge />

        <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
          <span>{providerLabel}</span>
          {config.llm.model && (
            <span className="text-blue-500">/ {config.llm.model}</span>
          )}
        </div>

        {webSearchActive(config) && (
          <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-medium">
            <Globe className="w-3.5 h-3.5" /> Web
          </div>
        )}

        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
            config.streamEnabled
              ? "bg-green-50 text-green-700"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {config.streamEnabled ? (
            <>
              <Wifi className="w-3.5 h-3.5" /> Stream ON
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5" /> Stream OFF
            </>
          )}
        </div>

        <a
          href="https://github.com/jlg-formation/chat-llm"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors"
          title="Code source sur GitHub"
        >
          <GitHubIcon />
        </a>
      </div>
    </header>
  );
}
