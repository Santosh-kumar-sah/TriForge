"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, Sparkles } from "lucide-react";

interface FormattedMessageProps {
  content: string;
  isStreaming?: boolean;
}

export default function FormattedMessage({ content, isStreaming }: FormattedMessageProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (codeText: string, id: string) => {
    navigator.clipboard.writeText(codeText);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!content && isStreaming) {
    return (
      <div className="flex items-center gap-2 text-[15px] text-zinc-400 py-2 animate-pulse">
        <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
        <span>Thinking &amp; analyzing routing path...</span>
      </div>
    );
  }

  return (
    <div className="chatgpt-markdown w-full text-zinc-100 text-[15px] sm:text-[16px] leading-7 sm:leading-[1.8] font-normal selection:bg-amber-500/30 selection:text-white">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings — Clean, bold, natural hierarchy
          h1: ({ node, ...props }) => (
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-6 mb-3 pb-1.5 border-b border-zinc-800 tracking-tight" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-xl sm:text-2xl font-bold text-white mt-5 mb-2.5 tracking-tight" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-lg sm:text-xl font-semibold text-white mt-4 mb-2 tracking-tight" {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h4 className="text-base sm:text-lg font-semibold text-zinc-200 mt-3 mb-1.5 tracking-tight" {...props} />
          ),

          // Paragraphs — Generous line height and comfortable spacing
          p: ({ node, ...props }) => (
            <p className="mb-4 last:mb-0 text-zinc-100 text-[15px] sm:text-[16px] leading-7 font-normal" {...props} />
          ),

          // Bold and Italic
          strong: ({ node, ...props }) => (
            <strong className="font-bold text-white" {...props} />
          ),
          em: ({ node, ...props }) => (
            <em className="italic text-zinc-200" {...props} />
          ),

          // Lists — ChatGPT styled with clean indentation
          ul: ({ node, ...props }) => (
            <ul className="list-disc pl-6 space-y-2 mb-4 text-zinc-100 text-[15px] sm:text-[16px] leading-7" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal pl-6 space-y-2 mb-4 text-zinc-100 text-[15px] sm:text-[16px] leading-7" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="pl-1 leading-7 text-zinc-100" {...props} />
          ),

          // Blockquotes
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-zinc-500 bg-zinc-900/60 pl-4 pr-3 py-2 my-4 text-zinc-300 italic rounded-r-md text-[15px]" {...props} />
          ),

          // Tables — Professional dark theme styling
          table: ({ node, ...props }) => (
            <div className="my-5 w-full overflow-x-auto rounded-lg border border-zinc-800 bg-[#121212] shadow-md">
              <table className="w-full text-left text-sm border-collapse" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-zinc-800/90 text-white font-semibold border-b border-zinc-700" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="px-4 py-3 font-semibold text-white tracking-wide border-r border-zinc-800 last:border-r-0" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-4 py-2.5 text-zinc-200 border-b border-zinc-800/80 border-r border-zinc-800/60 last:border-r-0" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr className="hover:bg-zinc-800/40 transition-colors border-b border-zinc-800/60 last:border-b-0" {...props} />
          ),

          // Divider
          hr: ({ node, ...props }) => (
            <hr className="my-6 border-zinc-800" {...props} />
          ),

          // Links
          a: ({ node, ...props }) => (
            <a 
              className="text-amber-400 hover:text-amber-300 underline underline-offset-4 transition-colors font-medium" 
              target="_blank" 
              rel="noopener noreferrer" 
              {...props} 
            />
          ),

          // Code blocks & inline code (Exact ChatGPT Layout)
          code: ({ node, inline, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || "");
            const codeString = String(children).replace(/\n$/, "");
            const isMultiLine = codeString.includes("\n") || Boolean(match);

            if (!inline && isMultiLine) {
              const lang = match ? match[1] : "text";
              const blockId = `code-${lang}-${codeString.slice(0, 16)}`;

              return (
                <div className="my-4 rounded-lg bg-[#0d0d0d] border border-zinc-700/70 overflow-hidden font-mono text-[13.5px] shadow-lg">
                  {/* ChatGPT-style Code Header */}
                  <div className="bg-[#212121] px-4 py-2 flex items-center justify-between text-zinc-400 text-xs border-b border-zinc-700/50 select-none">
                    <span className="lowercase font-sans text-xs text-zinc-300 font-medium tracking-wide">
                      {lang}
                    </span>

                    <button
                      onClick={() => handleCopy(codeString, blockId)}
                      className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-xs font-sans"
                    >
                      {copiedId === blockId ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-medium">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy code</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Code Body */}
                  <div className="p-4 overflow-x-auto text-zinc-100 bg-[#0d0d0d] leading-6 font-mono">
                    <pre className="m-0 font-mono text-[13.5px]">
                      <code>{codeString}</code>
                    </pre>
                  </div>
                </div>
              );
            }

            // Inline Code
            return (
              <code 
                className="bg-zinc-800 text-zinc-100 px-1.5 py-0.5 mx-0.5 rounded text-[13.5px] font-mono font-medium border border-zinc-700/50" 
                {...props}
              >
                {children}
              </code>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>

      {isStreaming && (
        <span className="inline-block w-2 h-4 bg-zinc-200 ml-1 animate-pulse align-middle" />
      )}
    </div>
  );
}
