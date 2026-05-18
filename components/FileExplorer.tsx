import { useState, useEffect } from "react";
import { rpc } from "../mainview/rpc";
import type { FileEntry } from "../shared/types";

type Props = {
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
};

export default function FileExplorer({ onFileSelect, selectedFile }: Props) {
  const [tree, setTree] = useState<Map<string, FileEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const [loading, setLoading] = useState(true);

  const loadDir = async (path: string) => {
    const res = await rpc.request.listFiles({ path: path || undefined });
    if ("files" in res) {
      setTree((prev) => new Map(prev).set(path, res.files));
    }
  };

  useEffect(() => {
    loadDir("").then(() => setLoading(false));
  }, []);

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        if (!tree.has(path)) loadDir(path);
      }
      return next;
    });
  };

  const renderEntries = (parentPath: string, depth: number): React.ReactNode[] => {
    const entries = tree.get(parentPath);
    if (!entries) return [];

    return entries.map((entry) => {
      const isOpen = expanded.has(entry.path);
      const isSelected = selectedFile === entry.path;

      return (
        <div key={entry.path}>
          <button
            onClick={() => entry.isDirectory ? toggleDir(entry.path) : onFileSelect(entry.path)}
            className={`w-full text-left px-2 py-[3px] flex items-center gap-1.5 text-[12px] font-mono truncate transition-colors ${
              isSelected
                ? "bg-[#fb923c]/10 text-[#fb923c]"
                : "text-[#8b8b8b] hover:text-[#d4d4d4] hover:bg-[#1e1e1e]"
            }`}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {entry.isDirectory ? (
              <svg className="w-3 h-3 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={isOpen ? "M19 9l-7 7-7-7" : "M9 5l7 7-7 7"} />
              </svg>
            ) : (
              <svg className="w-3 h-3 shrink-0 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            )}
            <span className="truncate">{entry.name}</span>
          </button>
          {entry.isDirectory && isOpen && renderEntries(entry.path, depth + 1)}
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className="p-3 text-[11px] font-mono text-[#555]">Loading...</div>
    );
  }

  return (
    <div className="py-1 overflow-y-auto h-full">
      {renderEntries("", 0)}
    </div>
  );
}
