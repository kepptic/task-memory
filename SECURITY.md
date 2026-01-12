# Security Policy

## Reporting a Vulnerability

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead:

1. **Use GitHub Security Advisories:**
   - Go to: https://github.com/kepptic/task-memory/security/advisories
   - Click "Report a vulnerability"
   - Fill out the private security advisory form

2. **Or contact the maintainer** through GitHub profile

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Initial Response:** Within 48 hours
- **Status Update:** Within 7 days
- **Fix Timeline:** Depends on severity (Critical: 1-3 days, High: 1-2 weeks)

---

## Security Features

### No Network Requests
- 100% offline - No data sent to servers
- No telemetry or tracking
- No external resources - Everything bundled
- No CDN dependencies

### XSS Protection
- DOMPurify sanitization for all user content
- Allowed tags whitelist
- Dangerous attributes stripped

### File System Access
- Explicit user permissions required
- Browser sandboxing via File System Access API
- Can only access selected folders

### Local Storage
- IndexedDB only for recent projects
- No sensitive data stored
- Browser isolation per origin

---

## Security Best Practices

### For Users
1. Download only from official repository
2. Grant access only to folders containing tasks
3. Keep browser updated
4. Review markdown files from untrusted sources

### For Developers
```bash
# Check for vulnerabilities
npm audit

# Update dependencies
npm update
```

---

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

---

**Thank you for helping keep task-memory secure!**
