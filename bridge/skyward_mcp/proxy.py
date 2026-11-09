"""Bounded, fixed-destination MCP forwarding. No browser automation in Core."""
import asyncio
import re
from aiohttp import ClientError, ClientTimeout, web

LIMIT = 65536
RESPONSE_LIMIT = 8 * 1024 * 1024

async def forward(request, session, backend, secret=None):
    headers = {'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'}
    if request.headers.get('Origin') or request.query_string:
        return web.Response(status=403, headers=headers)
    if secret is not None and not re.fullmatch(r'[a-f0-9]{64}', secret):
        return web.Response(status=404, headers=headers)
    if request.method != 'POST':
        return web.Response(status=405, headers={**headers, 'Allow': 'POST'})
    body = bytearray()
    async for chunk in request.content.iter_chunked(8192):
        body.extend(chunk)
        if len(body) > LIMIT:
            return web.Response(status=413, headers=headers)
    outgoing = {key: request.headers[key] for key in ('Content-Type', 'Accept', 'Authorization', 'MCP-Protocol-Version') if key in request.headers}
    # Backend is installation metadata, never taken from the incoming URL or headers.
    url = backend + '/mcp' + ('/' + secret if secret is not None else '')
    try:
        async with session.post(url, data=bytes(body), headers=outgoing,
                                allow_redirects=False, timeout=ClientTimeout(total=600)) as upstream:
            result = bytearray()
            async for chunk in upstream.content.iter_chunked(65536):
                result.extend(chunk)
                if len(result) > RESPONSE_LIMIT:
                    return web.Response(status=502, text='MCP response too large.', headers=headers)
            if 300 <= upstream.status < 400:
                return web.Response(status=502, headers=headers)
            for key in ('Content-Type', 'WWW-Authenticate', 'Allow'):
                if key in upstream.headers:
                    headers[key] = upstream.headers[key]
            return web.Response(status=upstream.status, body=bytes(result), headers=headers)
    except (ClientError, asyncio.TimeoutError):
        return web.Response(status=502, text='Skyward app is unavailable.', headers=headers)
