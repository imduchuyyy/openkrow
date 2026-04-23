import { describe, it, expect } from "vitest";
import {
  normalizeDomain,
  getGitHubCopilotBaseUrl,
  buildCopilotHeaders,
} from "./utils/oauth/github-copilot.js";

describe("GitHub Copilot OAuth helpers", () => {
  describe("normalizeDomain", () => {
    it("returns hostname from full URL", () => {
      expect(normalizeDomain("https://github.company.com/path")).toBe("github.company.com");
    });

    it("returns hostname from bare domain", () => {
      expect(normalizeDomain("company.ghe.com")).toBe("company.ghe.com");
    });

    it("trims whitespace", () => {
      expect(normalizeDomain("  company.ghe.com  ")).toBe("company.ghe.com");
    });

    it("returns null for empty string", () => {
      expect(normalizeDomain("")).toBeNull();
    });

    it("returns null for whitespace-only string", () => {
      expect(normalizeDomain("   ")).toBeNull();
    });
  });

  describe("getGitHubCopilotBaseUrl", () => {
    it("extracts base URL from token proxy-ep field", () => {
      const token = "tid=abc;exp=123;proxy-ep=proxy.individual.githubcopilot.com;st=dotcom";
      expect(getGitHubCopilotBaseUrl(token)).toBe("https://api.individual.githubcopilot.com");
    });

    it("returns enterprise URL when no token", () => {
      expect(getGitHubCopilotBaseUrl(undefined, "ghe.company.com"))
        .toBe("https://copilot-api.ghe.company.com");
    });

    it("returns default URL when no token and no enterprise", () => {
      expect(getGitHubCopilotBaseUrl()).toBe("https://api.individual.githubcopilot.com");
    });

    it("token proxy-ep takes precedence over enterprise domain", () => {
      const token = "tid=abc;proxy-ep=proxy.business.githubcopilot.com;exp=999";
      expect(getGitHubCopilotBaseUrl(token, "ghe.example.com"))
        .toBe("https://api.business.githubcopilot.com");
    });
  });

  describe("buildCopilotHeaders", () => {
    it("sets X-Initiator to 'user' when last message is from user", () => {
      const headers = buildCopilotHeaders([{ role: "user" }]);
      expect(headers["X-Initiator"]).toBe("user");
    });

    it("sets X-Initiator to 'agent' when last message is from assistant", () => {
      const headers = buildCopilotHeaders([
        { role: "user" },
        { role: "assistant" },
      ]);
      expect(headers["X-Initiator"]).toBe("agent");
    });

    it("sets X-Initiator to 'agent' when last message is tool", () => {
      const headers = buildCopilotHeaders([
        { role: "user" },
        { role: "tool" },
      ]);
      expect(headers["X-Initiator"]).toBe("agent");
    });

    it("always includes Openai-Intent header", () => {
      const headers = buildCopilotHeaders([{ role: "user" }]);
      expect(headers["Openai-Intent"]).toBe("conversation-edits");
    });

    it("includes standard Copilot headers", () => {
      const headers = buildCopilotHeaders([{ role: "user" }]);
      expect(headers["User-Agent"]).toContain("GitHubCopilotChat");
      expect(headers["Editor-Version"]).toBeDefined();
      expect(headers["Copilot-Integration-Id"]).toBe("vscode-chat");
    });
  });
});
