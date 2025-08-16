# app/services/s3_storage.py
import os
from uuid import uuid4
import boto3


def _s3():
    return boto3.client(
        "s3",
        endpoint_url=os.getenv("S3_ENDPOINT"),
        aws_access_key_id=os.getenv("S3_ACCESS_KEY"),
        aws_secret_access_key=os.getenv("S3_SECRET_KEY"),
        region_name=os.getenv("S3_REGION", "us-east-1"),
        verify=os.getenv("S3_SECURE", "false").lower() == "true",
    )


def upload_png_and_return_key(project_id: str, image_bytes: bytes) -> str:
    """
    Uploads PNG bytes to S3/MinIO and returns the object KEY (not a URL).
    """
    bucket = os.getenv("S3_BUCKET", "generated")
    key = f"generated/{project_id}/{uuid4().hex}.png"
    s3 = _s3()
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=image_bytes,
        ContentType="image/png",
        CacheControl="private, max-age=31536000, immutable",  # safe for object storage
    )
    return key


def presign_get_url(key: str, expires: int = 3600) -> str:
    """
    Returns a time-limited URL to GET the object.
    """
    s3 = _s3()
    bucket = os.getenv("S3_BUCKET", "generated")
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires,
    )


def delete_object(key: str) -> None:
    s3 = _s3()
    bucket = os.getenv("S3_BUCKET", "generated")
    s3.delete_object(Bucket=bucket, Key=key)
