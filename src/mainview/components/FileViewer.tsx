import { useState, useEffect } from "react";
import { rpc } from "../rpc";

type Props = {
  filePath: string | null;
  onClose: () => void;
};

export default function FileViewer({ filePath, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!filePath) {
      setContent(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    rpc.request.readFile({ path: filePath }).then((res) => {
      if ("content" in res) {
        setContent(res.content);
      } else {
        setError(res.error);
        setContent(null);
      }
      setLoading(false);
    });
  }, [filePath]);

  if (!filePath) {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-900 border-l border-neutral-800">
        <p className="text-neutral-600 text-xs">Select a file to view</p>
      </div>
    );
  }

  const fileName = filePath.split("/").pop() ?? filePath;

  return (
    <div className="h-full flex flex-col bg-neutral-900 border-l border-neutral-800">
      {/* Tab bar */}
      <div className="flex items-center px-3 py-1.5 border-b border-neutral-800 shrink-0">
        <span className="text-xs text-neutral-300 truncate flex-1 font-mono">{fileName}</span>
        <button
          onClick={onClose}
          className="text-neutral-500 hover:text-neutral-300 text-xs ml-2 px-1"
        >
          ✕
        </button>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {loading && <p className="text-neutral-600 text-xs">Loading...</p>}
        {error && <p className="text-red-400 text-xs">{error}</p>}
        {content !== null && (
          <pre className="text-xs text-neutral-300 font-mono whitespace-pre leading-5">
            {content.split("\n").map((line, i) => (
              <div key={i} className="flex">
                <span className="text-neutral-600 select-none w-10 text-right pr-3 shrink-0">{i + 1}</span>
                <span className="flex-1">{line}</span>
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}
