import types


class ClientError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


class NoSuchKey(ClientError):
    def __init__(self):
        super().__init__("NoSuchKey")


class Body:
    def __init__(self, data):
        self.data = data

    def read(self, size=-1):
        return self.data if size < 0 else self.data[:size]

    def close(self):
        pass


class FakeS3:
    exceptions = types.SimpleNamespace(ClientError=ClientError, NoSuchKey=NoSuchKey)

    def __init__(self):
        self.objects = {}
        self.metadata = {}
        self.puts = []
        self.posts = []
        self.signed_urls = []
        self.revision = 0
        self.before_put = None
        self.head_error = None

    def seed(self, bucket, key, data, content_type="application/octet-stream", metadata=None):
        self.revision += 1
        self.objects[bucket, key] = (data, f'"etag-{self.revision}"')
        self.metadata[bucket, key] = {"ContentType": content_type, "Metadata": metadata or {}}

    def get_object(self, Bucket, Key):
        if (Bucket, Key) not in self.objects:
            raise NoSuchKey()
        data, etag = self.objects[Bucket, Key]
        return {"Body": Body(data), "ETag": etag, **self.metadata.get((Bucket, Key), {})}

    def head_object(self, Bucket, Key):
        if self.head_error:
            raise ClientError(self.head_error)
        if (Bucket, Key) not in self.objects:
            raise ClientError("404")
        data, etag = self.objects[Bucket, Key]
        return {"ETag": etag, "ContentLength": len(data), **self.metadata.get((Bucket, Key), {})}

    def put_object(self, Bucket, Key, Body, **options):
        if self.before_put:
            hook, self.before_put = self.before_put, None
            hook()
        self.puts.append({"Bucket": Bucket, "Key": Key, **options})
        expected = options.get("IfMatch")
        if expected is not None and self.objects.get((Bucket, Key), (None, None))[1] != expected:
            raise ClientError("PreconditionFailed")
        if options.get("IfNoneMatch") == "*" and (Bucket, Key) in self.objects:
            raise ClientError("PreconditionFailed")
        self.seed(Bucket, Key, Body, options.get("ContentType", "application/octet-stream"), options.get("Metadata"))
        return {"ETag": self.objects[Bucket, Key][1]}

    def delete_object(self, Bucket, Key):
        self.objects.pop((Bucket, Key), None)
        self.metadata.pop((Bucket, Key), None)

    def list_objects_v2(self, Bucket, Prefix, ContinuationToken=None, MaxKeys=1000, Delimiter=None):
        keys = sorted(key for bucket, key in self.objects if bucket == Bucket and key.startswith(Prefix))
        if Delimiter:
            prefixes = sorted({Prefix + key[len(Prefix):].split(Delimiter)[0] + Delimiter
                               for key in keys if Delimiter in key[len(Prefix):]})
            return {"CommonPrefixes": [{"Prefix": item} for item in prefixes], "IsTruncated": False}
        return {"Contents": [{"Key": key} for key in keys], "IsTruncated": False}

    def generate_presigned_url(self, operation, Params, ExpiresIn):
        self.signed_urls.append((operation, Params, ExpiresIn))
        return f"https://signed.test/{Params['Key']}?expires={ExpiresIn}"

    def generate_presigned_post(self, Bucket, Key, Fields, Conditions, ExpiresIn):
        result = {"url": "https://upload.test", "fields": {"key": Key, **Fields, "policy": "test"}}
        self.posts.append({"Bucket": Bucket, "Key": Key, "Fields": Fields,
                           "Conditions": Conditions, "ExpiresIn": ExpiresIn})
        return result
