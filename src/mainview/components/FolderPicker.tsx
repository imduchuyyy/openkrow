type Props = {
  onSelectFolder: () => void;
  loading: boolean;
  error: string | null;
};

export default function FolderPicker({ onSelectFolder, loading, error }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-neutral-900 text-neutral-200 font-sans gap-6">
      <h1 className="text-4xl font-light tracking-tight">Krow</h1>
      <p className="text-neutral-400 text-sm max-w-xs text-center">
        Select a workspace folder to get started.
      </p>
      <button
        onClick={onSelectFolder}
        disabled={loading}
        className="px-5 py-2.5 bg-white text-neutral-900 rounded-lg text-sm font-medium hover:bg-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Starting..." : "Open Folder"}
      </button>
      {error && <p className="text-red-400 text-xs max-w-xs text-center">{error}</p>}
    </div>
  );
}
