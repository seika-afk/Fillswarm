import { END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenRouter } from "@langchain/openrouter";
import { z } from "zod";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import type { BrowserSession } from "../../shared/browser";
import { createBrowserTools, submitForm } from "./tools";
import { EXTRACT_DATA_PROMPT, FINAL_PROMPT } from "./prompts";

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

export const model = new ChatOpenRouter({
  model: "deepseek/deepseek-chat-v3.1",
  temperature: 0,
  maxTokens: 600,
});

const supportedTools = [
  "fill_input",
  "select_option",
  "check_checkbox",
  "uncheck_checkbox",
  "select_radio",
  "click_button",
  "upload_pdf_tool"
] as const;

const formActionSchema = z.object({
  tool: z.enum(supportedTools),
  label: z.string().describe("Visible label or control text"),
  value: z.string().nullable().optional().describe("Value to type or option text to select"),
  resume_path: z.string().nullable().optional().describe("Local file path for PDF upload actions"),
});

const extractSchema = z.object({
  actions: z.array(formActionSchema).describe("Ordered list of form actions to run"),
  error: z.string().nullable().optional().describe("Set when required fields are missing or incomplete"),
});

type FormAction = z.infer<typeof formActionSchema>;

export type BrowserState = {
  final_query: string;
  field_data: string;
  html: string;
  actions?: FormAction[];
  error?: string;
  success?: boolean;
  answer?: string;
  resume_path: string;
};

const extractModel = model.withStructuredOutput(extractSchema, {
  name: "Extract Form Actions",
  method: "functionCalling",
});

export async function run_graph(
  session: BrowserSession,
  html: string,
  field_data: string,
  query: string,
  resume_path: string,
) {
  const {
    fillInputTool,
    selectOptionTool,
    checkCheckboxTool,
    uncheckCheckboxTool,
    selectRadioTool,
    clickButtonTool,
    upload_pdf_tool
  } = createBrowserTools(session);

  async function runAction(action: FormAction) {
    switch (action.tool) {
      case "fill_input":
        if (typeof action.value !== "string") {
          throw new Error(`Missing value for tool: ${action.tool} (${action.label})`);
        }
        return fillInputTool.func({
          label: action.label,
          value: action.value,
        });
      case "select_option":
        if (typeof action.value !== "string") {
          throw new Error(`Missing value for tool: ${action.tool} (${action.label})`);
        }
        return selectOptionTool.func({
          label: action.label,
          value: action.value,
        });
      case "check_checkbox":
        return checkCheckboxTool.func({ label: action.label });
      case "uncheck_checkbox":
        return uncheckCheckboxTool.func({ label: action.label });
      case "select_radio":
        return selectRadioTool.func({ label: action.label });
      case "click_button":
        return clickButtonTool.func({ label: action.label });
      case "upload_pdf_tool": {
        const resumePath = action.resume_path ?? action.value;
        if (typeof resumePath !== "string") {
          throw new Error(`Missing resume_path for tool: ${action.tool} (${action.label})`);
        }
        return upload_pdf_tool.func({
          label: action.label,
          resume_path: resumePath,
        });
      }
      default:
        throw new Error(`Unsupported tool: ${action.tool}`);
    }
  }

  async function extractDataLLM(state: BrowserState): Promise<Partial<BrowserState>> {
    const response = await extractModel.invoke([
      {
        role: "system",
        content: EXTRACT_DATA_PROMPT,
      },
      {
        role: "user",
        content: `HTML CONTENT:\n${state.html}\n\nFIELD DATA:\n${state.field_data}\n\nRESUME PATH:\n${
          state.resume_path ? state.resume_path : "No resume file was provided for this request."
        }`,    },
    ]);

    console.log("-----LLM extraction response-----");
    console.log(response);
    console.log("--------------------------------");

    const hasError = Boolean(response.error) && response.error !== "null";

    if (hasError) {
      return {
        actions: [],
        error: response.error,
        success: false,
        answer: response.error,
      };
    }

    return {
      actions: response.actions ?? [],
    };
  }

  async function executeActions(state: BrowserState): Promise<Partial<BrowserState>> {
    if (state.error) {
      console.log("-----EXTRACTION ERROR-----");
      console.log(state.error);
      console.log("--------------------------");

      return {
        success: false,
        answer: state.error,
      };
    }

    const actions = state.actions ?? [];

    console.log("-----EXECUTING ACTIONS-----");
    console.log(actions);

    try {
      for (const [index, action] of actions.entries()) {
        console.log(
          `Running action ${index + 1}/${actions.length}:`,
          action.tool,
          action.label,
        );
        await runAction(action);
      }
    } catch (error) {
      console.log("error while executing action", error);
      return {
        success: false,
        answer: "not_ok",
      };
    }

    const html =
      actions.length > 0
        ? await submitForm(session, "submit").catch((error) => {
            console.log("submit failed, falling back to current page html", error);
            return state.html;
          })
        : state.html;

    if (actions.length > 0) {
      console.log("Form submitted.");
    }

    const res = await model.invoke([
      {
        role: "system",
        content: FINAL_PROMPT,
      },
      {
        role: "user",
        content: `HTML CONTENT:\n${html}\n\nQUERY:\n${state.final_query}`,
      },
    ]);

    const answer = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    console.log("-----ANSWERED-----");

    return {
      success: true,
      answer,
    };
  }

  const graph = new StateGraph<BrowserState>({
    channels: {
      final_query: {},
      field_data: {},
      html: {},
      actions: {},
      error: {},
      success: {},
      answer: {},
      resume_path:{}
    },
  });

  graph.addNode("extract_data", extractDataLLM);
  graph.addNode("execute_actions", executeActions);

  graph.addEdge(START, "extract_data");
  graph.addEdge("extract_data", "execute_actions");
  graph.addEdge("execute_actions", END);

  const app = graph.compile();

  const result = await app.invoke({
    final_query: query,
    html,
    field_data,
    resume_path
  });

  return result.answer ?? "";
}
