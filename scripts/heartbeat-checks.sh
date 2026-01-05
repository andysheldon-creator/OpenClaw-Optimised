#!/bin/bash
# Heartbeat checks - run on heartbeat to check various things

echo "=== Steve's Email (steve@withagency.ai) ==="
python3 << 'PYEOF'
import imaplib
mail = imaplib.IMAP4_SSL('imap.purelymail.com', 993)
mail.login('steve@withagency.ai', 'BendDontBreak!Steve.')
mail.select('INBOX')
status, messages = mail.search(None, 'UNSEEN')
unseen = len(messages[0].split()) if messages[0] else 0
if unseen > 0:
    print(f"📬 {unseen} unread message(s) for Steve!")
else:
    print("No new messages")
mail.logout()
PYEOF

echo ""
echo "=== Heartbeat checks complete ==="
