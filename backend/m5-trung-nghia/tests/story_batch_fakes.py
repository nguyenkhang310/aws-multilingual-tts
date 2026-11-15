"""S3 and Lambda Event fixtures for audiobook integration tests."""

import json
import threading

from fake_s3 import FakeS3


class SafeS3(FakeS3):
    def __init__(self):
        super().__init__()
        self.lock = threading.RLock()

    def put_object(self, **options):
        with self.lock:
            return super().put_object(**options)


class LambdaQueue:
    def __init__(self):
        self.events = []
        self.fail = False

    def invoke(self, **kwargs):
        self.events.append(json.loads(kwargs['Payload']))
        if self.fail:
            raise TimeoutError('response lost')
        return {'StatusCode': 202}
