"""Exercise the bundled integration inside the real HA Core container."""
import asyncio
import json
from pathlib import Path
from aiohttp import web, ClientSession
from homeassistant.core import HomeAssistant
from homeassistant.bootstrap import async_from_config_dict

async def main():
    config = Path('/config')
    target = config / 'custom_components' / 'skyward_mcp'
    (target / 'connection.json').write_text(json.dumps({'hostname': 'localhost'}))
    secret = 'a' * 64
    async def backend(request):
        if request.path != '/mcp/' + secret:
            return web.Response(status=404)
        data = await request.json()
        return web.json_response({'jsonrpc': '2.0', 'id': data.get('id'), 'result': {'tools': []}})
    app = web.Application(); app.router.add_post('/{path:.*}', backend)
    runner = web.AppRunner(app, access_log=None); await runner.setup()
    await web.TCPSite(runner, '127.0.0.1', 3000).start()
    hass = HomeAssistant(str(config))
    try:
        await async_from_config_dict({'http': {'server_host': '127.0.0.1', 'server_port': 8123}}, hass)
        result = await hass.config_entries.flow.async_init('skyward_mcp', context={'source':'user'})
        assert result['type'] == 'form', result
        result = await hass.config_entries.flow.async_configure(result['flow_id'], {})
        assert result['type'] == 'create_entry', result
        await hass.async_block_till_done()
        await hass.async_start()
        async with ClientSession() as client:
            async with client.post('http://127.0.0.1:8123/api/skyward_mcp/mcp/' + secret,
                                   json={'jsonrpc':'2.0','id':1,'method':'tools/list'}) as response:
                assert response.status == 200, (response.status, await response.text())
                assert (await response.json())['result'] == {'tools': []}
            async with client.post('http://127.0.0.1:8123/api/skyward_mcp/mcp/' + 'b'*64, json={}) as response:
                assert response.status == 404, response.status
        print('Real HA Core config flow, route registration, and authenticated MCP forwarding passed.')
    finally:
        await hass.async_stop(force=True)
        await runner.cleanup()

asyncio.run(main())
