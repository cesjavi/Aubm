from playwright.async_api import async_playwright
import logging

logger = logging.getLogger("uvicorn")

class BrowserTool:
    """
    A tool that allows agents to browse the web and extract content.
    """
    async def search_and_extract(self, url: str) -> str:
        """
        Navigates to a URL and returns the text content.
        """
        logger.info(f"BrowserTool: Navigating to {url}")
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
                # Simple extraction: get all text from body
                content = await page.inner_text("body")
                # Truncate if too long for LLM context
                return content[:10000] 
            except Exception as e:
                logger.error(f"BrowserTool error: {str(e)}")
                return f"Error accessing {url}: {str(e)}"
            finally:
                await browser.close()

    async def google_search(self, query: str) -> str:
        """
        Performs a Google search and returns results.
        """
        search_url = f"https://www.google.com/search?q={query}"
        return await self.search_and_extract(search_url)
