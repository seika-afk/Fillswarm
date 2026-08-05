import { pathToFileURL } from "url";
import { ask_llm, final_llm } from "./llmHelper";
import {
  clickAndMaybeFollowNewPage,
  clickByText,
  gotoWithRetries,
  withBrowserSession,
} from "../../shared/browser";
import { extractClickables, truncate } from "./textCutRelated";

export async function runClickFlow(url: string, clickQuery: string, msg: string) {
  return withBrowserSession(async (session) => {
    console.log("Started browser");
    await gotoWithRetries(session.page, url);

    const clickableElements = truncate(await extractClickables(session.page));
    const text = await ask_llm(clickQuery, clickableElements);
    console.log("HTML_LLM found :", text);

    if (text === "invalid") {
      throw new Error(`No matching element found for query: "${clickQuery}"`);
    }

    if (text === "Multiple") {
      throw new Error(
        `Multiple matching elements found for query: "${clickQuery}" — need to disambiguate`,
      );
    }

    console.log("Clicking...");

    const targetPage = await clickAndMaybeFollowNewPage(session, () =>
      clickByText(session.page, text),
    );

    console.log("Clicked", text);
    console.log("Recieved Content from : ", targetPage.url());
    console.log("Asking about page state...");

    const result = await final_llm(msg, targetPage);
    console.log(result);

    return {
      answer: result,
      finalUrl: targetPage.url(),
    };
  });
}
