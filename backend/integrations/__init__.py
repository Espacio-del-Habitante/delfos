"""Capa integrator: interfaz unica + adapters intercambiables para IA externa.

El dominio (ocr/ai questions) NO importa adapters concretos. Solo usa:
    from integrations import registry
    integration = registry.get_active_integration()
    integration.complete_json(prompt)
"""

from integrations.base import AIIntegration, IntegrationError

__all__ = ["AIIntegration", "IntegrationError"]
