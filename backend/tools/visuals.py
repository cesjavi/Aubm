import urllib.parse
import json
import logging

logger = logging.getLogger("uvicorn")

class VisualsTool:
    """
    Provides visual generation capabilities like charts and illustrations.
    """

    async def generate_chart(self, chart_type: str, chart_config: str) -> str:
        """
        Generates a chart using QuickChart.io.
        chart_type: 'bar', 'line', 'pie', 'doughnut'
        chart_config: A JSON string containing the QuickChart configuration.
        """
        try:
            # If chart_config is already a dict, convert to JSON
            if isinstance(chart_config, dict):
                config_str = json.dumps(chart_config)
            else:
                # Try to parse it to validate
                config_str = chart_config
                json.loads(config_str)
            
            encoded_config = urllib.parse.quote(config_str)
            url = f"https://quickchart.io/chart?c={encoded_config}"
            
            logger.info(f"Generated chart URL: {url}")
            return f"Chart generated successfully: {url}. You should include this URL in your markdown output as an image: ![Chart]({url})"
        except Exception as e:
            logger.error(f"Failed to generate chart: {e}")
            return f"Error generating chart: {str(e)}. Please ensure your chart_config is a valid JSON string."

    async def generate_illustration(self, prompt: str) -> str:
        """
        Generates an illustration using Pollinations.ai.
        """
        try:
            encoded_prompt = urllib.parse.quote(prompt)
            url = f"https://pollinations.ai/p/{encoded_prompt}?width=1024&height=1024&seed=42&model=flux"
            
            logger.info(f"Generated illustration URL: {url}")
            return f"Illustration generated successfully: {url}. You should include this URL in your markdown output as an image: ![Illustration]({url})"
        except Exception as e:
            logger.error(f"Failed to generate illustration: {e}")
            return f"Error generating illustration: {str(e)}"
