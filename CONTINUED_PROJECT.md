# Lumière Discord Bot - Project Continuation

## Current Status
The bot is fully functional with the following features:

### Commands
- `/preorder` - Submit customer preorders
- `/wholesale` - Submit wholesale orders (with kitchen selection: TOVA / LUMIERE / BOTH)

### Workflow
1. Staff uses command → form opens
2. Form is submitted → order posts directly to output channel
3. To delete an order, right-click the message and delete it

### Google Calendar Integration
**Status: Code is ready, needs credentials**

The bot can automatically add orders to Google Calendar when dates are entered. It uses smart date parsing that understands:
- "Feb 13" → February 13, 2026
- "Friday" or "fri" → The upcoming Friday
- "Feb 14 2pm" → February 14, 2026 at 2:00 PM
- "next monday" → The next Monday

---

## ⭐ NEXT STEPS: Connect Google Calendar

### Step 1: Create a Google Cloud Project
1. Go to **https://console.cloud.google.com/**
2. Click **Select a project** (top left) → **New Project**
3. Name it "Lumiere Bot" and click **Create**
4. Wait for it to create, then make sure it's selected

### Step 2: Enable Google Calendar API
1. In the left menu, go to **APIs & Services** → **Library**
2. Search for "**Google Calendar API**"
3. Click on it and press the blue **Enable** button

### Step 3: Create a Service Account
1. In the left menu, go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** (top) → **Service Account**
3. Name it "lumiere-bot" and click **Create and Continue**
4. Skip the optional steps (just click **Continue** then **Done**)
5. You'll see your service account in the list - **click on it**
6. Go to the **Keys** tab
7. Click **Add Key** → **Create new key** → Select **JSON** → **Create**
8. **A JSON file will automatically download - SAVE THIS FILE!**

### Step 4: Open the JSON File
Open the downloaded JSON file in Notepad. It looks like this:
```json
{
  "type": "service_account",
  "project_id": "lumiere-bot-xxxxx",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADA...(very long)...\n-----END PRIVATE KEY-----\n",
  "client_email": "lumiere-bot@lumiere-bot-xxxxx.iam.gserviceaccount.com",
  "client_id": "123456789",
  ...
}
```

**You need TWO things from this file:**
- `client_email` → This is your **GOOGLE_SERVICE_ACCOUNT_EMAIL**
- `private_key` → This is your **GOOGLE_PRIVATE_KEY** (copy the ENTIRE thing including the `-----BEGIN` and `-----END` parts)

### Step 5: Share Your Calendar with the Service Account
1. Go to **https://calendar.google.com/**
2. On the left sidebar, find the calendar you want to use (or create a new one called "Lumiere Orders")
3. Click the **3 dots** next to the calendar name → **Settings and sharing**
4. Scroll down to **"Share with specific people or groups"**
5. Click **+ Add people and groups**
6. Paste the **client_email** from the JSON file (e.g., `lumiere-bot@lumiere-bot-xxxxx.iam.gserviceaccount.com`)
7. Set permission to **"Make changes to events"**
8. Click **Send**

### Step 6: Get Your Calendar ID
1. Still in calendar settings, scroll down to **"Integrate calendar"**
2. Copy the **Calendar ID** 
   - For your primary calendar, it's usually your email address
   - For other calendars, it looks like: `abc123xyz@group.calendar.google.com`

### Step 7: Update Your .env File
Add these lines to your `.env` file:

```env
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CALENDAR_ID=paste_calendar_id_here
GOOGLE_SERVICE_ACCOUNT_EMAIL=paste_client_email_from_json_here
GOOGLE_PRIVATE_KEY="paste_entire_private_key_from_json_here"
```

**Example with real-looking values:**
```env
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CALENDAR_ID=lumiere.orders@gmail.com
GOOGLE_SERVICE_ACCOUNT_EMAIL=lumiere-bot@lumiere-bot-12345.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...(very long)...\n-----END PRIVATE KEY-----\n"
```

**Important:** The private key must be in quotes and keep all the `\n` characters!

### Step 8: Restart the Bot
```bash
npm start
```

You should see:
```
📅 Google Calendar: ENABLED
```

Now when you submit orders with dates, they'll appear on your Google Calendar!

---

## File Structure
```
lumiere-discord-bot/
├── .env                    # Credentials (DO NOT COMMIT)
├── deploy-commands.js      # Registers slash commands with Discord
├── index.js               # Main bot code
├── package.json           # Dependencies
└── CONTINUED_PROJECT.md   # This file
```

---

## Environment Variables (.env)
```env
# Discord
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_app_id
DISCORD_GUILD_ID=your_server_id

# Channels
PREORDER_INTAKE_CHANNEL_ID=channel_id
PREORDER_OUTPUT_CHANNEL_ID=channel_id
WHOLESALE_INTAKE_CHANNEL_ID=channel_id
WHOLESALE_OUTPUT_CHANNEL_ID=channel_id

# Google Calendar (optional)
GOOGLE_CALENDAR_ENABLED=false
GOOGLE_CALENDAR_ID=calendar_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=email
GOOGLE_PRIVATE_KEY=private_key
```

---

## Running the Bot

### First time setup:
```bash
npm install
npm run deploy   # Register commands with Discord
npm start        # Start the bot
```

### After code changes:
```bash
npm start        # Just restart the bot
```

### If you change commands (add/remove/modify slash commands):
```bash
npm run deploy   # Re-register commands
npm start
```

---

## Form Fields

### Pre-Order Form
| Field | Required |
|-------|----------|
| Customer Name | Yes |
| Phone Number | No |
| Pickup Date/Time | No |
| Items + Special Instructions | Yes |
| Payment Status | Yes |

### Wholesale Form
| Field | Required |
|-------|----------|
| Business Code | Yes |
| Kitchen (TOVA/LUMIERE/BOTH) | Yes (button selection) |
| Delivery Day | Yes |
| Items + Quantity | Yes |
| Notes | No |

---

## Permissions Setup (Optional)
To restrict who can use commands:
1. Go to **Server Settings** → **Integrations**
2. Click on **Lumiere Patisserie** bot
3. For each command, set which roles can use it

---

## Notes
- Order IDs reset when bot restarts (PRE-0204-001, WHO-0204-001, etc.)
- The bot token was exposed earlier - **RESET IT** in Discord Developer Portal
- Google Calendar events are created as all-day events unless a specific time is provided
