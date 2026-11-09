"""Skyward MCP bridge installed and maintained by the Skyward app."""
import json
import re
from pathlib import Path
from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from .proxy import forward

DOMAIN = 'skyward_mcp'

def read_backend():
    host = json.loads(Path(__file__).with_name('connection.json').read_text())['hostname']
    if not isinstance(host, str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,62}', host):
        raise ValueError('Invalid Skyward app hostname')
    return 'http://' + host + ':3000'

async def async_setup_entry(hass, entry):
    backend = await hass.async_add_executor_job(read_backend)
    hass.data[DOMAIN] = backend
    if not hass.data.get(DOMAIN + '_registered'):
        hass.http.register_view(SkywardView(hass))
        hass.data[DOMAIN + '_registered'] = True
    return True

async def async_unload_entry(hass, entry):
    hass.data.pop(DOMAIN, None)
    return True

class SkywardView(HomeAssistantView):
    url = '/api/skyward_mcp/mcp'
    extra_urls = ['/api/skyward_mcp/mcp/{secret}']
    name = 'api:skyward_mcp:mcp'
    # Authentication is enforced by the app for EVERY forwarded MCP request.
    # HA login is intentionally not required for ChatGPT's secret URL transport.
    requires_auth = False

    def __init__(self, hass):
        self.hass = hass

    async def post(self, request, secret=None):
        backend = self.hass.data.get(DOMAIN)
        if not backend:
            return web.Response(status=503)
        return await forward(request, async_get_clientsession(self.hass), backend, secret)

    async def get(self, request, secret=None):
        return web.Response(status=405, headers={'Allow': 'POST', 'Cache-Control': 'no-store'})

    delete = get
