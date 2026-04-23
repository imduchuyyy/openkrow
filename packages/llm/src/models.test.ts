import { describe, it, expect } from "vitest";
import {
  getModel,
  getModelById,
  getModels,
  getProviders,
  getAllModels,
  calculateCost,
} from "./models.js";

describe("models", () => {
  describe("getAllModels", () => {
    it("returns a non-empty array", () => {
      const models = getAllModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it("returns a copy (not the internal array)", () => {
      const a = getAllModels();
      const b = getAllModels();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe("getModel", () => {
    it("finds a model by provider + id", () => {
      const model = getModel("anthropic", "claude-sonnet-4-20250514");
      expect(model).toBeDefined();
      expect(model!.provider).toBe("anthropic");
      expect(model!.api).toBe("anthropic-messages");
    });

    it("returns undefined for unknown provider+id pair", () => {
      expect(getModel("openai", "claude-sonnet-4-20250514")).toBeUndefined();
    });

    it("distinguishes same model id across providers (e.g. gpt-4o on openai vs copilot)", () => {
      const openai = getModel("openai", "gpt-4o");
      const copilot = getModel("github-copilot", "gpt-4o");
      expect(openai).toBeDefined();
      expect(copilot).toBeDefined();
      expect(openai!.provider).toBe("openai");
      expect(copilot!.provider).toBe("github-copilot");
    });
  });

  describe("getModelById", () => {
    it("finds the first model with a given id", () => {
      const model = getModelById("deepseek-chat");
      expect(model).toBeDefined();
      expect(model!.id).toBe("deepseek-chat");
    });

    it("returns undefined for unknown id", () => {
      expect(getModelById("nonexistent-model")).toBeUndefined();
    });
  });

  describe("getModels", () => {
    it("returns all models for a provider", () => {
      const anthropicModels = getModels("anthropic");
      expect(anthropicModels.length).toBeGreaterThanOrEqual(3);
      for (const m of anthropicModels) {
        expect(m.provider).toBe("anthropic");
      }
    });

    it("returns copilot models", () => {
      const copilotModels = getModels("github-copilot");
      expect(copilotModels.length).toBeGreaterThanOrEqual(1);
      for (const m of copilotModels) {
        expect(m.provider).toBe("github-copilot");
        expect(m.api).toBe("openai-completions");
      }
    });

    it("returns empty array for provider with no models", () => {
      expect(getModels("openrouter")).toEqual([]);
    });
  });

  describe("getProviders", () => {
    it("returns unique provider names", () => {
      const providers = getProviders();
      expect(providers.length).toBe(new Set(providers).size);
      expect(providers).toContain("anthropic");
      expect(providers).toContain("openai");
      expect(providers).toContain("google");
      expect(providers).toContain("github-copilot");
    });
  });

  describe("calculateCost", () => {
    it("calculates cost from usage and pricing", () => {
      const model = getModel("anthropic", "claude-sonnet-4-20250514")!;
      const cost = calculateCost(model, { inputTokens: 1_000_000, outputTokens: 1_000_000 });
      expect(cost).toBe(model.inputCostPerMillion! + model.outputCostPerMillion!);
    });

    it("returns 0 for models without pricing (e.g. copilot)", () => {
      const model = getModel("github-copilot", "gpt-4o")!;
      const cost = calculateCost(model, { inputTokens: 1_000_000, outputTokens: 1_000_000 });
      expect(cost).toBe(0);
    });

    it("returns 0 for zero usage", () => {
      const model = getModel("openai", "gpt-4o")!;
      const cost = calculateCost(model, { inputTokens: 0, outputTokens: 0 });
      expect(cost).toBe(0);
    });
  });

  describe("model shape", () => {
    it("all models have required fields", () => {
      for (const m of getAllModels()) {
        expect(m.id).toBeTruthy();
        expect(m.name).toBeTruthy();
        expect(m.api).toBeTruthy();
        expect(m.provider).toBeTruthy();
        expect(m.contextWindow).toBeGreaterThan(0);
        expect(m.maxTokens).toBeGreaterThan(0);
        expect(typeof m.supportsTools).toBe("boolean");
        expect(typeof m.supportsThinking).toBe("boolean");
      }
    });

    it("all copilot models use openai-completions api", () => {
      for (const m of getModels("github-copilot")) {
        expect(m.api).toBe("openai-completions");
      }
    });
  });
});
