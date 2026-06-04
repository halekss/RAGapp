from playwright.async_api import async_playwright


async def scrape_page(url: str) -> dict:
    """Scrape une page web et extrait le texte visible avec Playwright."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        await page.goto(url, wait_until="networkidle", timeout=30000)

        title = await page.title()
        content = await page.inner_text("body")

        await browser.close()

    return {
        "title": title,
        "url": url,
        "content": content,
    }
