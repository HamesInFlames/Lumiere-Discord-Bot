# Lumière Discord Bot - Project Continuation

## Current Status
The bot is fully functional with the following features:

### Commands
- `/preorder` - Submit customer preorders
- `/wholesale` - Submit wholesale orders (with kitchen selection: TOVA / LUMIERE / BOTH)
- `/delete` - Delete an order by ID (with confirmation)

### Workflow
1. Staff uses command → form opens
2. Form is submitted → order posts directly to output channel + added to Google Calendar
3. To delete an order, use `/delete ORDER_ID` (e.g., `/delete PRE-0203-001`)

### Google Calendar Integration
**Status: ✅ Connected and working!**

The bot automatically adds orders to Google Calendar when dates are entered. It uses smart date parsing that understands:
- "Feb 13" → February 13, 2026
- "Friday" or "fri" → The upcoming Friday
- "Feb 14 2pm" → February 14, 2026 at 2:00 PM
- "next monday" → The next Monday

**Current Setup:**
- Calendar ID: `4d06fb7a5549ea70a68b7101d5ae280427c6c7c2d5a0a147f1286398811997ba@group.calendar.google.com`
- Service Account: `lumiere-bot@lumiere-bot-486622.iam.gserviceaccount.com`
- Key File: `lumiere-bot-486622-3c8669e3b5cf.json` (in project folder, NOT committed to git)

---

## Google Calendar Setup (Reference)

If you need to set this up again or on a different machine:

### Step 1: Enable Google Calendar API
1. Go to **https://console.cloud.google.com/** (project: lumiere-bot-486622)
2. Go to **APIs & Services** → **Library**
3. Search for "**Google Calendar API**" and **Enable** it

### Step 2: Get the Service Account Key
1. Go to **APIs & Services** → **Credentials**
2. Click on the service account **lumiere-bot**
3. Go to **Keys** tab → **Add Key** → **Create new key** → **JSON**
4. Save the downloaded JSON file in the project folder

### Step 3: Update .env
```env
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CALENDAR_ID=your_calendar_id@group.calendar.google.com
GOOGLE_KEY_FILE=your-key-file.json
```

### Step 4: Share Calendar with Service Account
1. Open Google Calendar
2. Click 3 dots on your calendar → **Settings and sharing**
3. Under "Share with specific people", add the service account email
4. Set permission to **"Make changes to events"**

---

## File Structure
```
lumiere-discord-bot/
├── .env                              # Credentials (DO NOT COMMIT)
├── .gitignore                        # Prevents secrets from being committed
├── deploy-commands.js                # Registers slash commands with Discord
├── index.js                          # Main bot code
├── package.json                      # Dependencies
├── lumiere-bot-486622-*.json         # Google Service Account key (DO NOT COMMIT)
└── CONTINUED_PROJECT.md              # This file
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

# Google Calendar
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CALENDAR_ID=your_calendar_id@group.calendar.google.com
GOOGLE_KEY_FILE=your-service-account-key.json
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
