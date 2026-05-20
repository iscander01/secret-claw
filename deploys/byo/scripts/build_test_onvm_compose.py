#!/usr/bin/env python3
"""Build a test-only compose that mimics what SecretVM's portal-upload
rewriter would produce on top of our render output.

The wizard production flow uploads `out/docker-compose.yml` to the SecretVM
portal, which rewrites it (adds traefik service, env_file, router labels, TLS
config). For local end-to-end tests we don't go through the portal — instead
we synthesize the post-rewriter shape here and SSH-push it directly to
/mnt/secure/docker_wd/docker-compose.yaml.

This script is test-only and is not part of the wizard production path.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True, type=Path, help="rendered docker-compose.yml")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--vm-hostname", required=True)
    args = ap.parse_args()

    src = yaml.safe_load(args.inp.read_text(encoding="utf-8"))

    gw = src["services"]["openclaw-gateway"]
    # Add post-rewriter mutations onto the gateway service.
    gw.setdefault("networks", []).append("traefik")
    gw.setdefault("labels", []).extend([
        "traefik.enable=true",
        f"traefik.http.routers.openclaw-gateway.rule=Host(`{args.vm_hostname}`)",
        "traefik.http.routers.openclaw-gateway.entrypoints=websecure",
        "traefik.http.routers.openclaw-gateway.tls=true",
        "traefik.http.services.openclaw-gateway.loadbalancer.server.port=18789",
    ])
    gw["env_file"] = ["usr/.env"]

    out = {
        "x-openclaw-image": src["x-openclaw-image"],
        "services": {
            "openclaw-gateway": gw,
            "traefik": {
                "image": "traefik:v2.10",
                "command": [
                    "--api.insecure=false",
                    "--providers.docker=true",
                    "--providers.docker.exposedbydefault=false",
                    "--entrypoints.web.address=:80",
                    "--entrypoints.websecure.address=:443",
                    "--entrypoints.websecure.http.tls.options=default@file",
                    "--providers.file.directory=/etc/traefik/dynamic",
                    "--providers.file.watch=true",
                ],
                "ports": ["80:80", "443:443"],
                "volumes": [
                    "/var/run/docker.sock:/var/run/docker.sock:ro",
                    "/mnt/secure/cert:/certs:ro",
                ],
                "networks": ["traefik"],
                "configs": [
                    {"source": "tls_config", "target": "/etc/traefik/dynamic/tls.yml"},
                ],
                "env_file": ["usr/.env"],
            },
        },
        "volumes": src["volumes"],
        "networks": {"traefik": {"driver": "bridge"}},
        "configs": {
            **src["configs"],
            "tls_config": {
                "content": (
                    "tls:\n"
                    "  certificates:\n"
                    "    - certFile: /certs/secret_vm_fullchain.pem\n"
                    "      keyFile: /certs/secret_vm_private.pem\n"
                    "  stores:\n"
                    "    default:\n"
                    "      defaultCertificate:\n"
                    "        certFile: /certs/secret_vm_fullchain.pem\n"
                    "        keyFile: /certs/secret_vm_private.pem\n"
                ),
            },
        },
    }

    # default_flow_style=False -> block style. width=4096 prevents line wrapping
    # inside the configs.content blocks (where we definitely don't want PyYAML
    # rewrapping our base64 blobs).
    args.out.write_text(
        yaml.safe_dump(out, default_flow_style=False, width=4096, sort_keys=False),
        encoding="utf-8",
        newline="\n",
    )
    print(f"wrote {args.out} ({args.out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
