import logging
import numpy as np
from typing import List, Optional
import openai
from services.config import settings

logger = logging.getLogger("embedding_service")

class EmbeddingService:
    """
    Handles text vectorization for semantic deduplication and retrieval.
    """
    def __init__(self):
        self.client = None
        self.model = "text-embedding-3-small"
        if settings.OPENAI_API_KEY:
            try:
                self.client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            except Exception as e:
                logger.error(f"Failed to initialize OpenAI client for embeddings: {e}")

    async def get_embedding(self, text: str) -> List[float]:
        """
        Fetches a single embedding for a string.
        """
        embeddings = await self.get_embeddings([text])
        return embeddings[0] if embeddings else []

    async def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """
        Batch fetches embeddings for a list of strings.
        """
        if not settings.OPENAI_API_KEY or not self.client:
            logger.debug("OpenAI embeddings not available (missing key or initialization failed).")
            return []
            
        if not texts:
            return []

        try:
            # Cleanup texts to avoid API errors on empty/null inputs
            clean_texts = [str(t)[:8000] for t in texts if t]
            if not clean_texts:
                return []

            response = await self.client.embeddings.create(
                input=clean_texts,
                model=self.model
            )
            return [data.embedding for data in response.data]
        except Exception as e:
            logger.error(f"Failed to fetch embeddings: {e}")
            return []

    def cosine_similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """
        Calculates cosine similarity between two vectors.
        """
        a = np.array(vec_a)
        b = np.array(vec_b)
        if not a.any() or not b.any():
            return 0.0
        return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

    async def find_duplicates(self, new_claims: List[str], existing_claims: List[str], threshold: float = 0.85) -> List[Optional[int]]:
        """
        For each new claim, finds the index of a semantically similar existing claim.
        Returns a list of indices or None if no match found.
        """
        if not new_claims or not existing_claims:
            return [None] * len(new_claims)

        new_vecs = await self.get_embeddings(new_claims)
        existing_vecs = await self.get_embeddings(existing_claims)

        if not new_vecs or not existing_vecs:
            return [None] * len(new_claims)

        results = []
        for n_vec in new_vecs:
            best_idx = None
            best_score = -1.0
            
            for idx, e_vec in enumerate(existing_vecs):
                score = self.cosine_similarity(n_vec, e_vec)
                if score > threshold and score > best_score:
                    best_score = score
                    best_idx = idx
            
            results.append(best_idx)
        
        return results

embedding_service = EmbeddingService()
