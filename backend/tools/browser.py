import logging
from typing import Any

import httpx
from playwright.async_api import async_playwright

from services.config import settings

logger = logging.getLogger("uvicorn")


class BrowserTool:
    """
    Tools for live web search and direct URL extraction.
    """

    def __init__(self) -> None:
        self.tavily_api_key = settings.TAVILY_API_KEY

    async def search_and_extract(self, url: str) -> str:
        """
        Navigates to a URL and returns the page text content.
        """
        logger.info("BrowserTool: Navigating to %s", url)
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            page = await browser.new_page()
            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
                title = await page.title()
                content = await page.inner_text("body")
                combined = f"Title: {title}\nURL: {url}\n\n{content}".strip()
                return combined[:12000]
            except Exception as exc:
                logger.error("BrowserTool extract error for %s: %s", url, exc)
                return f"Error accessing {url}: {exc}"
            finally:
                await browser.close()

    async def web_search(self, query: str, topic: str = "general", max_results: int = 5) -> str:
        """
        Searches the public web with Tavily and returns LLM-friendly results.
        """
        if not self.tavily_api_key:
            return (
                "Web search is unavailable: TAVILY_API_KEY is not configured. "
                "Add it to the backend environment to enable internet search."
            )

        payload = {
            "query": query,
            "topic": topic if topic in {"general", "news", "finance"} else "general",
            "search_depth": "advanced",
            "max_results": max(1, min(max_results, 10)),
            "include_answer": "advanced",
            "include_raw_content": False,
            "include_images": False,
        }

        headers = {
            "Authorization": f"Bearer {self.tavily_api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.post(
                    "https://api.tavily.com/search",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:500] if exc.response is not None else str(exc)
            logger.error("Tavily HTTP error: %s", detail)
            return f"Tavily search failed with status {exc.response.status_code}: {detail}"
        except Exception as exc:
            logger.error("Tavily request error: %s", exc)
            return f"Tavily search failed: {exc}"

        data = response.json()
        return self._format_tavily_results(query, data)

    def _format_tavily_results(self, query: str, data: dict[str, Any]) -> str:
        answer = data.get("answer")
        results = data.get("results") or []

        lines = [f"Search query: {query}"]
        if answer:
            lines.extend(["", "Answer:", str(answer).strip()])

        if not results:
            lines.extend(["", "No search results returned."])
            return "\n".join(lines)

        lines.extend(["", "Sources:"])
        for index, result in enumerate(results, start=1):
            title = result.get("title") or "Untitled"
            url = result.get("url") or ""
            snippet = (result.get("content") or "").strip()
            score = result.get("score")

            lines.append(f"{index}. {title}")
            if url:
                lines.append(f"   URL: {url}")
            if score is not None:
                lines.append(f"   Score: {score}")
            if snippet:
                lines.append(f"   Snippet: {snippet[:900]}")

        return "\n".join(lines)[:12000]
