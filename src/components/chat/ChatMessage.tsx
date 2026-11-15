import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";
import { useState } from "react";
import type { ChatMessage as ChatMessageType } from "../../types";
import {
  User,
  Bot,
  Wrench,
  ChevronDown,
  ChevronRight,
  Globe,
} from "lucide-react";
import { MermaidBlock } from "./MermaidBlock";
import { ThinkingBlock } from "./ThinkingBlock";
import { XmlBlock } from "./XmlBlock";
import { parseXmlBlocks } from "./parseXmlBlocks";

interface Props {
  message: ChatMessageType;
}

function prettyJson(content: string): string | null {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return null;
  }
}

function JsonDisplay({ content }: { content: string }) {
  const formatted = prettyJson(content);
  if (formatted !== null) {
    return (
      <pre className="bg-gray-100 border border-gray-200 rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
        {formatted}
      </pre>
    );
  }
  return <span className="text-gray-700">{content}</span>;
}

function ToolMessageView({ message }: Props) {
  const [open, setOpen] = useState(false);
  const isCall = message.role === "tool_call";

  return (
    <div className="flex justify-center">
      <div className="text-xs rounded-lg border border-gray-200 bg-gray-50 overflow-hidden max-w-[90%]">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-gray-700 w-full"
        >
          <Wrench className="w-3 h-3 shrink-0 text-amber-500" />
          {isCall ? (
            <span>
              Appel outil :{" "}
              <span className="font-mono font-semibold text-amber-700">
                {message.toolName}
              </span>
            </span>
          ) : (
            <span className="text-green-700 font-medium">Résultat outil</span>
          )}
          {open ? (
            <ChevronDown className="w-3 h-3 ml-auto" />
          ) : (
            <ChevronRight className="w-3 h-3 ml-auto" />
          )}
        </button>
        {open && (
          <pre className="px-3 pb-2 font-mono text-gray-600 whitespace-pre-wrap break-all border-t border-gray-200 bg-white max-h-48 overflow-y-auto">
            {isCall
              ? (prettyJson(message.content) ?? message.content)
              : message.content}
          </pre>
        )}
      </div>
    </div>
  );
}

export function ChatMessageView({ message }: Props) {
  if (message.role === "tool_call" || message.role === "tool_result") {
    return <ToolMessageView message={message} />;
  }

  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? "bg-blue-500" : "bg-gray-200"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-gray-600" />
        )}
      </div>

      <div
        className={`max-w-[75%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-2`}
      >
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.images.map((img, i) => (
              <img
                key={i}
                src={img.dataUrl}
                alt="image jointe"
                className="max-h-40 rounded-md border border-gray-200 object-contain"
              />
            ))}
          </div>
        )}

        {message.thinking && !isUser && (
          <ThinkingBlock
            content={message.thinking}
            isStreaming={message.isStreaming && !message.content}
          />
        )}

        {message.content && (
          <div
            className={`rounded-2xl px-4 py-2.5 ${
              isUser
                ? "bg-blue-500 text-white rounded-tr-sm"
                : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm"
            }`}
          >
            {message.isJson && !isUser ? (
              <JsonDisplay content={message.content} />
            ) : isUser ? (
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="prose-chat text-sm">
                {parseXmlBlocks(message.content).map((seg, i) =>
                  seg.type === "xml" ? (
                    <XmlBlock
                      key={i}
                      tag={seg.tag!}
                      content={seg.content}
                      unclosed={seg.unclosed}
                    />
                  ) : (
                    <ReactMarkdown
                      key={i}
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[
                        [rehypeHighlight, { ignoreMissing: true }],
                      ]}
                      components={{
                        code({ className, children }) {
                          const lang = /language-(\w+)/.exec(
                            className ?? "",
                          )?.[1];
                          if (lang === "mermaid" && !message.isStreaming) {
                            return (
                              <MermaidBlock code={String(children).trimEnd()} />
                            );
                          }
                          return <code className={className}>{children}</code>;
                        },
                        a({ href, children }) {
                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 underline hover:text-blue-800 break-all"
                            >
                              {children}
                            </a>
                          );
                        },
                      }}
                    >
                      {seg.content}
                    </ReactMarkdown>
                  ),
                )}
                {message.isStreaming &&
                  !message.content.match(/<\w+>[\s\S]*$/) && (
                    <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom" />
                  )}
              </div>
            )}
          </div>
        )}

        {!isUser &&
          message.generatedImages &&
          message.generatedImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {message.generatedImages.map((img, i) => (
                <img
                  key={i}
                  src={img.dataUrl}
                  alt="image générée"
                  className="max-h-96 rounded-md border border-gray-200 object-contain"
                />
              ))}
            </div>
          )}

        {!isUser && message.webSearches && message.webSearches.length > 0 && (
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <Globe className="w-3 h-3 shrink-0 text-indigo-500" />
            Recherche web : {message.webSearches.join(" · ")}
          </p>
        )}

        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="text-xs text-gray-500">
            <p className="font-medium mb-0.5">Sources</p>
            <ul className="space-y-0.5">
              {message.sources.map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline hover:text-blue-800 break-all"
                  >
                    {s.title || s.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {message.isStreaming && !message.content && !message.thinking && (
          <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
            <div className="flex gap-1">
              <span
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
