import io
import unittest
from urllib.error import HTTPError
from urllib.request import Request

from deployment.local.runtime.gemini_rotation import install, parse_keys


class FakeOpener:
    def __init__(self, outcomes):
        self.outcomes, self.requests = iter(outcomes), []

    def open(self, request, *args, **kwargs):
        self.requests.append(request)
        outcome = next(self.outcomes)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class GeminiRotationTest(unittest.TestCase):
    def test_parse_one_or_many_keys_and_reject_more_than_five(self):
        self.assertEqual(parse_keys(' one '), ('one',))
        self.assertEqual(parse_keys(' one, two,one , , three '), ('one', 'two', 'three'))
        with self.assertRaises(ValueError):
            parse_keys(','.join(str(index) for index in range(6)))

    def test_local_gemini_429_tries_next_key_in_order(self):
        opener = FakeOpener([HTTPError('https://fixture', 429, 'quota', {}, io.BytesIO()), io.BytesIO(b'ok')])
        restore = install(opener, ('one', 'two'))
        request = Request('https://generativelanguage.googleapis.com/v1beta/interactions',
                          data=b'{}', headers={'x-goog-api-key': 'one,two'}, method='POST')
        self.assertEqual(opener.open(request).read(), b'ok')
        self.assertEqual([item.get_header('X-goog-api-key') for item in opener.requests], ['one', 'two'])
        restore()

    def test_auth_failure_and_non_gemini_requests_do_not_rotate(self):
        denied = HTTPError('https://fixture', 403, 'auth', {}, io.BytesIO())
        opener = FakeOpener([denied])
        install(opener, ('one', 'two'))
        request = Request('https://generativelanguage.googleapis.com/v1beta/interactions', data=b'{}')
        with self.assertRaises(HTTPError):
            opener.open(request)
        self.assertEqual(len(opener.requests), 1)
        one_key = FakeOpener([io.BytesIO(b'ok')])
        install(one_key, ('single',))
        one_key.open(Request('https://example.com'))
        self.assertEqual(len(one_key.requests), 1)


if __name__ == '__main__':
    unittest.main()
