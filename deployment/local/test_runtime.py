import contextlib
import io
import json
from pathlib import Path
import struct
import tempfile
import time
import unittest
from unittest.mock import patch
from urllib.error import URLError
import zlib

import server


def png_cover():
    def chunk(name, payload):
        value = name + payload
        return struct.pack('>I', len(payload)) + value + struct.pack('>I', zlib.crc32(value) & 0xffffffff)
    header = struct.pack('>IIBBBBB', 2, 3, 8, 6, 0, 0, 0)
    pixels = b''.join(b'\0\xff\0\0\xff\xff\0\0\xff' for _ in range(3))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')


def multipart(fields, image):
    boundary = 'local-cover-boundary'
    chunks = []
    for name, value in fields.items():
        chunks += [f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                   str(value).encode(), b'\r\n']
    chunks += [f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="cover.png"\r\nContent-Type: image/png\r\n\r\n'.encode(),
               image, f'\r\n--{boundary}--\r\n'.encode()]
    return b''.join(chunks), f'multipart/form-data; boundary={boundary}'


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        stack = contextlib.ExitStack()
        self.addCleanup(stack.close)
        self.output = stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
        data = Path(stack.enter_context(tempfile.TemporaryDirectory()))
        env = data / '.env.local'
        env.write_text('DEMO_TOKEN=fixture-demo\nAZURE_SPEECH_KEY=fixture-key\n')
        registry = {'_region': 'eastasia', 'vi-VN': {
            'provider': 'azure', 'languageCode': 'vi-VN', 'speedRange': [0.7, 1.2],
            'voices': [{'id': 'vi-VN-HoaiMyNeural', 'gender': 'F'}],
        }}
        (data / 'voices.azure.json').write_text(json.dumps(registry))
        stack.enter_context(patch.object(server, 'DATA', data))
        self.runtime = stack.enter_context(server.Runtime(server.settings(env)))
        from providers.azure import OPENER
        self.request = stack.enter_context(patch.object(OPENER, 'open', side_effect=AssertionError('Network forbidden')))

    def call(self, method, path, body=None):
        result = self.runtime.router.handler({
            'rawPath': path, 'requestContext': {'http': {'method': method}},
            'headers': {'X-Demo-Token': 'fixture-demo'},
            'body': json.dumps(body) if body else None,
        }, server.LocalContext())
        return result['statusCode'], json.loads(result['body'])

    def synthesize(self):
        status, job = self.call('POST', '/synthesize', {
            'text': 'Nội dung fixture riêng tư.', 'lang': 'vi-VN',
            'voice': 'vi-VN-HoaiMyNeural', 'speed': 0.9,
        })
        self.assertEqual(status, 202)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            status, result = self.call('GET', '/jobs/' + job['jobId'])
            self.assertEqual(status, 200)
            if result['status'] in {'DONE', 'FAILED'}:
                return result
            time.sleep(0.02)
        self.fail('Local job did not reach a terminal state')

    def response(self):
        response = io.BytesIO(b'ID3\x04fixture-audio')
        response.headers = {'Content-Type': 'audio/mpeg'}
        return response

    def test_timeout_twice_becomes_failed_in_polling_and_history(self):
        self.request.side_effect = URLError(TimeoutError('private-network-detail'))
        result = self.synthesize()
        self.assertEqual(result['status'], 'FAILED')
        self.assertIn('thời gian chờ', result['error'])
        self.assertIsNone(result['audioUrl'])
        self.assertEqual(self.request.call_count, 2)
        self.assertTrue(all(0 < call.kwargs['timeout'] <= 60 for call in self.request.call_args_list))
        _, history = self.call('GET', '/history')
        self.assertEqual(history['items'][0]['status'], 'FAILED')
        self.assertNotIn('private-network-detail', json.dumps(result))
        self.assertNotIn('Nội dung fixture', self.output.getvalue())
        self.assertNotIn('fixture-key', self.output.getvalue())
        _, deleted = self.call('DELETE', '/history/' + result['jobId'])
        self.assertTrue(deleted['deleted'])

    def test_timeout_then_success_uses_same_job_and_stops_after_two_calls(self):
        self.request.side_effect = [TimeoutError('network'), self.response()]
        result = self.synthesize()
        self.assertEqual(result['status'], 'DONE')
        self.assertEqual(result['progress'], {'done': 1, 'total': 1})
        self.assertEqual(self.request.call_count, 2)
        _, history = self.call('GET', '/history')
        self.assertEqual([item['jobId'] for item in history['items']], [result['jobId']])

    def test_success_requires_no_retry(self):
        self.request.side_effect = None
        self.request.return_value = self.response()
        result = self.synthesize()
        self.assertEqual(result['status'], 'DONE')
        self.assertEqual(self.request.call_count, 1)

    def test_story_cover_uses_local_moto_bridge_not_aws_s3_url(self):
        image = png_cover()
        _, project = self.call('POST', '/audiobooks',
            {'title': 'Local', 'sourceLang': 'vi-VN', 'targetLang': 'vi-VN'})
        pid = project['projectId']
        _, ticket = self.call('POST', f'/audiobooks/{pid}/cover-upload',
            {'contentType': 'image/png', 'sizeBytes': len(image), 'version': project['version']})
        self.assertEqual(ticket['url'], 'http://127.0.0.1:8000/local/story-cover-upload')
        body, content_type = multipart(ticket['fields'], image)
        self.runtime.accept_cover_upload(body, content_type)
        status, saved = self.call('POST', f'/audiobooks/{pid}/cover',
            {'uploadId': ticket['uploadId'], 'version': ticket['version']})
        self.assertEqual(status, 200)
        cover = saved['project']['cover']
        self.assertTrue(cover['url'].startswith('http://127.0.0.1:8000/local/story-cover/'))
        self.assertNotIn('amazonaws.com', cover['url'])
        from urllib.parse import parse_qs, urlsplit
        self.assertEqual(self.runtime.cover(pid, parse_qs(urlsplit(cover['url']).query)), (image, 'image/png'))
        query = parse_qs(urlsplit(cover['url']).query)
        query['signature'] = ['0' * 64]
        self.assertIsNone(self.runtime.cover(pid, query))


if __name__ == '__main__':
    unittest.main()
