#!/usr/bin/env bash
# Bootstrap only the dedicated Project Comrade guest, never a hypervisor.
set -euo pipefail
test "$(hostname)" = projectcomrade-01
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y docker.io docker-compose ca-certificates curl python3
systemctl enable --now docker
install -d -m 755 /opt/comrade
