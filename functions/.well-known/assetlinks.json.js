export function onRequest() {
  const body = JSON.stringify([
    {
      "relation": ["delegate_permission/common.handle_all_urls"],
      "target": {
        "namespace": "android_app",
        "package_name": "com.penc.messagerie",
        "sha256_cert_fingerprints": [
          "28:80:30:91:3B:D4:93:8C:21:8B:51:EE:85:EB:F5:1B:82:60:CF:BD:57:24:E2:9F:2E:B4:12:AA:0D:5D:6C:3D"
        ]
      }
    }
  ]);
  return new Response(body, {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
