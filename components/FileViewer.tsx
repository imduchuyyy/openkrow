import { useState, useEffect } from "react";
import { rpc } from "../mainview/rpc";

type Props = {
  filePath: string;
  onClose: () => void;
};

export default function FileViewer({ filePath, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContent(null);
    setError(null);
    rpc.request.readFile({ path: filePath }).then((res) => {
      if ("content" in res) {
        setContent(res.content);
      } else {
        setError(res.error);
      }
    });
  }, [filePath]);

  const fileName = filePath.split("/").pop() ?? filePath;

  return (
    <div className="flex flex-col h-full">
      {/* File header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e1e1e] shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-[#555]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <span className="font-mono text-[12px] text-[#ccc]">{fileName}</span>
          <span className="font-mono text-[10px] text-[#555]">{filePath}</span>
        </div>
        <button
          onClick={onClose}
          className="text-[#555] hover:text-[#ccc] transition-colors p-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* File content */}
      <div className="flex-1 overflow-auto">
        {error ? (
          <div className="p-4 font-mono text-[12px] text-red-400/80">{error}</div>
        ) : content === null ? (
          <div className="p-4 font-mono text-[12px] text-[#555]">Loading...</div>
        ) : (
          <pre className="p-4 font-mono text-[12px] text-[#b0b0b0] leading-[1.6] whitespace-pre-wrap break-words">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
