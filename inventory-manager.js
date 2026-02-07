/**
 * AI-Powered Inventory Manager v2
 * Memory + Reminder layer for messy human communication
 * 
 * Core principles:
 * - Accept messiness, don't require precision
 * - Remember context and timing
 * - Ask when unsure, don't guess
 * - End-of-day is the anchor
 */

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const INVENTORY_FILE = path.join(__dirname, 'inventory.json');
const PENDING_FILE = path.join(__dirname, 'pending.json');

let openai = null;

// ============================================
// INITIALIZATION
// ============================================

function initOpenAI(apiKey) {
  if (apiKey) {
    openai = new OpenAI({ apiKey });
    console.log('✅ OpenAI connected for inventory');
    return true;
  }
  console.log('⚠️ OpenAI API key not set - inventory AI disabled');
  return false;
}

// ============================================
// DATA LAYER
// ============================================

function loadInventory() {
  try {
    if (fs.existsSync(INVENTORY_FILE)) {
      return JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading inventory:', error.message);
  }
  return { categories: {}, items: {}, history: [] };
}

function saveInventory(inventory) {
  try {
    fs.writeFileSync(INVENTORY_FILE, JSON.stringify(inventory, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving inventory:', error.message);
    return false;
  }
}

function loadPending() {
  try {
    if (fs.existsSync(PENDING_FILE)) {
      return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading pending:', error.message);
  }
  return { clarifications: [], reminders: [] };
}

function savePending(pending) {
  try {
    fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving pending:', error.message);
    return false;
  }
}

function getAllItemNames(inventory) {
  const items = [];
  for (const category of Object.values(inventory.categories)) {
    items.push(...category);
  }
  return items;
}

// Item aliases for fuzzy matching
const ITEM_ALIASES = {
  'skim': 'Skim milk',
  'oat': 'Oat milk',
  'almond': 'Almond milk',
  'lactose': 'Lactose free milk',
  'lactose free': 'Lactose free milk',
  'matcha': 'Matcha powder',
  'cinnamon powder': 'Cinnamon powder',
  'decaf': 'Decaf coffee bags',
  'sugar': ['Sugar brown', 'Sugar white'], // ambiguous
  'brown sugar': 'Sugar brown',
  'white sugar': 'Sugar white',
  'gloves': 'Plastic gloves',
  'utensils': 'Wooden to go utensils',
  'co2': 'CO2',
  'cups': ['Large to go cups', 'Regular to go cups', 'Espresso to go cups', 'Cold to go cups'], // ambiguous
  'large cups': 'Large to go cups',
  'regular cups': 'Regular to go cups',
  'espresso cups': 'Espresso to go cups',
  'cold cups': 'Cold to go cups',
  'lids': ['Blue lids', 'Cold togo lids', 'Small plastic box lids', 'Large plastic box lids'], // ambiguous
  'blue lids': 'Blue lids',
  'cold lids': 'Cold togo lids',
  'bags': ['Paper bags 10', 'Paper bags 12', 'Baguette bags', 'Shopping bags', 'Large coffee bags', 'Small coffee bags'], // ambiguous
  'paper bags': ['Paper bags 10', 'Paper bags 12'],
  'shopping bags': 'Shopping bags',
  'baguette bags': 'Baguette bags',
  'coffee bags': ['Large coffee bags', 'Small coffee bags'],
  'large coffee': 'Large coffee bags',
  'small coffee': 'Small coffee bags',
  'boxes': ['Big boxes', 'Small boxes', 'Rectangle boxes'], // ambiguous
  'big boxes': 'Big boxes',
  'small boxes': 'Small boxes',
  'rectangle boxes': 'Rectangle boxes',
  'one biters': ['4 one biter containers', '12 one biter containers'],
  '4 one biters': '4 one biter containers',
  '12 one biters': '12 one biter containers',
  'fruits': ['Orange', 'Lemon', 'Apple', 'Ginger', 'Mint'], // group
  'all fruits': ['Orange', 'Lemon', 'Apple', 'Ginger', 'Mint'],
  'sf': ['SF caramel', 'SF hazelnut', 'SF sweetener'], // ambiguous
  'sugar free': ['SF caramel', 'SF hazelnut', 'SF sweetener'],
  'sf caramel': 'SF caramel',
  'sf hazelnut': 'SF hazelnut',
  'sweetener': 'SF sweetener',
};

// ============================================
// AI PARSING
// ============================================

async function parseInventoryMessage(message, userId) {
  if (!openai) return null;

  const inventory = loadInventory();
  const pending = loadPending();
  const allItems = getAllItemNames(inventory);

  // Check if this is a response to a pending clarification
  const userPending = pending.clarifications.find(c => c.userId === userId);
  let clarificationContext = '';
  if (userPending) {
    clarificationContext = `\nPENDING QUESTION: I asked "${userPending.question}" about "${userPending.rawItem}". Options were: ${userPending.options.join(', ')}. This message might be answering that.`;
  }

  const systemPrompt = `You're the inventory helper for Lumière Patisserie. You track SUPPLIES only (not pastries/breads).

SUPPLIES BY CATEGORY:
☕ Drinks: Milk, Almond milk, Oat milk, Skim milk, Lactose free milk, Cream, Matcha powder, Cinnamon powder, Decaf coffee bags, Large coffee bags, Small coffee bags
🍋 Fruits: Orange, Lemon, Apple, Ginger, Mint
📦 Others: Sugar brown, Sugar white, Napkins, Mixer sticks, Plastic gloves, Tape, Straws, CO2, Wooden to go utensils, Cup holders
🍵 Tea: Cinnamon sticks, All spice, Honey, Chai, Earl grey, Peppermint, Iced princess, Chamomile, Coconut green, Strawberry kiwi, Raspberry lime, Lemon oolong, Ginger green, Jasmin, Green tea
🥡 Containers: Big boxes, Small boxes, Rectangle boxes, 4 one biter containers, 12 one biter containers, Small plastic box lids, Large plastic box lids, Baguette bags, Paper bags 10, Paper bags 12, Lumiere pastry paper, Large to go cups, Regular to go cups, Espresso to go cups, Cold to go cups, Blue lids, Cold togo lids, Shopping bags
🧴 Syrups: Vanilla, Caramel, Hazelnut, Pumpkin spice, Tiramisu, Cinnamon, Pistachio, Coconut, SF caramel, SF hazelnut, SF sweetener
${clarificationContext}

COMMON ALIASES:
- "skim" = Skim milk, "oat" = Oat milk, "almond" = Almond milk
- "fruits" = Orange, Lemon, Apple, Ginger, Mint (ask if they mean all or specific)
- "cups" is ambiguous (Large/Regular/Espresso/Cold to go cups)
- "bags" is ambiguous (Paper bags, Coffee bags, Shopping bags, Baguette bags)
- "boxes" is ambiguous (Big/Small/Rectangle boxes)
- "sugar" is ambiguous (brown or white?)
- "lids" is ambiguous (Blue lids, Cold togo lids, plastic box lids)

YOUR JOB:
1. Understand what they're saying (update, question, chat, reminder)
2. Match items confidently OR ask for clarification
3. Note quantities when mentioned ("2 bags left")
4. Respond naturally like a helpful coworker

OUTPUT THIS JSON:
{
  "intent": "update|status|reminder|question|chat|ignore",
  "updates": [
    {"item": "exact item name", "status": "low|out|stocked", "qty": null, "unit": null, "note": null}
  ],
  "clarifications": [
    {"raw": "what they said", "options": ["Option 1", "Option 2"], "question": "friendly question to ask"}
  ],
  "reminder": {"text": "what to remind", "when": "tonight|tomorrow|specific time", "resolved": false},
  "reply": "your friendly response"
}

RULES:
1. If ONE clear match → update it
2. If MULTIPLE possible matches → add to clarifications, DON'T update
3. If NO match → say so in reply
4. "all" or "all 3" after a clarification = update all options
5. Quantities like "2 bags left" or "almost out" = status is "low"
6. "got X" or "restocked X" = status is "stocked"
7. "out of X" or "none left" = status is "out"
8. "show inventory" / "what do we need" = intent is "status"
9. Planning messages ("I'll check tonight") = intent is "reminder" or "chat"
10. Pastry/bread/cake counts = intent is "ignore"
11. Be conversational but structured

EXAMPLES:
"2 bags of skim left" → update Skim milk as low, qty: 2, unit: bags
"need cups" → clarification: "Which cups? Large, regular, espresso, or cold?"
"all of them" (after cups question) → update all 4 cup types as low
"got the milk and cream" → update Milk and Cream as stocked
"I'll check stock tonight" → reminder for tonight, friendly acknowledgment`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.5,
      max_tokens: 800,
    });

    const content = response.choices[0].message.content.trim();
    
    // Extract JSON
    let jsonStr = content;
    if (content.includes('```')) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) jsonStr = match[1];
    }
    
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('OpenAI parsing error:', error.message);
    return null;
  }
}

// ============================================
// ITEM UPDATES
// ============================================

function updateItem(itemName, status, qty = null, unit = null, note = null) {
  const inventory = loadInventory();
  const now = new Date().toISOString();
  
  // Find exact match
  const allItems = getAllItemNames(inventory);
  const matchedItem = allItems.find(item => 
    item.toLowerCase() === itemName.toLowerCase()
  );
  
  if (!matchedItem) return null;

  // Get or create item data
  const existing = inventory.items[matchedItem] || {};
  
  inventory.items[matchedItem] = {
    status: status,
    qty: qty !== null ? qty : existing.qty,
    unit: unit !== null ? unit : existing.unit,
    note: note !== null ? note : existing.note,
    lastUpdatedAt: now,
    lastMentionedAt: now,
    previousStatus: existing.status || null,
  };

  // Add to history
  inventory.history.push({
    item: matchedItem,
    action: status,
    qty: qty,
    unit: unit,
    timestamp: now,
  });

  // Keep history manageable
  if (inventory.history.length > 500) {
    inventory.history = inventory.history.slice(-500);
  }

  saveInventory(inventory);
  return matchedItem;
}

// ============================================
// STATUS & DISPLAY
// ============================================

function getInventoryStatus() {
  const inventory = loadInventory();
  const status = { low: [], out: [], stocked: [], unknown: [] };
  const allItems = getAllItemNames(inventory);
  
  for (const item of allItems) {
    const itemData = inventory.items[item];
    if (!itemData) {
      status.unknown.push(item);
    } else if (itemData.status === 'out') {
      status.out.push({ name: item, ...itemData });
    } else if (itemData.status === 'low') {
      status.low.push({ name: item, ...itemData });
    } else {
      status.stocked.push({ name: item, ...itemData });
    }
  }

  return status;
}

function formatStatusMessage() {
  const inventory = loadInventory();
  const status = getInventoryStatus();
  
  const categoryEmoji = {
    'Drinks': '☕', 'Fruits': '🍋', 'Others': '📦',
    'Tea': '🍵', 'Containers': '🥡', 'Syrups': '🧴',
  };

  let message = '📋 **LUMIÈRE INVENTORY**\n';
  message += '━━━━━━━━━━━━━━━━━━━━━\n\n';

  // Urgent issues first
  if (status.out.length > 0 || status.low.length > 0) {
    message += '🚨 **NEEDS ATTENTION:**\n';
    if (status.out.length > 0) {
      const outItems = status.out.map(i => {
        let s = i.name;
        if (i.qty) s += ` (${i.qty} ${i.unit || 'left'})`;
        return s;
      });
      message += `❌ **Out:** ${outItems.join(', ')}\n`;
    }
    if (status.low.length > 0) {
      const lowItems = status.low.map(i => {
        let s = i.name;
        if (i.qty) s += ` (${i.qty} ${i.unit || 'left'})`;
        return s;
      });
      message += `⚠️ **Low:** ${lowItems.join(', ')}\n`;
    }
    message += '\n';
  }

  // Items by category
  for (const [category, items] of Object.entries(inventory.categories)) {
    const emoji = categoryEmoji[category] || '📌';
    message += `${emoji} **${category}**\n`;
    
    const itemLines = items.map(item => {
      const data = inventory.items[item];
      if (!data) return `• ${item}`;
      
      let line = `• ${item}`;
      if (data.qty) line += ` (${data.qty} ${data.unit || ''})`.trim();
      
      if (data.status === 'out') line = `• ~~${item}~~ ❌`;
      else if (data.status === 'low') line += ' ⚠️';
      else if (data.status === 'stocked') line += ' ✓';
      
      return line;
    });
    
    message += itemLines.join('\n') + '\n\n';
  }

  // Last updated info
  const recentUpdates = inventory.history.slice(-3).reverse();
  if (recentUpdates.length > 0) {
    message += '📝 **Recent updates:**\n';
    for (const update of recentUpdates) {
      const time = new Date(update.timestamp).toLocaleTimeString('en-US', { 
        hour: 'numeric', minute: '2-digit', hour12: true 
      });
      message += `• ${update.item} → ${update.action} (${time})\n`;
    }
    message += '\n';
  }

  message += '━━━━━━━━━━━━━━━━━━━━━\n';
  message += '`✓ stocked` `⚠️ low` `❌ out`';

  return message;
}

// ============================================
// CLARIFICATION HANDLING
// ============================================

function addPendingClarification(userId, rawItem, options, question) {
  const pending = loadPending();
  
  // Remove any existing clarification for this user
  pending.clarifications = pending.clarifications.filter(c => c.userId !== userId);
  
  pending.clarifications.push({
    userId,
    rawItem,
    options,
    question,
    createdAt: new Date().toISOString(),
  });
  
  savePending(pending);
}

function resolveClarification(userId) {
  const pending = loadPending();
  const clarification = pending.clarifications.find(c => c.userId === userId);
  
  if (clarification) {
    pending.clarifications = pending.clarifications.filter(c => c.userId !== userId);
    savePending(pending);
  }
  
  return clarification;
}

function getPendingClarification(userId) {
  const pending = loadPending();
  return pending.clarifications.find(c => c.userId === userId);
}

// ============================================
// REMINDERS
// ============================================

function addReminder(userId, text, when) {
  const pending = loadPending();
  
  pending.reminders.push({
    userId,
    text,
    when,
    createdAt: new Date().toISOString(),
    resolved: false,
  });
  
  savePending(pending);
}

function getDueReminders() {
  const pending = loadPending();
  const now = new Date();
  const hour = now.getHours();
  
  const due = pending.reminders.filter(r => {
    if (r.resolved) return false;
    if (r.when === 'tonight' && hour >= 20) return true;
    if (r.when === 'tomorrow') {
      const created = new Date(r.createdAt);
      const daysDiff = Math.floor((now - created) / (1000 * 60 * 60 * 24));
      return daysDiff >= 1;
    }
    return false;
  });
  
  return due;
}

// ============================================
// MAIN PROCESSING
// ============================================

async function processInventoryMessage(message, userId = 'default') {
  const parsed = await parseInventoryMessage(message, userId);
  
  if (!parsed) return null;
  
  // Ignore non-inventory messages
  if (parsed.intent === 'ignore') return null;
  
  // Handle status request
  if (parsed.intent === 'status') {
    return formatStatusMessage();
  }
  
  // Handle clarification response (user answering a previous question)
  const pendingClarification = getPendingClarification(userId);
  if (pendingClarification && parsed.updates && parsed.updates.length > 0) {
    // They answered our question - resolve it
    resolveClarification(userId);
  }
  
  // Process updates
  const updatedItems = [];
  const failedItems = [];
  
  if (parsed.updates && parsed.updates.length > 0) {
    for (const update of parsed.updates) {
      const result = updateItem(
        update.item, 
        update.status, 
        update.qty, 
        update.unit, 
        update.note
      );
      if (result) {
        updatedItems.push({ name: result, ...update });
      } else {
        failedItems.push(update.item);
      }
    }
  }
  
  // Handle new clarifications needed
  if (parsed.clarifications && parsed.clarifications.length > 0) {
    const clarification = parsed.clarifications[0];
    addPendingClarification(userId, clarification.raw, clarification.options, clarification.question);
  }
  
  // Handle reminders
  if (parsed.reminder && parsed.reminder.text) {
    addReminder(userId, parsed.reminder.text, parsed.reminder.when);
  }
  
  // Build response
  let response = parsed.reply || '';
  
  // If we have clarifications, make sure to ask
  if (parsed.clarifications && parsed.clarifications.length > 0) {
    const c = parsed.clarifications[0];
    if (!response.includes('?')) {
      response += `\n\n${c.question}`;
    }
  }
  
  // If updates happened, confirm them
  if (updatedItems.length > 0 && !response) {
    const emoji = updatedItems[0].status === 'stocked' ? '✅' : 
                  updatedItems[0].status === 'low' ? '⚠️' : '❌';
    response = `${emoji} Got it! Updated: ${updatedItems.map(i => i.name).join(', ')}`;
  }
  
  return response || null;
}

// ============================================
// DAILY PROMPTS
// ============================================

function getDailyPromptMessage() {
  const status = getInventoryStatus();
  
  let message = '👋 **End of day check-in!**\n\n';
  
  if (status.low.length > 0 || status.out.length > 0) {
    message += 'Currently tracking:\n';
    if (status.out.length > 0) {
      message += `❌ Out: ${status.out.map(i => i.name).join(', ')}\n`;
    }
    if (status.low.length > 0) {
      message += `⚠️ Low: ${status.low.map(i => i.name).join(', ')}\n`;
    }
    message += '\n';
  }
  
  message += 'Anything else running low or out? Send me your list!';
  
  return message;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  initOpenAI,
  processInventoryMessage,
  getInventoryStatus,
  formatStatusMessage,
  getDailyPromptMessage,
  getDueReminders,
  getPendingClarification,
  resolveClarification,
};
