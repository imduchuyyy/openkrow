import { useState, useEffect, useCallback } from "react";
import { rpc } from "../rpc";
import type { FileEntry } from "../../shared/types";

type Props = {
  workspacePath: string;
  onFileSelect: (path: string) => void;
};

function FileIcon({ type }: { type: "file" | "directory" }) {
  if (type === "directory") {
    return <span className="text-yellow-400 mr-1.5 text-xs">&#128193;</span>;
  }
  return <span className="text-neutral-400 mr-1.5 text-xs">&#128196;</span>;
}

function TreeNode({ entry, onFileSelect, depth }: { entry: FileEntry; onFileSelect: (path: string) => void; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (entry.type === "file") {
      onFileSelect(entry.path);
      return;
    }
    if (!expanded && children.length === 0) {
      setLoading(true);
      const res = await rpc.request.listFiles({ path: entry.path });
      if ("files" in res) {
        setChildren(res.files);
      }
      setLoading(false);
    }
    setExpanded(!expanded);
  };

  return (
    <div>
      <div
        onClick={toggle}
        className="flex items-center py-0.5 px-2 cursor-pointer hover:bg-neutral-700/50 text-xs text-neutral-300"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {entry.type === "directory" && (
          <span className="mr-1 text-[10px] text-neutral-500">{expanded ? "▼" : "▶"}</span>
        )}
        <FileIcon type={entry.type} />
        <span className="truncate">{entry.name}</span>
      </div>
      {expanded && (
        <div>
          {loading && <div className="text-[10px] text-neutral-600 pl-8">Loading...</div>}
          {children.map((child) => (
            <TreeNode key={child.path} entry={child} onFileSelect={onFileSelect} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileExplorer({ workspacePath, onFileSelect }: Props) {
  const [rootFiles, setRootFiles] = useState<FileEntry[]>([]);

  useEffect(() => {
    if (!workspacePath) return;
    rpc.request.listFiles({ path: workspacePath }).then((res) => {
      if ("files" in res) setRootFiles(res.files);
    });
  }, [workspacePath]);

  return (
    <div className="h-full flex flex-col bg-neutral-900 border-r border-neutral-800">
      <div className="px-3 py-2 text-[11px] font-medium text-neutral-500 uppercase tracking-wider border-b border-neutral-800">
        Explorer
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {rootFiles.map((entry) => (
          <TreeNode key={entry.path} entry={entry} onFileSelect={onFileSelect} depth={0} />
        ))}
      </div>
    </div>
  );
}
