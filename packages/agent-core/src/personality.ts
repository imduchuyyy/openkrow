/**
 * PersonalityManager — Manages the learned user personality profile.
 *
 * The personality is NOT configured by the user directly — it's extracted
 * by a background agent every N sessions by analyzing conversation history.
 *
 * Storage: ~/.config/openkrow/profile/personality.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { IPersonalityManager, UserPersonality } from "./types.js";

const PROFILE_DIR = join(homedir(), ".config", "openkrow", "profile");
const PERSONALITY_FILE = join(PROFILE_DIR, "personality.json");

/** How many sessions between personality extraction runs. */
const EXTRACTION_INTERVAL = 5;

/** Minimum turn count for a session to count toward extraction. */
const MIN_TURNS_FOR_EXTRACTION = 10;

export class PersonalityManager implements IPersonalityManager {
  async load(): Promise<UserPersonality | null> {
    try {
      const raw = await readFile(PERSONALITY_FILE, "utf-8");
      return JSON.parse(raw) as UserPersonality;
    } catch {
      return null;
    }
  }

  async save(personality: UserPersonality): Promise<void> {
    await mkdir(PROFILE_DIR, { recursive: true });
    await writeFile(
      PERSONALITY_FILE,
      JSON.stringify(personality, null, 2) + "\n",
      "utf-8"
    );
  }

  shouldExtract(sessionTurns: number): boolean {
    // Only trigger if the session had enough interaction
    return sessionTurns >= MIN_TURNS_FOR_EXTRACTION;
  }

  /**
   * Check if extraction should run based on session count.
   * Returns true every EXTRACTION_INTERVAL sessions.
   */
  shouldRunExtraction(sessionsAnalyzed: number): boolean {
    return sessionsAnalyzed % EXTRACTION_INTERVAL === 0;
  }

  formatForSystemPrompt(personality: UserPersonality): string {
    const lines: string[] = ["## User Context"];

    // Communication style
    const comm = personality.communicationStyle;
    lines.push(`- Communication: ${comm.verbosity}, ${comm.formality}`);
    if (comm.explanationDepth !== "moderate") {
      lines.push(`- Explanation depth: ${comm.explanationDepth}`);
    }

    // Technical profile
    const tech = personality.technical;
    lines.push(`- Expertise: ${tech.expertiseLevel}`);

    if (tech.preferredLanguages.length > 0) {
      lines.push(`- Languages: ${tech.preferredLanguages.join(", ")}`);
    }
    if (tech.preferredTools.length > 0) {
      lines.push(`- Tools: ${tech.preferredTools.join(", ")}`);
    }
    if (tech.codingStyle.length > 0) {
      lines.push(`- Coding style: ${tech.codingStyle.join(", ")}`);
    }

    // Observations
    if (personality.observations.length > 0) {
      lines.push(`- Observations: ${personality.observations.join("; ")}`);
    }

    return lines.join("\n");
  }

  getDefault(): UserPersonality {
    return {
      communicationStyle: {
        verbosity: "moderate",
        formality: "neutral",
        explanationDepth: "moderate",
      },
      technical: {
        expertiseLevel: "intermediate",
        preferredLanguages: [],
        preferredTools: [],
        codingStyle: [],
      },
      observations: [],
      lastUpdated: Date.now(),
      sessionsAnalyzed: 0,
      version: 1,
    };
  }
}
