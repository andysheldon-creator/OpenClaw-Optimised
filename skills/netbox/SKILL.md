---
name: netbox
description: Query and manage network infrastructure using the NetBox REST API. Search devices, IP addresses, prefixes, and manage IP allocations.
homepage: https://docs.netbox.dev/en/stable/
metadata: {"openclaw":{"emoji":"🌐","requires":{"bins":["curl","jq"],"env":["NETBOX_URL","NETBOX_TOKEN"]}}}
---

# NetBox Skill

Query and manage network infrastructure using the NetBox REST API.

## Setup

Set environment variables:
```bash
export NETBOX_URL="http://netbox.example.com:8080"
export NETBOX_TOKEN="your-api-token"
```

## Common Variables

All commands use these headers:
```bash
AUTH="Authorization: Token $NETBOX_TOKEN"
CT="Content-Type: application/json"
```

---

## IPAM Operations

### Search IP Addresses

Search by address:
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/ip-addresses/?address=10.0.0.1" | jq '.results[] | {id, address, status: .status.value, dns_name, description}'
```

Search by partial address (contains):
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/ip-addresses/?address__ic=10.0.0" | jq '.results[] | {id, address, status: .status.value}'
```

Search by DNS name:
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/ip-addresses/?dns_name__ic=myserver" | jq '.results[] | {id, address, dns_name}'
```

List IPs assigned to a device:
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/ip-addresses/?device=mydevice" | jq '.results[] | {address, interface: .assigned_object.name}'
```

### Search Prefixes

List all prefixes:
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/prefixes/?limit=50" | jq '.results[] | {id, prefix, status: .status.value, site: .site.name, vlan: .vlan.vid}'
```

Search prefix by network:
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/prefixes/?prefix=10.0.0.0/24" | jq '.results[] | {id, prefix, status: .status.value, description}'
```

Search prefixes containing an IP:
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/prefixes/?contains=10.0.0.50" | jq '.results[] | {prefix, site: .site.name}'
```

Search prefixes within a parent:
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/prefixes/?within=10.0.0.0/16" | jq '.results[] | {prefix, status: .status.value}'
```

Search by site:
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/prefixes/?site=dc1" | jq '.results[] | {prefix, vlan: .vlan.vid, role: .role.name}'
```

### Get IP Availability in a Prefix

Get available IPs in a prefix (requires prefix ID):
```bash
# First get the prefix ID
PREFIX_ID=$(curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/prefixes/?prefix=10.0.0.0/24" | jq -r '.results[0].id')

# Then get available IPs
curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/prefixes/$PREFIX_ID/available-ips/" | jq '.[0:10]'
```

Get prefix utilization:
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/prefixes/?prefix=10.0.0.0/24" | jq '.results[] | {prefix, description, children: .children, utilization: "\(.mark_utilized)%"}'
```

### Create/Reserve IP Address

Create a new IP address:
```bash
curl -s -X POST -H "$AUTH" -H "$CT" "$NETBOX_URL/api/ipam/ip-addresses/" \
  -d '{
    "address": "10.0.0.100/24",
    "status": "active",
    "dns_name": "myserver.example.com",
    "description": "Web server primary IP"
  }' | jq '{id, address, status: .status.value}'
```

Reserve next available IP in a prefix:
```bash
# First get the prefix ID
PREFIX_ID=$(curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/prefixes/?prefix=10.0.0.0/24" | jq -r '.results[0].id')

# Create next available IP
curl -s -X POST -H "$AUTH" -H "$CT" "$NETBOX_URL/api/ipam/prefixes/$PREFIX_ID/available-ips/" \
  -d '{
    "description": "Reserved for new server",
    "status": "reserved"
  }' | jq '{id, address, status: .status.value}'
```

Reserve multiple IPs at once:
```bash
curl -s -X POST -H "$AUTH" -H "$CT" "$NETBOX_URL/api/ipam/prefixes/$PREFIX_ID/available-ips/" \
  -d '[
    {"description": "Server 1", "status": "reserved"},
    {"description": "Server 2", "status": "reserved"}
  ]' | jq '.[] | {address, description}'
```

### Update IP Address

```bash
curl -s -X PATCH -H "$AUTH" -H "$CT" "$NETBOX_URL/api/ipam/ip-addresses/{id}/" \
  -d '{
    "status": "active",
    "dns_name": "newname.example.com"
  }' | jq '{id, address, status: .status.value, dns_name}'
```

### Delete IP Address

```bash
curl -s -X DELETE -H "$AUTH" "$NETBOX_URL/api/ipam/ip-addresses/{id}/"
```

---

## DCIM Operations

### Search Devices

List devices:
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/dcim/devices/?limit=50" | jq '.results[] | {id, name, status: .status.value, site: .site.name, role: .role.name}'
```

Search by name:
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/dcim/devices/?name__ic=server" | jq '.results[] | {id, name, status: .status.value, primary_ip: .primary_ip.address}'
```

Search by site:
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/dcim/devices/?site=dc1" | jq '.results[] | {name, rack: .rack.name, position: .position}'
```

Search by role:
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/dcim/devices/?role=server" | jq '.results[] | {name, device_type: .device_type.model}'
```

Search by serial number:
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/dcim/devices/?serial=ABC123" | jq '.results[] | {name, serial, asset_tag}'
```

Get device details:
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/dcim/devices/{id}/" | jq '{name, status: .status.value, site: .site.name, rack: .rack.name, position, primary_ip4: .primary_ip4.address, primary_ip6: .primary_ip6.address}'
```

### List Device Interfaces

```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/dcim/interfaces/?device=mydevice" | jq '.results[] | {id, name, type: .type.value, enabled, mac_address}'
```

### Search Sites

```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/dcim/sites/" | jq '.results[] | {id, name, slug, status: .status.value, region: .region.name}'
```

### Search Racks

```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/dcim/racks/?site=dc1" | jq '.results[] | {id, name, u_height, status: .status.value}'
```

---

## VLANs

### List VLANs

```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/vlans/" | jq '.results[] | {id, vid, name, status: .status.value, site: .site.name}'
```

### Search VLAN by ID

```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/vlans/?vid=100" | jq '.results[] | {vid, name, description}'
```

---

## Virtualization

### List Virtual Machines

```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/virtualization/virtual-machines/" | jq '.results[] | {id, name, status: .status.value, cluster: .cluster.name, vcpus, memory, disk}'
```

### Search VM by name

```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/virtualization/virtual-machines/?name__ic=web" | jq '.results[] | {name, primary_ip: .primary_ip.address}'
```

---

## Tips

### Pagination

NetBox returns paginated results. Use `limit` and `offset`:
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/dcim/devices/?limit=100&offset=200" | jq '.results'
```

### Filtering

Common filter suffixes:
- `__ic` - case-insensitive contains
- `__nic` - case-insensitive not contains
- `__ie` - case-insensitive exact
- `__isw` - case-insensitive starts with
- `__iew` - case-insensitive ends with

### Status Values

Common status values:
- IP addresses: `active`, `reserved`, `deprecated`, `dhcp`, `slaac`
- Devices: `active`, `planned`, `staged`, `failed`, `offline`, `decommissioning`, `inventory`
- Prefixes: `active`, `reserved`, `deprecated`, `container`

### Get All Results (scripting)

```bash
# Loop through paginated results
OFFSET=0
LIMIT=100
while true; do
  RESULT=$(curl -s -H "$AUTH" "$NETBOX_URL/api/dcim/devices/?limit=$LIMIT&offset=$OFFSET")
  echo "$RESULT" | jq -r '.results[] | .name'
  NEXT=$(echo "$RESULT" | jq -r '.next')
  [ "$NEXT" = "null" ] && break
  OFFSET=$((OFFSET + LIMIT))
done
```

### Export to CSV

```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/ip-addresses/?limit=1000" | \
  jq -r '.results[] | [.address, .dns_name, .status.value, .description] | @csv'
```

## Examples

### Find which device has a specific IP
```bash
IP="10.0.0.50"
curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/ip-addresses/?address=$IP" | \
  jq '.results[] | {address, device: .assigned_object.device.name, interface: .assigned_object.name}'
```

### List all IPs in a subnet with their assignments
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/ipam/ip-addresses/?parent=10.0.0.0/24" | \
  jq '.results[] | {address, dns_name, device: .assigned_object.device.name // "unassigned"}'
```

### Get rack utilization
```bash
curl -s -H "$AUTH" "$NETBOX_URL/api/dcim/racks/?site=dc1" | \
  jq '.results[] | {name, u_height, utilized: "\(.u_utilized // 0)/\(.u_height)"}'
```
