# INA Coding — Open VSX Edition

This is the same extension published on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=inagpt.ina-coding), available here for **VS Codium**, **Theia**, **Eclipse Che**, **Gitpod**, and other editors compatible with the Open VSX Registry.

## Compatibility

| Editor | Status | Notes |
|--------|--------|-------|
| VS Codium | Full | Recommended open-source alternative |
| Theia IDE | Full | Cloud & desktop |
| Eclipse Che | Full | Cloud IDE |
| Gitpod | Full | Cloud development |
| code-server | Full | VS Code in browser |
| OpenVSCode Server | Full | Gitpod's VS Code server |
| Cursor | Partial | Use VS Code Marketplace version |
| Windsurf | Partial | Use VS Code Marketplace version |

## Known Differences from VS Code

1. **Walkthroughs**: The built-in VS Code Getting Started walkthrough may not appear in all editors. Use the in-extension onboarding instead (automatically shown on first run).

2. **SecretStorage**: Some editors implement SecretStorage differently. API keys will still be stored securely using the editor's credential storage, with an automatic fallback to globalState.

3. **Terminal Integration**: Terminal APIs may behave slightly differently. Agent mode terminal commands will still work but output capture may vary.

4. **Theme Sync**: Auto-sync with editor theme works in VS Codium. Other editors may need manual theme selection.

## Installation

### VS Codium
```bash
codium --install-extension inagpt.ina-coding
```

### From VSIX
1. Download the `.vsix` file from [Open VSX](https://open-vsx.org/extension/inagpt/ina-coding)
2. In your editor: Extensions > ... > Install from VSIX
3. Select the downloaded file

### From CLI
```bash
ovsx get inagpt.ina-coding
```

## Self-Hosted Server

INA Coding requires a self-hosted backend server. See [setup guide](https://inagpt.com/coding/docs/self-hosted).

---

*Made by INA GPT GmbH, Berlin, Germany*
