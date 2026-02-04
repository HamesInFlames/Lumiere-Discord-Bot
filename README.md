# Lumière Patisserie Discord Bot

A Discord bot for managing preorders and wholesale orders with an intake → output workflow.

## Setup Instructions

### Step 1: Get Your Discord IDs

1. **Enable Developer Mode in Discord:**
   - Open Discord → Settings (⚙️) → Advanced → Developer Mode → ON

2. **Get Server ID:**
   - Right-click your server icon → "Copy Server ID"

3. **Get Channel IDs (right-click each channel → Copy Channel ID):**
   - `#preorder-intake`
   - `#preorder-output`
   - `#wholesale-intake`
   - `#wholesale-output`

4. **Get Bot Token:**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Select your app → Bot → Copy Token

5. **Get Application ID:**
   - Discord Developer Portal → General Information → Application ID

### Step 2: Configure the Bot

Edit the `.env` file and replace all `PASTE_..._HERE` values with your actual IDs:

```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_GUILD_ID=your_server_id
PREORDER_INTAKE_CHANNEL_ID=channel_id
PREORDER_OUTPUT_CHANNEL_ID=channel_id
WHOLESALE_INTAKE_CHANNEL_ID=channel_id
WHOLESALE_OUTPUT_CHANNEL_ID=channel_id
```

### Step 3: Register Slash Commands

Run this **once** to make `/preorder` and `/wholesale` appear in Discord:

```bash
npm run deploy
```

You should see: `✅ Slash commands registered successfully!`

### Step 4: Start the Bot

```bash
npm start
```

You should see: `🥐 Lumière Patisserie Bot Online!`

## How It Works

### Workflow

1. **Staff** uses `/preorder` or `/wholesale` → form opens
2. **Submitted order** posts to **INTAKE channel** with Confirm/Cancel buttons
3. **Manager** clicks **Confirm** → order moves to **OUTPUT channel**
4. **Kitchen/Baker** watches **OUTPUT channel** only (clean queue of confirmed orders)

### Commands

| Command | Description |
|---------|-------------|
| `/preorder` | Opens preorder form (customer name, phone, pickup time, items, payment) |
| `/wholesale` | Opens wholesale form (business, contact, delivery date, items, terms) |
| `/confirm [order_id]` | Manually confirm an order by ID |

### Order Flow

```
Staff submits order
       ↓
┌─────────────────┐
│  INTAKE CHANNEL │  ← Pending orders with Confirm/Cancel buttons
│  (review queue) │
└────────┬────────┘
         │ Manager clicks Confirm
         ↓
┌─────────────────┐
│ OUTPUT CHANNEL  │  ← Confirmed orders ready for kitchen
│ (kitchen queue) │
└─────────────────┘
```

## Troubleshooting

### "Commands don't appear"
- Run `npm run deploy` again
- Make sure bot is in your server
- Check that DISCORD_GUILD_ID is correct

### "Missing Access" error
- Bot needs permissions: View Channels, Send Messages, Use Slash Commands
- Check channel permissions allow the bot role

### "Channel not found" error
- Double-check channel IDs in `.env`
- Make sure channels exist and bot can see them

## Files

```
lumiere-discord-bot/
├── .env                 # Your secrets (DO NOT SHARE)
├── deploy-commands.js   # Registers slash commands (run once)
├── index.js             # Main bot code
├── package.json
└── README.md
```

## Future Enhancements

- [ ] Google Calendar integration for pickup times
- [ ] Google Sheets logging for order history
- [ ] Daily summary reports
- [ ] Inventory tracking integration
