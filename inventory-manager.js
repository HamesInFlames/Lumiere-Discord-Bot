/**
 * AI-Powered Inventory Manager
 * Uses OpenAI to parse natural language and manage inventory
 */

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const INVENTORY_FILE = path.join(__dirname, 'inventory.json');

// Initialize OpenAI client
let openai = null;

function initOpenAI(apiKey) {
  if (apiKey) {
    openai = new OpenAI({ apiKey });
    console.log('✅ OpenAI connected for inventory');
    return true;
  }
  console.log('⚠️ OpenAI API key not set - inventory AI disabled');
  return false;
}

// Load inventory from file
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

// Save inventory to file
function saveInventory(inventory) {
  try {
    fs.writeFileSync(INVENTORY_FILE, JSON.stringify(inventory, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving inventory:', error.message);
    return false;
  }
}

// Get all item names from categories
function getAllItemNames(inventory) {
  const items = [];
  for (const category of Object.values(inventory.categories)) {
    items.push(...category);
  }
  return items;
}

// Parse natural language message with OpenAI
async function parseInventoryMessage(message) {
  if (!openai) return null;

  const inventory = loadInventory();
  const allItems = getAllItemNames(inventory);

  const systemPrompt = `You're the friendly inventory helper for Lumière Patisserie! Think of yourself as a helpful coworker keeping track of supplies.

SUPPLIES WE TRACK (not pastries/breads - those are products):
☕ Drinks: Milk, Almond milk, Oat milk, Skim milk, Lactose free milk, Cream, Matcha powder, Cinnamon powder, Decaf coffee bags, Large coffee bags, Small coffee bags
🍋 Fruits: Orange, Lemon, Apple, Ginger, Mint
📦 Others: Sugar brown, Sugar white, Napkins, Mixer sticks, Plastic gloves, Tape, Straws, CO2, Wooden to go utensils, Cup holders
🍵 Tea: Cinnamon sticks, All spice, Honey, Chai, Earl grey, Peppermint, Iced princess, Chamomile, Coconut green, Strawberry kiwi, Raspberry lime, Lemon oolong, Ginger green, Jasmin, Green tea
🥡 Containers: Big boxes, Small boxes, Rectangle boxes, 4 one biter containers, 12 one biter containers, Small plastic box lids, Large plastic box lids, Baguette bags, Paper bags 10, Paper bags 12, Lumiere pastry paper, Large to go cups, Regular to go cups, Espresso to go cups, Cold to go cups, Blue lids, Cold togo lids, Shopping bags
🧴 Syrups: Vanilla, Caramel, Hazelnut, Pumpkin spice, Tiramisu, Cinnamon, Pistachio, Coconut, SF caramel, SF hazelnut, SF sweetener

HOW PEOPLE TALK:
- "Need: Fruits, Ginger, Skim" or "running low on milk" or "2 bags left" = LOW
- "got milk" or "restocked" or "just got shopping bags" = STOCKED  
- "out of napkins" or "none left" = OUT
- "show inventory" or "what do we need" or "list everything" = STATUS (show full list)
- Casual chat about inventory, planning, "will send list later" = CHAT
- Pastry counts, bread, cakes, TGTG, sales stuff = IGNORE (not supplies)

RESPOND WITH JSON:
{"action":"restock|low|out|status|chat|ignore","items":["matched items"],"message":"your friendly response"}

BE CONVERSATIONAL:
- Match items loosely: "skim" = Skim milk, "oat" = Oat milk, "fruits" = Orange/Lemon/Apple
- Write natural, warm responses like a coworker would
- For status requests, just say something brief - the system will show the full list
- For updates, confirm what you updated in a friendly way
- For chat, respond naturally and helpfully
- Emojis welcome but don't overdo it

Examples:
"we need milk" → {"action":"low","items":["Milk"],"message":"Got it, marking milk as low!"}
"just restocked all the syrups" → {"action":"restock","items":["Vanilla","Caramel",...],"message":"Nice! All syrups marked as stocked 👍"}
"show me everything" → {"action":"status","items":[],"message":"Here's our full inventory:"}
"I'll check stock tonight" → {"action":"chat","items":[],"message":"Sounds good! Just send me the list when you're ready."}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const content = response.choices[0].message.content.trim();
    
    // Extract JSON from response (handle markdown code blocks)
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

// Update item status
function updateItemStatus(itemName, status) {
  const inventory = loadInventory();
  const now = new Date().toISOString();
  
  // Find the item (case-insensitive match)
  const allItems = getAllItemNames(inventory);
  const matchedItem = allItems.find(item => 
    item.toLowerCase() === itemName.toLowerCase()
  );
  
  if (!matchedItem) return false;

  // Update item status
  inventory.items[matchedItem] = {
    status: status,
    updatedAt: now,
  };

  // Add to history
  inventory.history.push({
    item: matchedItem,
    action: status,
    timestamp: now,
  });

  // Keep history manageable (last 500 entries)
  if (inventory.history.length > 500) {
    inventory.history = inventory.history.slice(-500);
  }

  saveInventory(inventory);
  return true;
}

// Get current inventory status
function getInventoryStatus() {
  const inventory = loadInventory();
  const status = {
    low: [],
    out: [],
    stocked: [],
    unknown: [],
  };

  const allItems = getAllItemNames(inventory);
  
  for (const item of allItems) {
    const itemData = inventory.items[item];
    if (!itemData) {
      status.unknown.push(item);
    } else if (itemData.status === 'out') {
      status.out.push(item);
    } else if (itemData.status === 'low') {
      status.low.push(item);
    } else {
      status.stocked.push(item);
    }
  }

  return status;
}

// Get items that need restocking based on history patterns
function getPredictions() {
  const inventory = loadInventory();
  const predictions = [];
  
  // Group history by item
  const itemHistory = {};
  for (const entry of inventory.history) {
    if (entry.action === 'stocked') {
      if (!itemHistory[entry.item]) {
        itemHistory[entry.item] = [];
      }
      itemHistory[entry.item].push(new Date(entry.timestamp));
    }
  }

  // Calculate average days between restocks
  for (const [item, dates] of Object.entries(itemHistory)) {
    if (dates.length >= 2) {
      // Sort dates
      dates.sort((a, b) => a - b);
      
      // Calculate average gap
      let totalDays = 0;
      for (let i = 1; i < dates.length; i++) {
        const days = (dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24);
        totalDays += days;
      }
      const avgDays = Math.round(totalDays / (dates.length - 1));
      
      // Check if due soon
      const lastRestock = dates[dates.length - 1];
      const daysSinceRestock = Math.round((new Date() - lastRestock) / (1000 * 60 * 60 * 24));
      
      if (daysSinceRestock >= avgDays - 1) {
        predictions.push({
          item,
          avgDays,
          daysSinceRestock,
          urgent: daysSinceRestock >= avgDays,
        });
      }
    }
  }

  return predictions;
}

// Format status as Discord message - organized by category
function formatStatusMessage() {
  const inventory = loadInventory();
  const status = getInventoryStatus();
  
  // Category emoji map
  const categoryEmoji = {
    'Drinks': '☕',
    'Fruits': '🍋',
    'Others': '📦',
    'Tea': '🍵',
    'Containers': '🥡',
    'Syrups': '🧴',
  };

  // Build the message
  let message = '📋 **LUMIÈRE INVENTORY**\n';
  message += '━━━━━━━━━━━━━━━━━━━━━\n\n';

  // Show urgent issues first if any
  if (status.out.length > 0 || status.low.length > 0) {
    message += '🚨 **NEEDS ATTENTION:**\n';
    if (status.out.length > 0) {
      message += `❌ **Out:** ${status.out.join(', ')}\n`;
    }
    if (status.low.length > 0) {
      message += `⚠️ **Low:** ${status.low.join(', ')}\n`;
    }
    message += '\n';
  }

  // Show items by category
  for (const [category, items] of Object.entries(inventory.categories)) {
    const emoji = categoryEmoji[category] || '📌';
    message += `${emoji} **${category}**\n`;
    
    // Show each item with its status
    const itemStatuses = items.map(item => {
      const itemData = inventory.items[item];
      if (!itemData) return `• ${item}`;
      if (itemData.status === 'out') return `• ~~${item}~~ ❌`;
      if (itemData.status === 'low') return `• ${item} ⚠️`;
      if (itemData.status === 'stocked') return `• ${item} ✓`;
      return `• ${item}`;
    });
    
    message += itemStatuses.join('\n') + '\n\n';
  }

  // Add predictions if available
  const predictions = getPredictions();
  if (predictions.length > 0) {
    message += '🔮 **Predictions** (based on history):\n';
    for (const pred of predictions.slice(0, 3)) {
      message += `• ${pred.item} - usually restock every ~${pred.avgDays} days\n`;
    }
    message += '\n';
  }

  // Legend
  message += '━━━━━━━━━━━━━━━━━━━━━\n';
  message += '`✓ stocked` `⚠️ low` `❌ out`';

  return message;
}

// Process inventory message and return response
async function processInventoryMessage(message) {
  const parsed = await parseInventoryMessage(message);
  
  if (!parsed) {
    return null; // Don't respond if we couldn't parse
  }

  // Ignore non-inventory messages (don't respond)
  if (parsed.action === 'ignore') {
    return null;
  }

  if (parsed.action === 'unknown') {
    return null; // Don't respond to unknown messages
  }

  // Handle conversational messages about inventory
  if (parsed.action === 'chat') {
    return parsed.message || '👍 Got it! Send me the list whenever you\'re ready.';
  }

  if (parsed.action === 'status') {
    return formatStatusMessage();
  }

  // Map action to status
  const statusMap = {
    'restock': 'stocked',
    'low': 'low',
    'out': 'out',
  };

  const status = statusMap[parsed.action];
  const updatedItems = [];

  for (const item of parsed.items) {
    if (updateItemStatus(item, status)) {
      updatedItems.push(item);
    }
  }

  if (updatedItems.length === 0) {
    // Use AI's message if available, otherwise generic
    return parsed.message || `Hmm, I couldn't find those items. Mind double-checking the names?`;
  }

  // Use AI's conversational message if available
  if (parsed.message) {
    return parsed.message;
  }

  // Fallback to simple confirmation
  const emoji = status === 'stocked' ? '✅' : status === 'low' ? '⚠️' : '❌';
  return `${emoji} Updated: ${updatedItems.join(', ')}`;
}

module.exports = {
  initOpenAI,
  processInventoryMessage,
  getInventoryStatus,
  formatStatusMessage,
  getPredictions,
};
