import ModelSelector from "./ModelSelector";

type Props = {
  workspacePath: string | null;
  onModelChange: (model: { providerID: string; modelID: string } | null) => void;
};

export default function ChatHeader({ workspacePath, onModelChange }: Props) {
  return (
    <div className="flex items-center px-4 py-3 border-b border-neutral-800 shrink-0" style={{ paddingTop: "2rem" }}>
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-medium truncate">Krow</h1>
        <p className="text-xs text-neutral-500 truncate font-mono">{workspacePath}</p>
      </div>
      <ModelSelector onModelChange={onModelChange} />
    </div>
  );
}
