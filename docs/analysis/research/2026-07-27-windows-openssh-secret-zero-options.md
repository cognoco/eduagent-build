# Windows OpenSSH and headless Secret Zero on Orion

**Date:** 2026-07-27  
**Scope:** Windows 11 x64, local account `hex`, Microsoft Win32-OpenSSH, Windows Credential Manager/DPAPI, Infisical, and unattended development-agent access.

## Executive conclusion

The choice is **not** limited to “invent a new headless Windows Secret Zero backend” or “use SSH password authentication.”

More importantly, **SSH password authentication does not solve the current Credential Manager problem**. Microsoft Win32-OpenSSH creates a `NetworkCleartext` logon token for password authentication, while public-key authentication uses an S4U network token. Neither is an ordinary interactive logon session. Windows Credential Manager credentials are associated with the current token's logon session, so merely proving knowledge of the Windows password during SSH does not make `hex`'s existing interactive-session Credential Manager entries available.

Credible alternatives exist, but they solve the problem at different layers:

1. **Immediate bridge:** retain public-key SSH and refresh an ACL-protected `host.env` from a Task Scheduler job running with a credential-bearing `Password` logon. This supports declared host secrets, not arbitrary on-demand reads.
2. **Preferred passwordless architecture:** enroll Orion in Azure Arc, use its system-assigned managed identity with Infisical Azure Auth, and let the Infisical Agent or estate helper maintain short-lived credentials and rendered secret files.
3. **Local passwordless machine credential:** authenticate to Infisical with a TPM-backed, non-exportable TLS client certificate. This avoids a reusable client secret but requires certificate lifecycle work and, for self-hosted Infisical, a correctly configured mTLS proxy.
4. **Narrower Infisical-native architecture:** Universal Auth periodic tokens plus Infisical Agent. One controlled bootstrap can remove the long-lived client secret from normal operation, although recovery after renewal expiry still needs a bootstrap path.
5. **Windows-service experiment:** run `sshd` as `hex`, making same-account sessions inherit/duplicate the service token. This follows current OpenSSH source behavior, but is nonstandard, single-user, stores the Windows password in the Service Control Manager, and requires a careful proof of concept.
6. **Alternate SSH server with a password cache:** Cygwin/OpenSSH and Bitvise can create a credential-bearing token for public-key sessions by storing the Windows password as a service secret. This preserves key-only client login but is not passwordless at the host.
7. **Identity/infrastructure alternatives:** classic Active Directory plus Kerberos/GSSAPI delegation, or moving the agent runtime and secret store into WSL. Both are materially larger changes.

SSH certificates, FIDO keys, key passphrases, agent forwarding, Tailscale network access, Entra ID, Windows Hello, and JEA can improve access control or key custody, but **do not by themselves change the Windows server token into one that can read `hex`'s Credential Manager entries**.

## Why the present session fails

Three things that look equivalent at the account level are different at the Windows security-token level:

- the same account/SID;
- a token created by a particular logon type;
- a user's interactive logon session with its profile, DPAPI state, and Credential Manager credential set.

Microsoft's Win32-OpenSSH source currently shows:

- public-key/S4U authentication calls `LsaLogonUser` with a `Network` logon type ([source, lines 190–192](https://github.com/PowerShell/openssh-portable/blob/41d8351014e475ae429ecd3727883a807903f27b/contrib/win32/win32compat/win32_usertoken_utils.c#L190-L192));
- password authentication calls `LogonUserExExW` with `LOGON32_LOGON_NETWORK_CLEARTEXT` ([source, lines 754–756](https://github.com/PowerShell/openssh-portable/blob/41d8351014e475ae429ecd3727883a807903f27b/contrib/win32/win32compat/win32_usertoken_utils.c#L754-L756));
- if `sshd` is not running as SYSTEM and the requested SID is the process SID, it returns/duplicates the `sshd` process token ([source, lines 312–336](https://github.com/PowerShell/openssh-portable/blob/41d8351014e475ae429ecd3727883a807903f27b/contrib/win32/win32compat/win32_usertoken_utils.c#L312-L336));
- when `sshd` is not SYSTEM, OpenSSH skips its explicit profile-loading path ([source, lines 372–375](https://github.com/PowerShell/openssh-portable/blob/41d8351014e475ae429ecd3727883a807903f27b/contrib/win32/win32compat/win32_usertoken_utils.c#L372-L375)).

Microsoft's `CredRead` documentation says the credential set is associated with the current token's logon session ([CredRead](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credreada)). Microsoft documents DPAPI as deriving protection from user logon credentials and normally requiring matching logon credentials to decrypt ([CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)); .NET also warns that the user profile must be loaded and that impersonation complicates DPAPI use ([ProtectedData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata)).

The Microsoft Win32-OpenSSH repository contains a direct reproduction of `CMDKEY: Credentials cannot be saved from this logon session` after password SSH authentication ([issue #2273](https://github.com/PowerShell/Win32-OpenSSH/issues/2273)). A proposed change to use interactive logon for the password path was closed without merge ([PR #387](https://github.com/PowerShell/openssh-portable/pull/387)).

This evidence means the earlier password proposal should be withdrawn: password SSH may authenticate the connection, but it does not produce the required Credential Manager context.

## Option matrix

| Option | Changes server token? | Password/reusable secret | Headless after reboot | Existing CredMan helper unchanged? | Assessment |
|---|---:|---|---:|---:|---|
| Password SSH | Different from public key, but still network token | Windows password per connection | Yes | No practical benefit | **Reject as solution** |
| Public-key SSH + refreshed `host.env` | No | Task Scheduler may store Windows password | Yes | Mostly; on-demand reads remain unavailable | **Best immediate bridge** |
| Azure Arc managed identity + Infisical Azure Auth | No need to reuse user token | No reusable user password or UA secret | Yes | Requires helper/auth adaptation | **Preferred strategic design** |
| TPM-backed client certificate + Infisical TLS Auth | No need to reuse user token | Non-exportable machine private key | Yes | Requires helper, PKI, and mTLS-proxy adaptation | **Strong local passwordless design** |
| Universal Auth periodic token + Infisical Agent | No need to reuse user token | One controlled bootstrap; renewable token thereafter | Yes, while renewal continuity holds | Requires helper/agent adaptation | **Good narrower design** |
| Run `sshd` service as `hex` | Yes: same-SID sessions reuse service token | SCM stores `hex` password | Yes | Possibly; must prove profile/CredMan behavior | **Experimental, high caution** |
| Cygwin/OpenSSH or Bitvise password cache | Yes: server logs on with cached password | Password stored as an LSA/service secret | Yes | Must migrate SSH server and prove helper behavior | **Supported pattern, larger attack surface** |
| AD domain account + GSSAPI delegation | Yes, Kerberos credential path | Domain credentials/TGT | Yes | Must recreate/migrate credentials | **Viable only with AD investment** |
| PowerShell remoting/CredSSP/RunAs broker | Can use delegated or run-as credentials | Usually stores/delegates credentials | Yes | Only through another remote/broker path | **Different protocol or backend** |
| WSL-hosted agents and secrets | Avoids Windows CredMan dependency | Depends on Linux auth design | Requires lifecycle work | No | **Possible runtime migration** |
| SSH cert/FIDO/agent forwarding | No; all remain `publickey` | Improves private-key custody | Yes | No | **Security enhancement only** |
| Entra/Hello/Tailscale/JEA alone | No | Varies | Varies | No | **Not a Secret Zero solution** |

## Detailed alternatives

### 1. Public-key SSH plus scheduled host-secret refresh

Keep the present SSH design and treat `host.env` as the headless session's consumption interface. Run `estate-secrets refresh` periodically and at boot under a Task Scheduler principal configured with the `Password` logon type.

Microsoft documents the relevant Task Scheduler logon modes:

- `Password` uses a stored password;
- `S4U` stores no password but has no access to the network or encrypted files;
- `InteractiveToken` requires an existing interactive logon.

See the [Task Scheduler `LogonType` schema](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-logontype-principaltype-element).

Consequences:

- `S4U` is explicitly unsuitable for remote Infisical access and encrypted user material.
- `InteractiveToken` works only while `hex` has an interactive session, so it is not robust headless operation.
- `Password` is the credible unattended variant, but it stores the Windows account password with Task Scheduler.
- The task should render only declared host secrets into an owner-only ACL file. SSH sessions can consume that file without reading Credential Manager.
- This does not automatically support arbitrary `estate-secrets read` calls. A broker or broader render set is required for on-demand secrets.

This is the smallest operational bridge. A proof of concept should verify after reboot that a `Password` task can both read the `nexus-hex` generic credentials and refresh Infisical successfully; Microsoft's generic documentation does not guarantee that exact application path.

### 2. Azure Arc managed identity plus Infisical Azure Auth

Azure Arc-enabled servers can assign a system-managed identity to Windows hosts. Microsoft supports Windows 11 for server-like, always-on scenarios in the [Azure Arc prerequisites](https://learn.microsoft.com/en-au/azure/azure-arc/servers/prerequisites). Arc's local hybrid identity metadata service issues Azure tokens backed by the machine service principal and certificate; on Windows the caller must be an Administrator or a member of `Hybrid Agent Extension Applications` ([Arc managed identity authentication](https://learn.microsoft.com/en-us/azure/azure-arc/servers/managed-identity-authentication)).

Infisical's [Azure Auth](https://infisical.com/docs/documentation/platform/identities/azure-auth) validates a managed-identity JWT against configured tenant, audience, and allowed service principals, then issues an Infisical access token. The CLI exposes `infisical login --method=azure --machine-identity-id ...` ([CLI login](https://infisical.com/docs/cli/commands/login)).

Proposed flow:

1. Enroll Orion in Azure Arc and enable its system-assigned identity.
2. Restrict local access to the Arc token endpoint to the `hex` execution context through the documented local group.
3. Bind the Arc service-principal identity to an Infisical machine identity using Azure Auth.
4. Update the estate helper or Infisical Agent configuration to exchange Arc identity tokens for short-lived Infisical tokens.
5. Render the declared secret set to owner-only files for SSH agents.

Advantages:

- no Windows password sent or stored for SSH;
- no reusable Infisical Universal Auth client secret on Orion;
- automatic machine identity lifecycle and short-lived tokens;
- suitable for service/scheduled/headless processes.

Open proof point: verify whether the current Infisical Azure-auth client directly recognizes Arc's `IDENTITY_ENDPOINT`, rather than assuming the Azure VM IMDS address. The underlying Arc token API and Infisical JWT exchange are documented, so a helper adaptation remains possible even if the stock discovery path is VM-specific.

This is the strongest long-term answer if Azure Arc governance and machine enrollment are acceptable.

### 3. TPM-backed certificate plus Infisical TLS Certificate Auth

Infisical supports machine authentication through a mutual-TLS client certificate and returns a short-lived access token after validating certificate properties ([Infisical TLS Certificate Auth](https://infisical.com/docs/documentation/platform/identities/tls-cert-auth)). Microsoft documents that the Platform Crypto Provider can keep a non-exportable private key in the TPM ([How Windows uses the TPM](https://learn.microsoft.com/en-us/windows/security/hardware-security/tpm/how-windows-uses-the-tpm); [CNG key storage providers](https://learn.microsoft.com/en-us/windows/win32/seccertenroll/cng-key-storage-providers)).

A plausible Orion design is a Local Machine certificate whose TPM-backed private key is ACL-authorized only to the `hex` execution identity or a narrow broker service. Access would then be based on the process token's SID and private-key ACL, rather than the absent Credential Manager credential set. This is an inference from the Windows certificate/key security model and must be proved from an actual public-key SSH session.

For self-hosted Infisical, all TLS-certificate login traffic must traverse a load balancer or proxy that performs a real mutual-TLS handshake and verifies possession of the private key; direct header-forwarding is explicitly unsafe. Certificate enrollment, renewal, revocation, proxy configuration, private-key ACLs, and helper support are therefore part of the design.

This is a strong passwordless option when a local hardware root is preferred over Azure Arc. It is not merely machine-scope DPAPI storage, but it does introduce PKI and ingress work.

### 4. Universal Auth periodic tokens plus Infisical Agent

Infisical Universal Auth supports **periodic tokens**, explicitly intended to address Secret Zero: a one-use or short-lived client secret bootstraps a renewable access token ([Universal Auth](https://infisical.com/docs/documentation/platform/identities/universal-auth)). The [Infisical Agent](https://infisical.com/docs/integrations/platforms/infisical-agent) manages token renewal, can remove the client secret after reading it, writes tokens to sinks, and templates secrets into files.

This permits a controlled setup ceremony:

1. provision a one-use/short-lived UA client secret;
2. start the agent and obtain a periodic token;
3. remove the bootstrap secret;
4. continuously renew and render the declared secrets into an owner-only file.

This is materially narrower than designing a new general Windows secret backend. Its principal risk is recovery: if the agent is stopped longer than the renewal/maximum-TTL window, it needs another bootstrap. The service lifecycle, ACLs, crash recovery, and credential rotation policy therefore need deliberate design.

Infisical lists other machine-auth methods—Token, Universal, Kubernetes, AWS, Azure, GCP, OIDC, and SPIFFE—in its [machine identities overview](https://infisical.com/docs/documentation/platform/identities/machine-identities). For Orion:

- static Token Auth merely relocates Secret Zero;
- Kubernetes/AWS/GCP are relevant only if the workload moves there;
- OIDC still needs a trustworthy JWT issuer available to the machine;
- SPIFFE is credible but disproportionately heavy for one Windows workstation.

### 5. Run the OpenSSH service as `hex`

The current Win32-OpenSSH source has a special path: when `sshd` is not SYSTEM and the requested user SID equals the `sshd` process SID, it returns or duplicates the process token. Configuring the Windows OpenSSH service to log on as `hex` could therefore make public-key SSH commands run under the credential-bearing service token instead of an S4U network token.

This is a real alternative to changing the estate helper, but not a routine recommendation:

- the Service Control Manager stores `hex`'s password;
- the server effectively becomes single-user;
- Win32-OpenSSH normally runs as Local System, so this configuration has limited support evidence;
- source shows explicit profile loading is skipped in the non-SYSTEM path;
- service-logon DPAPI/CredMan behavior must be verified after cold boot;
- service privileges, file ownership, host keys, update behavior, and password rotation must be tested.

Treat this only as a contained proof of concept with an easy rollback. It may preserve the current Credential Manager helper, but it replaces a documented standard service layout with a source-dependent implementation detail.

### 6. Replace Microsoft OpenSSH with a password-caching SSH server

Cygwin documents `passwd -R`, which stores the Windows password in the LSA private registry area and lets public-key SSH create a fully credentialed Windows token. Its own documentation warns that the two-way-encrypted stored password is not overly secure and should be used only on a locked-down machine ([Cygwin `passwd`](https://cygwin.com/cygwin-ug-net/passwd.html); [Cygwin security model](https://cygwin.com/cygwin-ug-net/ntsec.html)).

Bitvise SSH Server documents a similar optional password cache for Windows accounts authenticated with public keys ([Bitvise security architecture](https://bitvise.com/ssh-server-guide-security-architecture)).

These products demonstrate that key-only client authentication and a credential-bearing Windows process can be combined. The cost is that the server stores the Windows password and uses it behind the scenes. This is therefore a legitimate alternate SSH implementation, but not a passwordless Secret Zero design. It also introduces a second SSH stack, migration work, update policy, and a larger credential-theft blast radius.

### 7. Classic Active Directory plus Kerberos/GSSAPI

Microsoft documents `GSSAPIAuthentication` support for Windows 11 and Windows Server 2022 OpenSSH. The client `-K` option and `GSSAPIDelegateCredentials yes` enable Kerberos credential delegation ([Windows OpenSSH server configuration](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh-server-configuration); [OpenSSH `ssh(1)`](https://man.openbsd.org/ssh.1)).

This provides a genuine credential-bearing remote identity architecture without transmitting a password for each SSH connection when the client already has a Kerberos ticket. It requires:

- classic Active Directory/Kerberos infrastructure, not merely Entra join;
- using a domain account rather than local `hex`;
- correctly constrained delegation and ticket policy;
- migrating/recreating any per-user Credential Manager material under that identity.

It is a viable enterprise option if AD is already strategic. It is excessive solely to solve Orion's agent access.

### 8. PowerShell remoting, RunAs, CredSSP, and JEA

PowerShell remoting can use explicit credentials, CredSSP delegation, or a registered endpoint running as another account. This can create a credential-bearing execution path, but it either changes the remote protocol or becomes a broker with its own stored credentials.

Microsoft's [second-hop documentation](https://learn.microsoft.com/en-us/powershell/scripting/security/remoting/ps-remoting-second-hop) warns that CredSSP caches credentials on the remote computer and increases credential-theft risk; RunAs configurations require credential management. Standard Kerberos/NTLM remoting does not send reusable credentials to the remote host ([WinRM security](https://learn.microsoft.com/en-us/powershell/scripting/security/remoting/winrm-security)).

JEA restricts commands and can use virtual or run-as accounts ([JEA security considerations](https://learn.microsoft.com/en-us/powershell/scripting/security/remoting/jea/security-considerations)), but it does not make an ordinary SSH token able to read `hex`'s Credential Manager. A narrowly scoped JEA endpoint could expose only `refresh`/`read`, but that is precisely a secret broker design.

### 9. WSL as the agent and secret runtime

Another architectural option is to terminate SSH and run Codex/Claude/Infisical inside WSL, keeping Secret Zero entirely in the Linux environment and calling Windows tooling through WSL interoperability.

Microsoft documents that Windows executables launched from WSL run with the permissions of the active Windows user and that `WSLENV` can bridge environment variables ([WSL filesystems and interoperability](https://learn.microsoft.com/en-us/windows/wsl/filesystems)). However:

- Android emulator, ADB, EAS, path semantics, GUI/session interaction, and Windows SDK tooling require a realistic end-to-end proof;
- WSL's VM lifecycle is not identical to a production VM ([WSL FAQ](https://learn.microsoft.com/en-us/windows/wsl/faq));
- systemd services do not by themselves keep a WSL instance alive ([WSL systemd](https://learn.microsoft.com/en-us/windows/wsl/systemd)).

This is viable only if moving the agent runtime is acceptable. It does not fix Windows Credential Manager; it avoids depending on it.

## Options that improve SSH security but do not solve Secret Zero

### SSH certificates, FIDO keys, passphrases, and agent forwarding

These are all variants of OpenSSH `publickey` authentication:

- certificates change how public keys are trusted;
- FIDO keys add hardware-backed touch/user-verification requirements;
- a key passphrase protects the client private key;
- `ssh-agent` keeps client private keys available for public-key authentication;
- agent forwarding exposes an agent connection to the remote session, not the private key or a Windows server credential.

See [`sshd_config(5)`](https://man.openbsd.org/sshd_config), [`ssh-agent(1)`](https://man.openbsd.org/ssh-agent.1), and [`ssh_config(5)`](https://man.openbsd.org/ssh_config.5). They can materially strengthen Orion access, but Win32-OpenSSH still follows its public-key/S4U token path.

Combining `publickey,password` strengthens connection authentication but still uses the documented password token path; it does not repair Credential Manager access.

### Entra ID and Windows Hello

Microsoft states that Windows OpenSSH does not support authentication with Microsoft Entra accounts ([Windows OpenSSH configuration](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh-server-configuration)). Microsoft's Entra SSH sign-in guidance applies to [Azure Linux VMs](https://learn.microsoft.com/en-us/entra/identity/devices/howto-vm-sign-in-azure-ad-linux). Azure Arc SSH can reach Windows, but Entra-user SSH is limited to Linux ([Azure Arc SSH overview](https://learn.microsoft.com/en-us/azure/azure-arc/servers/ssh-arc-overview)). Entra sign-in for Windows is documented through RDP, not OpenSSH ([Entra sign-in to Windows VMs](https://learn.microsoft.com/en-us/entra/identity/devices/howto-vm-sign-in-azure-ad-windows)).

Windows Hello/FIDO Windows sign-in therefore does not add a server authentication method to Win32-OpenSSH. FIDO-backed SSH remains public-key authentication.

### Tailscale SSH

Tailscale SSH's built-in server is supported on Linux and macOS, not Windows ([Tailscale SSH](https://tailscale.com/docs/features/tailscale-ssh)). Tailnet-only firewalling remains valuable for reducing exposure, but transport reachability does not alter the Windows logon token created by Microsoft's SSH server.

## DPAPI backend designs

If the estate deliberately redesigns local Secret Zero, Windows exposes supported primitives:

- DPAPI with `CRYPTPROTECT_LOCAL_MACHINE` allows any local user to decrypt, so confidentiality must come from strict file ACLs and process isolation ([CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata));
- DPAPI-NG/CNG-protected secrets, a machine certificate, TPM-backed key, or a small Windows service can provide a headless machine root;
- a broker can expose narrowly authorized `refresh`/`read` operations instead of raw bootstrap credentials.

These are legitimate designs, but they are not the only choices, and machine-scope DPAPI is not automatically safe: its broader decryptability materially changes the blast radius.

## Recommended decision sequence

1. **Do not enable password SSH as the Credential Manager fix.** It adds password exposure without solving the token/session mismatch.
2. **For immediate utility, retain public-key SSH and the existing owner-only `host.env`.** Prove a Task Scheduler `Password` job can refresh it after cold boot. Limit it to declared host secrets and document that on-demand `read` remains unavailable.
3. **Evaluate Azure Arc managed identity plus Infisical Azure Auth as the target architecture.** It is the cleanest supported passwordless machine identity for an always-on Windows 11 host.
4. **If a local hardware root is preferable, evaluate a TPM-backed client certificate plus Infisical TLS Auth.** This avoids a reusable secret but requires PKI and a self-hosted mTLS proxy.
5. **If Arc and PKI work are unwanted, evaluate Universal Auth periodic tokens plus Infisical Agent.** This is a bounded Infisical configuration change, not a bespoke general-purpose secret backend.
6. **Only then test `sshd`-as-`hex` if preserving the existing CredMan helper is more important than service standardization.** Treat it as experimental and reject it unless reboot, profile, DPAPI, ACL, password-rotation, and OpenSSH-update tests all pass.
7. **Use AD/GSSAPI only as part of a broader domain-identity decision.** Use WSL only as part of a broader agent-runtime decision.

## Verification experiments before adopting any route

- Reboot Orion with no interactive `hex` session and execute the full flow remotely.
- Record the Windows logon type and token identity for the agent process.
- Run `estate-secrets check`, `refresh`, `doctor`, and one authorized on-demand `read` without printing any secret value.
- Verify ACLs from an unrelated local standard account.
- Rotate/revoke the machine identity and confirm recovery behavior.
- Stop the agent/task/service past token maximum TTL, restart it, and verify whether manual bootstrap is required.
- Test Android emulator, ADB, EAS, and Windows process/session interaction from the exact headless context.
- Validate behavior after Windows and OpenSSH updates rather than depending only on current source internals.

## Confidence and source limitations

The token-path conclusions are grounded in current Microsoft Win32-OpenSSH source and Microsoft API documentation. Repository issues and unmerged pull requests are corroborating implementation evidence, not product-support guarantees. The scheduled-task and `sshd`-as-`hex` routes therefore need local proof before adoption. Azure Arc, Infisical Azure Auth, Universal Auth periodic tokens, and Infisical Agent are documented product capabilities, but their precise composition on Orion still needs an integration proof.
