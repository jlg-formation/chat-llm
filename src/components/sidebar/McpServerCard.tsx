import { RefreshCw, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Toggle } from "./Toggle";
import type { McpServer } from "../../types";

interface Props {
  server: McpServer;
  isExpanded: boolean;
  isLoading: boolean;
  error?: string;
  onToggle: () => void;
  onToggleExpanded: () => void;
  onRemove: () => void;
  onRefresh: () => void;
  onToggleTool: (name: string) => void;
  onUpdate: (patch: Partial<McpServer>) => void;
}

export function McpServerCard({
  server,
  isExpanded,
  isLoading,
  error,
  onToggle,
  onToggleExpanded,
  onRemove,
  onRefresh,
  onToggleTool,
  onUpdate,
}: Props) {
  const enabledCount = server.tools.filter((t) => t.enabled).length;

  return (
    <div
      className={`border rounded-md ${server.enabled ? "border-teal-300 bg-teal-50/30" : "border-gray-200"}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Toggle
          checked={server.enabled}
          onChange={() => onToggle()}
          color="teal"
          size="sm"
        />
        <span
          className="flex-1 text-sm font-medium text-gray-700 truncate cursor-pointer select-none"
          onClick={() => onToggleExpanded()}
        >
          {server.name || (
            <span className="text-gray-400 italic font-normal">Sans nom</span>
          )}
        </span>
        {server.tools.length > 0 && (
          <span className="text-xs text-teal-600 bg-teal-100 rounded-full px-1.5 py-0.5 shrink-0">
            {enabledCount}/{server.tools.length}
          </span>
        )}
        <button
          onClick={() => onToggleExpanded()}
          className="text-gray-400 hover:text-gray-600 shrink-0"
          aria-label={isExpanded ? "Réduire" : "Développer"}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
        <button
          onClick={() => onRemove()}
          className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
          title="Supprimer ce serveur"
          aria-label="Supprimer ce serveur"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Corps (expanded) */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Alias</label>
            <input
              type="text"
              value={server.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Mon serveur MCP"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              URL (Streamable HTTP)
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={server.url}
                onChange={(e) => onUpdate({ url: e.target.value })}
                className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="http://localhost:8000"
              />
              <button
                onClick={() => onRefresh()}
                disabled={!server.url || isLoading}
                className="p-1.5 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 transition-colors"
                title="Recharger les outils"
                aria-label="Recharger les outils"
              >
                <RefreshCw
                  className={`w-4 h-4 text-gray-600 ${isLoading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Token d'authentification (Bearer)
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={server.token ?? ""}
                onChange={(e) => onUpdate({ token: e.target.value })}
                autoComplete="off"
                className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Optionnel"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          {server.tools.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-gray-500 font-medium">
                Outils disponibles :
              </p>
              {server.tools.map((tool) => (
                <div key={tool.name} className="flex items-start gap-2">
                  <Toggle
                    checked={tool.enabled}
                    onChange={() => onToggleTool(tool.name)}
                    color="teal"
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div
                      className={`font-mono text-xs ${tool.enabled ? "text-gray-800" : "text-gray-400"}`}
                    >
                      {tool.name}
                    </div>
                    <div className="text-xs text-gray-400">
                      {tool.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
