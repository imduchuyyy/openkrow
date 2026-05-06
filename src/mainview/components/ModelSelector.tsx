import { useState, useEffect, useRef } from "react";
import { rpc } from "../rpc";
import type { ModelInfo } from "../../shared/types";

type Props = {
  onModelChange: (model: { providerID: string; modelID: string } | null) => void;
};

export default function ModelSelector({ onModelChange }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rpc.request.getProviders({}).then((res) => {
      if ("models" in res) {
        setModels(res.models);
        setCurrentModel(res.currentModel);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedModel = models.find(
    (m) => `${m.providerID}/${m.id}` === currentModel
  );

  const handleSelect = (model: ModelInfo) => {
    setCurrentModel(`${model.providerID}/${model.id}`);
    onModelChange({ providerID: model.providerID, modelID: model.id });
    setOpen(false);
  };

  // Group models by provider
  const grouped = models.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    if (!acc[m.providerName]) acc[m.providerName] = [];
    acc[m.providerName].push(m);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="text-xs text-neutral-500">Loading models...</div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 transition-colors text-xs text-neutral-300"
      >
        <span className="text-neutral-500">{selectedModel?.providerName ?? "Unknown"}</span>
        <span>/</span>
        <span>{selectedModel?.name ?? currentModel ?? "Select model"}</span>
        <svg className="w-3 h-3 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 max-h-80 overflow-y-auto bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50">
          {Object.entries(grouped).map(([providerName, providerModels]) => (
            <div key={providerName}>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-neutral-500 font-medium sticky top-0 bg-neutral-800">
                {providerName}
              </div>
              {providerModels.map((model) => {
                const isSelected = `${model.providerID}/${model.id}` === currentModel;
                return (
                  <button
                    key={`${model.providerID}/${model.id}`}
                    onClick={() => handleSelect(model)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-neutral-700 transition-colors ${
                      isSelected ? "text-white bg-neutral-700" : "text-neutral-300"
                    }`}
                  >
                    {model.name}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
