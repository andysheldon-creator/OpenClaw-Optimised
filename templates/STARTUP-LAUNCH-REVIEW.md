# DBH Ventures — Startup Launch Review Template

**Purpose**: Comprehensive quality assurance checklist for verifying a startup is fully functional before marking as "Launched" in Vikunja. This document ensures end-to-end functionality, marketing alignment, and spec completion.

**Usage**: A sub-agent should work through each section systematically, documenting findings, then compile the final report and submit to Bear.

---

## 📋 Review Metadata

```
Project Name: [STARTUP_NAME]
Website: [PRIMARY_URL]
Review Date: [DATE]
Reviewer: [SUB_AGENT_NAME]
Vikunja Project ID: [ID]
```

---

## 1. 🎯 Project Specification Verification

### 1.1 Original Concept Check

- [ ] Review CONCEPT.md or original spec document
- [ ] List all promised features
- [ ] Verify each feature is implemented or explicitly descoped

| Feature | Spec'd | Implemented | Notes |
|---------|--------|-------------|-------|
| | ☐ Yes ☐ No | ☐ Yes ☐ Partial ☐ No | |

### 1.2 Pricing Tiers

- [ ] Verify all pricing tiers exist as documented
- [ ] Confirm tier features match marketing copy
- [ ] Test tier enforcement (free users can't access paid features)

| Tier | Price | Features Match Spec? | Enforced? |
|------|-------|---------------------|-----------|
| Free | $0 | ☐ Yes ☐ No | ☐ Yes ☐ No |
| Pro | $X/mo | ☐ Yes ☐ No | ☐ Yes ☐ No |
| Team | $X/mo | ☐ Yes ☐ No | ☐ Yes ☐ No |

### 1.3 Vikunja Task Completion

- [ ] All Foundation tasks complete
- [ ] All MVP tasks complete
- [ ] All Launch tasks complete
- [ ] No blocking issues remain open

---

## 2. 🌐 Website & Marketing Verification

### 2.1 Domain & DNS

- [ ] Primary domain resolves correctly
- [ ] HTTPS certificate valid (check expiry)
- [ ] www redirect works (or vice versa)
- [ ] No mixed content warnings

```
Primary Domain: 
Certificate Expiry: 
DNS Provider: 
Hosting: 
```

### 2.2 Landing Page Content

- [ ] Hero section clearly explains value prop
- [ ] Features section matches actual product capabilities
- [ ] Pricing section accurate and links work
- [ ] CTA buttons functional
- [ ] No placeholder/lorem ipsum text
- [ ] No broken images
- [ ] Mobile responsive

### 2.3 SEO Essentials

- [ ] `<title>` tag present and descriptive
- [ ] `<meta name="description">` present
- [ ] Open Graph tags (og:title, og:description, og:image)
- [ ] Twitter Card tags
- [ ] Canonical URL set
- [ ] robots.txt exists and is correct
- [ ] sitemap.xml exists and submitted to Google Search Console
- [ ] Schema.org structured data (if applicable)

### 2.4 Legal Pages

- [ ] Privacy Policy exists and is linked
- [ ] Terms of Service exists and is linked
- [ ] Cookie notice (if applicable)
- [ ] Contact information available

### 2.5 Analytics & Tracking

- [ ] Analytics installed (Plausible/GA/etc)
- [ ] Tracking verified working
- [ ] Conversion goals set up (if applicable)

---

## 3. 💳 Payment & Billing System

### 3.1 Stripe Configuration

- [ ] Stripe account in live mode
- [ ] Products/prices created correctly
- [ ] Webhook endpoint configured
- [ ] Webhook signing secret set in env

```
Stripe Account: 
Webhook Endpoint: 
Webhook ID: 
```

### 3.2 Checkout Flow Test

For each paid tier:

- [ ] Checkout link works
- [ ] Correct price displayed
- [ ] Test purchase completes (use Stripe test mode first)
- [ ] Webhook received and processed
- [ ] Account/subscription created in database
- [ ] Welcome email sent with credentials

### 3.3 Subscription Lifecycle

- [ ] New subscription → account activated
- [ ] Payment failed → account shows past_due status
- [ ] Subscription canceled → downgrade to free
- [ ] Subscription upgraded → tier changed correctly

### 3.4 Customer Portal

- [ ] Users can access billing portal
- [ ] Can update payment method
- [ ] Can cancel subscription
- [ ] Can view invoices

---

## 4. 📧 Email System

### 4.1 Transactional Email Setup

- [ ] Email service configured (PurelyMail/SendGrid/etc)
- [ ] SPF record set
- [ ] DKIM record set
- [ ] DMARC record set
- [ ] Test email delivery works

```
From Address: noreply@[domain]
Reply-To: hello@[domain]
Email Provider: 
```

### 4.2 Email Templates

- [ ] Welcome email sends and renders correctly
- [ ] Password reset (if applicable)
- [ ] Subscription confirmation
- [ ] Cancellation confirmation
- [ ] Check spam score (mail-tester.com)

---

## 5. 🔐 Authentication & Authorization

### 5.1 Authentication Methods

- [ ] Primary auth method works (API key/OAuth/password)
- [ ] Credentials stored securely
- [ ] Invalid credentials rejected with clear error
- [ ] Rate limiting on auth endpoints

### 5.2 Authorization

- [ ] Free users blocked from paid features
- [ ] Pro users have access to Pro features
- [ ] Team users have access to Team features
- [ ] Admin endpoints protected (if any)

---

## 6. 🖥️ Core Product Functionality

### 6.1 User Journey: Free Tier

Document the complete free user flow:

1. [ ] Discovery (landing page)
2. [ ] Sign up / Install
3. [ ] Onboarding / First use
4. [ ] Core free features work
5. [ ] Upgrade prompts appear appropriately
6. [ ] Upgrade flow works

**Free User Test Results:**
```
Tester: 
Date: 
All Steps Passed: ☐ Yes ☐ No
Issues Found: 
```

### 6.2 User Journey: Pro Tier

Document the complete Pro user flow:

1. [ ] Purchase subscription
2. [ ] Receive welcome email with credentials
3. [ ] Authenticate / Login
4. [ ] Access Pro features
5. [ ] Pro features function correctly
6. [ ] Usage limits enforced (if any)
7. [ ] Can manage subscription

**Pro User Test Results:**
```
Tester: 
Date: 
All Steps Passed: ☐ Yes ☐ No
Issues Found: 
```

### 6.3 User Journey: Team Tier

Document the complete Team user flow:

1. [ ] Purchase Team subscription
2. [ ] Receive welcome email
3. [ ] Access Team features
4. [ ] Team-specific features work (SSO, shared access, etc)
5. [ ] Admin controls function (if any)

**Team User Test Results:**
```
Tester: 
Date: 
All Steps Passed: ☐ Yes ☐ No
Issues Found: 
```

### 6.4 API Endpoints (if applicable)

| Endpoint | Method | Auth Required | Tested | Works |
|----------|--------|---------------|--------|-------|
| | | | ☐ | ☐ |

### 6.5 CLI Commands (if applicable)

| Command | Description | Tested | Works |
|---------|-------------|--------|-------|
| | | ☐ | ☐ |

---

## 7. 🗄️ Database & Infrastructure

### 7.1 Database

- [ ] Production database configured
- [ ] Backups enabled
- [ ] Connection string secured (not in code)
- [ ] Migrations applied

```
Database Provider: 
Database Name: 
Backup Schedule: 
```

### 7.2 Environment Variables

- [ ] All required env vars set in production
- [ ] No secrets in code repository
- [ ] Secrets rotated from any test values

### 7.3 Error Handling

- [ ] Errors logged appropriately
- [ ] User-facing errors are friendly (no stack traces)
- [ ] 500 errors don't leak sensitive info

### 7.4 Performance

- [ ] Page load time acceptable (<3s)
- [ ] API response times acceptable (<500ms)
- [ ] No obvious memory leaks
- [ ] Rate limiting in place for abuse prevention

---

## 8. 📚 Documentation

### 8.1 User Documentation

- [ ] Getting started guide exists
- [ ] Installation instructions accurate
- [ ] Common use cases documented
- [ ] FAQ or troubleshooting section

### 8.2 Developer Documentation (if open source)

- [ ] README is comprehensive
- [ ] Contributing guide exists
- [ ] License file present
- [ ] Changelog maintained

### 8.3 Internal Documentation

- [ ] Architecture documented
- [ ] Deployment process documented
- [ ] Runbook for common issues

---

## 9. 📱 Distribution Channels

### 9.1 Package Registries (if applicable)

| Registry | Package Name | Version | Published |
|----------|--------------|---------|-----------|
| npm | | | ☐ |
| PyPI | | | ☐ |
| Homebrew | | | ☐ |

### 9.2 GitHub Repository

- [ ] Repository is public (if open source)
- [ ] README badges accurate
- [ ] Releases tagged
- [ ] CI/CD passing

---

## 10. 🚨 Security Checklist

- [ ] No hardcoded secrets in codebase
- [ ] HTTPS enforced everywhere
- [ ] Input validation on all endpoints
- [ ] SQL injection protection
- [ ] XSS protection
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] Sensitive data encrypted at rest
- [ ] Audit logging for important actions

---

## 11. 📊 Launch Readiness Scorecard

| Category | Items | Passed | Score |
|----------|-------|--------|-------|
| Spec Verification | /X | /X | % |
| Website/Marketing | /X | /X | % |
| Payments | /X | /X | % |
| Email | /X | /X | % |
| Auth/Authz | /X | /X | % |
| Core Product | /X | /X | % |
| Infrastructure | /X | /X | % |
| Documentation | /X | /X | % |
| Distribution | /X | /X | % |
| Security | /X | /X | % |
| **TOTAL** | **/X** | **/X** | **%** |

**Minimum passing score: 95%**

---

## 12. 🐛 Issues Found

| ID | Severity | Category | Description | Status |
|----|----------|----------|-------------|--------|
| 1 | Critical/High/Medium/Low | | | Open/Fixed |

---

## 13. 📝 Recommendations

List any non-blocking recommendations for future improvement:

1. 
2. 
3. 

---

## 14. ✅ Final Verdict

**Launch Approved**: ☐ Yes ☐ No (requires fixes)

**Blocking Issues**: [List any critical issues that must be fixed]

**Sign-off**:

```
Reviewer: [SUB_AGENT_NAME]
Review Completed: [TIMESTAMP]
Signature: [AGENT_SIGNATURE_HASH]

Reviewed for: DBH Ventures
Project: [STARTUP_NAME]
Vikunja Status: Ready to mark as LAUNCHED ☐ Yes ☐ No
```

---

## 15. 📤 Submission Instructions

After completing this review:

1. Save this completed document
2. Create Bear note titled: `[STARTUP_NAME] Launch Review - [DATE]`
3. Tag with: `#dbh-ventures`, `#launch-review`, `#[startup-name]`
4. Include full report content
5. Add timestamp and signature block
6. If approved, update Vikunja project status to "Launched"
7. Notify David of completion

---

*Template Version: 1.0*
*Last Updated: 2026-01-29*
*Created by: Steve (DBH Ventures AI Assistant)*
