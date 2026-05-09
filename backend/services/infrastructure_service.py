import httpx
import logging
import asyncio
from typing import Optional, Dict, Any
from .config import settings

logger = logging.getLogger("infrastructure")

class InfrastructureService:
    """
    Manages on-the-fly compute resources on DigitalOcean for AI inference.
    """
    API_URL = "https://api.digitalocean.com/v2"

    def __init__(self):
        self.headers = {
            "Authorization": f"Bearer {settings.DO_API_TOKEN}",
            "Content-Type": "application/json"
        }

    async def create_inference_node(self, name: str, size: str = "s-4vcpu-8gb-amd") -> Optional[Dict[str, Any]]:
        """
        Provision a new AMD-based droplet with Ollama pre-installed.
        Default size is a capable AMD-based node.
        """
        if not settings.DO_API_TOKEN:
            logger.error("DO_API_TOKEN not configured.")
            return None

        # Cloud-init script to setup the inference environment
        user_data = """#cloud-config
runcmd:
  - curl -fsSL https://get.docker.com | sh
  - docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama -e OLLAMA_HOST=0.0.0.0 ollama/ollama
  - sleep 10
  - docker exec ollama ollama pull llama3
"""

        payload = {
            "name": name,
            "region": settings.DO_REGION,
            "size": size,
            "image": "ubuntu-22-04-x64",
            "user_data": user_data,
            "tags": ["aubm-worker", "inference-node"]
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(f"{self.API_URL}/droplets", headers=self.headers, json=payload)
                response.raise_for_status()
                data = response.json()
                droplet_id = data["droplet"]["id"]
                logger.info(f"Inference node creation initiated: {name} (ID: {droplet_id})")
                return data["droplet"]
            except Exception as e:
                logger.error(f"Failed to create droplet: {e}")
                return None

    async def wait_for_ip(self, droplet_id: int, timeout: int = 300) -> Optional[str]:
        """
        Polls the API until the droplet has a public IP assigned.
        """
        start_time = asyncio.get_event_loop().time()
        async with httpx.AsyncClient() as client:
            while (asyncio.get_event_loop().time() - start_time) < timeout:
                try:
                    response = await client.get(f"{self.API_URL}/droplets/{droplet_id}", headers=self.headers)
                    response.raise_for_status()
                    droplet = response.json()["droplet"]
                    
                    networks = droplet.get("networks", {}).get("v4", [])
                    for nw in networks:
                        if nw["type"] == "public":
                            return nw["ip_address"]
                            
                except Exception as e:
                    logger.warning(f"Error polling droplet {droplet_id}: {e}")
                
                await asyncio.sleep(10)
        return None

    async def terminate_node(self, droplet_id: int):
        """
        Destroy the inference node to stop billing.
        """
        async with httpx.AsyncClient() as client:
            try:
                response = await client.delete(f"{self.API_URL}/droplets/{droplet_id}", headers=self.headers)
                response.raise_for_status()
                logger.info(f"Inference node {droplet_id} termination requested.")
                return True
            except Exception as e:
                logger.error(f"Failed to terminate droplet {droplet_id}: {e}")
                return False

infrastructure_service = InfrastructureService()
