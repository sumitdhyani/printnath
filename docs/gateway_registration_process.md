# Gateway Registration Process

## 0. WiFi Setup (First Boot / Recovery)

The gateway uses a single WiFi chip (Raspberry Pi Zero 2 W built-in). It supports two modes:

- **Station mode (client):** Connects to an existing WiFi network (normal operation)
- **AP mode (access point):** Broadcasts its own WiFi network (for setup/recovery)

### Boot Flow

```
Gateway boots
  ├── Saved WiFi credentials exist?
  │     ├── Yes → try to connect for 60 seconds (retry every 5s)
  │     │         ├── Success → HELLO to server (normal operation)
  │     │         └── Fail → start AP mode + captive portal
  │     └── No → start AP mode + captive portal immediately
  │
  └── In AP mode:
        ├── Broadcasts SSID "PrintNath-XXXX"
        ├── Serves captive portal at 192.168.4.1
        ├── Captive portal: lists nearby WiFi networks, owner selects + enters password
        ├── Owner submits → stores credentials, reboots in station mode
        └── Every 5 minutes: silently retry saved credentials
              ├── Success → switch to station mode, HELLO
              └── Fail → stay in AP mode
```

### Why 60-second retry before AP mode?

Handles transient outages (power cut, router reboot). Most router reboots complete within 60 seconds. Without this delay, a power cut would unnecessarily trigger AP mode.

### Captive Portal

When connected to the gateway's AP, any HTTP request from the phone is redirected to the gateway's built-in web server. This triggers the phone's captive portal popup automatically (standard iOS/Android behavior).

### Reconfiguration

If WiFi password changes or router is replaced:
1. Gateway fails to connect → retries for 60s → fails → enters AP mode
2. Owner sees "PrintNath-XXXX" in phone WiFi list
3. Connects to it → captive portal opens → enters new WiFi credentials
4. Gateway reboots, connects with new credentials, HELLO to server

## 1. Device Preparation

Before shipping/installing the gateway:

1. Install the gateway software on the SBC.
2. Generate a persistent `deviceId` (UUID v4).
3. Register the device ID in the central backend.
4. Create an activation record.
5. Put an activation QR on the device.

Example:

`https://<server>/activate/<deviceId>`

The QR should contain only activation information, not customer documents or personal data.

## 2. First Boot

The gateway:

1. Loads or generates its persistent `deviceId`.
2. Connects to the backend.
3. Sends a `HELLO` request.

```json
{
  "type": "HELLO",
  "deviceId": "DEVICE-UUID",
  "softwareVersion": "1.0.0"
}
```

The server initially places the gateway in:

`PRE_ACTIVATION`

At this stage it should have only limited privileges.

## 3. Owner/Administrator Activation

The shopkeeper, hostel administrator, or other authorized person:

1. Scans the activation QR attached to the gateway.
2. Opens the activation page.
3. Authenticates using OTP/login.
4. Selects or confirms the business/location.
5. Confirms activation.

The backend then binds:

`deviceId -> business/location`

Keep the physical device identity separate from the business identity.

## 4. Activation

The backend changes the gateway state to:

`ACTIVATED`

It provides operational credentials/configuration.

```json
{
  "type": "HELLO_RESPONSE",
  "status": "ACTIVATED",
  "deviceToken": "<secure-token>"
}
```

For production, use a device-specific credential such as a secure token, certificate, or HMAC-based identity.

## 5. Establish the Operational Connection

```text
Gateway
   |
   | HTTPS HELLO
   v
Server
   |
   | activation/configuration
   v
Gateway
   |
   | WebSocket
   v
Server
```

The WebSocket handles persistent communication such as:

- heartbeats
- capability queries
- print preflight
- print-job dispatch
- job status
- cancellation
- diagnostics

The server remains the source of truth for gateway and job state.

## 6. Printer Discovery

After activation, the gateway discovers local printers and their capabilities:

- B&W / colour
- paper sizes
- duplex support
- printer status
- connection type
- available queues

The gateway owns the local printer topology. The server sends printing requirements rather than individual printer IDs.

For example:

```text
Server
  |
  | "Need A4, colour"
  v
Gateway
  |
  +--> Printer A: B&W only
  |
  +--> Printer B: Colour, A4
             |
             +--> select Printer B
```

## 7. Operational State

Once activated, connected, and printers are successfully discovered:

`PRE_ACTIVATION -> ACTIVATED -> OPERATIONAL`

Connectivity is tracked separately:

`CONNECTED <-> DISCONNECTED`

Therefore a gateway can remain `OPERATIONAL` while temporarily disconnected.

## 8. Restart / Recovery

After a normal restart:

1. Reuse the existing `deviceId`.
2. Do not create a new identity.
3. Reconnect to the backend.
4. Authenticate with the stored device credential.
5. Restore configuration/state.

After a factory reset, return the device to `PRE_ACTIVATION` and require activation again.

## 9. Security Principles

- `deviceId` identifies the gateway but is not a secret.
- Pre-activation privileges must be minimal.
- Human activation requires authentication.
- Use HTTPS/WSS for communication.
- Give every gateway unique credentials.
- Credentials must be revocable.
- Never put customer documents or personal information in QR codes.
- Keep device, business/location, and customer identities separate.

## Complete Flow

```text
              DEVICE PREPARATION
                       |
                       v
              Generate deviceId
                       |
                       v
             Register device in DB
                       |
                       v
             Attach activation QR
                       |
                       v
                 Ship/install
                       |
                       v
                  FIRST BOOT
                       |
                       v
             Gateway sends HELLO
                       |
                       v
                PRE_ACTIVATION
                       |
              Admin scans QR
                       |
                       v
                OTP / LOGIN
                       |
                       v
          Bind device to location
                       |
                       v
                  ACTIVATED
                       |
                       v
           Receive device credentials
                       |
                       v
             Establish WebSocket
                       |
                       v
             Discover local printers
                       |
                       v
                 OPERATIONAL
                       |
                       v
               Ready for print jobs
```

## Key Design Decision

Keep these identities separate:

```text
Physical Device
    |
    +-- deviceId
    +-- device credentials
    +-- printer topology

Business / Location
    |
    +-- businessId
    +-- locationId
    +-- owner/admin

Customer
    |
    +-- customerId
    +-- documents
    +-- print jobs
```

This allows a gateway to be moved to another location without changing its physical device identity.
