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

  const systemPrompt = `You are an inventory assistant for a bakery/cafe called Lumière Patisserie.

Available inventory items:
${allItems.join(', ')}

Your job is to understand inventory-related messages and return a JSON response.

Types of actions:
1. "restock" - items have been restocked/refilled
2. "low" - items are running low
3. "out" - items are completely out
4. "status" - user wants to see current inventory status
5. "unknown" - message is not inventory-related

Response format (always return valid JSON):
{
  "action": "restock|low|out|status|unknown",
  "items": ["item1", "item2"],
  "message": "brief confirmation message"
}

Match items to the available list even if spelled slightly differently.
If user says "all milks" or "all teas", expand to all items in that category.
If action is "status", items array should be empty.
If action is "unknown", explain what you can help with.`;

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
    return '❌ Sorry, I couldn\'t understand that. Try something like "restocked milk" or "running low on napkins"';
  }

  if (parsed.action === 'unknown') {
    return `🤔 ${parsed.message}\n\nTry saying things like:\n• "restocked milk and coffee"\n• "running low on napkins"\n• "out of straws"\n• "what do we need?"`;
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
