import os
import pandas as pd
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from datetime import datetime
import logging

logger = logging.getLogger("uvicorn")

class FileGeneratorTool:
    """
    A tool that allows agents to generate PDF and Excel files.
    """
    def __init__(self):
        self.output_dir = "outputs"
        os.makedirs(self.output_dir, exist_ok=True)

    def _generate_filename(self, extension: str) -> str:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return os.path.join(self.output_dir, f"report_{timestamp}.{extension}")

    async def generate_pdf(self, title: str, content: str) -> str:
        """
        Generates a PDF document with the provided title and content.
        """
        filename = self._generate_filename("pdf")
        logger.info(f"FileGenerator: Generating PDF {filename}")
        
        try:
            c = canvas.Canvas(filename, pagesize=letter)
            width, height = letter
            
            # Title
            c.setFont("Helvetica-Bold", 16)
            c.drawString(72, height - 72, title)
            
            # Content (very basic wrapping/split)
            c.setFont("Helvetica", 12)
            text_object = c.beginText(72, height - 100)
            for line in content.split('\n'):
                text_object.textLine(line)
            c.drawText(text_object)
            
            c.save()
            return f"PDF generated successfully: {filename}"
        except Exception as e:
            return f"Failed to generate PDF: {str(e)}"

    async def generate_excel(self, data: list) -> str:
        """
        Generates an Excel file from a list of dictionaries.
        """
        filename = self._generate_filename("xlsx")
        logger.info(f"FileGenerator: Generating Excel {filename}")
        
        try:
            df = pd.DataFrame(data)
            df.to_excel(filename, index=False)
            return f"Excel generated successfully: {filename}"
        except Exception as e:
            return f"Failed to generate Excel: {str(e)}"
