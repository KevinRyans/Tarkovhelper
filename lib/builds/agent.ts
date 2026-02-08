import OpenAI from "openai";

import { env } from "@/lib/config/env";
import {
  findWeaponByPrompt,
  parsePromptToConstraints,
  planWeaponBuild,
  type BuildConstraints,
  type PlannedBuild,
} from "@/lib/builds/planner";

const openaiClient = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

type PromptInterpretation = {
  weaponHint?: string;
  budgetRub?: number;
  priority?: BuildConstraints["priority"];
  fleaEnabled?: boolean;
};

async function interpretPromptWithLLM(prompt: string): Promise<PromptInterpretation | null> {
  if (!openaiClient) {
    return null;
  }

  try {
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Extract Tarkov build constraints. Return strict JSON: {weaponHint?: string, budgetRub?: number, priority?: 'LOW_RECOIL'|'HIGH_ERGO'|'BALANCED'|'BEST_VALUE', fleaEnabled?: boolean}.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: {
        type: "json_object",
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    const parsed = JSON.parse(content) as PromptInterpretation;
    return parsed;
  } catch (error) {
    console.error("Prompt interpretation failed", error);
    return null;
  }
}

async function explainBuildWithLLM(params: {
  prompt: string;
  plan: PlannedBuild;
}): Promise<string | null> {
  if (!openaiClient) {
    return null;
  }

  try {
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are a Tarkov weapon build analyst. Explain decisions in 4-6 concise bullet points. Mention trade-offs and alternatives if budget/availability is tight.",
        },
        {
          role: "user",
          content: JSON.stringify({ prompt: params.prompt, plan: params.plan }),
        },
      ],
    });

    return response.choices[0]?.message?.content ?? null;
  } catch (error) {
    console.error("Build explanation failed", error);
    return null;
  }
}

function fallbackExplanation(plan: PlannedBuild) {
  const partsFromTraders = plan.parts.filter((part) => part.source === "TRADER").length;
  const partsFromFlea = plan.parts.filter((part) => part.source === "FLEA").length;

  return [
    `Priority used: ${plan.constraints.priority}`,
    `Estimated total cost: ${plan.totalCost.toLocaleString("en-US")} RUB`,
    `Sourcing profile: ${partsFromTraders} trader parts, ${partsFromFlea} flea parts`,
    `Final recoil estimate: ${plan.finalStats.recoil} (${plan.finalStats.recoilVertical}V / ${plan.finalStats.recoilHorizontal}H)`,
    `Final ergonomics estimate: ${plan.finalStats.ergo}`,
  ].join("\n");
}

export async function runBuildAgent(params: {
  prompt: string;
  baseConstraints: BuildConstraints;
  progressByTaskId?: Record<string, "NOT_STARTED" | "IN_PROGRESS" | "DONE">;
}) {
  const llmInterpretation = await interpretPromptWithLLM(params.prompt);
  const constraints = parsePromptToConstraints(params.prompt, params.baseConstraints);

  if (llmInterpretation?.budgetRub && llmInterpretation.budgetRub > 0) {
    constraints.budgetRub = llmInterpretation.budgetRub;
  }

  if (llmInterpretation?.priority) {
    constraints.priority = llmInterpretation.priority;
  }

  if (typeof llmInterpretation?.fleaEnabled === "boolean") {
    constraints.fleaEnabled = llmInterpretation.fleaEnabled;
  }

  const weaponHint = llmInterpretation?.weaponHint ?? params.prompt;
  const weapon = await findWeaponByPrompt(weaponHint);

  if (!weapon) {
    throw new Error("No matching weapon platform found in Tarkov catalog");
  }

  const plan = await planWeaponBuild({
    weaponId: weapon.id,
    constraints,
    progressByTaskId: params.progressByTaskId,
  });

  const llmExplanation = await explainBuildWithLLM({ prompt: params.prompt, plan });

  return {
    plan,
    explanation: llmExplanation ?? fallbackExplanation(plan),
    interpretedConstraints: constraints,
  };
}
