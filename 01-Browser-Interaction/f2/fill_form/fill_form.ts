import { pathToFileURL } from "url";
import { gotoWithRetries, withBrowserSession } from "../../shared/browser";
import { run_graph } from "./llm";

export async function runFillFlow(url: string, fieldData: string, query: string,resumePath:string) {
  const startedAt = Date.now();

  return withBrowserSession(async (session) => {
    console.log("Started browser");
    console.log("-----STARTED-------");

    try {
      await gotoWithRetries(session.page, url);

      const html = await session.page.content();
      console.log("--- RECIEVED HTML ");
      console.log(" FORWARDING TO LLM Graph");

      const answer = await run_graph(session, html, fieldData, query,resumePath);

      return {
        answer,
        finalUrl: session.page.url(),
      };
    } finally {
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      console.log("----------------------------------");
      console.log("------FINISHED");
      console.log(`TOOK: ${elapsedSeconds.toFixed(2)}s`);
    }
  });
}
