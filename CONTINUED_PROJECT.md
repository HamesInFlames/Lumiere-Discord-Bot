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

## Next Steps: Connect Google Calendar

### Step 1: Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Name it "Lumiere Bot" and click **Create**

### Step 2: Enable Google Calendar API
1. In your project, go to **APIs & Services** → **Library**
2. Search for "Google Calendar API"
3. Click on it and press **Enable**

### Step 3: Create a Service Account
1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service Account**
3. Name it "lumiere-bot" and click **Create and Continue**
4. Skip the optional steps, click **Done**
5. Click on the service account you just created
6. Go to **Keys** tab → **Add Key** → **Create new key** → **JSON**
7. A JSON file will download - keep this safe!

### Step 4: Share Your Calendar
1. Open [Google Calendar](https://calendar.google.com/)
2. Find the calendar you want to use (or create a new one)
3. Click the 3 dots next to it → **Settings and sharing**
4. Under "Share with specific people", click **Add people**
5. Paste the **service account email** from the JSON file
6. Set permission to **Make changes to events**
7. Copy the **Calendar ID** from the "Integrate calendar" section

### Step 5: Update Your .env File
```env
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CALENDAR_ID=your-calendar-id@group.calendar.google.com
GOOGLE_SERVICE_ACCOUNT_EMAIL=lumiere-bot@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...(copy the whole thing)...\n-----END PRIVATE KEY-----\n"
```

### Step 6: Restart the Bot
```bash
npm start
```

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
