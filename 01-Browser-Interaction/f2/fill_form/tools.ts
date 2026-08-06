import { tool } from "@langchain/core/tools";
import type { BrowserSession, Page } from "../../shared/browser";
import { clickAndMaybeFollowNewPage } from "../../shared/browser";
import { z } from "zod";

export function createBrowserTools(session: BrowserSession) {
  const fillInputTool = tool(
    async ({ label, value }) => {
      await session.page.getByLabel(label).fill(value);
      return "Successfully inserted input";
    },
    {
      name: "fill_input",
      description: "Fill a text input or textarea using its label.",
      schema: z.object({
        label: z.string().describe("Label of the input"),
        value: z.string().describe("Value to be filled"),
      }),
    },
  );



    const upload_pdf_tool = tool(
      async ({ label ,resume_path}) => {
        const fileChooserPromise = session.page.waitForEvent('filechooser',{ timeout: 10_000 });
        await session.page.getByText(label).click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(resume_path);
        return "Successfully inserted PDF File"
      }

      , {
      name: "upload_pdf",
      description: "Upload resume or pdf file to specified upload component .",
      schema: z.object({
        label: z.string().describe("Label of the upload file component"),
        resume_path:z.string().describe("Local file path to the resume/PDF to upload")
      })

    })


  const selectOptionTool = tool(
    async ({ label, value }) => {
      const locator = session.page.getByLabel(label);
      await locator.selectOption({ label: value }).catch(async () => {
        await locator.selectOption(value);
      });
      return "Successfully selected option";
    },
    {
      name: "select_option",
      description: "Select a dropdown option using the visible label of the select control.",
      schema: z.object({
        label: z.string().describe("Label of the select control"),
        value: z.string().describe("Visible option text to choose"),
      }),
    },
  );

  const checkCheckboxTool = tool(
    async ({ label }) => {
      await session.page.getByLabel(label).check();
      return "Successfully checked checkbox";
    },
    {
      name: "check_checkbox",
      description: "Check a checkbox using its label.",
      schema: z.object({
        label: z.string().describe("Label of the checkbox"),
        value: z.string().optional().describe("Unused"),
      }),
    },
  );

  const uncheckCheckboxTool = tool(
    async ({ label }) => {
      await session.page.getByLabel(label).uncheck();
      return "Successfully unchecked checkbox";
    },
    {
      name: "uncheck_checkbox",
      description: "Uncheck a checkbox using its label.",
      schema: z.object({
        label: z.string().describe("Label of the checkbox"),
        value: z.string().optional().describe("Unused"),
      }),
    },
  );

  const selectRadioTool = tool(
    async ({ label }) => {
      await session.page.getByLabel(label).check();
      return "Successfully selected radio option";
    },
    {
      name: "select_radio",
      description: "Select a radio button using its label.",
      schema: z.object({
        label: z.string().describe("Label of the radio option"),
        value: z.string().optional().describe("Unused"),
      }),
    },
  );

  const clickButtonTool = tool(
    async ({ label }) => {
      const page = session.page;
      const button = page.getByRole("button", { name: label });

      await clickAndMaybeFollowNewPage(session, async () => {
        await button.click().catch(async () => {
          await page.getByText(label).click();
        });
      });

      return "Successfully clicked button";
    },
    {
      name: "click_button",
      description: "Click a button or button-like control using its visible text.",
      schema: z.object({
        label: z.string().describe("Visible button text"),
        value: z.string().optional().describe("Unused"),
      }),
    },
  );

  return {
    fillInputTool,
    selectOptionTool,
    checkCheckboxTool,
    uncheckCheckboxTool,
    selectRadioTool,
    clickButtonTool,
    upload_pdf_tool,
    browserTools: [
      fillInputTool,
      selectOptionTool,
      checkCheckboxTool,
      uncheckCheckboxTool,
      selectRadioTool,
      clickButtonTool,
      upload_pdf_tool
    ],
  };
}

async function fillMissingRequiredFields(page: Page): Promise<void> {
  const required = page.locator("input:required, select:required, textarea:required");
  const count = await required.count();

  for (let i = 0; i < count; i++) {
    const el = required.nth(i);
    const tag = await el.evaluate((node) => node.tagName).catch(() => "");
    const type = (await el.getAttribute("type").catch(() => null)) ?? "";

    try {
      if (tag === "SELECT") {
        if (!(await el.inputValue())) {
          const firstValue = await el
            .locator("option:not([value=''])")
            .first()
            .getAttribute("value")
            .catch(() => null);
          if (firstValue) {
            await el.selectOption(firstValue);
          }
        }
      } else if (tag === "TEXTAREA") {
        if (!(await el.inputValue())) {
          await el.fill("N/A");
        }
      } else if (type === "email") {
        if (!(await el.inputValue())) {
          await el.fill("demo@example.com");
        }
      } else if (type === "url") {
        if (!(await el.inputValue())) {
          await el.fill("https://example.com");
        }
      } else if (type === "tel") {
        if (!(await el.inputValue())) {
          await el.fill("0000000000");
        }
      } else if (type === "number") {
        if (!(await el.inputValue())) {
          await el.fill("1");
        }
      } else if (type === "checkbox") {
        if (!(await el.isChecked())) {
          await el.check();
        }
      } else if (type === "radio") {
        const name = await el.getAttribute("name");
        const group = name
          ? page.locator(`input[type="radio"][name="${name}"]`)
          : el;
        if ((await group.evaluateAll((nodes) => nodes.every((n) => !(n as HTMLInputElement).checked))) && (name ?? "")) {
          await el.check();
        }
      } else if (!["submit", "button", "hidden", "file", "image"].includes(type)) {
        if (!(await el.inputValue())) {
          await el.fill("N/A");
        }
      }
    } catch {
      // skip fields we cannot fill
    }
  }
}

export async function submitForm(session: BrowserSession, text: string): Promise<string> {
  const page = session.page;
  const submitLabels = [
    text,
    "submit",
    "Submit",
    "continue",
    "Continue",
    "next",
    "Next",
    "finish",
    "Finish",
  ];

  await fillMissingRequiredFields(page);

  const targetPage = await clickAndMaybeFollowNewPage(
    session,
    async () => {
      for (const label of submitLabels) {
        const buttonLocator = page.getByRole("button", { name: label });
        if (await buttonLocator.count()) {
          const button = buttonLocator.first();
          await button.click().catch(async () => {
            await page.getByText(label, { exact: true }).click();
          });
          return;
        }
      }

      const submitInputLocator = page.locator('input[type="submit"], button[type="submit"]');
      if (await submitInputLocator.count()) {
        const submitInput = submitInputLocator.first();
        await submitInput.click();
        return;
      }

      await page.getByText(text, { exact: true }).click();
    },
    15_000,
  );

  return targetPage.content();
}
