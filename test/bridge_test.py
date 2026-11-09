"""Run with python -m unittest discover -s test -p '*_test.py'."""
import importlib.util
from pathlib import Path
import unittest
from aiohttp import web, ClientSession
from aiohttp.test_utils import TestServer, TestClient

spec = importlib.util.spec_from_file_location('skyward_proxy', Path('bridge/skyward_mcp/proxy.py'))
proxy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proxy)

class BridgeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.secret = 'a' * 64
        self.seen = []
        async def backend(request):
            self.seen.append((request.path, await request.read(), dict(request.headers)))
            if request.path != '/mcp/' + self.secret and request.headers.get('Authorization') != 'Bearer valid':
                return web.Response(status=401)
            return web.json_response({'jsonrpc': '2.0', 'id': 1, 'result': {'tools': []}})
        app = web.Application(); app.router.add_post('/{tail:.*}', backend)
        self.backend = TestServer(app); await self.backend.start_server()
        self.backend_url = str(self.backend.make_url('')).rstrip('/')
        self.session = ClientSession()
        async def bridge(request):
            return await proxy.forward(request, self.session, self.backend_url, request.match_info.get('secret'))
        app = web.Application(); app.router.add_route('*', '/api/skyward_mcp/mcp', bridge); app.router.add_route('*', '/api/skyward_mcp/mcp/{secret}', bridge)
        self.client = TestClient(TestServer(app)); await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close(); await self.session.close(); await self.backend.close()

    async def test_forward_and_revoke(self):
        url = '/api/skyward_mcp/mcp/' + self.secret
        response = await self.client.post(url, json={'jsonrpc':'2.0','id':1,'method':'tools/list'}, headers={'Cookie':'never-forward', 'Accept':'application/json'})
        self.assertEqual(response.status, 200)
        self.assertEqual((await response.json())['result']['tools'], [])
        self.assertNotIn('Cookie', self.seen[0][2])
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.secret = 'b' * 64
        self.assertEqual((await self.client.post(url, json={})).status, 401)
        self.assertEqual((await self.client.post('/api/skyward_mcp/mcp', json={})).status, 401)
        self.assertEqual((await self.client.post('/api/skyward_mcp/mcp', json={}, headers={'Authorization':'Bearer valid'})).status, 200)

    async def test_reject_invalid_and_browser_requests(self):
        for path, kwargs, expected in [('/bad', {}, 404), ('/'+'a'*64, {'headers':{'Origin':'https://evil.example'}},403), ('/'+'a'*64+'?url=http://evil',{},403), ('/'+'a'*64, {'data': b'x'*65537},413)]:
            response = await self.client.post('/api/skyward_mcp/mcp'+path, **kwargs)
            self.assertEqual(response.status, expected)
        self.assertEqual(len(self.seen), 0)
        self.assertEqual((await self.client.get('/api/skyward_mcp/mcp/'+'a'*64)).status, 405)

    async def test_backend_unavailable(self):
        await self.backend.close()
        response = await self.client.post('/api/skyward_mcp/mcp/'+'a'*64, json={})
        self.assertEqual(response.status, 502)
