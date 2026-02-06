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

  const systemPrompt = `You are a friendly inventory assistant for Lumière Patisserie bakery/cafe.

INVENTORY ITEMS BY CATEGORY:
- Drinks: Milk, Almond milk, Oat milk, Skim milk, Lactose free milk, Cream, Matcha powder, Cinnamon powder, Decaf coffee bags, Large coffee bags, Small coffee bags
- Fruits: Orange, Lemon, Apple, Ginger, Mint
- Others: Sugar brown, Sugar white, Napkins, Mixer sticks, Plastic gloves, Tape, Straws, CO2, Wooden to go utensils, Cup holders
- Tea: Cinnamon sticks, All spice, Honey, Chai, Earl grey, Peppermint, Iced princess, Chamomile, Coconut green, Strawberry kiwi, Raspberry lime, Lemon oolong, Ginger green, Jasmin, Green tea
- Containers: Big boxes, Small boxes, Rectangle boxes, 4 one biter containers, 12 one biter containers, Small plastic box lids, Large plastic box lids, Baguette bags, Paper bags 10, Paper bags 12, Lumiere pastry paper, Large to go cups, Regular to go cups, Espresso to go cups, Cold to go cups, Blue lids, Cold togo lids, Shopping bags
- Syrups: Vanilla, Caramel, Hazelnut, Pumpkin spice, Tiramisu, Cinnamon, Pistachio, Coconut, SF caramel, SF hazelnut, SF sweetener

Understand messages FLEXIBLY and return JSON:

ACTIONS:
- "restock" = items refilled/restocked (e.g., "got milk", "refilled coffee", "restocked all teas")
- "low" = running low (e.g., "almost out of napkins", "need more straws soon", "low on milk")  
- "out" = completely out (e.g., "no more cups", "out of vanilla", "we ran out")
- "status" = wants to see inventory (e.g., "show everything", "list all", "what do we need", "inventory", "status", "what's low")
- "ignore" = not inventory related (casual chat, questions about other things)

RESPONSE FORMAT (valid JSON only):
{"action": "restock|low|out|status|ignore", "items": ["item1"], "message": "brief friendly message"}

RULES:
- Match items even with typos or abbreviations (e.g., "oat" = "Oat milk", "sf van" = "SF vanilla")
- "all milks", "all teas", "all syrups" = expand to all items in that category
- For "status", items = []
- For "ignore", items = [], message = ""
- Be generous - if it MIGHT be inventory related, treat it as such
- Casual greetings or off-topic = "ignore"`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.3,
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

// Format status as Discord message
function formatStatusMessage() {
  const status = getInventoryStatus();
  let message = '';

  if (status.out.length > 0) {
    message += `❌ **OUT OF STOCK** (${status.out.length}):\n${status.out.join(', ')}\n\n`;
  }
  
  if (status.low.length > 0) {
    message += `⚠️ **RUNNING LOW** (${status.low.length}):\n${status.low.join(', ')}\n\n`;
  }

  if (status.out.length === 0 && status.low.length === 0) {
    message += '✅ **All tracked items are stocked!**\n\n';
  }

  // Add predictions if available
  const predictions = getPredictions();
  if (predictions.length > 0) {
    message += `📊 **Predictions** (based on history):\n`;
    for (const pred of predictions) {
      const emoji = pred.urgent ? '🔴' : '🟡';
      message += `${emoji} ${pred.item}: Usually restock every ~${pred.avgDays} days (${pred.daysSinceRestock} days since last)\n`;
    }
  }

  return message || 'No inventory data yet. Start by telling me what you restocked or what\'s running low!';
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
    return `❌ Couldn't find those items in inventory. Check spelling?`;
  }

  const emoji = status === 'stocked' ? '✅' : status === 'low' ? '⚠️' : '❌';
  const statusText = status === 'stocked' ? 'RESTOCKED' : status === 'low' ? 'marked as LOW' : 'marked as OUT';
  
  return `${emoji} **${statusText}:** ${updatedItems.join(', ')}`;
}

module.exports = {
  initOpenAI,
  processInventoryMessage,
  getInventoryStatus,
  formatStatusMessage,
  getPredictions,
};
