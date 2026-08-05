import TurndownService from 'turndown';

export const mdService = () => {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  //removing  jargon
  turndownService.remove(['script', 'style', 'noscript', 'svg', 'link', 'meta', 'iframe']);
  return turndownService;
};

const turndownService = mdService();

export const getPageMarkdown = async (page: import('playwright').Page): Promise<string> => {
  const html = await page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style, svg, noscript, link, meta, [aria-hidden="true"]')
      .forEach(el => el.remove());
    clone.querySelectorAll('*').forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        el.remove();
      }
    });

    return clone.outerHTML;
  });

  return turndownService.turndown(html);
};
