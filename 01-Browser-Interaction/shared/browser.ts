import { chromium, type Browser, type BrowserContext, type Page } from "../f1/Click_feature/node_modules/playwright";

const DEFAULT_TIMEOUT_MS = 10_000;
const NAVIGATION_TIMEOUT_MS = 3_000;

let browserPromise: Promise<Browser> | null = null;
let browserInstance: Browser | null = null;

async function preparePage(page: Page) {
  page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  await page.addInitScript(() => {
    (window as any).__name = (fn: unknown) => fn;
  });
}

async function launchSharedBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        chromiumSandbox: false,
        args: ["--disable-setuid-sandbox"],
      })
      .then((browser) => {
        browserInstance = browser;
        browser.once("disconnected", () => {
          browserInstance = null;
          browserPromise = null;
        });
        return browser;
      })
      .catch((error) => {
        browserPromise = null;
        throw error;
      });
  }

  return browserPromise;
}

export type BrowserSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  setPage(nextPage: Page): void;
};

export async function ensureBrowser(): Promise<Browser> {
  if (browserInstance) {
    return browserInstance;
  }

  return launchSharedBrowser();
}

export async function closeBrowser(): Promise<void> {
  if (!browserInstance) {
    browserPromise = null;
    return;
  }

  const browser = browserInstance;
  browserInstance = null;
  browserPromise = null;
  await browser.close().catch(() => {});
}

export async function createBrowserSession(): Promise<BrowserSession> {
  const browser = await ensureBrowser();
  const context = await browser.newContext();
  let currentPage = await context.newPage();

  await preparePage(currentPage);

  return {
    browser,
    context,
    get page() {
      return currentPage;
    },
    setPage(nextPage: Page) {
      currentPage = nextPage;
    },
  } as BrowserSession;
}

export async function withBrowserSession<T>(
  fn: (session: BrowserSession) => Promise<T>,
): Promise<T> {
  const session = await createBrowserSession();

  try {
    return await fn(session);
  } finally {
    await session.context.close().catch(() => {});
  }
}

export async function gotoWithRetries(
  page: Page,
  url: string,
  attempts = 3,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await page.goto(url, { timeout: timeoutMs });
      return;
    } catch (error) {
      if (attempt === attempts - 1) {
        throw new Error(`Failed to load ${url} after ${attempts} attempts`, {
          cause: error,
        });
      }
    }
  }
}

export async function clickByText(page: Page, text: string): Promise<void> {
  const roles = [
    "link",
    "button",
    "menuitem",
    "tab",
    "option",
    "checkbox",
    "radio",
    "switch",
    "treeitem",
    "gridcell",
    "menuitemcheckbox",
    "menuitemradio",
  ] as const;

  for (const role of roles) {
    const locator = page.getByRole(role, { name: text });
    const count = await locator.count();
    if (count > 0) {
      await locator.first().click({ force: true });
      return;
    }
  }

  const exactText = page.getByText(text, { exact: true });
  if (await exactText.count()) {
    await exactText.first().click({ force: true });
    return;
  }

  await page.getByText(text).first().click({ force: true });
}

export async function clickAndMaybeFollowNewPage(
  session: BrowserSession,
  action: () => Promise<unknown>,
  timeoutMs = NAVIGATION_TIMEOUT_MS,
): Promise<Page> {
  const page = session.page;
  const context = page.context();
  const startingUrl = page.url();

  const newPageSignal = context
    .waitForEvent("page", { timeout: timeoutMs })
    .then((newPage) => ({ kind: "page" as const, newPage }))
    .catch(() => null);
  const urlSignal = page
    .waitForURL((currentUrl) => currentUrl.toString() !== startingUrl, {
      timeout: timeoutMs,
    })
    .then(() => ({ kind: "url" as const }))
    .catch(() => null);
  const timeoutSignal = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });

  await action();

  const result = await Promise.race([newPageSignal, urlSignal, timeoutSignal]);

  if (result?.kind === "page") {
    const newPage = result.newPage;
    await preparePage(newPage);
    await newPage.waitForLoadState("networkidle").catch(() => {});
    session.setPage(newPage);
    return newPage;
  }

  await page.waitForLoadState("networkidle").catch(() => {});
  return page;
}
