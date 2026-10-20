#!/usr/bin/env bash
# Run on prx-h2 after verifying VMID/IP availability and node capacity.
set -euo pipefail
vmid=280
template=debian-13-standard_13.6-1_amd64.tar.zst
test "$(hostname)" = prx-h2
test ! -e /etc/pve/lxc/${vmid}.conf
test ! -e /etc/pve/qemu-server/${vmid}.conf
test -s /root/comrade-bootstrap.pub
if ! pvesm list local --content vztmpl | grep -q "$template"; then
  pveam download local "$template"
fi
pct create "$vmid" "local:vztmpl/$template" \
  --hostname projectcomrade-01 --unprivileged 1 \
  --cores 2 --memory 4096 --swap 512 --rootfs local-lvm:24 \
  --features nesting=1,keyctl=1 --onboot 1 \
  --net0 name=eth0,bridge=vmbr0v10,ip=10.1.0.60/24,gw=10.1.0.1,type=veth \
  --nameserver 10.1.0.1 --ssh-public-keys /root/comrade-bootstrap.pub \
  --description 'Project Comrade browser engine workbench with credential-free release deployment'
pct start "$vmid"
pct exec "$vmid" -- hostname
